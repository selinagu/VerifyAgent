import type { Prisma } from "@prisma/client";

import { candidateActionSchema, type CandidateAction } from "./schema";
import { ExecutionError } from "@/lib/executor/errors";

const SUPPORTED_ACTIONS = new Set([
  "CREATE_DRAFT_LISTING",
  "SET_LISTING_PRICE",
  "PUBLISH_LISTING",
]);

export type PersistedActionShape = {
  type: string;
  payloadJson: Prisma.JsonValue;
  dependsOnJson: Prisma.JsonValue;
  rationale: string;
};

export function parsePersistedAction(action: PersistedActionShape): CandidateAction {
  if (!SUPPORTED_ACTIONS.has(action.type)) throw new ExecutionError("UNSUPPORTED_ACTION");
  const parsed = candidateActionSchema.safeParse({
    type: action.type,
    payload: action.payloadJson,
    rationale: action.rationale,
    dependsOn: action.dependsOnJson,
  });
  if (!parsed.success) {
    throw new ExecutionError("INVALID_ACTION_PAYLOAD", { cause: parsed.error });
  }
  return parsed.data;
}
