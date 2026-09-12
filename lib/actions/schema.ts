import { createHash } from "node:crypto";

import { z } from "zod";

const boundedText = (field: string, max: number) =>
  z.string().trim().min(1, `${field} is required`).max(max, `${field} is too long`);

const logicalReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/, "Invalid logical reference");

const commonCandidateFields = {
  rationale: boundedText("rationale", 500),
  dependsOn: z.array(logicalReferenceSchema).max(5).default([]),
};

export const createDraftListingCandidateSchema = z
  .object({
    type: z.literal("CREATE_DRAFT_LISTING"),
    payload: z
      .object({
        title: boundedText("title", 120),
        description: boundedText("description", 2_000),
        sourceItemId: boundedText("sourceItemId", 100),
      })
      .strict(),
    ...commonCandidateFields,
  })
  .strict();

export const setListingPriceCandidateSchema = z
  .object({
    type: z.literal("SET_LISTING_PRICE"),
    payload: z
      .object({
        listingRef: logicalReferenceSchema,
        priceCents: z.number().int().positive().max(100_000_000),
        currency: z.literal("USD"),
      })
      .strict(),
    ...commonCandidateFields,
  })
  .strict();

export const publishListingCandidateSchema = z
  .object({
    type: z.literal("PUBLISH_LISTING"),
    payload: z
      .object({
        listingRef: logicalReferenceSchema,
      })
      .strict(),
    ...commonCandidateFields,
  })
  .strict();

export const candidateActionSchema = z.discriminatedUnion("type", [
  createDraftListingCandidateSchema,
  setListingPriceCandidateSchema,
  publishListingCandidateSchema,
]);

export const actionPlanSchema = z
  .object({
    summary: boundedText("summary", 500),
    actions: z.array(candidateActionSchema).min(1).max(5),
  })
  .strict();

export const validatedActionEnvelopeSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    action: candidateActionSchema,
    idempotencyKey: z.string().min(16).max(200),
  })
  .strict();

export type CandidateAction = z.infer<typeof candidateActionSchema>;
export type ActionPlan = z.infer<typeof actionPlanSchema>;
export type ValidatedActionEnvelope = z.infer<typeof validatedActionEnvelopeSchema>;
export type ActionType = CandidateAction["type"];

export function parseActionPlan(input: unknown): ActionPlan {
  return actionPlanSchema.parse(input);
}

export function safeParseActionPlan(input: unknown) {
  return actionPlanSchema.safeParse(input);
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCanonicalJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForCanonicalJson(entry)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

export function hashCanonicalPayload(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
