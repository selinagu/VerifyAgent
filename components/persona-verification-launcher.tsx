"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseVerificationSnapshot, verificationDecision } from "@/lib/verification/client-state";

type PersonaClient = { open(): void; destroy?(): void };
type Flow = { inquiryId: string; environmentId: string; sessionToken?: string };

declare global {
  interface Window {
    Persona?: {
      Client: new (options: Flow & {
        onReady: () => void;
        onComplete: () => void;
        onCancel: () => void;
        onError: () => void;
      }) => PersonaClient;
    };
  }
}

const PERSONA_SDK_URL = "https://cdn.withpersona.com/dist/persona-v5.8.0.js";
const FAILURE_STATES = new Set(["DECLINED", "FAILED", "EXPIRED", "CANCELLED"]);
let sdkPromise: Promise<void> | undefined;

function loadPersonaSdk(): Promise<void> {
  if (window.Persona) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PERSONA_SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => reject(new Error("PERSONA_SDK_TIMEOUT")), 8_000);
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.Persona) resolve();
      else reject(new Error("PERSONA_SDK_INVALID"));
    };
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error("PERSONA_SDK_FAILED")); };
    if (!existing) {
      script.src = PERSONA_SDK_URL;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise!;
}

async function readJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json().catch(() => undefined);
  if (!response.ok || value === undefined) throw new Error("SAFE_REQUEST_FAILED");
  return value;
}

export function PersonaVerificationLauncher({ verificationId }: { verificationId: string }) {
  const clientRef = useRef<PersonaClient | undefined>(undefined);
  const pollAbortRef = useRef<AbortController | undefined>(undefined);
  const [message, setMessage] = useState("Preparing secure identity verification…");
  const [terminal, setTerminal] = useState(false);
  const [published, setPublished] = useState(false);
  const [retryable, setRetryable] = useState(false);

  const poll = useCallback(async (): Promise<boolean> => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    const raw = await readJson(await fetch(`/api/verifications/${verificationId}`, { cache: "no-store", signal: controller.signal }));
    const snapshot = parseVerificationSnapshot(raw);
    const decision = verificationDecision(snapshot);
    if (decision.kind === "BLOCKED") {
      setTerminal(true);
      setRetryable(false);
      setMessage(`Verification ${decision.status.toLowerCase()}. Publishing remains blocked and the listing stays private.`);
      return true;
    }
    if (decision.kind === "RESUME") {
      setMessage("Identity verified. Authorizing the exact publish action…");
      const task = await readJson(await fetch(`/api/actions/${decision.actionId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })) as Record<string, unknown>;
      if (task.status !== "COMPLETED") throw new Error("TASK_NOT_COMPLETED");
      setPublished(true);
      setTerminal(true);
      setRetryable(false);
      setMessage("Identity verified by the server. The exact publish action completed successfully.");
      return true;
    }
    return false;
  }, [verificationId]);

  useEffect(() => {
    let disposed = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (interval) clearInterval(interval); interval = undefined; };
    const check = async () => {
      if (disposed || document.hidden) return;
      try {
        if (await poll()) stop();
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
        setRetryable(true);
        setMessage("Server confirmation is temporarily unavailable. Publishing remains blocked.");
      }
    };
    const onVisibility = () => { if (!document.hidden) void check(); };
    const boot = async () => {
      try {
        const initial = parseVerificationSnapshot(await readJson(await fetch(`/api/verifications/${verificationId}`, { cache: "no-store" })));
        if (FAILURE_STATES.has(initial.status)) {
          setTerminal(true);
          setMessage(`Verification ${initial.status.toLowerCase()}. Publishing remains blocked and the listing stays private.`);
          return;
        }
        if (verificationDecision(initial).kind === "RESUME") {
          await check();
          return;
        }
        const started = await readJson(await fetch(`/api/actions/${initial.actionId}/verification/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })) as Record<string, unknown>;
        if (!started.flow || typeof started.flow !== "object") throw new Error("INVALID_FLOW");
        const flow = started.flow as Flow;
        if (!flow.inquiryId || !flow.environmentId) throw new Error("INVALID_FLOW");
        await loadPersonaSdk();
        if (disposed || !window.Persona) return;
        clientRef.current = new window.Persona.Client({
          ...flow,
          onReady: () => { setMessage("Persona is ready. Complete the Sandbox verification to continue."); clientRef.current?.open(); },
          onComplete: () => setMessage("Persona flow completed. Waiting for signed webhook and server confirmation…"),
          onCancel: () => setMessage("Verification paused. Publishing remains blocked."),
          onError: () => { setRetryable(true); setMessage("Persona could not continue. Publishing remains blocked."); },
        });
        interval = setInterval(() => void check(), 2_000);
        document.addEventListener("visibilitychange", onVisibility);
      } catch {
        if (!disposed) {
          setRetryable(true);
          setMessage("Verification could not be started. Check Persona Sandbox readiness; publishing remains blocked.");
        }
      }
    };
    void boot();
    return () => {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      pollAbortRef.current?.abort();
      clientRef.current?.destroy?.();
    };
  }, [poll, verificationId]);

  return (
    <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Persona Sandbox · verified human required</p>
      <h1 className="mt-3 text-3xl font-semibold">Authorize public publishing</h1>
      <p role="status" className="mt-4 leading-7 text-slate-300">{message}</p>
      {!terminal && (
        <button type="button" onClick={() => clientRef.current?.open()} className="mt-7 rounded-full bg-cyan-300 px-5 py-3 font-semibold text-slate-950">
          Open verification
        </button>
      )}
      {retryable && !terminal && (
        <button type="button" onClick={() => void poll()} className="ml-3 mt-7 rounded-full border border-slate-600 px-5 py-3 font-semibold text-slate-200">
          Check server status
        </button>
      )}
      {terminal && (
        <Link href="/" className="mt-7 inline-flex rounded-full bg-cyan-300 px-5 py-3 font-semibold text-slate-950 outline-none transition hover:bg-cyan-200 focus-visible:ring-4 focus-visible:ring-cyan-300/20">
          {published ? "View published listing" : "Return to blocked task"}
        </Link>
      )}
      <p className="mt-6 text-xs leading-5 text-slate-500">
        Browser completion never authorizes the action. VerifyAgent waits for a signed Persona webhook and authoritative server retrieval.
      </p>
    </section>
  );
}
