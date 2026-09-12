import type { AuditSnapshot, TaskActionSnapshot } from "@/lib/client/contracts";

const EVENT_LABELS: Record<string, string> = {
  TASK_PLANNING_STARTED: "Planning started",
  ACTION_PROPOSED: "Agent proposed action",
  ACTION_VALIDATED: "Action validated",
  TASK_PLAN_READY: "Plan ready",
  POLICY_EVALUATED: "Policy evaluated",
  ACTION_WAITING_CONFIRMATION: "Waiting for confirmation",
  ACTION_CONFIRMATION_APPROVED: "Human confirmed action",
  ACTION_CONFIRMATION_REJECTED: "Human rejected action",
  ACTION_WAITING_IDENTITY: "Waiting for verified identity",
  IDENTITY_VERIFICATION_CREATED: "Identity verification created",
  PERSONA_INQUIRY_CREATED: "Persona inquiry started",
  IDENTITY_VERIFICATION_APPROVED: "Identity verified",
  IDENTITY_GRANT_ISSUED: "Exact-action grant issued",
  IDENTITY_GRANT_CONSUMED: "One-time grant consumed",
  LISTING_PUBLISHED: "Listing published",
  TASK_COMPLETED: "Task completed",
};

export function AuditTrail({ audit, actions }: { audit: AuditSnapshot[]; actions: TaskActionSnapshot[] }) {
  const actionIndex = new Map(actions.map((action, index) => [action.id, index + 1]));
  return (
    <details className="panel group p-6" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
        <div>
          <p className="eyebrow">Append-only evidence</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Audit trail</h2>
        </div>
        <span className="text-sm text-slate-500 group-open:text-cyan-300">{audit.length} events · toggle</span>
      </summary>
      <ol className="mt-6 divide-y divide-slate-800">
        {[...audit].reverse().map((event) => (
          <li key={event.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium text-slate-200">{EVENT_LABELS[event.eventType] ?? event.eventType.replaceAll("_", " ").toLowerCase()}</p>
              <p className="mt-1 text-xs text-slate-500">
                {event.actorType} · {event.outcome}
                {event.actionId && actionIndex.has(event.actionId) ? ` · Action ${actionIndex.get(event.actionId)}` : ""}
                {event.reasonCode ? ` · ${event.reasonCode}` : ""}
              </p>
            </div>
            <time className="text-xs text-slate-600" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
          </li>
        ))}
      </ol>
    </details>
  );
}
