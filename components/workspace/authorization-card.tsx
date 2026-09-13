import type { TaskActionSnapshot, TaskSnapshot } from "@/lib/client/contracts";
import { actionPayloadSummary } from "@/lib/presentation/action-display";

type VerificationError = {
  code: string;
  message: string;
};

type Props = {
  task: TaskSnapshot;
  busy: boolean;
  verificationError?: VerificationError;
  onConfirm(action: TaskActionSnapshot, decision: "APPROVE" | "REJECT"): void;
  onVerify(action: TaskActionSnapshot): void;
};

export function AuthorizationCard({ task, busy, verificationError, onConfirm, onVerify }: Props) {
  const waiting = task.actions.find((action) => action.status === task.status);
  const verificationFailure = [...task.audit].reverse().find((event) =>
    ["IDENTITY_VERIFICATION_DECLINED", "IDENTITY_VERIFICATION_FAILED", "IDENTITY_VERIFICATION_EXPIRED"].includes(event.eventType),
  );
  if (task.status === "WAITING_CONFIRMATION" && waiting) {
    return (
      <section className="rounded-3xl border border-amber-300/25 bg-amber-300/[0.07] p-6" aria-labelledby="confirmation-heading">
        <p className="eyebrow text-amber-300">Your decision</p>
        <h2 id="confirmation-heading" className="mt-2 text-xl font-semibold text-white">Confirm the exact price</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{actionPayloadSummary(waiting)}. Approving allows the agent to continue with this exact server-loaded action.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="primary-button bg-amber-300 hover:bg-amber-200" disabled={busy || !waiting.confirmationPayloadHash} onClick={() => onConfirm(waiting, "APPROVE")}>Approve price</button>
          <button type="button" className="secondary-button" disabled={busy || !waiting.confirmationPayloadHash} onClick={() => onConfirm(waiting, "REJECT")}>Reject and cancel</button>
        </div>
      </section>
    );
  }
  if (task.status === "WAITING_IDENTITY" && waiting) {
    return (
      <section className="rounded-3xl border border-violet-300/25 bg-violet-300/[0.07] p-6" aria-labelledby="identity-heading">
        <p className="eyebrow text-violet-300">Verified human required</p>
        <h2 id="identity-heading" className="mt-2 text-xl font-semibold text-white">Authorize public publishing</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">Publishing publicly represents you. Persona verifies the human; the signed server webhook authorizes only this exact action.</p>
        {verificationFailure && (
          <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            Previous verification did not approve. No grant was issued; the listing remains private. You may start a new Sandbox attempt.
          </p>
        )}
        {verificationError && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            <strong>Persona could not start.</strong> {verificationError.message} The listing remains private.
          </p>
        )}
        <button type="button" className="primary-button mt-5 bg-violet-300 hover:bg-violet-200" disabled={busy} onClick={() => onVerify(waiting)}>
          {busy ? "Starting Persona…" : "Verify identity with Persona"}
        </button>
      </section>
    );
  }
  return null;
}
