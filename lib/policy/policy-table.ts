import type { ActionType } from "@/lib/actions/schema";
import type { PolicyDecision } from "./types";

export const POLICY_ID = "marketplace-actions";
export const POLICY_VERSION = 1;

export const POLICY_TABLE: Readonly<Record<ActionType, Omit<PolicyDecision, "policyId" | "policyVersion">>> = {
  CREATE_DRAFT_LISTING: { requirement: "NONE", reasonCode: "PRIVATE_DRAFT_LOW_RISK" },
  SET_LISTING_PRICE: { requirement: "CONFIRM", reasonCode: "PRICE_REQUIRES_CONFIRMATION" },
  PUBLISH_LISTING: {
    requirement: "VERIFIED_IDENTITY",
    reasonCode: "PUBLIC_ACTION_REQUIRES_VERIFIED_IDENTITY",
  },
};
