import { z } from "zod";

export const emptyMutationBodySchema = z.object({}).strict();

export const confirmationRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    expectedPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const taskCreationRequestSchema = z
  .object({ requestText: z.string().trim().min(1).max(1_000) })
  .strict();

export const planningIdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
