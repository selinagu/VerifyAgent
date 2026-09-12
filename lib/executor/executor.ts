import type { Prisma, PrismaClient } from "@prisma/client";

import type { CandidateAction } from "@/lib/actions/schema";
import { parsePersistedAction } from "@/lib/actions/persisted-action";
import { findActionForExecution } from "@/lib/actions/action-repository";
import { appendAuditEvent } from "@/lib/audit/audit-service";
import { consumeIdentityGrant } from "@/lib/authorization/grant-service";
import { assertActionTransition } from "@/lib/state-machine/action-transitions";
import { parseActionReference } from "./action-reference";
import { ExecutionError, toExecutionError, type ExecutionErrorCode } from "./errors";
import { handleCreateDraftListing } from "./handlers/create-draft-listing";
import { handlePublishListing } from "./handlers/publish-listing";
import { handleSetListingPrice } from "./handlers/set-listing-price";
import type { HandlerResult } from "./handlers/types";
import type { ExecutionContext, ExecutionFailure, ExecutionResult } from "./types";

type PersistedAction = NonNullable<Awaited<ReturnType<typeof findActionForExecution>>>;

function failure(actionId: string, error: ExecutionError): ExecutionFailure {
  return {
    outcome: "FAILED",
    actionId,
    error: { code: error.code, message: error.safeMessage, retryable: error.retryable },
  };
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

async function validateDependencies(
  tx: Prisma.TransactionClient,
  taskId: string,
  currentSequence: number,
  dependencies: string[],
): Promise<void> {
  for (const reference of dependencies) {
    let dependencyId: string;
    try {
      dependencyId = parseActionReference(reference);
    } catch {
      throw new ExecutionError("DEPENDENCY_NOT_SUCCEEDED");
    }
    const dependency = await tx.actionRun.findUnique({ where: { id: dependencyId } });
    if (
      !dependency ||
      dependency.taskId !== taskId ||
      dependency.sequence >= currentSequence ||
      dependency.status !== "SUCCEEDED"
    ) {
      throw new ExecutionError("DEPENDENCY_NOT_SUCCEEDED");
    }
  }
}

async function dispatch(
  tx: Prisma.TransactionClient,
  persisted: PersistedAction,
  action: CandidateAction,
  context: ExecutionContext,
): Promise<HandlerResult> {
  const base = { tx, actionId: persisted.id, taskId: persisted.taskId, context };
  switch (action.type) {
    case "CREATE_DRAFT_LISTING":
      return handleCreateDraftListing({ ...base, action });
    case "SET_LISTING_PRICE":
      return handleSetListingPrice({ ...base, action });
    case "PUBLISH_LISTING":
      return handlePublishListing({ ...base, action });
    default:
      throw new ExecutionError("UNSUPPORTED_ACTION");
  }
}

export class ActionExecutor {
  constructor(private readonly prisma: PrismaClient) {}

  async executeAction(actionId: string, context: ExecutionContext): Promise<ExecutionResult> {
    const persisted = await findActionForExecution(this.prisma, actionId);
    if (!persisted) return failure(actionId, new ExecutionError("ACTION_NOT_FOUND"));

    const ownershipError = this.checkOwnership(persisted, context);
    const trustedContext = { ...context, correlationId: persisted.task.correlationId };
    if (ownershipError) {
      await this.recordRejection(persisted, trustedContext, ownershipError.code);
      return failure(actionId, ownershipError);
    }

    if (persisted.status === "SUCCEEDED") {
      return {
        outcome: "SUCCEEDED",
        actionId,
        replayed: true,
        result: jsonObject(persisted.resultJson),
      };
    }
    if (persisted.status === "EXECUTING") {
      return failure(actionId, new ExecutionError("ACTION_ALREADY_EXECUTING"));
    }
    if (persisted.status !== "AUTHORIZED") {
      return failure(actionId, new ExecutionError("ACTION_NOT_EXECUTABLE"));
    }

    let parsed: CandidateAction;
    try {
      parsed = parsePersistedAction(persisted);
    } catch (error) {
      const safeError = toExecutionError(error);
      await this.failAuthorizedAction(persisted, trustedContext, safeError);
      return failure(actionId, safeError);
    }

    const claimed = await this.claim(persisted, trustedContext);
    if (!claimed) return this.resultAfterLostClaim(actionId);

    try {
      const handlerResult = await this.prisma.$transaction(async (tx) => {
        await validateDependencies(tx, persisted.taskId, persisted.sequence, parsed.dependsOn);
        if (persisted.requirement === "VERIFIED_IDENTITY") {
          const grantId = await consumeIdentityGrant(tx, persisted, trustedContext);
          await appendAuditEvent(tx, {
            taskId: persisted.taskId,
            actionId: persisted.id,
            actorType: "EXECUTOR",
            eventType: "IDENTITY_GRANT_CONSUMED",
            outcome: "SUCCEEDED",
            correlationId: trustedContext.correlationId,
            metadata: { grantId },
          });
        }
        const result = await dispatch(tx, persisted, parsed, trustedContext);
        const completed = await tx.actionRun.updateMany({
          where: { id: persisted.id, status: "EXECUTING" },
          data: { status: "SUCCEEDED", resultJson: result.result, errorCode: null },
        });
        if (completed.count !== 1) throw new ExecutionError("CONCURRENT_MODIFICATION");

        await appendAuditEvent(tx, {
          taskId: persisted.taskId,
          actionId: persisted.id,
          actorType: "EXECUTOR",
          eventType: result.eventType,
          outcome: "SUCCEEDED",
          correlationId: trustedContext.correlationId,
          metadata: result.metadata,
        });
        await appendAuditEvent(tx, {
          taskId: persisted.taskId,
          actionId: persisted.id,
          actorType: "EXECUTOR",
          eventType: "ACTION_EXECUTION_SUCCEEDED",
          outcome: "SUCCEEDED",
          correlationId: trustedContext.correlationId,
        });
        return result;
      });

      return {
        outcome: "SUCCEEDED",
        actionId,
        replayed: false,
        result: handlerResult.result,
      };
    } catch (error) {
      const safeError = toExecutionError(error);
      try {
        await this.recordFailure(persisted, trustedContext, safeError);
      } catch {
        // The caller still receives a safe failure if persistence is unavailable.
      }
      return failure(actionId, safeError);
    }
  }

  private checkOwnership(
    persisted: PersistedAction,
    context: ExecutionContext,
  ): ExecutionError | null {
    if (persisted.task.userId !== context.userId) {
      return new ExecutionError("TASK_OWNERSHIP_MISMATCH");
    }
    if (persisted.task.sessionId !== context.sessionId) {
      return new ExecutionError("SESSION_MISMATCH");
    }
    return null;
  }

  private async claim(persisted: PersistedAction, context: ExecutionContext): Promise<boolean> {
    assertActionTransition("AUTHORIZED", "EXECUTING");
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.actionRun.updateMany({
        where: { id: persisted.id, status: "AUTHORIZED" },
        data: { status: "EXECUTING", errorCode: null },
      });
      if (claim.count !== 1) return false;
      await appendAuditEvent(tx, {
        taskId: persisted.taskId,
        actionId: persisted.id,
        actorType: "EXECUTOR",
        eventType: "ACTION_EXECUTION_STARTED",
        outcome: "STARTED",
        correlationId: context.correlationId,
      });
      return true;
    });
  }

  private async resultAfterLostClaim(actionId: string): Promise<ExecutionResult> {
    const current = await this.prisma.actionRun.findUnique({ where: { id: actionId } });
    if (current?.status === "SUCCEEDED") {
      return {
        outcome: "SUCCEEDED",
        actionId,
        replayed: true,
        result: jsonObject(current.resultJson),
      };
    }
    const code: ExecutionErrorCode =
      current?.status === "EXECUTING" ? "ACTION_ALREADY_EXECUTING" : "ACTION_NOT_EXECUTABLE";
    return failure(actionId, new ExecutionError(code));
  }

  private async failAuthorizedAction(
    persisted: PersistedAction,
    context: ExecutionContext,
    error: ExecutionError,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const update = await tx.actionRun.updateMany({
        where: { id: persisted.id, status: "AUTHORIZED" },
        data: { status: "FAILED", errorCode: error.code },
      });
      if (update.count !== 1) return;
      await appendAuditEvent(tx, {
        taskId: persisted.taskId,
        actionId: persisted.id,
        actorType: "EXECUTOR",
        eventType: "ACTION_EXECUTION_REJECTED",
        outcome: "FAILED",
        reasonCode: error.code,
        correlationId: context.correlationId,
      });
    });
  }

  private async recordRejection(
    persisted: PersistedAction,
    context: ExecutionContext,
    code: ExecutionErrorCode,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      appendAuditEvent(tx, {
        taskId: persisted.taskId,
        actionId: persisted.id,
        actorType: "EXECUTOR",
        eventType: "ACTION_EXECUTION_REJECTED",
        outcome: "DENIED",
        reasonCode: code,
        correlationId: context.correlationId,
      }),
    );
  }

  private async recordFailure(
    persisted: PersistedAction,
    context: ExecutionContext,
    error: ExecutionError,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (persisted.requirement === "VERIFIED_IDENTITY") {
        const revoked = await tx.authorizationGrant.updateMany({
          where: {
            actionId: persisted.id,
            userId: context.userId,
            sessionId: context.sessionId,
            status: "ACTIVE",
          },
          data: { status: "REVOKED" },
        });
        if (revoked.count > 0) {
          await appendAuditEvent(tx, {
            taskId: persisted.taskId,
            actionId: persisted.id,
            actorType: "EXECUTOR",
            eventType: "IDENTITY_GRANT_REVOKED",
            outcome: "REVOKED",
            reasonCode: error.code,
            correlationId: context.correlationId,
          });
        }
      }
      await tx.actionRun.updateMany({
        where: { id: persisted.id, status: "EXECUTING" },
        data: { status: "FAILED", errorCode: error.code },
      });
      await appendAuditEvent(tx, {
        taskId: persisted.taskId,
        actionId: persisted.id,
        actorType: "EXECUTOR",
        eventType: "ACTION_EXECUTION_FAILED",
        outcome: "FAILED",
        reasonCode: error.code,
        correlationId: context.correlationId,
      });
    });
  }
}
