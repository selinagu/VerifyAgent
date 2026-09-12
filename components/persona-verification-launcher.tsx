"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type PersonaClient = {
  open(): void;
  destroy?(): void;
};

declare global {
  interface Window {
    Persona?: {
      Client: new (options: {
        inquiryId: string;
        environmentId: string;
        sessionToken?: string;
        onReady: () => void;
        onComplete: () => void;
        onCancel: () => void;
        onError: () => void;
      }) => PersonaClient;
    };
  }
}

const PERSONA_SDK_URL = "https://cdn.withpersona.com/dist/persona-v5.8.0.js";

async function readJson(response: Response) {
  const value: unknown = await response.json();
  if (!response.ok) throw new Error("The verification request could not be completed.");
  return value as Record<string, unknown>;
}

export function PersonaVerificationLauncher({ verificationId }: { verificationId: string }) {
  const clientRef = useRef<PersonaClient | undefined>(undefined);
  const actionIdRef = useRef<string | undefined>(undefined);
  const [message, setMessage] = useState("Preparing secure identity verification…");
  const [finished, setFinished] = useState(false);

  const poll = useCallback(async () => {
    const snapshot = await readJson(await fetch(`/api/verifications/${verificationId}`, { cache: "no-store" }));
    actionIdRef.current = snapshot.actionId as string;
    if (snapshot.canResume === true && actionIdRef.current) {
      setMessage("Identity verified. Authorizing the exact publish action…");
      const task = await readJson(
        await fetch(`/api/actions/${actionIdRef.current}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      setFinished(true);
      setMessage(task.status === "COMPLETED" ? "Verified and published successfully." : "Verified. The task is ready to continue.");
      return true;
    }
    if (["DECLINED", "FAILED", "EXPIRED", "CANCELLED"].includes(snapshot.status as string)) {
      setFinished(true);
      setMessage("Verification did not complete. The publish action remains blocked.");
      return true;
    }
    return false;
  }, [verificationId]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const boot = async () => {
      try {
        const snapshot = await readJson(await fetch(`/api/verifications/${verificationId}`, { cache: "no-store" }));
        actionIdRef.current = snapshot.actionId as string;
        const started = await readJson(
          await fetch(`/api/actions/${actionIdRef.current}/verification/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }),
        );
        const flow = started.flow as { inquiryId: string; environmentId: string; sessionToken?: string };
        const script = document.createElement("script");
        script.src = PERSONA_SDK_URL;
        script.crossOrigin = "anonymous";
        script.onload = () => {
          if (cancelled || !window.Persona) return;
          clientRef.current = new window.Persona.Client({
            ...flow,
            onReady: () => {
              setMessage("Persona is ready. Complete the verification to continue.");
              clientRef.current?.open();
            },
            onComplete: () => setMessage("Persona flow completed. Waiting for secure server confirmation…"),
            onCancel: () => setMessage("Verification paused. Publishing remains blocked."),
            onError: () => setMessage("Persona could not load. Publishing remains blocked."),
          });
        };
        script.onerror = () => setMessage("Persona could not load. Publishing remains blocked.");
        document.head.appendChild(script);
        interval = setInterval(() => {
          void poll().then((terminal) => {
            if (terminal && interval) clearInterval(interval);
          }).catch(() => undefined);
        }, 2_000);
      } catch {
        if (!cancelled) setMessage("Verification could not be started. Publishing remains blocked.");
      }
    };
    void boot();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      clientRef.current?.destroy?.();
    };
  }, [poll, verificationId]);

  return (
    <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Verified human required</p>
      <h1 className="mt-3 text-3xl font-semibold">Authorize public publishing</h1>
      <p className="mt-4 leading-7 text-slate-300">{message}</p>
      {!finished && (
        <button
          type="button"
          onClick={() => clientRef.current?.open()}
          className="mt-7 rounded-full bg-cyan-300 px-5 py-3 font-semibold text-slate-950"
        >
          Open verification
        </button>
      )}
      {finished && (
        <Link
          href="/"
          className="mt-7 inline-flex rounded-full bg-cyan-300 px-5 py-3 font-semibold text-slate-950 outline-none transition hover:bg-cyan-200 focus-visible:ring-4 focus-visible:ring-cyan-300/20"
        >
          Return to workspace
        </Link>
      )}
      <p className="mt-6 text-xs leading-5 text-slate-500">
        Browser completion never authorizes the action. VerifyAgent waits for a signed Persona webhook and a server-side inquiry check.
      </p>
    </section>
  );
}
