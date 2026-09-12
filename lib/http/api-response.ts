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
  VERIFICATION_NOT_FOUND: 404,
  VERIFICATION_NOT_STARTABLE: 409,
  VERIFICATION_ALREADY_TERMINAL: 409,
  VERIFICATION_ACTION_CHANGED: 409,
  VERIFICATION_EXPIRED: 410,
  PERSONA_NOT_CONFIGURED: 503,
  PERSONA_REQUEST_FAILED: 502,
  PERSONA_RESPONSE_INVALID: 502,
  PERSONA_WEBHOOK_SIGNATURE_MISSING: 401,
  PERSONA_WEBHOOK_SIGNATURE_INVALID: 401,
  PERSONA_EVENT_INVALID: 400,
  INQUIRY_BINDING_MISMATCH: 409,
  LLM_NOT_CONFIGURED: 503,
  LLM_REQUEST_FAILED: 502,
  LLM_TIMEOUT: 504,
  LLM_RESPONSE_INVALID: 502,
  LLM_REFUSAL: 422,
  PLAN_SCHEMA_INVALID: 422,
  PLAN_SEMANTIC_INVALID: 422,
  PLAN_UNSUPPORTED_REQUEST: 422,
  PLAN_REFERENCE_INVALID: 422,
  PLAN_DEPENDENCY_INVALID: 422,
  PLAN_RESOURCE_NOT_FOUND: 422,
  PLAN_RESOURCE_OWNERSHIP_MISMATCH: 404,
  PLAN_PRICE_MISMATCH: 422,
  PLANNING_IDEMPOTENCY_CONFLICT: 409,
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
