import { ExecutionError } from "@/lib/executor/errors";

export class InvalidStateTransitionError extends ExecutionError {
  constructor(entity: "action" | "task", from: string, to: string) {
    super("INVALID_STATE_TRANSITION", {
      message: `Invalid ${entity} transition: ${from} -> ${to}`,
    });
    this.name = "InvalidStateTransitionError";
  }
}
