import { describe, expect, it } from "vitest";

import { parseVerificationSnapshot, verificationDecision } from "@/lib/verification/client-state";

describe("verification client state", () => {
  it("waits until both approval and an authoritative grant are present", () => {
    expect(verificationDecision(parseVerificationSnapshot({ status: "PENDING", actionId: "act_1", canResume: false }))).toEqual({ kind: "WAIT" });
    expect(verificationDecision(parseVerificationSnapshot({ status: "APPROVED", actionId: "act_1", canResume: false }))).toEqual({ kind: "WAIT" });
    expect(verificationDecision(parseVerificationSnapshot({ status: "APPROVED", actionId: "act_1", canResume: true }))).toEqual({ kind: "RESUME", actionId: "act_1" });
  });

  it.each(["DECLINED", "FAILED", "EXPIRED", "CANCELLED"])("blocks terminal status %s", (status) => {
    expect(verificationDecision(parseVerificationSnapshot({ status, actionId: "act_1", canResume: false }))).toEqual({ kind: "BLOCKED", status });
  });

  it("rejects malformed server responses", () => {
    expect(() => parseVerificationSnapshot({ status: "APPROVED", actionId: "act_1", canResume: "yes" })).toThrow("INVALID_VERIFICATION_RESPONSE");
  });
});
