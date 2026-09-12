import { describe, expect, it } from "vitest";

import {
  actionPlanSchema,
  candidateActionSchema,
  canonicalJson,
  hashCanonicalPayload,
} from "@/lib/actions/schema";

const actions = [
  {
    type: "CREATE_DRAFT_LISTING",
    payload: {
      title: "Concert ticket",
      description: "One transferable ticket.",
      sourceItemId: "demo_item_concert_ticket",
    },
    rationale: "Prepare the listing privately.",
    dependsOn: [],
  },
  {
    type: "SET_LISTING_PRICE",
    payload: { listingRef: "action:draft", priceCents: 8_000, currency: "USD" },
    rationale: "Use the price requested by the user.",
    dependsOn: ["action:draft"],
  },
  {
    type: "PUBLISH_LISTING",
    payload: { listingRef: "action:draft" },
    rationale: "Publish the completed listing.",
    dependsOn: ["action:price"],
  },
] as const;

describe("candidate action schema", () => {
  it.each(actions)("accepts $type", (action) => {
    expect(candidateActionSchema.safeParse(action).success).toBe(true);
  });

  it("rejects unknown actions", () => {
    expect(
      candidateActionSchema.safeParse({
        type: "TRANSFER_MONEY",
        payload: {},
        rationale: "Unsafe",
        dependsOn: [],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown payload fields", () => {
    expect(
      candidateActionSchema.safeParse({
        ...actions[2],
        payload: { ...actions[2].payload, authorization: "VERIFIED_IDENTITY" },
      }).success,
    ).toBe(false);
  });

  it.each([
    { listingRef: "action:draft", priceCents: 0, currency: "USD" },
    { listingRef: "action:draft", priceCents: -1, currency: "USD" },
    { listingRef: "action:draft", priceCents: 1.5, currency: "USD" },
    { listingRef: "action:draft", priceCents: 8_000, currency: "EUR" },
    { listingRef: "", priceCents: 8_000, currency: "USD" },
  ])("rejects invalid price payload %#", (payload) => {
    expect(
      candidateActionSchema.safeParse({
        type: "SET_LISTING_PRICE",
        payload,
        rationale: "Set price",
        dependsOn: [],
      }).success,
    ).toBe(false);
  });

  it("rejects overlong strings", () => {
    expect(
      candidateActionSchema.safeParse({
        type: "CREATE_DRAFT_LISTING",
        payload: {
          title: "x".repeat(121),
          description: "valid",
          sourceItemId: "item",
        },
        rationale: "valid",
        dependsOn: [],
      }).success,
    ).toBe(false);
  });

  it("rejects authoritative server fields smuggled into a candidate", () => {
    expect(
      candidateActionSchema.safeParse({
        ...actions[2],
        id: "f4e8e3bf-4ff5-489e-a5ab-fc0e492af654",
        idempotencyKey: "attacker-controlled-key",
        requirement: "NONE",
      }).success,
    ).toBe(false);
  });
});

describe("action plan schema", () => {
  it("rejects plans with more than five actions", () => {
    expect(
      actionPlanSchema.safeParse({
        summary: "Too many actions",
        actions: Array.from({ length: 6 }, () => actions[2]),
      }).success,
    ).toBe(false);
  });
});

describe("canonical payload", () => {
  it("is stable across object key order", () => {
    const left = { currency: "USD", nested: { b: 2, a: 1 }, priceCents: 8_000 };
    const right = { priceCents: 8_000, nested: { a: 1, b: 2 }, currency: "USD" };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCanonicalPayload(left)).toBe(hashCanonicalPayload(right));
  });
});
