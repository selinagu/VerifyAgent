import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { confirmAction } from "@/lib/authorization/confirmation-service";
import { validateIdentityGrant } from "@/lib/authorization/grant-service";
import { parseEnv } from "@/lib/config/env";
import { DEMO_IDS } from "@/lib/demo/fixtures";
import { createPhase2Fixture } from "@/lib/demo/phase2-fixture";
import { issuePhase2TestGrant } from "@/lib/demo/phase2-test-grant";
import { resetDemoNamespace } from "@/lib/demo/reset-demo";
import { TaskRunner } from "@/lib/orchestrator/task-runner";
import { getTaskSnapshot } from "@/lib/tasks/task-query-service";
import { createMigratedTestDatabase } from "@/tests/helpers/test-database";

const database = createMigratedTestDatabase(`phase2-orchestrator-${randomUUID()}`);
const env = parseEnv({ ...process.env, DATABASE_URL: "file:test", DEMO_MODE: "true" });
const context = {
  userId: DEMO_IDS.userId,
  sessionId: DEMO_IDS.sessionId,
  correlationId: "caller-controlled-value-is-replaced",
};

beforeEach(async () => resetDemoNamespace(database.prisma));
afterAll(async () => database.cleanup());

async function reachIdentityWait() {
  const fixture = await createPhase2Fixture(database.prisma);
  let snapshot = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
  const price = snapshot.actions.find((action) => action.id === fixture.priceId)!;
  await confirmAction(database.prisma, {
    actionId: price.id,
    userId: context.userId,
    sessionId: context.sessionId,
    correlationId: fixture.correlationId,
    expectedPayloadHash: price.confirmationPayloadHash!,
    decision: "APPROVE",
  });
  snapshot = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
  expect(snapshot.status).toBe("WAITING_IDENTITY");
  return fixture;
}

describe("Phase 2 orchestrator", () => {
  it("runs NONE, pauses for CONFIRM and identity, then completes with one-time grant consumption", async () => {
    const fixture = await createPhase2Fixture(database.prisma);
    const runner = new TaskRunner(database.prisma, env);

    const firstPause = await runner.runTask(fixture.taskId, context);
    expect(firstPause.status).toBe("WAITING_CONFIRMATION");
    expect(firstPause.actions.map((action) => [action.status, action.requirement])).toEqual([
      ["SUCCEEDED", "NONE"],
      ["WAITING_CONFIRMATION", "CONFIRM"],
      ["VALIDATED", null],
    ]);
    expect(firstPause.actions[1].confirmationPayloadHash).toMatch(/^sha256:/);

    const confirmation = await confirmAction(database.prisma, {
      actionId: fixture.priceId,
      userId: context.userId,
      sessionId: context.sessionId,
      correlationId: fixture.correlationId,
      expectedPayloadHash: firstPause.actions[1].confirmationPayloadHash!,
      decision: "APPROVE",
    });
    expect(confirmation.idempotent).toBe(false);

    const repeated = await confirmAction(database.prisma, {
      actionId: fixture.priceId,
      userId: context.userId,
      sessionId: context.sessionId,
      correlationId: fixture.correlationId,
      expectedPayloadHash: firstPause.actions[1].confirmationPayloadHash!,
      decision: "APPROVE",
    });
    expect(repeated.idempotent).toBe(true);

    const identityPause = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(identityPause.status).toBe("WAITING_IDENTITY");
    expect(identityPause.actions[2]).toMatchObject({
      status: "WAITING_IDENTITY",
      requirement: "VERIFIED_IDENTITY",
    });

    const issued = await issuePhase2TestGrant(database.prisma, {
      actionId: fixture.publishId,
      userId: context.userId,
      sessionId: context.sessionId,
    });
    const completed = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.actions.every((action) => action.status === "SUCCEEDED")).toBe(true);
    expect(completed.listings[0]).toMatchObject({ priceCents: 8_000, status: "PUBLISHED", version: 3 });
    expect(completed.audit.some((event) => event.eventType === "IDENTITY_GRANT_CONSUMED")).toBe(true);

    const grant = await database.prisma.authorizationGrant.findUniqueOrThrow({ where: { id: issued.grantId } });
    expect(grant.status).toBe("CONSUMED");
    expect(grant.consumedAt).not.toBeNull();

    const replay = await runner.runTask(fixture.taskId, context);
    expect(replay).toEqual(completed);
    expect(await database.prisma.listing.count({ where: { taskId: fixture.taskId } })).toBe(1);
  });

  it("rejects confirmation if the payload changed after it was displayed", async () => {
    const fixture = await createPhase2Fixture(database.prisma);
    const snapshot = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    await database.prisma.actionRun.update({
      where: { id: fixture.priceId },
      data: { payloadJson: { listingRef: `action:${fixture.createId}`, priceCents: 9_000, currency: "USD" } },
    });
    await expect(
      confirmAction(database.prisma, {
        actionId: fixture.priceId,
        userId: context.userId,
        sessionId: context.sessionId,
        correlationId: fixture.correlationId,
        expectedPayloadHash: snapshot.actions[1].confirmationPayloadHash!,
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ code: "ACTION_CHANGED" });
  });

  it("cancels the task and downstream actions when confirmation is rejected", async () => {
    const fixture = await createPhase2Fixture(database.prisma);
    const snapshot = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    await confirmAction(database.prisma, {
      actionId: fixture.priceId,
      userId: context.userId,
      sessionId: context.sessionId,
      correlationId: fixture.correlationId,
      expectedPayloadHash: snapshot.actions[1].confirmationPayloadHash!,
      decision: "REJECT",
    });
    const cancelled = await getTaskSnapshot(database.prisma, fixture.taskId, context.userId);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.actions.map((action) => action.status)).toEqual(["SUCCEEDED", "DENIED", "CANCELLED"]);
  });

  it("rejects expired, revoked, consumed, and mismatched identity grants", async () => {
    const fixture = await reachIdentityWait();
    const issued = await issuePhase2TestGrant(database.prisma, {
      actionId: fixture.publishId,
      userId: context.userId,
      sessionId: context.sessionId,
    });
    const action = await database.prisma.actionRun.findUniqueOrThrow({ where: { id: fixture.publishId } });

    await database.prisma.authorizationGrant.update({
      where: { id: issued.grantId },
      data: { scopeHash: "sha256:wrong" },
    });
    await expect(validateIdentityGrant(database.prisma, action, context)).resolves.toEqual({
      valid: false,
      reasonCode: "GRANT_SCOPE_MISMATCH",
    });

    await database.prisma.authorizationGrant.update({
      where: { id: issued.grantId },
      data: { status: "ACTIVE", expiresAt: new Date(0) },
    });
    await expect(validateIdentityGrant(database.prisma, action, context)).resolves.toEqual({
      valid: false,
      reasonCode: "GRANT_EXPIRED",
    });

    await database.prisma.authorizationGrant.update({
      where: { id: issued.grantId },
      data: { status: "REVOKED", expiresAt: new Date("2099-01-01") },
    });
    await expect(validateIdentityGrant(database.prisma, action, context)).resolves.toEqual({
      valid: false,
      reasonCode: "GRANT_REVOKED",
    });

    await database.prisma.authorizationGrant.update({
      where: { id: issued.grantId },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    await expect(validateIdentityGrant(database.prisma, action, context)).resolves.toEqual({
      valid: false,
      reasonCode: "GRANT_ALREADY_CONSUMED",
    });
  });

  it("does not expose grant records or scope hashes in task snapshots", async () => {
    const fixture = await reachIdentityWait();
    await issuePhase2TestGrant(database.prisma, {
      actionId: fixture.publishId,
      userId: context.userId,
      sessionId: context.sessionId,
    });
    const snapshot = await getTaskSnapshot(database.prisma, fixture.taskId, context.userId);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("scopeHash");
    expect(serialized).not.toContain("authorizationGrant");
    expect(serialized).not.toContain("personaReferenceId");
  });

  it("revokes the one-time grant when publish execution fails", async () => {
    const fixture = await reachIdentityWait();
    const issued = await issuePhase2TestGrant(database.prisma, {
      actionId: fixture.publishId,
      userId: context.userId,
      sessionId: context.sessionId,
    });
    await database.prisma.listing.updateMany({
      where: { taskId: fixture.taskId },
      data: { status: "SOLD" },
    });

    const failed = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(failed.status).toBe("FAILED");
    expect(failed.actions[2]).toMatchObject({ status: "FAILED", errorCode: "INVALID_LISTING_STATE" });
    const grant = await database.prisma.authorizationGrant.findUniqueOrThrow({ where: { id: issued.grantId } });
    expect(grant.status).toBe("REVOKED");

    const replay = await new TaskRunner(database.prisma, env).runTask(fixture.taskId, context);
    expect(replay.status).toBe("FAILED");
    expect(await database.prisma.auditEvent.count({
      where: { actionId: fixture.publishId, eventType: "IDENTITY_GRANT_REVOKED" },
    })).toBe(1);
  });
});
