import { POLICY_ID, POLICY_TABLE, POLICY_VERSION } from "./policy-table";
import type { PolicyContext, PolicyOutcome } from "./types";

export function evaluatePolicy(action: { type: string }, context: PolicyContext): PolicyOutcome {
  const deny = (reasonCode: string): PolicyOutcome => ({
    kind: "DENY",
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    reasonCode,
  });

  if (!context.dependenciesSatisfied) return deny("DEPENDENCIES_NOT_SATISFIED");
  if (!context.resourceExists) return deny("RESOURCE_NOT_FOUND");
  if (!context.resourceOwnerId) return deny("RESOURCE_OWNER_UNKNOWN");
  if (context.resourceOwnerId !== context.userId) return deny("RESOURCE_OWNER_MISMATCH");
  if (!(action.type in POLICY_TABLE)) return deny("UNSUPPORTED_ACTION");
  if (
    (action.type === "SET_LISTING_PRICE" || action.type === "PUBLISH_LISTING") &&
    context.listingStatus !== "DRAFT"
  ) {
    return deny("LISTING_NOT_DRAFT");
  }

  const rule = POLICY_TABLE[action.type as keyof typeof POLICY_TABLE];
  return {
    kind: "ALLOW_WITH",
    decision: { ...rule, policyId: POLICY_ID, policyVersion: POLICY_VERSION },
  };
}
