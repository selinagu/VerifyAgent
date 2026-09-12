import type { ExecutionErrorCode } from "./errors";

export type ExecutionContext = {
  userId: string;
  sessionId: string;
  correlationId: string;
};

export type ExecutionSuccess = {
  outcome: "SUCCEEDED";
  actionId: string;
  replayed: boolean;
  result: Record<string, unknown>;
};

export type ExecutionFailure = {
  outcome: "FAILED";
  actionId: string;
  error: {
    code: ExecutionErrorCode;
    message: string;
    retryable: boolean;
  };
};

export type ExecutionResult = ExecutionSuccess | ExecutionFailure;
