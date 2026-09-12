import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { identityGrantScopeHash } from "@/lib/authorization/scope-hash";
import { ExecutionError } from "@/lib/executor/errors";

const GRANT_TTL_MS = 10 * 60 * 1_000;

export async function issueGrantForApprovedVerification(
  tx: Prisma.TransactionClient,
  verificationId: string,
  now = new Date(),
) {
  const verification = await tx.verificationSession.findUnique({
    where: { id: verificationId },
    include: { action: { include: { task: true } }, grant: true },
  });
  if (!verification) throw new ExecutionError("VERIFICATION_NOT_FOUND");
  if (verification.grant) return verification.grant;
  if (verification.status !== "APPROVED") throw new ExecutionError("VERIFICATION_NOT_STARTABLE");
  if (!verification.expiresAt || verification.expiresAt <= now) throw new ExecutionError("VERIFICATION_EXPIRED");

  const { action } = verification;
  if (
    action.status !== "WAITING_IDENTITY" ||
    action.requirement !== "VERIFIED_IDENTITY" ||
    action.task.status !== "WAITING_IDENTITY" ||
    action.task.userId !== verification.userId ||
    action.task.sessionId !== verification.sessionId
  ) {
    throw new ExecutionError("VERIFICATION_NOT_STARTABLE");
  }
  const currentScope = identityGrantScopeHash({
    actionId: action.id,
    type: action.type,
    payload: action.payloadJson,
    userId: verification.userId,
    sessionId: verification.sessionId,
  });
  if (currentScope !== verification.scopeHash) throw new ExecutionError("VERIFICATION_ACTION_CHANGED");

  const expiresAt = new Date(Math.min(verification.expiresAt.getTime(), now.getTime() + GRANT_TTL_MS));
  return tx.authorizationGrant.create({
    data: {
      id: randomUUID(),
      userId: verification.userId,
      sessionId: verification.sessionId,
      actionId: action.id,
      verificationSessionId: verification.id,
      scopeHash: currentScope,
      status: "ACTIVE",
      expiresAt,
    },
  });
}
