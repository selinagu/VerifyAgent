import { z } from "zod";

import type { AppEnv } from "@/lib/config/env";
import { ExecutionError } from "@/lib/executor/errors";
import type { PersonaGateway } from "./persona-gateway";
import type { CreateInquiryInput, PersonaInquiryStatus } from "./types";

const API_BASE_URL = "https://api.withpersona.com/api/v1";
const REQUEST_TIMEOUT_MS = 8_000;

const statusSchema = z
  .string()
  .transform((value): PersonaInquiryStatus => {
    const normalized = value.toLowerCase();
    return ["created", "pending", "completed", "approved", "declined", "failed", "expired", "needs_review"].includes(
      normalized,
    )
      ? (normalized as PersonaInquiryStatus)
      : "unknown";
  });

const inquiryResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({
      status: statusSchema,
      "reference-id": z.string().nullish(),
    }).passthrough(),
  }),
  meta: z.object({ "session-token": z.string().min(1).optional() }).passthrough().optional(),
});

const resumeResponseSchema = z.object({
  meta: z.object({ "session-token": z.string().min(1) }).passthrough(),
});

export type PersonaHttpConfig = {
  apiKey: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function personaHttpConfigFromEnv(env: AppEnv): PersonaHttpConfig {
  if (!env.PERSONA_API_KEY || !env.PERSONA_API_VERSION) {
    throw new ExecutionError("PERSONA_NOT_CONFIGURED");
  }
  return { apiKey: env.PERSONA_API_KEY, apiVersion: env.PERSONA_API_VERSION };
}

export class PersonaHttpClient implements PersonaGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: PersonaHttpConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async createInquiry(input: CreateInquiryInput) {
    const response = await this.request("/inquiries", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        data: {
          attributes: {
            "inquiry-template-id": input.templateId,
            "reference-id": input.referenceId,
          },
        },
      }),
    });
    const parsed = inquiryResponseSchema.safeParse(response);
    if (!parsed.success || !parsed.data.data.attributes["reference-id"]) {
      throw new ExecutionError("PERSONA_RESPONSE_INVALID");
    }
    return {
      inquiryId: parsed.data.data.id,
      status: parsed.data.data.attributes.status,
      referenceId: parsed.data.data.attributes["reference-id"],
      sessionToken: parsed.data.meta?.["session-token"],
    };
  }

  async retrieveInquiry(inquiryId: string) {
    const parsed = inquiryResponseSchema.safeParse(
      await this.request(`/inquiries/${encodeURIComponent(inquiryId)}`, { method: "GET" }),
    );
    if (!parsed.success) throw new ExecutionError("PERSONA_RESPONSE_INVALID");
    return {
      inquiryId: parsed.data.data.id,
      status: parsed.data.data.attributes.status,
      referenceId: parsed.data.data.attributes["reference-id"] ?? undefined,
    };
  }

  async resumeInquiry(inquiryId: string) {
    const parsed = resumeResponseSchema.safeParse(
      await this.request(`/inquiries/${encodeURIComponent(inquiryId)}/resume`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    if (!parsed.success) throw new ExecutionError("PERSONA_RESPONSE_INVALID");
    return { sessionToken: parsed.data.meta["session-token"] };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Persona-Version": this.config.apiVersion,
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new ExecutionError("PERSONA_REQUEST_FAILED", { cause });
    }
    if (!response.ok) throw new ExecutionError("PERSONA_REQUEST_FAILED");
    try {
      return await response.json();
    } catch (cause) {
      throw new ExecutionError("PERSONA_RESPONSE_INVALID", { cause });
    }
  }
}
