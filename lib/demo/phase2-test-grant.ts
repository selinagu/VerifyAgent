import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { parseEnv } from "@/lib/config/env";
import { ExecutionError } from "@/lib/executor/errors";
import { identityGrantScopeHash } from "@/lib/authorization/scope-hash";

export async function issuePhase2TestGrant(
  prisma: PrismaClient,
  input: { actionId: string; userId: string; sessionId: string },
) {
  const env = parseEnv();
  if (!env.DEMO_MODE && process.env.NODE_ENV !== "test") {
    throw new ExecutionError("AUTH_CONTEXT_UNAVAILABLE");
  }
  const action = await prisma.actionRun.findUnique({
    where: { id: input.actionId },
    include: { task: true },
  });
  if (!action) throw new ExecutionError("ACTION_NOT_FOUND");
  if (action.task.userId !== input.userId) throw new ExecutionError("TASK_OWNERSHIP_MISMATCH");
  if (action.task.sessionId !== input.sessionId) throw new ExecutionError("SESSION_MISMATCH");
  if (action.status !== "WAITING_IDENTITY" || action.requirement !== "VERIFIED_IDENTITY") {
    throw new ExecutionError("ACTION_NOT_EXECUTABLE");
  }

  const verificationId = randomUUID();
  const grantId = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);
  const scopeHash = identityGrantScopeHash({
    actionId: action.id,
    type: action.type,
    payload: action.payloadJson,
    userId: input.userId,
    sessionId: input.sessionId,
  });

  return prisma.$transaction(async (tx) => {
    const verification = await tx.verificationSession.create({
      data: {
        id: verificationId,
        userId: input.userId,
        sessionId: input.sessionId,
        actionId: action.id,
        personaReferenceId: `phase2_demo_${randomUUID()}`,
        scopeHash,
        status: "APPROVED",
        verifiedAt: new Date(),
        expiresAt,
      },
    });
    const grant = await tx.authorizationGrant.create({
      data: {
        id: grantId,
        userId: input.userId,
        sessionId: input.sessionId,
        actionId: action.id,
        verificationSessionId: verification.id,
        scopeHash,
        status: "ACTIVE",
        expiresAt,
      },
    });
    return { verificationId: verification.id, grantId: grant.id };
  });
}
