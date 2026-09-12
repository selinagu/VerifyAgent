"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createWorkspaceApi, ApiClientError } from "@/lib/client/api-client";
import type { DemoContext, ReadinessSnapshot, TaskActionSnapshot, TaskSnapshot } from "@/lib/client/contracts";
import { requestAttempt, type RequestAttempt, viewStateForTask } from "@/lib/client/task-controller";
import { ActionTimeline } from "./action-timeline";
import { AuditTrail } from "./audit-trail";
import { AuthorizationCard } from "./authorization-card";
import { MarketplacePreview } from "./marketplace-preview";
import { RequestComposer } from "./request-composer";

const TASK_STORAGE_KEY = "verifyagent.currentTaskId";

function errorDetails(error: unknown) {
  return error instanceof ApiClientError
    ? { message: error.message, code: error.code, retryable: error.retryable }
    : { message: "The request could not be completed.", code: "INTERNAL_ERROR", retryable: false };
}

export function AgentWorkspace() {
  const [requestId, setRequestId] = useState<string>();
  const api = useMemo(() => createWorkspaceApi(fetch, setRequestId), []);
  const generation = useRef(0);
  const attempt = useRef<RequestAttempt | undefined>(undefined);
  const [context, setContext] = useState<DemoContext>();
  const [readiness, setReadiness] = useState<ReadinessSnapshot>();
  const [prompt, setPrompt] = useState("Sell my concert ticket for $80.");
  const [task, setTask] = useState<TaskSnapshot>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<ReturnType<typeof errorDetails>>();

  const acceptTask = useCallback((next: TaskSnapshot) => {
    setTask(next);
    window.localStorage.setItem(TASK_STORAGE_KEY, next.id);
  }, []);

  const perform = useCallback(async (label: string, operation: () => Promise<TaskSnapshot>) => {
    const active = ++generation.current;
    setBusy(label);
    setError(undefined);
    try {
      const next = await operation();
      if (active === generation.current) acceptTask(next);
      return next;
    } catch (caught) {
      if (active === generation.current) setError(errorDetails(caught));
    } finally {
      if (active === generation.current) setBusy(undefined);
    }
  }, [acceptTask]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([api.readiness(), api.demoContext()]).then(([readinessResult, contextResult]) => {
      if (controller.signal.aborted) return;
      if (readinessResult.status === "fulfilled") setReadiness(readinessResult.value);
      if (contextResult.status === "fulfilled") {
        setContext(contextResult.value);
        setPrompt(contextResult.value.defaultPrompt);
      }
    });
    const taskFromUrl = new URLSearchParams(window.location.search).get("task");
    const savedTask = taskFromUrl ?? window.localStorage.getItem(TASK_STORAGE_KEY);
    if (savedTask) {
      void api.task(savedTask).then((snapshot) => {
        if (!controller.signal.aborted) acceptTask(snapshot);
      }).catch(() => {
        if (!controller.signal.aborted) window.localStorage.removeItem(TASK_STORAGE_KEY);
      });
    }
    return () => controller.abort();
  }, [acceptTask, api]);

  useEffect(() => {
    if (!task || !["PLANNING", "RUNNING"].includes(task.status) || busy) return;
    const timer = window.setInterval(() => {
      void api.task(task.id).then(acceptTask).catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [acceptTask, api, busy, task]);

  const createTask = () => {
    attempt.current = requestAttempt(prompt, attempt.current);
    const current = attempt.current;
    void perform("create", () => api.createTask(current.requestText, current.idempotencyKey));
  };

  const runTask = () => task && void perform("run", () => api.runTask(task.id));

  const confirm = (action: TaskActionSnapshot, decision: "APPROVE" | "REJECT") => {
    if (!action.confirmationPayloadHash) return;
    void perform("confirm", async () => {
      const confirmed = await api.confirm(action.id, decision, action.confirmationPayloadHash!);
      return decision === "APPROVE" ? api.runTask(confirmed.id) : confirmed;
    });
  };

  const verify = (action: TaskActionSnapshot) => {
    setBusy("verification");
    setError(undefined);
    void api.startVerification(action.id).then((started) => {
      if (task) window.localStorage.setItem(TASK_STORAGE_KEY, task.id);
      window.location.assign(started.verificationUrl);
    }).catch((caught) => {
      setError(errorDetails(caught));
      setBusy(undefined);
    });
  };

  const reset = () => {
    if (!window.confirm("Reset the fixed VerifyAgent demo data and clear this workspace?")) return;
    setBusy("reset");
    setError(undefined);
    void api.resetDemo().then(() => {
      generation.current += 1;
      attempt.current = undefined;
      window.localStorage.removeItem(TASK_STORAGE_KEY);
      setTask(undefined);
      setPrompt(context?.defaultPrompt ?? "Sell my concert ticket for $80.");
    }).catch((caught) => setError(errorDetails(caught))).finally(() => setBusy(undefined));
  };

  const viewState = viewStateForTask(task);
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">V</span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">VerifyAgent</h1>
              <p className="text-xs text-slate-500">Human-authorized AI actions</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`status-pill ${readiness?.checks.database === "ready" ? "status-good" : "status-muted"}`}><i />{readiness?.checks.database === "ready" ? "System ready" : "Checking system"}</span>
            <span className={`status-pill ${readiness?.checks.plannerConfiguration === "ready" ? "status-good" : "status-warn"}`}><i />Planner {readiness?.checks.plannerConfiguration === "ready" ? "ready" : "needs config"}</span>
            <span className={`status-pill ${readiness?.checks.personaConfiguration === "ready" ? "status-good" : "status-warn"}`}><i />Persona {readiness?.checks.personaConfiguration === "ready" ? "ready" : "needs config"}</span>
            {context?.demoMode && <button type="button" className="text-button" disabled={Boolean(busy)} onClick={reset}>Reset demo</button>}
          </div>
        </header>

        <details className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/45 px-5 py-3 text-xs text-slate-400">
          <summary className="cursor-pointer font-semibold text-slate-300">Readiness · {readiness?.status ?? "checking"} · {readiness?.profile ?? "incomplete"}</summary>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <span>Database: {readiness?.checks.database ?? "checking"}</span>
            <span>Webhook: {readiness?.checks.webhookConfiguration ?? "checking"}</span>
            <span>Demo mode: {readiness?.checks.demoMode ?? "checking"}</span>
            {requestId && <span className="break-all font-mono">Request ID: {requestId}</span>}
          </div>
        </details>

        <section className="hero-panel mb-6 overflow-hidden p-6 sm:p-8">
          <div className="relative z-10 max-w-3xl">
            <p className="eyebrow text-cyan-200">Trust-aware agent workspace</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">The agent can plan. <span className="text-gradient">You control what acts.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Every proposed action passes through deterministic validation, policy, exact-action consent, and identity verification before marketplace state can change.</p>
          </div>
        </section>

        {error && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
            <span><strong>{error.code.replaceAll("_", " ")}</strong> · {error.message}</span>
            {error.retryable && task && <button type="button" className="text-button text-rose-100" onClick={() => void api.task(task.id).then(acceptTask)}>Refresh safely</button>}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.75fr)]">
          <div className="min-w-0 space-y-6">
            <RequestComposer prompt={prompt} disabled={Boolean(busy)} busy={busy === "create"} onPromptChange={setPrompt} onSubmit={createTask} />

            {!task ? (
              <section className="panel flex min-h-64 flex-col items-center justify-center p-8 text-center">
                <span className="empty-icon" aria-hidden="true">⌁</span>
                <h2 className="mt-4 text-lg font-semibold text-slate-200">No action plan yet</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Submit the example request to see how planning, policy, confirmation, identity, and execution remain separate.</p>
              </section>
            ) : (
              <>
                <section className="panel p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="eyebrow">Current task</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold text-white">{task.status.replaceAll("_", " ")}</h2>
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">{viewState.replaceAll("_", " ")}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">“{task.requestText}”</p>
                      <p className="mt-2 break-all font-mono text-[11px] text-slate-600">Task {task.id}</p>
                    </div>
                    {task.status === "READY" && <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={runTask}>{busy === "run" ? "Running…" : "Run authorized flow"}</button>}
                    {["PLANNING", "RUNNING"].includes(task.status) && <span className="flex items-center gap-2 text-sm text-cyan-200"><i className="spinner" />Processing server state…</span>}
                    {task.status === "COMPLETED" && <span className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950">✓ Completed safely</span>}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4 text-xs text-slate-500">
                    <span>Planner: {task.planning.provider ?? "—"}</span><span>·</span>
                    <span>Model: {task.planning.model ?? "—"}</span><span>·</span>
                    <span>Prompt: {task.planning.promptVersion ?? "—"}</span>
                  </div>
                  {task.status === "COMPLETED" && (
                    <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">
                      Published after verified identity · exact-action grant consumed · marketplace version 3
                    </p>
                  )}
                </section>
                <AuthorizationCard task={task} busy={Boolean(busy)} onConfirm={confirm} onVerify={verify} />
                <ActionTimeline actions={task.actions} />
              </>
            )}
          </div>
          <MarketplacePreview context={context} task={task} />
        </div>
        {task && <div className="mt-6"><AuditTrail audit={task.audit} actions={task.actions} /></div>}
        <details className="panel mt-6 p-6">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Two-minute demo guide</summary>
          <ol className="mt-4 grid gap-3 text-sm text-slate-400 md:grid-cols-3">
            <li><strong className="text-cyan-200">1 · Plan</strong><br />Submit the $80 request and show typed actions.</li>
            <li><strong className="text-amber-200">2 · Authorize</strong><br />Run, confirm the price, then reach Persona.</li>
            <li><strong className="text-emerald-200">3 · Prove</strong><br />Verify, publish, and finish on the audit trail.</li>
          </ol>
        </details>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 py-6 text-xs text-slate-600">
          <span>LLM proposes · policy authorizes · executor mutates</span>
          <span>Persona browser completion is never authoritative</span>
        </footer>
      </div>
    </main>
  );
}
