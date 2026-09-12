import type { TaskActionSnapshot } from "@/lib/client/contracts";
import { actionLabel, actionPayloadSummary, requirementLabel } from "@/lib/presentation/action-display";

const complete = new Set(["SUCCEEDED"]);
const active = new Set(["POLICY_EVALUATED", "WAITING_CONFIRMATION", "WAITING_IDENTITY", "AUTHORIZED", "EXECUTING"]);

function requirementClass(requirement: string | null) {
  if (requirement === "VERIFIED_IDENTITY") return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  if (requirement === "CONFIRM") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (requirement === "NONE") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  return "border-slate-600 bg-slate-800 text-slate-400";
}

export function ActionTimeline({ actions }: { actions: TaskActionSnapshot[] }) {
  return (
    <section className="panel p-6" aria-labelledby="actions-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Structured actions</p>
          <h2 id="actions-heading" className="mt-2 text-xl font-semibold text-white">Authorization timeline</h2>
        </div>
        <span className="text-sm text-slate-500">{actions.length} steps</span>
      </div>
      <ol className="mt-6 space-y-3">
        {actions.map((action, index) => {
          const isComplete = complete.has(action.status);
          const isActive = active.has(action.status);
          return (
            <li key={action.id} className="relative grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
              {index < actions.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-1.25rem)] w-px bg-slate-700" />}
              <span className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${isComplete ? "border-emerald-400 bg-emerald-400 text-slate-950" : isActive ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-slate-700 bg-slate-900 text-slate-500"}`} aria-hidden="true">
                {isComplete ? "✓" : index + 1}
              </span>
              <article className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-100">{actionLabel(action.type)}</h3>
                    <p className="mt-1 text-sm text-slate-400">{actionPayloadSummary(action)}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${requirementClass(action.requirement)}`}>
                    {requirementLabel(action.requirement)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">{action.rationale}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="font-mono text-slate-500">{action.type}</span>
                  <span className={isComplete ? "text-emerald-300" : isActive ? "text-cyan-300" : "text-slate-500"}>{action.status.replaceAll("_", " ")}</span>
                  {action.reasonCode && <span className="break-all text-slate-500">Policy: {action.reasonCode}</span>}
                  {action.errorCode && <span className="break-all text-rose-300">{action.errorCode}</span>}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
