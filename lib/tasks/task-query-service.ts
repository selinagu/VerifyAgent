import type { PrismaClient } from "@prisma/client";

import { currentConfirmationHash } from "@/lib/authorization/confirmation-service";
import { ExecutionError } from "@/lib/executor/errors";

export async function getTaskSnapshot(prisma: PrismaClient, taskId: string, userId?: string) {
  const task = await prisma.taskRun.findUnique({
    where: { id: taskId },
    include: {
      actions: { orderBy: { sequence: "asc" }, include: { confirmation: true } },
      listings: { orderBy: { createdAt: "asc" } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) throw new ExecutionError("TASK_NOT_FOUND");
  if (userId && task.userId !== userId) throw new ExecutionError("TASK_OWNERSHIP_MISMATCH");

  return {
    id: task.id,
    status: task.status,
    requestText: task.requestText,
    actions: task.actions.map((action) => ({
      id: action.id,
      sequence: action.sequence,
      type: action.type,
      payload: action.payloadJson,
      status: action.status,
      requirement: action.requirement,
      reasonCode: action.reasonCode,
      result: action.resultJson,
      errorCode: action.errorCode,
      confirmationRequired: action.status === "WAITING_CONFIRMATION",
      confirmationPayloadHash:
        action.status === "WAITING_CONFIRMATION"
          ? currentConfirmationHash({ ...action, task })
          : undefined,
      confirmationDecision: action.confirmation?.decision,
    })),
    listings: task.listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      priceCents: listing.priceCents,
      currency: listing.currency,
      status: listing.status,
      version: listing.version,
    })),
    audit: task.auditEvents.map((event) => ({
      id: event.id,
      actionId: event.actionId,
      actorType: event.actorType,
      eventType: event.eventType,
      outcome: event.outcome,
      reasonCode: event.reasonCode,
      createdAt: event.createdAt,
    })),
  };
}
