export type VerificationClientSnapshot = {
  status: string;
  actionId: string;
  canResume: boolean;
  failureReasonCode?: string | null;
};

export type VerificationDecision =
  | { kind: "WAIT" }
  | { kind: "RESUME"; actionId: string }
  | { kind: "BLOCKED"; status: string };

const TERMINAL_FAILURES = new Set(["DECLINED", "FAILED", "EXPIRED", "CANCELLED"]);

export function parseVerificationSnapshot(value: unknown): VerificationClientSnapshot {
  if (!value || typeof value !== "object") throw new Error("INVALID_VERIFICATION_RESPONSE");
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string" || typeof record.actionId !== "string" || typeof record.canResume !== "boolean") {
    throw new Error("INVALID_VERIFICATION_RESPONSE");
  }
  return {
    status: record.status,
    actionId: record.actionId,
    canResume: record.canResume,
    failureReasonCode: typeof record.failureReasonCode === "string" ? record.failureReasonCode : null,
  };
}

export function verificationDecision(snapshot: VerificationClientSnapshot): VerificationDecision {
  if (snapshot.status === "APPROVED" && snapshot.canResume) return { kind: "RESUME", actionId: snapshot.actionId };
  if (TERMINAL_FAILURES.has(snapshot.status)) return { kind: "BLOCKED", status: snapshot.status };
  return { kind: "WAIT" };
}
