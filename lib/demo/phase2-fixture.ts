import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { DEMO_IDS, DEMO_PROMPT } from "./fixtures";

export async function createPhase2Fixture(prisma: PrismaClient) {
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
            status: "VALIDATED",
            idempotencyKey: `phase2:${taskId}:create`,
          },
          {
            id: priceId,
            sequence: 1,
            type: "SET_LISTING_PRICE",
            payloadJson: { listingRef: `action:${createId}`, priceCents: 8_000, currency: "USD" },
            dependsOnJson: [`action:${createId}`],
            rationale: "Set the user-requested price.",
            status: "VALIDATED",
            idempotencyKey: `phase2:${taskId}:price`,
          },
          {
            id: publishId,
            sequence: 2,
            type: "PUBLISH_LISTING",
            payloadJson: { listingRef: `action:${createId}` },
            dependsOnJson: [`action:${priceId}`],
            rationale: "Publish the completed listing.",
            status: "VALIDATED",
            idempotencyKey: `phase2:${taskId}:publish`,
          },
        ],
      },
    },
  });

  return { taskId, correlationId, createId, priceId, publishId };
}
