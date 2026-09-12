import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { parsePersistedAction } from "@/lib/actions/persisted-action";
import { appendAuditEvent } from "@/lib/audit/audit-service";
import { ExecutionError } from "@/lib/executor/errors";
import { transitionAction } from "@/lib/state-machine/action-transitions";
import { transitionTask } from "@/lib/state-machine/task-transitions";
import { confirmationPayloadHash } from "./scope-hash";

export type ConfirmationDecision = "APPROVE" | "REJECT";

type ConfirmInput = {
  actionId: string;
  userId: string;
  sessionId: string;
  correlationId: string;
  expectedPayloadHash: string;
  decision: ConfirmationDecision;
};

export function currentConfirmationHash(action: {
  id: string;
  type: string;
  payloadJson: Parameters<typeof confirmationPayloadHash>[0]["payload"];
  task: { userId: string; sessionId: string };
}): string {
  return confirmationPayloadHash({
    actionId: action.id,
    type: action.type,
    payload: action.payloadJson,
    userId: action.task.userId,
    sessionId: action.task.sessionId,
  });
}

export async function hasValidConfirmation(
  prisma: PrismaClient,
  action: {
    id: string;
    type: string;
    payloadJson: Parameters<typeof confirmationPayloadHash>[0]["payload"];
    task: { userId: string; sessionId: string };
  },
): Promise<boolean> {
  const confirmation = await prisma.actionConfirmation.findUnique({ where: { actionId: action.id } });
  return Boolean(
    confirmation &&
      confirmation.decision === "APPROVED" &&
      confirmation.userId === action.task.userId &&
      confirmation.sessionId === action.task.sessionId &&
      confirmation.payloadHash === currentConfirmationHash(action),
  );
}

export async function confirmAction(prisma: PrismaClient, input: ConfirmInput) {
  const action = await prisma.actionRun.findUnique({
    where: { id: input.actionId },
    include: { task: true, confirmation: true },
  });
  if (!action) throw new ExecutionError("ACTION_NOT_FOUND");
  if (action.task.userId !== input.userId) throw new ExecutionError("TASK_OWNERSHIP_MISMATCH");
  if (action.task.sessionId !== input.sessionId) throw new ExecutionError("SESSION_MISMATCH");
  if (action.requirement !== "CONFIRM") throw new ExecutionError("ACTION_NOT_EXECUTABLE");
  parsePersistedAction(action);

  const serverHash = currentConfirmationHash(action);
  if (serverHash !== input.expectedPayloadHash) throw new ExecutionError("ACTION_CHANGED");
  const persistedDecision = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";

  if (action.confirmation) {
    if (
      action.confirmation.payloadHash === serverHash &&
      action.confirmation.decision === persistedDecision &&
      action.confirmation.userId === input.userId &&
      action.confirmation.sessionId === input.sessionId
    ) {
      return { taskId: action.taskId, decision: input.decision, idempotent: true } as const;
    }
    throw new ExecutionError("ACTION_CHANGED");
  }
  if (action.status !== "WAITING_CONFIRMATION" || action.task.status !== "WAITING_CONFIRMATION") {
    throw new ExecutionError("ACTION_NOT_EXECUTABLE");
  }

  await prisma.$transaction(async (tx) => {
    await tx.actionConfirmation.create({
      data: {
        id: randomUUID(),
        actionId: action.id,
        userId: input.userId,
        sessionId: input.sessionId,
        payloadHash: serverHash,
        decision: persistedDecision,
      },
    });

    if (input.decision === "APPROVE") {
      await transitionAction(tx, {
        actionId: action.id,
        from: "WAITING_CONFIRMATION",
        to: "AUTHORIZED",
      });
      await transitionTask(tx, {
        taskId: action.taskId,
        from: "WAITING_CONFIRMATION",
        to: "RUNNING",
      });
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actionId: action.id,
        actorType: "USER",
        eventType: "ACTION_CONFIRMATION_APPROVED",
        outcome: "APPROVED",
        correlationId: action.task.correlationId,
      });
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actionId: action.id,
        actorType: "POLICY",
        eventType: "ACTION_AUTHORIZED",
        outcome: "AUTHORIZED",
        reasonCode: action.reasonCode ?? undefined,
        correlationId: action.task.correlationId,
      });
    } else {
      await transitionAction(tx, {
        actionId: action.id,
        from: "WAITING_CONFIRMATION",
        to: "DENIED",
      });
      await transitionTask(tx, {
        taskId: action.taskId,
        from: "WAITING_CONFIRMATION",
        to: "CANCELLED",
      });
      const downstream = await tx.actionRun.findMany({
        where: { taskId: action.taskId, sequence: { gt: action.sequence }, status: "VALIDATED" },
        select: { id: true },
      });
      for (const item of downstream) {
        await transitionAction(tx, { actionId: item.id, from: "VALIDATED", to: "CANCELLED" });
      }
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actionId: action.id,
        actorType: "USER",
        eventType: "ACTION_CONFIRMATION_REJECTED",
        outcome: "REJECTED",
        reasonCode: "CONFIRMATION_REJECTED",
        correlationId: action.task.correlationId,
      });
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actorType: "SYSTEM",
        eventType: "TASK_CANCELLED",
        outcome: "CANCELLED",
        reasonCode: "CONFIRMATION_REJECTED",
        correlationId: action.task.correlationId,
      });
    }
  });

  return { taskId: action.taskId, decision: input.decision, idempotent: false } as const;
}
