import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

export type AuditEventInput = {
  taskId?: string;
  actionId?: string;
  actorType: "USER" | "AGENT" | "POLICY" | "PERSONA" | "EXECUTOR" | "SYSTEM";
  eventType: string;
  outcome: string;
  reasonCode?: string;
  correlationId: string;
  metadata?: Prisma.InputJsonObject;
};

export async function appendAuditEvent(
  tx: Prisma.TransactionClient,
  input: AuditEventInput,
) {
  return tx.auditEvent.create({
    data: {
      id: randomUUID(),
      taskId: input.taskId,
      actionId: input.actionId,
      actorType: input.actorType,
      eventType: input.eventType,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      correlationId: input.correlationId,
      metadataJson: input.metadata,
    },
  });
}
