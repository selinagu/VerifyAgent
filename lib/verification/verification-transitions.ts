import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { ExecutionError } from "@/lib/executor/errors";

export const verificationStatusSchema = z.enum([
  "CREATED",
  "PENDING",
  "APPROVED",
  "DECLINED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const VERIFICATION_TRANSITIONS: Readonly<Record<VerificationStatus, readonly VerificationStatus[]>> = {
  CREATED: ["PENDING", "FAILED", "EXPIRED", "CANCELLED"],
  PENDING: ["APPROVED", "DECLINED", "FAILED", "EXPIRED", "CANCELLED"],
  APPROVED: [],
  DECLINED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function assertVerificationTransition(from: string, to: string) {
  const source = verificationStatusSchema.safeParse(from);
  const target = verificationStatusSchema.safeParse(to);
  if (!source.success || !target.success || !VERIFICATION_TRANSITIONS[source.data].includes(target.data)) {
    throw new ExecutionError("VERIFICATION_ALREADY_TERMINAL");
  }
}

export async function transitionVerification(
  tx: Prisma.TransactionClient,
  input: {
    verificationId: string;
    from: VerificationStatus;
    to: VerificationStatus;
    data?: Prisma.VerificationSessionUpdateManyMutationInput;
  },
) {
  assertVerificationTransition(input.from, input.to);
  const result = await tx.verificationSession.updateMany({
    where: { id: input.verificationId, status: input.from },
    data: { ...input.data, status: input.to },
  });
  if (result.count !== 1) throw new ExecutionError("VERIFICATION_ALREADY_TERMINAL");
}
