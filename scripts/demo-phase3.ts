import { createHmac, randomUUID } from "node:crypto";

import { confirmAction } from "../lib/authorization/confirmation-service";
import { parseEnv } from "../lib/config/env";
import { db } from "../lib/db";
import { DEMO_IDS } from "../lib/demo/fixtures";
import { FakePersonaGateway } from "../lib/demo/fake-persona-gateway";
import { createPhase2Fixture } from "../lib/demo/phase2-fixture";
import { resetDemoNamespace } from "../lib/demo/reset-demo";
import { TaskRunner } from "../lib/orchestrator/task-runner";
import { parsePersonaEvent } from "../lib/persona/persona-event-parser";
import { verifyPersonaWebhookSignature } from "../lib/persona/persona-webhook-verifier";
import { processPersonaWebhook } from "../lib/verification/persona-webhook-service";
import { startVerification } from "../lib/verification/verification-service";

async function main() {
  process.env.DEMO_MODE = "true";
  const env = parseEnv({
    ...process.env,
    PERSONA_API_KEY: "phase3_fake_key",
    PERSONA_WEBHOOK_SECRET: "phase3_fake_webhook_secret",
    PERSONA_ENVIRONMENT_ID: "env_demo",
    PERSONA_TEMPLATE_ID: "itmpl_demo",
  });
  await resetDemoNamespace(db);
  const fixture = await createPhase2Fixture(db);
  const runner = new TaskRunner(db, env);
  const context = { userId: DEMO_IDS.userId, sessionId: DEMO_IDS.sessionId, correlationId: fixture.correlationId };

  const confirmationPause = await runner.runTask(fixture.taskId, context);
  await confirmAction(db, {
    actionId: fixture.priceId,
    ...context,
    expectedPayloadHash: confirmationPause.actions[1].confirmationPayloadHash!,
    decision: "APPROVE",
  });
  await runner.runTask(fixture.taskId, context);

  const gateway = new FakePersonaGateway();
  const started = await startVerification({ prisma: db, gateway, env, actionId: fixture.publishId, context });
  const verification = await db.verificationSession.findUniqueOrThrow({ where: { id: started.verificationId } });
  gateway.setStatus(started.flow.inquiryId, "approved");

  const createdAt = new Date();
  const rawBody = JSON.stringify({
    data: {
      id: `evt_demo_${randomUUID()}`,
      attributes: {
        name: "inquiry.approved",
        "created-at": createdAt.toISOString(),
        payload: {
          data: {
            id: started.flow.inquiryId,
            type: "inquiry",
            attributes: { status: "approved", "reference-id": verification.personaReferenceId },
          },
        },
      },
    },
  });
  const timestamp = Math.floor(createdAt.getTime() / 1_000);
  const signature = createHmac("sha256", env.PERSONA_WEBHOOK_SECRET!)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  verifyPersonaWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    webhookSecret: env.PERSONA_WEBHOOK_SECRET,
    now: createdAt,
  });
  await processPersonaWebhook({ prisma: db, gateway, event: parsePersonaEvent(rawBody), now: createdAt });
  const completed = await runner.runTask(fixture.taskId, context);

  console.log(JSON.stringify({
    verificationId: started.verificationId,
    authoritativeStatus: "APPROVED",
    finalTaskStatus: completed.status,
    listing: completed.listings[0],
    grantConsumed: completed.audit.some((event) => event.eventType === "IDENTITY_GRANT_CONSUMED"),
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("Phase 3 demo failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
