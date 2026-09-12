import type { AuthorizationRequirement, ListingStatus } from "@/lib/domain/statuses";

export type PolicyContext = {
  userId: string;
  sessionId: string;
  taskId: string;
  resourceExists: boolean;
  resourceOwnerId?: string;
  listingStatus?: ListingStatus;
  dependenciesSatisfied: boolean;
  environment: "demo" | "test" | "production";
};

export type PolicyDecision = {
  requirement: AuthorizationRequirement;
  policyId: string;
  policyVersion: number;
  reasonCode: string;
};

export type PolicyOutcome =
  | { kind: "ALLOW_WITH"; decision: PolicyDecision }
  | { kind: "DENY"; policyId: string; policyVersion: number; reasonCode: string };
