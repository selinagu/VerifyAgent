import { afterEach, describe, expect, it, vi } from "vitest";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import {
  confirmationRequestSchema,
  emptyMutationBodySchema,
  planningIdempotencyKeySchema,
  taskCreationRequestSchema,
} from "@/lib/http/request-contracts";

describe("Phase 2 HTTP trust boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects caller-injected identity fields", () => {
    expect(emptyMutationBodySchema.safeParse({ userId: "attacker" }).success).toBe(false);
    expect(
      confirmationRequestSchema.safeParse({
        decision: "APPROVE",
        expectedPayloadHash: `sha256:${"a".repeat(64)}`,
        sessionId: "attacker-session",
      }).success,
    ).toBe(false);
    expect(taskCreationRequestSchema.safeParse({ requestText: "Sell it", userId: "attacker" }).success).toBe(false);
  });

  it("validates bounded planning requests and idempotency keys", () => {
    expect(taskCreationRequestSchema.parse({ requestText: "  Sell my ticket for $80.  " })).toEqual({
      requestText: "Sell my ticket for $80.",
    });
    expect(taskCreationRequestSchema.safeParse({ requestText: "" }).success).toBe(false);
    expect(planningIdempotencyKeySchema.safeParse("phase4-request-0001").success).toBe(true);
    expect(planningIdempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(planningIdempotencyKeySchema.safeParse("phase4 request invalid").success).toBe(false);
  });

  it("rejects malformed confirmation data", () => {
    expect(confirmationRequestSchema.safeParse({ decision: "YES", expectedPayloadHash: "x" }).success).toBe(false);
  });

  it("requires demo mode outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getDemoExecutionContext(parseEnv({ ...process.env, DEMO_MODE: "false" }), "request")).toThrowError(
      expect.objectContaining({ code: "AUTH_CONTEXT_UNAVAILABLE" }),
    );
  });
});
