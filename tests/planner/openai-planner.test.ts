import { describe, expect, it, vi } from "vitest";

import { OpenAIPlannerGateway } from "@/lib/planner/providers/openai-planner";

const input = { requestText: "Sell my ticket for $80.", availableInventory: [], supportedActions: ["CREATE_DRAFT_LISTING"], promptVersion: "v1" };
const unsupported = { kind: "UNSUPPORTED", summary: "No inventory.", actions: [] };

describe("OpenAI planner adapter", () => {
  it("uses strict Structured Outputs without tools and parses completed output", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
      expect(request.tools).toEqual([]);
      expect(request.tool_choice).toBe("none");
      expect(request.store).toBe(false);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer secret-key" });
      return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(unsupported) }] }] }));
    });
    await expect(new OpenAIPlannerGateway("secret-key", "gpt-test", fetchMock as typeof fetch).createPlan(input)).resolves.toEqual(unsupported);
  });

  it.each([
    [{ status: "incomplete", output: [] }, "LLM_RESPONSE_INVALID"],
    [{ status: "failed", output: [] }, "LLM_REQUEST_FAILED"],
    [{ status: "completed", output: [{ content: [{ type: "refusal", refusal: "no" }] }] }, "LLM_REFUSAL"],
    [{ status: "completed", output: [{ content: [{ type: "output_text", text: "```json" }] }] }, "LLM_RESPONSE_INVALID"],
  ])("maps invalid provider responses to safe errors", async (body, code) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
    await expect(new OpenAIPlannerGateway("secret", "model", fetchMock as typeof fetch).createPlan(input)).rejects.toMatchObject({ code });
  });

  it("maps non-success and network failures without exposing the key", async () => {
    const nonSuccess = vi.fn(async () => new Response("bad", { status: 429 }));
    await expect(new OpenAIPlannerGateway("top-secret", "model", nonSuccess as typeof fetch).createPlan(input)).rejects.toMatchObject({ code: "LLM_REQUEST_FAILED", message: expect.not.stringContaining("top-secret") });
    const failed = vi.fn(async () => { throw new Error("network unavailable"); });
    await expect(new OpenAIPlannerGateway("top-secret", "model", failed as typeof fetch).createPlan(input)).rejects.toMatchObject({ code: "LLM_REQUEST_FAILED" });
  });

  it("aborts requests at the configured timeout", async () => {
    const hanging = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    await expect(new OpenAIPlannerGateway("secret", "model", hanging as typeof fetch, 1).createPlan(input)).rejects.toMatchObject({ code: "LLM_TIMEOUT" });
  });
});
