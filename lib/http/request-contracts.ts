import { z } from "zod";

export const emptyMutationBodySchema = z.object({}).strict();

export const confirmationRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    expectedPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
