import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ActionExecutor } from "@/lib/executor/executor";
import { setDraftListingPrice } from "@/lib/marketplace/listing-service";
import { createMigratedTestDatabase } from "@/tests/helpers/test-database";

type UserFixture = { id: string; sessionId: string; itemId: string };

const USERS = {
  alex: { id: "test_alex", sessionId: "test_alex_session", itemId: "test_alex_ticket" },
  bob: { id: "test_bob", sessionId: "test_bob_session", itemId: "test_bob_ticket" },
} as const;

let prisma: PrismaClient;
let cleanup: () => Promise<void>;

async function seedUsers() {
  for (const [name, fixture] of Object.entries(USERS)) {
    await prisma.user.create({
      data: {
        id: fixture.id,
        displayName: name,
        sessions: {
          create: { id: fixture.sessionId, expiresAt: new Date("2099-01-01T00:00:00Z") },
        },
        items: {
          create: {
            id: fixture.itemId,
            type: "CONCERT_TICKET",
            title: `${name} ticket`,
            description: "Test ticket",
          },
        },
      },
    });
  }
}

async function createTask(
  user: UserFixture = USERS.alex,
  overrides: Partial<{ userId: string; sessionId: string }> = {},
) {
  const id = randomUUID();
  const correlationId = randomUUID();
  await prisma.taskRun.create({
    data: {
      id,
      userId: overrides.userId ?? user.id,
      sessionId: overrides.sessionId ?? user.sessionId,
      requestText: "Sell my concert ticket for $80.",
      status: "READY",
      correlationId,
    },
  });
  return { id, correlationId };
}

async function createAction(input: {
  taskId: string;
  sequence: number;
  type: string;
  payload: Prisma.InputJsonValue;
  dependsOn?: string[];
  status?: string;
}) {
  const id = randomUUID();
  await prisma.actionRun.create({
    data: {
      id,
      taskId: input.taskId,
      sequence: input.sequence,
      type: input.type,
      payloadJson: input.payload,
      dependsOnJson: input.dependsOn ?? [],
      rationale: "Integration test action.",
      status: input.status ?? "AUTHORIZED",
      idempotencyKey: `test:${id}`,
    },
  });
  return id;
}

function context(task: { correlationId: string }, user: UserFixture = USERS.alex) {
  return { userId: user.id, sessionId: user.sessionId, correlationId: task.correlationId };
}

async function createDraft(
  task: { id: string; correlationId: string },
  itemId: string = USERS.alex.itemId,
) {
  const id = await createAction({
    taskId: task.id,
    sequence: 0,
    type: "CREATE_DRAFT_LISTING",
    payload: { title: "Concert ticket", description: "One ticket", sourceItemId: itemId },
  });
  const result = await new ActionExecutor(prisma).executeAction(id, context(task));
  return { id, result };
}

beforeAll(() => {
  const database = createMigratedTestDatabase("executor-phase1-test");
  prisma = database.prisma;
  cleanup = database.cleanup.bind(database);
});

beforeEach(async () => {
  await prisma.auditEvent.deleteMany();
  await prisma.authorizationGrant.deleteMany();
  await prisma.verificationSession.deleteMany();
  await prisma.actionRun.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.taskRun.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.user.deleteMany();
  await seedUsers();
});

afterAll(async () => cleanup());

describe("ActionExecutor", () => {
  it("executes create, price, and publish with consistent results and audits", async () => {
    const task = await createTask();
    const executor = new ActionExecutor(prisma);
    const draft = await createDraft(task);
    expect(draft.result).toMatchObject({ outcome: "SUCCEEDED", replayed: false });

    const priceId = await createAction({
      taskId: task.id,
      sequence: 1,
      type: "SET_LISTING_PRICE",
      payload: { listingRef: `action:${draft.id}`, priceCents: 8_000, currency: "USD" },
      dependsOn: [`action:${draft.id}`],
    });
    expect(await executor.executeAction(priceId, context(task))).toMatchObject({
      outcome: "SUCCEEDED",
      replayed: false,
      result: { priceCents: 8_000, status: "DRAFT", version: 2 },
    });

    const publishId = await createAction({
      taskId: task.id,
      sequence: 2,
      type: "PUBLISH_LISTING",
      payload: { listingRef: `action:${draft.id}` },
      dependsOn: [`action:${priceId}`],
    });
    expect(await executor.executeAction(publishId, context(task))).toMatchObject({
      outcome: "SUCCEEDED",
      replayed: false,
      result: { previousStatus: "DRAFT", status: "PUBLISHED", version: 3 },
    });

    const listing = await prisma.listing.findFirstOrThrow({ where: { taskId: task.id } });
    const actions = await prisma.actionRun.findMany({ where: { taskId: task.id } });
    const audits = await prisma.auditEvent.findMany({ where: { taskId: task.id } });
    expect(listing).toMatchObject({ priceCents: 8_000, status: "PUBLISHED", version: 3 });
    expect(actions.every((action) => action.status === "SUCCEEDED" && action.resultJson)).toBe(true);
    expect(audits).toHaveLength(9);
    expect(audits.filter((event) => event.eventType === "ACTION_EXECUTION_SUCCEEDED")).toHaveLength(3);
  });

  it("rejects a user that does not own the task", async () => {
    const task = await createTask();
    const actionId = await createAction({
      taskId: task.id,
      sequence: 0,
      type: "CREATE_DRAFT_LISTING",
      payload: { title: "Ticket", description: "Ticket", sourceItemId: USERS.alex.itemId },
    });
    const result = await new ActionExecutor(prisma).executeAction(actionId, context(task, USERS.bob));
    expect(result).toMatchObject({ outcome: "FAILED", error: { code: "TASK_OWNERSHIP_MISMATCH" } });
    expect(await prisma.listing.count()).toBe(0);
  });

  it("rejects a session mismatch", async () => {
    const task = await createTask();
    const actionId = await createAction({
      taskId: task.id,
      sequence: 0,
      type: "CREATE_DRAFT_LISTING",
      payload: { title: "Ticket", description: "Ticket", sourceItemId: USERS.alex.itemId },
    });
    const result = await new ActionExecutor(prisma).executeAction(actionId, {
      ...context(task),
      sessionId: USERS.bob.sessionId,
    });
    expect(result).toMatchObject({ outcome: "FAILED", error: { code: "SESSION_MISMATCH" } });
  });

  it("rejects a source item owned by another user", async () => {
    const task = await createTask();
    const draft = await createDraft(task, USERS.bob.itemId);
    expect(draft.result).toMatchObject({
      outcome: "FAILED",
      error: { code: "SOURCE_ITEM_OWNERSHIP_MISMATCH" },
    });
    expect(await prisma.listing.count()).toBe(0);
  });

  it("rejects a listing action reference from another task", async () => {
    const firstTask = await createTask();
    const draft = await createDraft(firstTask);
    const secondTask = await createTask();
    const priceId = await createAction({
      taskId: secondTask.id,
      sequence: 0,
      type: "SET_LISTING_PRICE",
      payload: { listingRef: `action:${draft.id}`, priceCents: 8_000, currency: "USD" },
    });
    const result = await new ActionExecutor(prisma).executeAction(priceId, context(secondTask));
    expect(result).toMatchObject({ outcome: "FAILED", error: { code: "INVALID_LISTING_REFERENCE" } });
  });

  it("requires every declared dependency to have succeeded in the same task", async () => {
    const task = await createTask();
    const pendingId = await createAction({
      taskId: task.id,
      sequence: 0,
      type: "CREATE_DRAFT_LISTING",
      payload: { title: "Ticket", description: "Ticket", sourceItemId: USERS.alex.itemId },
    });
    const publishId = await createAction({
      taskId: task.id,
      sequence: 1,
      type: "PUBLISH_LISTING",
      payload: { listingRef: `action:${pendingId}` },
      dependsOn: [`action:${pendingId}`],
    });
    const result = await new ActionExecutor(prisma).executeAction(publishId, context(task));
    expect(result).toMatchObject({ outcome: "FAILED", error: { code: "DEPENDENCY_NOT_SUCCEEDED" } });
  });

  it("will not publish a listing without a price", async () => {
    const task = await createTask();
    const draft = await createDraft(task);
    const publishId = await createAction({
      taskId: task.id,
      sequence: 1,
      type: "PUBLISH_LISTING",
      payload: { listingRef: `action:${draft.id}` },
      dependsOn: [`action:${draft.id}`],
    });
    const result = await new ActionExecutor(prisma).executeAction(publishId, context(task));
    expect(result).toMatchObject({ outcome: "FAILED", error: { code: "LISTING_PRICE_REQUIRED" } });
    expect(await prisma.listing.findFirst()).toMatchObject({ status: "DRAFT", version: 1 });
  });

  it("rejects pricing or publishing a non-draft listing", async () => {
    const task = await createTask();
    const draft = await createDraft(task);
    const listing = await prisma.listing.findFirstOrThrow();
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "PUBLISHED", priceCents: 8_000 },
    });

    const priceId = await createAction({
      taskId: task.id,
      sequence: 1,
      type: "SET_LISTING_PRICE",
      payload: { listingRef: `action:${draft.id}`, priceCents: 9_000, currency: "USD" },
    });
    const publishId = await createAction({
      taskId: task.id,
      sequence: 2,
      type: "PUBLISH_LISTING",
      payload: { listingRef: `action:${draft.id}` },
    });
    const executor = new ActionExecutor(prisma);
    expect(await executor.executeAction(priceId, context(task))).toMatchObject({
      outcome: "FAILED",
      error: { code: "INVALID_LISTING_STATE" },
    });
    expect(await executor.executeAction(publishId, context(task))).toMatchObject({
      outcome: "FAILED",
      error: { code: "INVALID_LISTING_STATE" },
    });
  });

  it("replays successful actions without repeating any mutation", async () => {
    const task = await createTask();
    const executor = new ActionExecutor(prisma);
    const draft = await createDraft(task);
    const draftReplay = await executor.executeAction(draft.id, context(task));
    expect(draftReplay).toMatchObject({ outcome: "SUCCEEDED", replayed: true });
    expect(await prisma.listing.count()).toBe(1);

    const priceId = await createAction({
      taskId: task.id,
      sequence: 1,
      type: "SET_LISTING_PRICE",
      payload: { listingRef: `action:${draft.id}`, priceCents: 8_000, currency: "USD" },
    });
    await executor.executeAction(priceId, context(task));
    await executor.executeAction(priceId, context(task));
    expect(await prisma.listing.findFirst()).toMatchObject({ priceCents: 8_000, version: 2 });

    const publishId = await createAction({
      taskId: task.id,
      sequence: 2,
      type: "PUBLISH_LISTING",
      payload: { listingRef: `action:${draft.id}` },
    });
    await executor.executeAction(publishId, context(task));
    await executor.executeAction(publishId, context(task));
    expect(await prisma.listing.findFirst()).toMatchObject({ status: "PUBLISHED", version: 3 });
  });

  it("allows at most one mutation when the same action is executed concurrently", async () => {
    const task = await createTask();
    const actionId = await createAction({
      taskId: task.id,
      sequence: 0,
      type: "CREATE_DRAFT_LISTING",
      payload: { title: "Ticket", description: "Ticket", sourceItemId: USERS.alex.itemId },
    });
    const executor = new ActionExecutor(prisma);
    const results = await Promise.all([
      executor.executeAction(actionId, context(task)),
      executor.executeAction(actionId, context(task)),
    ]);
    expect(results.some((result) => result.outcome === "SUCCEEDED")).toBe(true);
    expect(await prisma.listing.count()).toBe(1);
  });

  it("detects optimistic concurrency conflicts", async () => {
    const task = await createTask();
    await createDraft(task);
    const staleListing = await prisma.listing.findFirstOrThrow();
    await prisma.listing.update({ where: { id: staleListing.id }, data: { version: { increment: 1 } } });

    await expect(
      prisma.$transaction((tx) =>
        setDraftListingPrice(tx, {
          listing: staleListing,
          userId: USERS.alex.id,
          priceCents: 8_000,
          currency: "USD",
          expectedVersion: staleListing.version,
        }),
      ),
    ).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });
  });

  it("rolls back a mutation and records no success audit when completion fails", async () => {
    const task = await createTask();
    const actionId = await createAction({
      taskId: task.id,
      sequence: 0,
      type: "CREATE_DRAFT_LISTING",
      payload: { title: "Ticket", description: "Ticket", sourceItemId: USERS.alex.itemId },
    });
    const failingPrisma = prisma.$extends({
      query: {
        actionRun: {
          async updateMany({ args, query }) {
            if ((args.data as { status?: unknown }).status === "SUCCEEDED") {
              throw new Error("Injected completion failure");
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;

    const result = await new ActionExecutor(failingPrisma).executeAction(actionId, context(task));
    expect(result).toMatchObject({ outcome: "FAILED", error: { code: "EXECUTION_FAILED" } });
    expect(await prisma.listing.count()).toBe(0);
    expect(await prisma.actionRun.findUnique({ where: { id: actionId } })).toMatchObject({
      status: "FAILED",
      errorCode: "EXECUTION_FAILED",
    });
    expect(
      await prisma.auditEvent.count({
        where: { actionId, eventType: { in: ["DRAFT_LISTING_CREATED", "ACTION_EXECUTION_SUCCEEDED"] } },
      }),
    ).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actionId, eventType: "ACTION_EXECUTION_FAILED" } })).toBe(1);
  });

  it("fails closed for unknown actions and invalid persisted payloads", async () => {
    const task = await createTask();
    const unknownId = await createAction({ taskId: task.id, sequence: 0, type: "WIRE_FUNDS", payload: {} });
    const invalidId = await createAction({
      taskId: task.id,
      sequence: 1,
      type: "SET_LISTING_PRICE",
      payload: { listingRef: "bad", priceCents: -1, currency: "USD" },
    });
    const executor = new ActionExecutor(prisma);
    expect(await executor.executeAction(unknownId, context(task))).toMatchObject({
      outcome: "FAILED",
      error: { code: "UNSUPPORTED_ACTION" },
    });
    expect(await executor.executeAction(invalidId, context(task))).toMatchObject({
      outcome: "FAILED",
      error: { code: "INVALID_ACTION_PAYLOAD" },
    });
  });

  it("does not execute actions in non-validated states", async () => {
    const task = await createTask();
    const actionId = await createAction({
      taskId: task.id,
      sequence: 0,
      type: "CREATE_DRAFT_LISTING",
      payload: { title: "Ticket", description: "Ticket", sourceItemId: USERS.alex.itemId },
      status: "WAITING_IDENTITY",
    });
    expect(await new ActionExecutor(prisma).executeAction(actionId, context(task))).toMatchObject({
      outcome: "FAILED",
      error: { code: "ACTION_NOT_EXECUTABLE" },
    });
  });
});
