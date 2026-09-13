import { describe, expect, it } from "vitest";

import { compilePlan } from "@/lib/planner/plan-compiler";
import { validatePlannerSemantics } from "@/lib/planner/plan-validator";
import { PLANNER_PROPOSAL_JSON_SCHEMA, plannerProposalSchema } from "@/lib/planner/proposal-schema";

const proposal = {
  kind: "PLAN" as const,
  summary: "List the ticket.",
  actions: [
    { key: "draft", type: "CREATE_DRAFT_LISTING" as const, payload: { title: "Ticket", description: "A ticket", sourceItemId: "item_1" }, rationale: "Draft", dependsOn: [] },
    { key: "price", type: "SET_LISTING_PRICE" as const, payload: { listingRef: "result:draft", priceCents: 8000, currency: "USD" as const }, rationale: "Price", dependsOn: ["draft"] },
    { key: "publish", type: "PUBLISH_LISTING" as const, payload: { listingRef: "result:draft" }, rationale: "Publish", dependsOn: ["price"] },
  ],
};

const context = { requestText: "Sell my ticket for $80.", userId: "user_1", inventory: [{ id: "item_1", ownerId: "user_1" }] };

describe("planner proposal boundary", () => {
  it("accepts only strict allowlisted proposals", () => {
    expect(plannerProposalSchema.parse(proposal)).toEqual(proposal);
    expect(plannerProposalSchema.safeParse({ ...proposal, authorized: true }).success).toBe(false);
    expect(plannerProposalSchema.safeParse({ ...proposal, actions: [{ type: "DELETE_USER" }] }).success).toBe(false);
    expect(plannerProposalSchema.safeParse({ kind: "UNSUPPORTED", summary: "No", actions: [] }).success).toBe(true);
    expect(plannerProposalSchema.safeParse({ kind: "UNSUPPORTED", summary: "No", actions: proposal.actions }).success).toBe(false);
    expect(plannerProposalSchema.safeParse({ kind: "PLAN", summary: "No", actions: [] }).success).toBe(false);
    expect(plannerProposalSchema.safeParse({ ...proposal, actions: proposal.actions.slice(0, 1) }).success).toBe(true);
  });

  it("uses the OpenAI Structured Outputs schema subset", () => {
    const serialized = JSON.stringify(PLANNER_PROPOSAL_JSON_SCHEMA);
    expect(PLANNER_PROPOSAL_JSON_SCHEMA.type).toBe("object");
    expect(PLANNER_PROPOSAL_JSON_SCHEMA).not.toHaveProperty("anyOf");
    expect(serialized).not.toContain('"oneOf"');
    expect(serialized).toContain('"anyOf"');
  });

  it("rejects bad references, dependencies, ownership, and price drift", () => {
    expect(() => validatePlannerSemantics({ ...proposal, actions: [proposal.actions[1], proposal.actions[0], proposal.actions[2]] }, context)).toThrow();
    expect(() => validatePlannerSemantics(proposal, { ...context, inventory: [{ id: "item_1", ownerId: "other" }] })).toThrowError(expect.objectContaining({ code: "PLAN_RESOURCE_OWNERSHIP_MISMATCH" }));
    const changed = structuredClone(proposal);
    changed.actions[1].payload.priceCents = 9000;
    expect(() => validatePlannerSemantics(changed, context)).toThrowError(expect.objectContaining({ code: "PLAN_PRICE_MISMATCH" }));
    expect(() => validatePlannerSemantics({ kind: "UNSUPPORTED", summary: "No", actions: [] }, context)).toThrowError(expect.objectContaining({ code: "PLAN_UNSUPPORTED_REQUEST" }));
  });

  it("compiles symbolic references into server-owned action IDs", () => {
    const validated = validatePlannerSemantics(proposal, context);
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    const compiled = compilePlan(validated, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", () => ids.shift()!);
    expect(compiled.map((action) => action.status)).toEqual(["PROPOSED", "PROPOSED", "PROPOSED"]);
    expect(compiled[1].payloadJson).toMatchObject({ listingRef: "action:11111111-1111-4111-8111-111111111111" });
    expect(compiled[2].dependsOnJson).toEqual(["action:22222222-2222-4222-8222-222222222222"]);
  });
});
