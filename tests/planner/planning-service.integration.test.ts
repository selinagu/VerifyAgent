import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FakePlannerGateway } from "@/lib/demo/fake-planner-gateway";
import { DEMO_IDS, DEMO_PROMPT } from "@/lib/demo/fixtures";
import { resetDemoNamespace } from "@/lib/demo/reset-demo";
import { PlanningService } from "@/lib/planner/planning-service";
import { createMigratedTestDatabase } from "@/tests/helpers/test-database";

const database = createMigratedTestDatabase(`phase4-planning-${randomUUID()}`);
const context = { userId: DEMO_IDS.userId, sessionId: DEMO_IDS.sessionId };

beforeEach(async () => resetDemoNamespace(database.prisma));
afterAll(async () => database.cleanup());

describe("Phase 4 planning service", () => {
  it("persists an audited validated plan and safely replays idempotent requests", async () => {
    const service = new PlanningService(database.prisma, new FakePlannerGateway());
    const created = await service.createTask({ requestText: DEMO_PROMPT, idempotencyKey: "phase4-idempotency-0001", context });
    expect(created.status).toBe("READY");
    expect(created.planning).toMatchObject({ provider: "fake", promptVersion: "marketplace-planner-v1", errorCode: null });
    expect(created.actions.map((action) => action.status)).toEqual(["VALIDATED", "VALIDATED", "VALIDATED"]);
    expect(created.audit.filter((event) => event.eventType === "ACTION_PROPOSED")).toHaveLength(3);
    expect(created.audit.filter((event) => event.eventType === "ACTION_VALIDATED")).toHaveLength(3);

    const replay = await service.createTask({ requestText: DEMO_PROMPT, idempotencyKey: "phase4-idempotency-0001", context });
    expect(replay.id).toBe(created.id);
    expect(await database.prisma.taskRun.count()).toBe(1);
    await expect(service.createTask({ requestText: "Sell my concert ticket for $90.", idempotencyKey: "phase4-idempotency-0001", context })).rejects.toMatchObject({ code: "PLANNING_IDEMPOTENCY_CONFLICT" });
  });

  it("fails closed for malformed model output without mutating marketplace state", async () => {
    const service = new PlanningService(database.prisma, new FakePlannerGateway({ kind: "PLAN", summary: "bad", actions: [{ type: "DELETE_ALL" }] }));
    await expect(service.createTask({ requestText: DEMO_PROMPT, idempotencyKey: "phase4-idempotency-0002", context })).rejects.toMatchObject({ code: "PLAN_SCHEMA_INVALID" });
    expect(await database.prisma.listing.count()).toBe(0);
    expect(await database.prisma.actionRun.count()).toBe(0);
    const task = await database.prisma.taskRun.findFirstOrThrow();
    expect(task).toMatchObject({ status: "FAILED", planningErrorCode: "PLAN_SCHEMA_INVALID" });
    expect(await database.prisma.auditEvent.count({ where: { eventType: "TASK_PLANNING_FAILED" } })).toBe(1);
  });

  it("rejects a model-selected resource owned by another user", async () => {
    const otherId = "other_item";
    await database.prisma.user.create({ data: { id: "other_user", displayName: "Other" } });
    await database.prisma.inventoryItem.create({ data: { id: otherId, ownerId: "other_user", type: "TICKET", title: "Other", description: "Other" } });
    const base = await new FakePlannerGateway().createPlan({ requestText: DEMO_PROMPT, availableInventory: [{ id: otherId, type: "TICKET", title: "Other", description: "Other" }], supportedActions: [], promptVersion: "v1" }) as { actions: Array<{ type: string; payload: Record<string, unknown> }> };
    const service = new PlanningService(database.prisma, new FakePlannerGateway(base));
    await expect(service.createTask({ requestText: DEMO_PROMPT, idempotencyKey: "phase4-idempotency-0003", context })).rejects.toMatchObject({ code: "PLAN_RESOURCE_OWNERSHIP_MISMATCH" });
    expect(await database.prisma.listing.count()).toBe(0);
  });
});
