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
import { processPersonaWebhook } from "../lib/verification/persona-webhook-service";
import { startVerification } from "../lib/verification/verification-service";

async function main() {
  process.env.DEMO_MODE = "true";
  const env = parseEnv({
    ...process.env,
    LLM_PROVIDER: "fake",
    PERSONA_API_KEY: "phase4_fake_key",
    PERSONA_WEBHOOK_SECRET: "phase4_fake_webhook_secret",
    PERSONA_ENVIRONMENT_ID: "env_demo",
    PERSONA_TEMPLATE_ID: "itmpl_demo",
  });
  await resetDemoNamespace(db);
  const context = { userId: DEMO_IDS.userId, sessionId: DEMO_IDS.sessionId, correlationId: randomUUID() };
  const planned = await new PlanningService(db, new FakePlannerGateway()).createTask({
    requestText: DEMO_PROMPT,
    idempotencyKey: "phase4-demo-request-0001",
    context,
  });
  const runner = new TaskRunner(db, env);
  const confirmationPause = await runner.runTask(planned.id, context);
  const price = confirmationPause.actions.find((action) => action.type === "SET_LISTING_PRICE")!;
  await confirmAction(db, {
    actionId: price.id,
    ...context,
    expectedPayloadHash: price.confirmationPayloadHash!,
    decision: "APPROVE",
  });
  const identityPause = await runner.runTask(planned.id, context);
  const publish = identityPause.actions.find((action) => action.type === "PUBLISH_LISTING")!;

  const persona = new FakePersonaGateway();
  const started = await startVerification({ prisma: db, gateway: persona, env, actionId: publish.id, context });
  const verification = await db.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
  persona.setStatus(started.flow.inquiryId, "approved");
  const createdAt = new Date();
  const rawBody = JSON.stringify({ data: { id: `evt_demo_${randomUUID()}`, attributes: { name: "inquiry.approved", "created-at": createdAt.toISOString(), payload: { data: { id: started.flow.inquiryId, type: "inquiry", attributes: { status: "approved", "reference-id": verification.personaReferenceId } } } } } });
  const timestamp = Math.floor(createdAt.getTime() / 1_000);
  const signature = createHmac("sha256", env.PERSONA_WEBHOOK_SECRET!).update(`${timestamp}.${rawBody}`).digest("hex");
  verifyPersonaWebhookSignature({ rawBody, signatureHeader: `t=${timestamp},v1=${signature}`, webhookSecret: env.PERSONA_WEBHOOK_SECRET!, now: createdAt });
  await processPersonaWebhook({ prisma: db, gateway: persona, event: parsePersonaEvent(rawBody), now: createdAt });
  const completed = await runner.runTask(planned.id, context);

  console.log(JSON.stringify({
    request: DEMO_PROMPT,
    planner: completed.planning,
    compiledActions: completed.actions.map(({ type, status, requirement }) => ({ type, status, requirement })),
    authorizationWaits: [confirmationPause.status, identityPause.status],
    finalTaskStatus: completed.status,
    listing: completed.listings[0],
    grantConsumed: completed.audit.some((event) => event.eventType === "IDENTITY_GRANT_CONSUMED"),
    auditEventCount: completed.audit.length,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("Phase 4 demo failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
