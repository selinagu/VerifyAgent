import "dotenv/config";

import { createHmac, randomUUID } from "node:crypto";

import { confirmAction } from "../lib/authorization/confirmation-service";
import { parseEnv } from "../lib/config/env";
import { db } from "../lib/db";
import { FakePersonaGateway } from "../lib/demo/fake-persona-gateway";
import { FakePlannerGateway } from "../lib/demo/fake-planner-gateway";
import { DEMO_IDS, DEMO_PROMPT } from "../lib/demo/fixtures";
import { resetDemoNamespace } from "../lib/demo/reset-demo";
import { TaskRunner } from "../lib/orchestrator/task-runner";
import { parsePersonaEvent } from "../lib/persona/persona-event-parser";
import { verifyPersonaWebhookSignature } from "../lib/persona/persona-webhook-verifier";
import { PlanningService } from "../lib/planner/planning-service";
import { getTaskSnapshot } from "../lib/tasks/task-query-service";
import { processPersonaWebhook } from "../lib/verification/persona-webhook-service";
import { startVerification } from "../lib/verification/verification-service";

async function main() {
  process.env.DEMO_MODE = "true";
  process.env.DEMO_PROFILE = "failure-demo";
  const env = parseEnv({
    ...process.env,
    LLM_PROVIDER: "fake",
    PERSONA_API_KEY: "fake_failure_api_key",
    PERSONA_WEBHOOK_SECRET: "fake_failure_webhook_secret",
    PERSONA_ENVIRONMENT_ID: "env_demo",
    PERSONA_TEMPLATE_ID: "itmpl_demo",
  });
  await resetDemoNamespace(db);
  const context = { userId: DEMO_IDS.userId, sessionId: DEMO_IDS.sessionId, correlationId: randomUUID() };
  const task = await new PlanningService(db, new FakePlannerGateway()).createTask({
    requestText: DEMO_PROMPT,
    idempotencyKey: "phase6-failure-demo-0001",
    context,
  });
  const runner = new TaskRunner(db, env);
  const confirmationPause = await runner.runTask(task.id, context);
  const price = confirmationPause.actions.find((action) => action.type === "SET_LISTING_PRICE")!;
  await confirmAction(db, { actionId: price.id, ...context, expectedPayloadHash: price.confirmationPayloadHash!, decision: "APPROVE" });
  const identityPause = await runner.runTask(task.id, context);
  const publish = identityPause.actions.find((action) => action.type === "PUBLISH_LISTING")!;
  const gateway = new FakePersonaGateway();
  const started = await startVerification({ prisma: db, gateway, env, actionId: publish.id, context });
  const verification = await db.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
  const occurredAt = new Date();
  const rawBody = JSON.stringify({ data: { id: `evt_demo_${randomUUID()}`, attributes: { name: "inquiry.declined", "created-at": occurredAt.toISOString(), payload: { data: { id: started.flow.inquiryId, type: "inquiry", attributes: { status: "declined", "reference-id": verification.personaReferenceId } } } } } });
  const timestamp = Math.floor(occurredAt.getTime() / 1_000);
  const signature = createHmac("sha256", env.PERSONA_WEBHOOK_SECRET!).update(`${timestamp}.${rawBody}`).digest("hex");
  verifyPersonaWebhookSignature({ rawBody, signatureHeader: `t=${timestamp},v1=${signature}`, webhookSecret: env.PERSONA_WEBHOOK_SECRET, now: occurredAt });
  const event = parsePersonaEvent(rawBody);
  await processPersonaWebhook({ prisma: db, gateway, event, now: occurredAt });
  const duplicate = await processPersonaWebhook({ prisma: db, gateway, event, now: occurredAt });
  const snapshot = await getTaskSnapshot(db, task.id, context.userId);
  const grantIssued = await db.authorizationGrant.count({ where: { actionId: publish.id } });
  console.log(JSON.stringify({
    taskStatus: snapshot.status,
    verificationStatus: "DECLINED",
    grantIssued: grantIssued > 0,
    listingStatus: snapshot.listings[0]?.status,
    priceCents: snapshot.listings[0]?.priceCents,
    published: snapshot.listings[0]?.status === "PUBLISHED",
    duplicateWebhookHandled: duplicate.duplicate,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error("Failure demo failed.", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
