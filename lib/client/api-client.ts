import type { ApiErrorBody, DemoContext, HealthSnapshot, TaskSnapshot, VerificationStart } from "./contracts";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function requestJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiClientError("NETWORK_ERROR", "VerifyAgent could not reach the server.", true);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "VerifyAgent received an invalid server response.", response.status >= 500, response.status);
  }
  if (!response.ok) {
    const error = (body as Partial<ApiErrorBody>)?.error;
    throw new ApiClientError(
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "The request could not be completed.",
      error?.retryable === true,
      response.status,
    );
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTask(value: unknown): TaskSnapshot {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.status !== "string" ||
      typeof value.requestText !== "string" || !isRecord(value.planning) ||
      !Array.isArray(value.actions) || !Array.isArray(value.listings) || !Array.isArray(value.audit)) {
    throw new ApiClientError("INVALID_RESPONSE", "VerifyAgent received an invalid task snapshot.");
  }
  const actionsValid = value.actions.every((action) => isRecord(action) &&
    typeof action.id === "string" && typeof action.sequence === "number" && typeof action.type === "string" &&
    typeof action.rationale === "string" && typeof action.status === "string" &&
    (action.requirement === null || typeof action.requirement === "string"));
  const listingsValid = value.listings.every((listing) => isRecord(listing) &&
    typeof listing.id === "string" && typeof listing.title === "string" && typeof listing.status === "string" &&
    typeof listing.version === "number");
  const auditValid = value.audit.every((event) => isRecord(event) && typeof event.id === "string" &&
    typeof event.actorType === "string" && typeof event.eventType === "string" && typeof event.outcome === "string");
  if (!actionsValid || !listingsValid || !auditValid) {
    throw new ApiClientError("INVALID_RESPONSE", "VerifyAgent received an invalid task snapshot.");
  }
  return value as unknown as TaskSnapshot;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function createWorkspaceApi(fetcher: typeof fetch = fetch) {
  return {
    health: () => requestJson<HealthSnapshot>(fetcher, "/api/health"),
    demoContext: () => requestJson<DemoContext>(fetcher, "/api/demo/context"),
    task: async (taskId: string) => parseTask(await requestJson<unknown>(fetcher, `/api/tasks/${encodeURIComponent(taskId)}`)),
    createTask: async (requestText: string, idempotencyKey: string) => {
      const result = await requestJson<{ task: TaskSnapshot }>(fetcher, "/api/tasks", {
        ...json({ requestText }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      });
      return parseTask(result.task);
    },
    runTask: async (taskId: string) => parseTask(await requestJson<unknown>(fetcher, `/api/tasks/${encodeURIComponent(taskId)}/run`, json({}))),
    confirm: async (actionId: string, decision: "APPROVE" | "REJECT", expectedPayloadHash: string) => {
      const result = await requestJson<{ task: TaskSnapshot }>(fetcher, `/api/actions/${encodeURIComponent(actionId)}/confirm`, json({ decision, expectedPayloadHash }));
      return parseTask(result.task);
    },
    startVerification: (actionId: string) => requestJson<VerificationStart>(fetcher, `/api/actions/${encodeURIComponent(actionId)}/verification/start`, json({})),
    resetDemo: () => requestJson<{ reset: true }>(fetcher, "/api/demo/reset", json({})),
  };
}
