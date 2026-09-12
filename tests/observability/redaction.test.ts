import { describe, expect, it } from "vitest";

import { requestIdFor } from "@/lib/observability/correlation";
import { redactSensitive } from "@/lib/observability/redaction";

describe("safe observability", () => {
  it("redacts nested secrets case-insensitively without hiding safe codes", () => {
    const result = redactSensitive({
      errorCode: "VERIFICATION_DECLINED",
      Authorization: "Bearer private",
      nested: [{ apiKey: "sk-private", PASSWORD: "private", status: "blocked" }],
      confirmationHash: "private-hash",
    });
    expect(result).toEqual({
      errorCode: "VERIFICATION_DECLINED",
      Authorization: "[REDACTED]",
      nested: [{ apiKey: "[REDACTED]", PASSWORD: "[REDACTED]", status: "blocked" }],
      confirmationHash: "[REDACTED]",
    });
  });

  it("accepts safe request IDs and replaces malformed values", () => {
    expect(requestIdFor(new Request("http://localhost", { headers: { "x-request-id": "demo-request-123" } }))).toBe("demo-request-123");
    expect(requestIdFor(new Request("http://localhost", { headers: { "x-request-id": "bad id" } }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
