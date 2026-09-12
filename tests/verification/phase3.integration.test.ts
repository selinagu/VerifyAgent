import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { confirmAction } from "@/lib/authorization/confirmation-service";
import { parseEnv } from "@/lib/config/env";
import { DEMO_IDS } from "@/lib/demo/fixtures";
import { createPhase2Fixture } from "@/lib/demo/phase2-fixture";
import { resetDemoNamespace } from "@/lib/demo/reset-demo";
import { FakePersonaGateway } from "@/lib/demo/fake-persona-gateway";
import { ExecutionError } from "@/lib/executor/errors";
import { TaskRunner } from "@/lib/orchestrator/task-runner";
import type { VerifiedPersonaEvent } from "@/lib/persona/types";
import { processPersonaWebhook } from "@/lib/verification/persona-webhook-service";
import { getVerificationSnapshot, startVerification } from "@/lib/verification/verification-service";
import { createMigratedTestDatabase } from "@/tests/helpers/test-database";

const database = createMigratedTestDatabase(`phase3-verification-${randomUUID()}`);
const env = parseEnv({
  ...process.env,
  DATABASE_URL: "file:test",
  DEMO_MODE: "true",
  PERSONA_API_KEY: "persona_test_key",
  PERSONA_WEBHOOK_SECRET: "persona_test_webhook_secret",
  PERSONA_ENVIRONMENT_ID: "env_demo",
  PERSONA_TEMPLATE_ID: "itmpl_demo",
  PERSONA_API_VERSION: "2025-10-27",
});
const context = {
  userId: DEMO_IDS.userId,
  sessionId: DEMO_IDS.sessionId,
  correlationId: "caller-correlation-is-not-authoritative",
};

beforeEach(async () => resetDemoNamespace(database.prisma));
afterAll(async () => database.cleanup());

async function reachIdentityWait() {
  const fixture = await createPhase2Fixture(database.prisma);
  const runner = new TaskRunner(database.prisma, env);
  const confirmationPause = await runner.runTask(fixture.taskId, context);
  await confirmAction(database.prisma, {
    actionId: fixture.priceId,
    userId: context.userId,
    sessionId: context.sessionId,
    correlationId: fixture.correlationId,
    expectedPayloadHash: confirmationPause.actions[1].confirmationPayloadHash!,
    decision: "APPROVE",
  });
  const identityPause = await runner.runTask(fixture.taskId, context);
  expect(identityPause.status).toBe("WAITING_IDENTITY");
  return fixture;
}

function personaEvent(input: {
  inquiryId: string;
  referenceId: string;
  eventType?: string;
  eventCreatedAt?: Date;
  eventId?: string;
}): VerifiedPersonaEvent {
  return {
    eventId: input.eventId ?? `evt_demo_${randomUUID()}`,
    eventType: input.eventType ?? "inquiry.approved",
    eventCreatedAt: input.eventCreatedAt ?? new Date(),
    inquiryId: input.inquiryId,
    inquiryStatus: input.eventType === "inquiry.declined" ? "declined" : "approved",
    referenceId: input.referenceId,
    payloadHash: `sha256:${randomUUID().replaceAll("-", "").padEnd(64, "0")}`,
  };
}

describe("Phase 3 Persona verification", () => {
  it("starts a server-created inquiry and reuses the same active verification", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const first = await startVerification({
      prisma: database.prisma,
      gateway,
      env,
      actionId: fixture.publishId,
      context,
    });
    const second = await startVerification({
      prisma: database.prisma,
      gateway,
      env,
      actionId: fixture.publishId,
      context,
    });

    expect(first).toMatchObject({ status: "PENDING", idempotent: false, verificationUrl: `/verify/${first.verificationId}` });
    expect(second).toMatchObject({ verificationId: first.verificationId, idempotent: true });
    expect(gateway.createInputs).toHaveLength(1);
    expect(gateway.createInputs[0]).toMatchObject({ templateId: "itmpl_demo", idempotencyKey: first.verificationId });
    expect(gateway.createInputs[0].referenceId).toMatch(/^vref_/);
    expect(await database.prisma.verificationSession.count({ where: { actionId: fixture.publishId } })).toBe(1);
  });

  it("returns a fresh session token when an existing Persona inquiry needs resuming", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const first = await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });
    gateway.setStatus(first.flow.inquiryId, "pending");
    const resumed = await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });
    expect(resumed).toMatchObject({ idempotent: true, flow: { sessionToken: "session_demo_resume" } });
    expect(gateway.resumeCalls).toBe(1);
  });

  it("does not authorize from browser completion or resume without authoritative approval", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });

    const stillWaiting = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(stillWaiting.status).toBe("WAITING_IDENTITY");
    expect(await database.prisma.authorizationGrant.count({ where: { actionId: fixture.publishId } })).toBe(0);
  });

  it("completes the exact action only after approved webhook and server-side inquiry retrieval", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const started = await startVerification({
      prisma: database.prisma,
      gateway,
      env,
      actionId: fixture.publishId,
      context,
    });
    gateway.setStatus(started.flow.inquiryId, "approved");
    const verification = await database.prisma.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
    const event = personaEvent({ inquiryId: started.flow.inquiryId, referenceId: verification.personaReferenceId });

    await expect(processPersonaWebhook({ prisma: database.prisma, gateway, event })).resolves.toEqual({
      duplicate: false,
      processed: true,
    });
    await expect(processPersonaWebhook({ prisma: database.prisma, gateway, event })).resolves.toEqual({
      duplicate: true,
      processed: true,
    });
    expect(gateway.retrieveCalls).toBeGreaterThan(0);

    const safeSnapshot = await getVerificationSnapshot(database.prisma, started.verificationId, context);
    expect(safeSnapshot).toMatchObject({ status: "APPROVED", actionId: fixture.publishId, canResume: true });
    expect(JSON.stringify(safeSnapshot)).not.toMatch(/scopeHash|personaInquiryId|personaReferenceId|sessionToken/);

    const grant = await database.prisma.authorizationGrant.findUniqueOrThrow({
      where: { verificationSessionId: started.verificationId },
    });
    expect(grant).toMatchObject({
      userId: context.userId,
      sessionId: context.sessionId,
      actionId: fixture.publishId,
      status: "ACTIVE",
    });

    const completed = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.listings[0]).toMatchObject({ status: "PUBLISHED", priceCents: 8_000, version: 3 });
    expect((await database.prisma.authorizationGrant.findUniqueOrThrow({ where: { id: grant.id } })).status).toBe("CONSUMED");

    const replay = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(replay.status).toBe("COMPLETED");
    expect(await database.prisma.listing.count({ where: { taskId: fixture.taskId } })).toBe(1);
  });

  it("refuses to grant if the action payload changes during verification", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const started = await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });
    const verification = await database.prisma.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
    gateway.setStatus(started.flow.inquiryId, "approved");
    await database.prisma.actionRun.update({
      where: { id: fixture.publishId },
      data: { payloadJson: { listingRef: `action:${fixture.createId}`, changed: true } },
    });

    await processPersonaWebhook({
      prisma: database.prisma,
      gateway,
      event: personaEvent({ inquiryId: started.flow.inquiryId, referenceId: verification.personaReferenceId }),
    });
    expect((await database.prisma.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } })).status).toBe(
      "FAILED",
    );
    expect(await database.prisma.authorizationGrant.count({ where: { actionId: fixture.publishId } })).toBe(0);
  });

  it("handles decline, unknown, and out-of-order events without issuing a grant", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const started = await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });
    const verification = await database.prisma.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
    const later = new Date("2026-09-12T12:10:00.000Z");
    const earlier = new Date("2026-09-12T12:09:00.000Z");

    await processPersonaWebhook({
      prisma: database.prisma,
      gateway,
      event: personaEvent({
        inquiryId: started.flow.inquiryId,
        referenceId: verification.personaReferenceId,
        eventType: "inquiry.started",
        eventCreatedAt: later,
      }),
    });
    gateway.setStatus(started.flow.inquiryId, "approved");
    const outOfOrder = await processPersonaWebhook({
      prisma: database.prisma,
      gateway,
      event: personaEvent({
        inquiryId: started.flow.inquiryId,
        referenceId: verification.personaReferenceId,
        eventCreatedAt: earlier,
      }),
    });
    expect(outOfOrder.processed).toBe(false);
    expect(await database.prisma.authorizationGrant.count({ where: { actionId: fixture.publishId } })).toBe(0);

    const unknown = await processPersonaWebhook({
      prisma: database.prisma,
      gateway,
      event: personaEvent({
        inquiryId: started.flow.inquiryId,
        referenceId: verification.personaReferenceId,
        eventType: "inquiry.surprise",
        eventCreatedAt: new Date("2026-09-12T12:11:00.000Z"),
      }),
    });
    expect(unknown.processed).toBe(false);
  });

  it("keeps declined verification terminal and the task safely waiting", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const started = await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });
    const verification = await database.prisma.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
    await processPersonaWebhook({
      prisma: database.prisma,
      gateway,
      event: personaEvent({
        inquiryId: started.flow.inquiryId,
        referenceId: verification.personaReferenceId,
        eventType: "inquiry.declined",
      }),
    });
    expect((await getVerificationSnapshot(database.prisma, started.verificationId, context)).status).toBe("DECLINED");
    expect((await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context)).status).toBe("WAITING_IDENTITY");
    expect(await database.prisma.authorizationGrant.count({ where: { actionId: fixture.publishId } })).toBe(0);
  });

  it("rejects expired verification and authoritative inquiry binding mismatches", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    const startedAt = new Date("2026-09-12T12:00:00.000Z");
    const started = await startVerification({
      prisma: database.prisma,
      gateway,
      env,
      actionId: fixture.publishId,
      context,
      now: startedAt,
    });
    const verification = await database.prisma.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
    gateway.setStatus(started.flow.inquiryId, "approved");
    await processPersonaWebhook({
      prisma: database.prisma,
      gateway,
      event: personaEvent({
        inquiryId: started.flow.inquiryId,
        referenceId: verification.personaReferenceId,
        eventCreatedAt: new Date("2026-09-12T12:31:00.000Z"),
      }),
      now: new Date("2026-09-12T12:31:00.000Z"),
    });
    expect((await getVerificationSnapshot(database.prisma, started.verificationId, context)).status).toBe("EXPIRED");
    expect(await database.prisma.authorizationGrant.count({ where: { actionId: fixture.publishId } })).toBe(0);

    const retry = await startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context });
    gateway.setStatus(retry.flow.inquiryId, "approved");
    gateway.inquiries.get(retry.flow.inquiryId)!.referenceId = "vref_wrong";
    await expect(
      processPersonaWebhook({
        prisma: database.prisma,
        gateway,
        event: personaEvent({ inquiryId: retry.flow.inquiryId, referenceId: "vref_wrong" }),
      }),
    ).rejects.toMatchObject({ code: "INQUIRY_BINDING_MISMATCH" });
    expect(await database.prisma.authorizationGrant.count({ where: { actionId: fixture.publishId } })).toBe(0);
  });

  it("records a safe failed attempt when Persona inquiry creation fails", async () => {
    const fixture = await reachIdentityWait();
    const gateway = new FakePersonaGateway();
    gateway.createError = new ExecutionError("PERSONA_REQUEST_FAILED", { cause: new Error("secret upstream body") });
    await expect(
      startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context }),
    ).rejects.toMatchObject({ code: "PERSONA_REQUEST_FAILED" });
    const attempt = await database.prisma.verificationSession.findFirstOrThrow({ where: { actionId: fixture.publishId } });
    expect(attempt).toMatchObject({ status: "FAILED", failureReasonCode: "PERSONA_REQUEST_FAILED", activeKey: null });
    expect((await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context)).status).toBe("WAITING_IDENTITY");
  });

  it("rejects unstartable actions, wrong ownership, and missing Persona public configuration", async () => {
    const fixture = await createPhase2Fixture(database.prisma);
    const gateway = new FakePersonaGateway();
    await expect(
      startVerification({ prisma: database.prisma, gateway, env, actionId: fixture.publishId, context }),
    ).rejects.toMatchObject({ code: "VERIFICATION_NOT_STARTABLE" });

    await reachIdentityWait();
    await expect(
      startVerification({
        prisma: database.prisma,
        gateway,
        env,
        actionId: fixture.publishId,
        context: { ...context, userId: "attacker" },
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/OWNERSHIP|STARTABLE/) });

    const waiting = await database.prisma.actionRun.findFirstOrThrow({ where: { status: "WAITING_IDENTITY" } });
    const unconfigured = parseEnv({
      ...process.env,
      DEMO_MODE: "true",
      PERSONA_API_KEY: "",
      PERSONA_WEBHOOK_SECRET: "",
      PERSONA_ENVIRONMENT_ID: "",
      PERSONA_TEMPLATE_ID: "",
    });
    await expect(
      startVerification({ prisma: database.prisma, gateway, env: unconfigured, actionId: waiting.id, context }),
    ).rejects.toEqual(expect.objectContaining<Partial<ExecutionError>>({ code: "PERSONA_NOT_CONFIGURED" }));
  });
});
