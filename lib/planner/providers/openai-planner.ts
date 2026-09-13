import { ExecutionError } from "@/lib/executor/errors";
import { buildPlannerInput, buildPlannerInstructions } from "../prompt-builder";
import { PLANNER_PROPOSAL_JSON_SCHEMA } from "../proposal-schema";
import type { PlannerGateway, PlannerInput } from "../types";

type Fetch = typeof fetch;

function outputText(body: Record<string, unknown>): string | undefined {
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return undefined;
  for (const item of body.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typed = part as { type?: unknown; text?: unknown };
      if (typed.type === "refusal") throw new ExecutionError("LLM_REFUSAL");
      if (typed.type === "output_text" && typeof typed.text === "string") return typed.text;
    }
  }
  return undefined;
}

export class OpenAIPlannerGateway implements PlannerGateway {
  readonly provider = "openai";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  async createPlan(input: PlannerInput): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          instructions: buildPlannerInstructions(),
          input: buildPlannerInput(input),
          text: {
            format: {
              type: "json_schema",
              name: "verifyagent_marketplace_plan",
              strict: true,
              schema: PLANNER_PROPOSAL_JSON_SCHEMA,
            },
          },
          tools: [],
          tool_choice: "none",
          store: false,
          max_output_tokens: 1_800,
        }),
      });
      if (!response.ok) throw new ExecutionError("LLM_REQUEST_FAILED");
      let body: Record<string, unknown>;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch (error) {
        throw new ExecutionError("LLM_RESPONSE_INVALID", { cause: error });
      }
      if (body.status === "failed") throw new ExecutionError("LLM_REQUEST_FAILED");
      if (body.status !== "completed") throw new ExecutionError("LLM_RESPONSE_INVALID");
      const text = outputText(body);
      if (!text) throw new ExecutionError("LLM_RESPONSE_INVALID");
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new ExecutionError("LLM_RESPONSE_INVALID", { cause: error });
      }
    } catch (error) {
      if (error instanceof ExecutionError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ExecutionError("LLM_TIMEOUT", { cause: error });
      }
      throw new ExecutionError("LLM_REQUEST_FAILED", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
