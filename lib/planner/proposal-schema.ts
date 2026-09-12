import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const actionKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const resultReferenceSchema = z.string().regex(/^result:[a-z][a-z0-9_]{0,39}$/);
const common = {
  key: actionKeySchema,
  rationale: boundedText(500),
  dependsOn: z.array(actionKeySchema).max(5),
};

const createDraftSchema = z
  .object({
    ...common,
    type: z.literal("CREATE_DRAFT_LISTING"),
    payload: z
      .object({
        title: boundedText(120),
        description: boundedText(2_000),
        sourceItemId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/),
      })
      .strict(),
  })
  .strict();

const setPriceSchema = z
  .object({
    ...common,
    type: z.literal("SET_LISTING_PRICE"),
    payload: z
      .object({
        listingRef: resultReferenceSchema,
        priceCents: z.number().int().positive().max(100_000_000),
        currency: z.literal("USD"),
      })
      .strict(),
  })
  .strict();

const publishSchema = z
  .object({
    ...common,
    type: z.literal("PUBLISH_LISTING"),
    payload: z.object({ listingRef: resultReferenceSchema }).strict(),
  })
  .strict();

export const plannerActionSchema = z.discriminatedUnion("type", [createDraftSchema, setPriceSchema, publishSchema]);

export const plannerProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PLAN"), summary: boundedText(500), actions: z.array(plannerActionSchema).min(1).max(5) }).strict(),
  z.object({ kind: z.literal("UNSUPPORTED"), summary: boundedText(500), actions: z.array(z.never()).length(0) }).strict(),
]);

export type PlannerAction = z.infer<typeof plannerActionSchema>;
export type PlannerProposal = z.infer<typeof plannerProposalSchema>;

export function parsePlannerProposal(value: unknown): PlannerProposal {
  return plannerProposalSchema.parse(value);
}

const key = { type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$" } as const;
const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const commonProperties = {
  key,
  rationale: text(500),
  dependsOn: { type: "array", items: key, maxItems: 5 },
};
const resultRef = { type: "string", pattern: "^result:[a-z][a-z0-9_]{0,39}$" };

export const PLANNER_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  oneOf: [
    {
      properties: {
        kind: { const: "PLAN" },
        summary: text(500),
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  ...commonProperties,
                  type: { const: "CREATE_DRAFT_LISTING" },
                  payload: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: text(120),
                      description: text(2_000),
                      sourceItemId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$" },
                    },
                    required: ["title", "description", "sourceItemId"],
                  },
                },
                required: ["key", "type", "payload", "rationale", "dependsOn"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  ...commonProperties,
                  type: { const: "SET_LISTING_PRICE" },
                  payload: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      listingRef: resultRef,
                      priceCents: { type: "integer", minimum: 1, maximum: 100000000 },
                      currency: { const: "USD" },
                    },
                    required: ["listingRef", "priceCents", "currency"],
                  },
                },
                required: ["key", "type", "payload", "rationale", "dependsOn"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  ...commonProperties,
                  type: { const: "PUBLISH_LISTING" },
                  payload: {
                    type: "object",
                    additionalProperties: false,
                    properties: { listingRef: resultRef },
                    required: ["listingRef"],
                  },
                },
                required: ["key", "type", "payload", "rationale", "dependsOn"],
              },
            ],
          },
        },
      },
      required: ["kind", "summary", "actions"],
      additionalProperties: false,
    },
    {
      properties: {
        kind: { const: "UNSUPPORTED" },
        summary: text(500),
        actions: { type: "array", maxItems: 0 },
      },
      required: ["kind", "summary", "actions"],
      additionalProperties: false,
    },
  ],
} as const;
