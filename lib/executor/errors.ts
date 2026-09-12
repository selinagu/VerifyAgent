export const EXECUTION_ERROR_CODES = [
  "ACTION_NOT_FOUND",
  "ACTION_NOT_EXECUTABLE",
  "ACTION_ALREADY_EXECUTING",
  "INVALID_ACTION_PAYLOAD",
  "UNSUPPORTED_ACTION",
  "TASK_OWNERSHIP_MISMATCH",
  "SESSION_MISMATCH",
  "SOURCE_ITEM_NOT_FOUND",
  "SOURCE_ITEM_OWNERSHIP_MISMATCH",
  "INVALID_LISTING_REFERENCE",
  "DEPENDENCY_NOT_SUCCEEDED",
  "LISTING_NOT_FOUND",
  "LISTING_OWNERSHIP_MISMATCH",
  "INVALID_LISTING_STATE",
  "LISTING_PRICE_REQUIRED",
  "CONCURRENT_MODIFICATION",
  "EXECUTION_FAILED",
] as const;

export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

const SAFE_MESSAGES: Record<ExecutionErrorCode, string> = {
  ACTION_NOT_FOUND: "The requested action does not exist.",
  ACTION_NOT_EXECUTABLE: "The action is not currently executable.",
  ACTION_ALREADY_EXECUTING: "The action is already executing.",
  INVALID_ACTION_PAYLOAD: "The action payload is invalid.",
  UNSUPPORTED_ACTION: "The action type is not supported.",
  TASK_OWNERSHIP_MISMATCH: "The action does not belong to the current user.",
  SESSION_MISMATCH: "The action does not belong to the current session.",
  SOURCE_ITEM_NOT_FOUND: "The source item does not exist.",
  SOURCE_ITEM_OWNERSHIP_MISMATCH: "The source item does not belong to the current user.",
  INVALID_LISTING_REFERENCE: "The listing reference is invalid.",
  DEPENDENCY_NOT_SUCCEEDED: "A required earlier action has not succeeded.",
  LISTING_NOT_FOUND: "The listing does not exist.",
  LISTING_OWNERSHIP_MISMATCH: "The listing does not belong to the current user.",
  INVALID_LISTING_STATE: "The listing is not in a state that allows this action.",
  LISTING_PRICE_REQUIRED: "A valid price is required before publishing.",
  CONCURRENT_MODIFICATION: "The listing changed while the action was executing.",
  EXECUTION_FAILED: "The action could not be executed.",
};

const RETRYABLE_CODES = new Set<ExecutionErrorCode>([
  "ACTION_ALREADY_EXECUTING",
  "CONCURRENT_MODIFICATION",
  "EXECUTION_FAILED",
]);

export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly safeMessage: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(code: ExecutionErrorCode, options?: { cause?: unknown; message?: string }) {
    super(options?.message ?? SAFE_MESSAGES[code]);
    this.name = "ExecutionError";
    this.code = code;
    this.safeMessage = SAFE_MESSAGES[code];
    this.retryable = RETRYABLE_CODES.has(code);
    this.cause = options?.cause;
  }
}

export function toExecutionError(error: unknown): ExecutionError {
  return error instanceof ExecutionError
    ? error
    : new ExecutionError("EXECUTION_FAILED", { cause: error });
}
