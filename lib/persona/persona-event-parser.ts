import { createHash } from "node:crypto";

import { z } from "zod";

import { ExecutionError } from "@/lib/executor/errors";
import type { PersonaInquiryStatus, VerifiedPersonaEvent } from "./types";

const eventSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({
      name: z.string().min(1),
      "created-at": z.string().datetime(),
      payload: z.object({
        data: z.object({
          id: z.string().min(1),
          type: z.literal("inquiry"),
          attributes: z.object({
            status: z.string().optional(),
            "reference-id": z.string().nullish(),
          }).passthrough(),
        }),
      }),
    }).passthrough(),
  }),
});

function normalizeStatus(value: string | undefined): PersonaInquiryStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return ["created", "pending", "completed", "approved", "declined", "failed", "expired", "needs_review"].includes(
    normalized,
  )
    ? (normalized as PersonaInquiryStatus)
    : "unknown";
}

export function parsePersonaEvent(rawBody: string): VerifiedPersonaEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch (cause) {
    throw new ExecutionError("PERSONA_EVENT_INVALID", { cause });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) throw new ExecutionError("PERSONA_EVENT_INVALID");
  const attributes = parsed.data.data.attributes;
  return {
    eventId: parsed.data.data.id,
    eventType: attributes.name,
    eventCreatedAt: new Date(attributes["created-at"]),
    inquiryId: attributes.payload.data.id,
    inquiryStatus: normalizeStatus(attributes.payload.data.attributes.status),
    referenceId: attributes.payload.data.attributes["reference-id"] ?? undefined,
    payloadHash: `sha256:${createHash("sha256").update(rawBody).digest("hex")}`,
  };
}
