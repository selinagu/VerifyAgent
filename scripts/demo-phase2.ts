import { db } from "../lib/db";
import { confirmAction } from "../lib/authorization/confirmation-service";
import { parseEnv } from "../lib/config/env";
import { DEMO_IDS } from "../lib/demo/fixtures";
import { createPhase2Fixture } from "../lib/demo/phase2-fixture";
import { issuePhase2TestGrant } from "../lib/demo/phase2-test-grant";
import { resetDemoNamespace } from "../lib/demo/reset-demo";
import { TaskRunner } from "../lib/orchestrator/task-runner";

async function main() {
  process.env.DEMO_MODE = "true";
  await resetDemoNamespace(db);
  const fixture = await createPhase2Fixture(db);
  const env = parseEnv();
  const runner = new TaskRunner(db, env);
  const context = {
    userId: DEMO_IDS.userId,
    sessionId: DEMO_IDS.sessionId,
    correlationId: fixture.correlationId,
  };

  const afterNone = await runner.runTask(fixture.taskId, context);
  const price = afterNone.actions.find((action) => action.id === fixture.priceId);
  if (!price?.confirmationPayloadHash) throw new Error("Price confirmation was not requested.");

  await confirmAction(db, {
    actionId: fixture.priceId,
    userId: context.userId,
    sessionId: context.sessionId,
    correlationId: context.correlationId,
    expectedPayloadHash: price.confirmationPayloadHash,
    decision: "APPROVE",
  });
  const afterConfirmation = await runner.runTask(fixture.taskId, context);
  await issuePhase2TestGrant(db, {
    actionId: fixture.publishId,
    userId: context.userId,
    sessionId: context.sessionId,
  });
  const completed = await runner.runTask(fixture.taskId, context);

  console.log(
    JSON.stringify(
      {
        pauses: [afterNone.status, afterConfirmation.status],
        finalStatus: completed.status,
        actions: completed.actions.map(({ type, requirement, status }) => ({ type, requirement, status })),
        listing: completed.listings[0],
        grantConsumed: completed.audit.some((event) => event.eventType === "IDENTITY_GRANT_CONSUMED"),
        auditEventCount: completed.audit.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error("Phase 2 demo failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
