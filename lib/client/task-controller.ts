import type { TaskSnapshot } from "./contracts";

export type WorkspaceViewState =
  | "IDLE"
  | "PLANNING"
  | "TASK_READY"
  | "RUNNING_TASK"
  | "AWAITING_CONFIRMATION"
  | "AWAITING_IDENTITY"
  | "COMPLETED"
  | "FAILED";

export function viewStateForTask(task?: Pick<TaskSnapshot, "status">): WorkspaceViewState {
  if (!task) return "IDLE";
  const states: Record<string, WorkspaceViewState> = {
    PLANNING: "PLANNING",
    READY: "TASK_READY",
    RUNNING: "RUNNING_TASK",
    WAITING_CONFIRMATION: "AWAITING_CONFIRMATION",
    WAITING_IDENTITY: "AWAITING_IDENTITY",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "FAILED",
  };
  return states[task.status] ?? "FAILED";
}

export type RequestAttempt = { requestText: string; idempotencyKey: string };

export function requestAttempt(
  requestText: string,
  previous?: RequestAttempt,
  idFactory: () => string = () => crypto.randomUUID(),
): RequestAttempt {
  const normalized = requestText.trim();
  if (previous?.requestText === normalized) return previous;
  return { requestText: normalized, idempotencyKey: `workspace:${idFactory()}` };
}
