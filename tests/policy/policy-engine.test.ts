import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "@/lib/policy/policy-engine";
import type { PolicyContext } from "@/lib/policy/types";

const context: PolicyContext = {
  userId: "user-1",
  sessionId: "session-1",
  taskId: "task-1",
  resourceExists: true,
  resourceOwnerId: "user-1",
  listingStatus: "DRAFT",
  dependenciesSatisfied: true,
  environment: "test",
};

describe("deterministic policy engine", () => {
  it.each([
    ["CREATE_DRAFT_LISTING", "NONE", "PRIVATE_DRAFT_LOW_RISK"],
    ["SET_LISTING_PRICE", "CONFIRM", "PRICE_REQUIRES_CONFIRMATION"],
    ["PUBLISH_LISTING", "VERIFIED_IDENTITY", "PUBLIC_ACTION_REQUIRES_VERIFIED_IDENTITY"],
  ])("maps %s to %s", (type, requirement, reasonCode) => {
    expect(evaluatePolicy({ type }, context)).toMatchObject({
      kind: "ALLOW_WITH",
      decision: { requirement, reasonCode, policyId: "marketplace-actions", policyVersion: 1 },
    });
    expect(evaluatePolicy({ type }, context)).toEqual(evaluatePolicy({ type }, context));
  });

  it.each([
    [{ dependenciesSatisfied: false }, "DEPENDENCIES_NOT_SATISFIED"],
    [{ resourceExists: false }, "RESOURCE_NOT_FOUND"],
    [{ resourceOwnerId: "another-user" }, "RESOURCE_OWNER_MISMATCH"],
    [{ listingStatus: "PUBLISHED" as const }, "LISTING_NOT_DRAFT"],
  ])("denies invalid context", (override, reasonCode) => {
    expect(evaluatePolicy({ type: "PUBLISH_LISTING" }, { ...context, ...override })).toMatchObject({
      kind: "DENY",
      reasonCode,
    });
  });

  it("denies unsupported actions", () => {
    expect(evaluatePolicy({ type: "DELETE_ACCOUNT" }, context)).toMatchObject({
      kind: "DENY",
      reasonCode: "UNSUPPORTED_ACTION",
    });
  });
});
