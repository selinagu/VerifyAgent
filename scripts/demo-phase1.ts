import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { db } from "../lib/db";
import { DEMO_IDS, DEMO_PROMPT } from "../lib/demo/fixtures";
import { resetDemoNamespace } from "../lib/demo/reset-demo";
import { ActionExecutor } from "../lib/executor/executor";

async function createFixture(prisma: PrismaClient) {
  const taskId = randomUUID();
  const createId = randomUUID();
  const priceId = randomUUID();
  const publishId = randomUUID();
  const correlationId = randomUUID();

  await prisma.taskRun.create({
    data: {
      id: taskId,
      userId: DEMO_IDS.userId,
      sessionId: DEMO_IDS.sessionId,
      requestText: DEMO_PROMPT,
      status: "READY",
      correlationId,
      actions: {
        create: [
          {
            id: createId,
            sequence: 0,
            type: "CREATE_DRAFT_LISTING",
            payloadJson: {
              title: "Rice Stadium Concert Ticket",
              description: "One transferable general-admission concert ticket.",
              sourceItemId: DEMO_IDS.inventoryItemId,
            },
            dependsOnJson: [],
            rationale: "Prepare the ticket listing privately.",
            status: "AUTHORIZED",
            idempotencyKey: `demo:${taskId}:create`,
          },
          {
            id: priceId,
            sequence: 1,
            type: "SET_LISTING_PRICE",
            payloadJson: { listingRef: `action:${createId}`, priceCents: 8_000, currency: "USD" },
            dependsOnJson: [`action:${createId}`],
            rationale: "Set the user-requested price.",
            status: "AUTHORIZED",
            idempotencyKey: `demo:${taskId}:price`,
          },
          {
            id: publishId,
            sequence: 2,
            type: "PUBLISH_LISTING",
            payloadJson: { listingRef: `action:${createId}` },
            dependsOnJson: [`action:${priceId}`],
            rationale: "Publish the completed listing.",
            status: "AUTHORIZED",
            idempotencyKey: `demo:${taskId}:publish`,
          },
        ],
      },
    },
  });

  return { taskId, correlationId, actionIds: [createId, priceId, publishId] };
}

async function main() {
  await resetDemoNamespace(db);
  const fixture = await createFixture(db);
  const executor = new ActionExecutor(db);
  const context = {
    userId: DEMO_IDS.userId,
    sessionId: DEMO_IDS.sessionId,
    correlationId: fixture.correlationId,
  };

  const results = [];
  for (const actionId of fixture.actionIds) {
    results.push(await executor.executeAction(actionId, context));
  }

  const listing = await db.listing.findFirstOrThrow({ where: { taskId: fixture.taskId } });
  const actions = await db.actionRun.findMany({
    where: { taskId: fixture.taskId },
    orderBy: { sequence: "asc" },
    select: { type: true, status: true },
  });
  const auditEventCount = await db.auditEvent.count({ where: { taskId: fixture.taskId } });

  console.log(
    JSON.stringify(
      {
        taskId: fixture.taskId,
        listingId: listing.id,
        priceCents: listing.priceCents,
        currency: listing.currency,
        status: listing.status,
        version: listing.version,
        actions,
        auditEventCount,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error("Phase 1 demo failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
