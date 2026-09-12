import { describe, expect, it } from "vitest";

import { ExecutionError, toExecutionError } from "@/lib/executor/errors";

describe("executor error model", () => {
  it("preserves safe domain errors", () => {
    const error = toExecutionError(new ExecutionError("LISTING_PRICE_REQUIRED"));
    expect(error.code).toBe("LISTING_PRICE_REQUIRED");
    expect(error.safeMessage).toBe("A valid price is required before publishing.");
    expect(error.retryable).toBe(false);
  });

  it("maps internal errors without leaking their message", () => {
    const error = toExecutionError(new Error("database password: super-secret"));
    expect(error.code).toBe("EXECUTION_FAILED");
    expect(error.safeMessage).not.toContain("super-secret");
    expect(error.retryable).toBe(true);
  });
});
