import type { Prisma } from "@prisma/client";

import { actionRunStatusSchema, type ActionRunStatus } from "@/lib/domain/statuses";
import { ExecutionError } from "@/lib/executor/errors";
import { InvalidStateTransitionError } from "./transition-error";

export const ACTION_TRANSITIONS: Readonly<Record<ActionRunStatus, readonly ActionRunStatus[]>> = {
  PROPOSED: ["VALIDATED", "FAILED", "CANCELLED"],
  VALIDATED: ["POLICY_EVALUATED", "FAILED", "CANCELLED"],
  POLICY_EVALUATED: ["AUTHORIZED", "WAITING_CONFIRMATION", "WAITING_IDENTITY", "DENIED", "FAILED"],
  WAITING_CONFIRMATION: ["AUTHORIZED", "DENIED", "CANCELLED", "FAILED"],
  WAITING_IDENTITY: ["AUTHORIZED", "DENIED", "CANCELLED", "FAILED"],
  AUTHORIZED: ["EXECUTING", "FAILED", "CANCELLED"],
  EXECUTING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  DENIED: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertActionTransition(from: string, to: string): void {
  const parsedFrom = actionRunStatusSchema.safeParse(from);
  const parsedTo = actionRunStatusSchema.safeParse(to);
  if (!parsedFrom.success || !parsedTo.success || !ACTION_TRANSITIONS[parsedFrom.data].includes(parsedTo.data)) {
    throw new InvalidStateTransitionError("action", from, to);
  }
}

export async function transitionAction(
  tx: Prisma.TransactionClient,
  input: { actionId: string; from: ActionRunStatus; to: ActionRunStatus; data?: Prisma.ActionRunUpdateManyMutationInput },
): Promise<void> {
  assertActionTransition(input.from, input.to);
  const result = await tx.actionRun.updateMany({
    where: { id: input.actionId, status: input.from },
    data: { ...input.data, status: input.to },
  });
  if (result.count !== 1) throw new ExecutionError("INVALID_STATE_TRANSITION");
}
