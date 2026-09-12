import { ZodError } from "zod";

import { ExecutionError } from "@/lib/executor/errors";

const STATUS_BY_CODE: Partial<Record<ExecutionError["code"], number>> = {
  ACTION_NOT_FOUND: 404,
  TASK_NOT_FOUND: 404,
  TASK_OWNERSHIP_MISMATCH: 404,
  SESSION_MISMATCH: 404,
  AUTH_CONTEXT_UNAVAILABLE: 403,
  ACTION_CHANGED: 409,
  INVALID_STATE_TRANSITION: 409,
  ACTION_NOT_EXECUTABLE: 409,
  TASK_NOT_RUNNABLE: 409,
};

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "The request body is invalid." } },
      { status: 400 },
    );
  }
  if (error instanceof ExecutionError) {
    return Response.json(
      { error: { code: error.code, message: error.safeMessage, retryable: error.retryable } },
      { status: STATUS_BY_CODE[error.code] ?? 400 },
    );
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
    { status: 500 },
  );
}
