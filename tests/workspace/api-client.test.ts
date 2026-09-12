import { describe, expect, it, vi } from "vitest";

import { createWorkspaceApi } from "@/lib/client/api-client";

const emptyTask = { id: "task", status: "READY", requestText: "Sell", actions: [], listings: [], audit: [], planning: {}, createdAt: "", updatedAt: "" };

describe("workspace API client", () => {
  it("sends only request text and preserves the caller idempotency key", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ requestText: "Sell my ticket for $80." });
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("workspace:stable-request-key");
      return Response.json({ task: emptyTask });
    });
    await createWorkspaceApi(fetcher as typeof fetch).createTask("Sell my ticket for $80.", "workspace:stable-request-key");
  });

  it("uses the exact server confirmation hash without recomputing it", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ decision: "APPROVE", expectedPayloadHash: "sha256:server-value" });
      return Response.json({ task: emptyTask });
    });
    await createWorkspaceApi(fetcher as typeof fetch).confirm("action", "APPROVE", "sha256:server-value");
  });

  it("parses safe API errors and fails closed on malformed responses", async () => {
    const rejected = vi.fn(async () => Response.json({ error: { code: "LLM_TIMEOUT", message: "Planning timed out.", retryable: true } }, { status: 504 }));
    await expect(createWorkspaceApi(rejected as typeof fetch).health()).rejects.toEqual(expect.objectContaining({ code: "LLM_TIMEOUT", retryable: true, message: "Planning timed out." }));
    const malformed = vi.fn(async () => new Response("not json", { status: 200 }));
    await expect(createWorkspaceApi(malformed as typeof fetch).health()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    const malformedTask = vi.fn(async () => Response.json({ status: "COMPLETED", actions: "not-an-array" }));
    await expect(createWorkspaceApi(malformedTask as typeof fetch).task("task")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("renders a valid blocked readiness snapshot returned with 503", async () => {
    const blocked = {
      status: "blocked",
      profile: "incomplete",
      checks: {
        database: "ready",
        plannerConfiguration: "missing",
        personaConfiguration: "missing",
        webhookConfiguration: "missing",
        demoMode: "enabled",
      },
    };
    const fetcher = vi.fn(async () => Response.json(blocked, { status: 503, headers: { "X-Request-ID": "request-test-123" } }));
    const requestIds: string[] = [];
    await expect(createWorkspaceApi(fetcher as typeof fetch, (value) => requestIds.push(value)).readiness()).resolves.toEqual(blocked);
    expect(requestIds).toEqual(["request-test-123"]);
  });
});
