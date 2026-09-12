import type { Prisma } from "@prisma/client";

import { taskRunStatusSchema, type TaskRunStatus } from "@/lib/domain/statuses";
import { ExecutionError } from "@/lib/executor/errors";
import { InvalidStateTransitionError } from "./transition-error";

export const TASK_TRANSITIONS: Readonly<Record<TaskRunStatus, readonly TaskRunStatus[]>> = {
  PLANNING: ["READY", "FAILED", "CANCELLED"],
  READY: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["WAITING_CONFIRMATION", "WAITING_IDENTITY", "COMPLETED", "FAILED", "CANCELLED"],
  WAITING_CONFIRMATION: ["RUNNING", "CANCELLED", "FAILED"],
  WAITING_IDENTITY: ["RUNNING", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertTaskTransition(from: string, to: string): void {
  const parsedFrom = taskRunStatusSchema.safeParse(from);
  const parsedTo = taskRunStatusSchema.safeParse(to);
  if (!parsedFrom.success || !parsedTo.success || !TASK_TRANSITIONS[parsedFrom.data].includes(parsedTo.data)) {
    throw new InvalidStateTransitionError("task", from, to);
  }
}

export async function transitionTask(
  tx: Prisma.TransactionClient,
  input: { taskId: string; from: TaskRunStatus; to: TaskRunStatus },
): Promise<void> {
  assertTaskTransition(input.from, input.to);
  const result = await tx.taskRun.updateMany({
    where: { id: input.taskId, status: input.from },
    data: { status: input.to },
  });
  if (result.count !== 1) throw new ExecutionError("INVALID_STATE_TRANSITION");
}
