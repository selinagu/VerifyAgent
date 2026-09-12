import type { Prisma, PrismaClient } from "@prisma/client";

import { parsePersistedAction } from "@/lib/actions/persisted-action";
import { appendAuditEvent } from "@/lib/audit/audit-service";
import { hasValidConfirmation } from "@/lib/authorization/confirmation-service";
import { validateIdentityGrant } from "@/lib/authorization/grant-service";
import type { AppEnv } from "@/lib/config/env";
import { ActionExecutor } from "@/lib/executor/executor";
import { ExecutionError } from "@/lib/executor/errors";
import type { ExecutionContext } from "@/lib/executor/types";
import { buildPolicyContext } from "@/lib/policy/policy-context";
import { evaluatePolicy } from "@/lib/policy/policy-engine";
import type { PolicyContext } from "@/lib/policy/types";
import { transitionAction } from "@/lib/state-machine/action-transitions";
import { transitionTask } from "@/lib/state-machine/task-transitions";
import { getTaskSnapshot } from "@/lib/tasks/task-query-service";

function policyEnvironment(env: AppEnv): PolicyContext["environment"] {
  if (process.env.NODE_ENV === "test") return "test";
  return env.DEMO_MODE ? "demo" : "production";
}

type TaskWithActions = Prisma.TaskRunGetPayload<{ include: { actions: true } }>;
type RunnerAction = TaskWithActions["actions"][number];

export class TaskRunner {
  private readonly executor: ActionExecutor;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: AppEnv,
  ) {
    this.executor = new ActionExecutor(prisma);
  }

  async runTask(taskId: string, suppliedContext: ExecutionContext) {
    let task = await this.prisma.taskRun.findUnique({
      where: { id: taskId },
      include: { actions: { orderBy: { sequence: "asc" } } },
    });
    if (!task) throw new ExecutionError("TASK_NOT_FOUND");
    if (task.userId !== suppliedContext.userId) throw new ExecutionError("TASK_OWNERSHIP_MISMATCH");
    if (task.sessionId !== suppliedContext.sessionId) throw new ExecutionError("SESSION_MISMATCH");

    const context = { ...suppliedContext, correlationId: task.correlationId };
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
      return getTaskSnapshot(this.prisma, taskId, context.userId);
    }
    if (task.status === "PLANNING") throw new ExecutionError("TASK_NOT_RUNNABLE");
    if (task.status === "READY") {
      await this.prisma.$transaction(async (tx) => {
        await transitionTask(tx, { taskId, from: "READY", to: "RUNNING" });
        await appendAuditEvent(tx, {
          taskId,
          actorType: "SYSTEM",
          eventType: "TASK_STARTED",
          outcome: "RUNNING",
          correlationId: context.correlationId,
        });
      });
    }

    for (let step = 0; step < 30; step += 1) {
      task = await this.prisma.taskRun.findUniqueOrThrow({
        where: { id: taskId },
        include: { actions: { orderBy: { sequence: "asc" } } },
      });
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) break;

      const action = task.actions.find((item) => item.status !== "SUCCEEDED");
      if (!action) {
        if (task.status !== "RUNNING") throw new ExecutionError("TASK_NOT_RUNNABLE");
        await this.prisma.$transaction(async (tx) => {
          await transitionTask(tx, { taskId, from: "RUNNING", to: "COMPLETED" });
          await appendAuditEvent(tx, {
            taskId,
            actorType: "SYSTEM",
            eventType: "TASK_COMPLETED",
            outcome: "COMPLETED",
            correlationId: context.correlationId,
          });
        });
        continue;
      }

      if (action.status === "VALIDATED") {
        await this.evaluateAction(task, action, context);
        continue;
      }
      if (action.status === "POLICY_EVALUATED") {
        await this.routePolicyDecision(task, action, context);
        continue;
      }
      if (action.status === "WAITING_CONFIRMATION") {
        const valid = await hasValidConfirmation(this.prisma, { ...action, task });
        if (!valid) return getTaskSnapshot(this.prisma, taskId, context.userId);
        await this.authorizeWaitingAction(task, action, context, "WAITING_CONFIRMATION");
        continue;
      }
      if (action.status === "WAITING_IDENTITY") {
        const grant = await validateIdentityGrant(this.prisma, action, context);
        if (!grant.valid) return getTaskSnapshot(this.prisma, taskId, context.userId);
        await this.authorizeWaitingAction(task, action, context, "WAITING_IDENTITY", grant.grantId);
        continue;
      }
      if (action.status === "AUTHORIZED") {
        const result = await this.executor.executeAction(action.id, context);
        if (result.outcome === "FAILED") {
          await this.failTask(taskId, task.status, context, result.error.code);
          break;
        }
        continue;
      }
      if (["FAILED", "DENIED", "CANCELLED"].includes(action.status)) {
        await this.failTask(taskId, task.status, context, action.errorCode ?? action.reasonCode ?? "POLICY_DENIED");
        break;
      }
      if (action.status === "EXECUTING") {
        return getTaskSnapshot(this.prisma, taskId, context.userId);
      }
      throw new ExecutionError("TASK_NOT_RUNNABLE");
    }

    return getTaskSnapshot(this.prisma, taskId, context.userId);
  }

  private async evaluateAction(
    task: TaskWithActions,
    action: RunnerAction,
    context: ExecutionContext,
  ) {
    let parsed;
    try {
      parsed = parsePersistedAction(action);
    } catch (error) {
      const reasonCode = error instanceof ExecutionError ? error.code : "POLICY_CONTEXT_INVALID";
      await this.prisma.$transaction(async (tx) => {
        await transitionAction(tx, {
          actionId: action.id,
          from: "VALIDATED",
          to: "FAILED",
          data: { errorCode: reasonCode },
        });
        await transitionTask(tx, { taskId: task.id, from: "RUNNING", to: "FAILED" });
        await appendAuditEvent(tx, {
          taskId: task.id,
          actionId: action.id,
          actorType: "SYSTEM",
          eventType: "TASK_FAILED",
          outcome: "FAILED",
          reasonCode,
          correlationId: context.correlationId,
        });
      });
      return;
    }
    const policyContext = await buildPolicyContext(
      this.prisma,
      { ...action, task: { userId: task.userId, sessionId: task.sessionId } },
      parsed,
      context,
      policyEnvironment(this.env),
    );
    const outcome = evaluatePolicy(parsed, policyContext);

    await this.prisma.$transaction(async (tx) => {
      await transitionAction(tx, {
        actionId: action.id,
        from: "VALIDATED",
        to: "POLICY_EVALUATED",
        data: {
          requirement: outcome.kind === "ALLOW_WITH" ? outcome.decision.requirement : null,
          policyId: outcome.kind === "ALLOW_WITH" ? outcome.decision.policyId : outcome.policyId,
          policyVersion: outcome.kind === "ALLOW_WITH" ? outcome.decision.policyVersion : outcome.policyVersion,
          reasonCode: outcome.kind === "ALLOW_WITH" ? outcome.decision.reasonCode : outcome.reasonCode,
        },
      });
      await appendAuditEvent(tx, {
        taskId: task.id,
        actionId: action.id,
        actorType: "POLICY",
        eventType: "POLICY_EVALUATED",
        outcome: outcome.kind === "ALLOW_WITH" ? "ALLOW_WITH" : "DENY",
        reasonCode: outcome.kind === "ALLOW_WITH" ? outcome.decision.reasonCode : outcome.reasonCode,
        correlationId: task.correlationId,
        metadata: {
          policyId: outcome.kind === "ALLOW_WITH" ? outcome.decision.policyId : outcome.policyId,
          policyVersion: outcome.kind === "ALLOW_WITH" ? outcome.decision.policyVersion : outcome.policyVersion,
          requirement: outcome.kind === "ALLOW_WITH" ? outcome.decision.requirement : "DENY",
          actionType: action.type,
        },
      });
    });
  }

  private async routePolicyDecision(
    task: { id: string; correlationId: string },
    action: { id: string; requirement: string | null; reasonCode: string | null },
    context: ExecutionContext,
  ) {
    if (!action.requirement) {
      await this.prisma.$transaction(async (tx) => {
        await transitionAction(tx, { actionId: action.id, from: "POLICY_EVALUATED", to: "DENIED" });
        await transitionTask(tx, { taskId: task.id, from: "RUNNING", to: "FAILED" });
        await appendAuditEvent(tx, {
          taskId: task.id,
          actionId: action.id,
          actorType: "POLICY",
          eventType: "TASK_FAILED",
          outcome: "FAILED",
          reasonCode: action.reasonCode ?? "POLICY_DENIED",
          correlationId: context.correlationId,
        });
      });
      return;
    }
    if (action.requirement === "NONE") {
      await this.prisma.$transaction(async (tx) => {
        await transitionAction(tx, { actionId: action.id, from: "POLICY_EVALUATED", to: "AUTHORIZED" });
        await appendAuditEvent(tx, {
          taskId: task.id,
          actionId: action.id,
          actorType: "POLICY",
          eventType: "ACTION_AUTHORIZED",
          outcome: "AUTHORIZED",
          reasonCode: action.reasonCode ?? undefined,
          correlationId: context.correlationId,
        });
      });
      return;
    }

    const waitingStatus = action.requirement === "CONFIRM" ? "WAITING_CONFIRMATION" : "WAITING_IDENTITY";
    const eventType = action.requirement === "CONFIRM" ? "ACTION_WAITING_CONFIRMATION" : "ACTION_WAITING_IDENTITY";
    await this.prisma.$transaction(async (tx) => {
      await transitionAction(tx, { actionId: action.id, from: "POLICY_EVALUATED", to: waitingStatus });
      await transitionTask(tx, { taskId: task.id, from: "RUNNING", to: waitingStatus });
      await appendAuditEvent(tx, {
        taskId: task.id,
        actionId: action.id,
        actorType: "POLICY",
        eventType,
        outcome: waitingStatus,
        reasonCode: action.reasonCode ?? undefined,
        correlationId: context.correlationId,
      });
    });
  }

  private async authorizeWaitingAction(
    task: { id: string; correlationId: string },
    action: { id: string; reasonCode: string | null },
    context: ExecutionContext,
    waitingStatus: "WAITING_CONFIRMATION" | "WAITING_IDENTITY",
    grantId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await transitionAction(tx, { actionId: action.id, from: waitingStatus, to: "AUTHORIZED" });
      await transitionTask(tx, { taskId: task.id, from: waitingStatus, to: "RUNNING" });
      if (grantId) {
        await appendAuditEvent(tx, {
          taskId: task.id,
          actionId: action.id,
          actorType: "POLICY",
          eventType: "IDENTITY_GRANT_VALIDATED",
          outcome: "VALID",
          correlationId: context.correlationId,
          metadata: { grantId },
        });
      }
      await appendAuditEvent(tx, {
        taskId: task.id,
        actionId: action.id,
        actorType: "POLICY",
        eventType: "ACTION_AUTHORIZED",
        outcome: "AUTHORIZED",
        reasonCode: action.reasonCode ?? undefined,
        correlationId: context.correlationId,
      });
    });
  }

  private async failTask(taskId: string, currentStatus: string, context: ExecutionContext, reasonCode: string) {
    if (!["RUNNING", "WAITING_CONFIRMATION", "WAITING_IDENTITY"].includes(currentStatus)) return;
    await this.prisma.$transaction(async (tx) => {
      await transitionTask(tx, {
        taskId,
        from: currentStatus as "RUNNING" | "WAITING_CONFIRMATION" | "WAITING_IDENTITY",
        to: "FAILED",
      });
      await appendAuditEvent(tx, {
        taskId,
        actorType: "SYSTEM",
        eventType: "TASK_FAILED",
        outcome: "FAILED",
        reasonCode,
        correlationId: context.correlationId,
      });
    });
  }
}
