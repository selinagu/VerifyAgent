import type { ActionRun, Prisma, PrismaClient } from "@prisma/client";

import { ExecutionError, type ExecutionErrorCode } from "@/lib/executor/errors";
import type { ExecutionContext } from "@/lib/executor/types";
import { identityGrantScopeHash } from "./scope-hash";

type GrantDatabase = PrismaClient | Prisma.TransactionClient;

export type GrantValidationResult =
  | { valid: true; grantId: string }
  | { valid: false; reasonCode: ExecutionErrorCode };

export async function validateIdentityGrant(
  database: GrantDatabase,
  action: Pick<ActionRun, "id" | "type" | "payloadJson">,
  context: Pick<ExecutionContext, "userId" | "sessionId">,
  now = new Date(),
): Promise<GrantValidationResult> {
  const grant = await database.authorizationGrant.findFirst({
    where: { actionId: action.id, userId: context.userId, sessionId: context.sessionId },
    include: { verificationSession: true },
    orderBy: { issuedAt: "desc" },
  });
  if (!grant) return { valid: false, reasonCode: "GRANT_NOT_FOUND" };
  if (grant.status === "CONSUMED") {
    return { valid: false, reasonCode: "GRANT_ALREADY_CONSUMED" };
  }
  if (grant.status === "REVOKED") return { valid: false, reasonCode: "GRANT_REVOKED" };
  if (grant.status !== "ACTIVE") return { valid: false, reasonCode: "GRANT_SCOPE_MISMATCH" };
  if (grant.expiresAt <= now) return { valid: false, reasonCode: "GRANT_EXPIRED" };
  if (
    grant.verificationSession.status !== "APPROVED" ||
    !grant.verificationSession.expiresAt ||
    grant.verificationSession.expiresAt <= now
  ) {
    return { valid: false, reasonCode: "VERIFICATION_NOT_APPROVED" };
  }

  const currentScope = identityGrantScopeHash({
    actionId: action.id,
    type: action.type,
    payload: action.payloadJson,
    userId: context.userId,
    sessionId: context.sessionId,
  });
  if (grant.scopeHash !== currentScope) {
    return { valid: false, reasonCode: "GRANT_SCOPE_MISMATCH" };
  }
  return { valid: true, grantId: grant.id };
}

export async function consumeIdentityGrant(
  tx: Prisma.TransactionClient,
  action: Pick<ActionRun, "id" | "type" | "payloadJson">,
  context: Pick<ExecutionContext, "userId" | "sessionId">,
  now = new Date(),
): Promise<string> {
  const validation = await validateIdentityGrant(tx, action, context, now);
  if (!validation.valid) throw new ExecutionError(validation.reasonCode);

  const consumed = await tx.authorizationGrant.updateMany({
    where: { id: validation.grantId, status: "ACTIVE", expiresAt: { gt: now } },
    data: { status: "CONSUMED", consumedAt: now },
  });
  if (consumed.count !== 1) throw new ExecutionError("GRANT_ALREADY_CONSUMED");
  return validation.grantId;
}
