import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { appendAuditEvent } from "@/lib/audit/audit-service";
import { identityGrantScopeHash } from "@/lib/authorization/scope-hash";
import { ExecutionError } from "@/lib/executor/errors";
import type { PersonaGateway } from "@/lib/persona/persona-gateway";
import type { PersonaInquiryResult, VerifiedPersonaEvent } from "@/lib/persona/types";
import { issueGrantForApprovedVerification } from "./grant-issuer";
import { transitionVerification, type VerificationStatus } from "./verification-transitions";

const PASSIVE_EVENTS = new Set(["inquiry.created", "inquiry.started", "inquiry.completed", "inquiry.marked-for-review"]);
const FAILURE_EVENTS: Readonly<Record<string, VerificationStatus>> = {
  "inquiry.declined": "DECLINED",
  "inquiry.failed": "FAILED",
  "inquiry.expired": "EXPIRED",
  "inquiry.canceled": "CANCELLED",
  "inquiry.cancelled": "CANCELLED",
};

async function finishEvent(
  prisma: PrismaClient,
  eventId: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  reasonCode?: string,
) {
  await prisma.personaWebhookEvent.update({
    where: { personaEventId: eventId },
    data: { status, reasonCode, processedAt: new Date() },
  });
}

export async function processPersonaWebhook(input: {
  prisma: PrismaClient;
  gateway: PersonaGateway;
  event: VerifiedPersonaEvent;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const prior = await input.prisma.personaWebhookEvent.findUnique({
    where: { personaEventId: input.event.eventId },
  });
  if (prior && ["PROCESSED", "IGNORED"].includes(prior.status)) {
    return { duplicate: true, processed: prior.status === "PROCESSED" } as const;
  }
  if (!prior) {
    try {
      await input.prisma.personaWebhookEvent.create({
        data: {
          id: randomUUID(),
          personaEventId: input.event.eventId,
          eventType: input.event.eventType,
          inquiryId: input.event.inquiryId,
          payloadHash: input.event.payloadHash,
          eventCreatedAt: input.event.eventCreatedAt,
          status: "RECEIVED",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { duplicate: true, processed: false } as const;
      }
      throw error;
    }
  } else if (prior.payloadHash !== input.event.payloadHash) {
    throw new ExecutionError("PERSONA_EVENT_INVALID");
  }

  const recognized =
    input.event.eventType === "inquiry.approved" ||
    PASSIVE_EVENTS.has(input.event.eventType) ||
    input.event.eventType in FAILURE_EVENTS;
  if (!recognized) {
    await finishEvent(input.prisma, input.event.eventId, "IGNORED", "UNSUPPORTED_PERSONA_EVENT");
    return { duplicate: false, processed: false } as const;
  }

  const verification = await input.prisma.verificationSession.findUnique({
    where: { personaInquiryId: input.event.inquiryId },
  });
  if (!verification) {
    await finishEvent(input.prisma, input.event.eventId, "IGNORED", "VERIFICATION_NOT_FOUND");
    return { duplicate: false, processed: false } as const;
  }
  if (verification.lastEventAt && input.event.eventCreatedAt < verification.lastEventAt) {
    await finishEvent(input.prisma, input.event.eventId, "IGNORED", "OUT_OF_ORDER_EVENT");
    return { duplicate: false, processed: false } as const;
  }

  let authoritative: PersonaInquiryResult | undefined;
  if (input.event.eventType === "inquiry.approved") {
    try {
      authoritative = await input.gateway.retrieveInquiry(input.event.inquiryId);
      if (
        authoritative.inquiryId !== verification.personaInquiryId ||
        authoritative.referenceId !== verification.personaReferenceId
      ) {
        throw new ExecutionError("INQUIRY_BINDING_MISMATCH");
      }
      if (authoritative.status !== "approved") {
        throw new ExecutionError("PERSONA_RESPONSE_INVALID");
      }
    } catch (error) {
      await finishEvent(
        input.prisma,
        input.event.eventId,
        "FAILED",
        error instanceof ExecutionError ? error.code : "PERSONA_REQUEST_FAILED",
      );
      throw error;
    }
  }

  await input.prisma.$transaction(async (tx) => {
    let current = await tx.verificationSession.findUniqueOrThrow({
      where: { id: verification.id },
      include: { action: { include: { task: true } }, grant: true },
    });
    const eventRecord = await tx.personaWebhookEvent.findUniqueOrThrow({
      where: { personaEventId: input.event.eventId },
    });
    if (["PROCESSED", "IGNORED"].includes(eventRecord.status)) return;
    if (current.lastEventAt && input.event.eventCreatedAt < current.lastEventAt) {
      await tx.personaWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "IGNORED", reasonCode: "OUT_OF_ORDER_EVENT", processedAt: now },
      });
      return;
    }

    await appendAuditEvent(tx, {
      taskId: current.action.taskId,
      actionId: current.actionId,
      actorType: "PERSONA",
      eventType: "PERSONA_WEBHOOK_RECEIVED",
      outcome: "VERIFIED_SIGNATURE",
      correlationId: current.action.task.correlationId,
      metadata: { eventId: input.event.eventId, inquiryId: input.event.inquiryId, eventType: input.event.eventType },
    });

    if (!["CREATED", "PENDING"].includes(current.status)) {
      await tx.personaWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "IGNORED", reasonCode: "VERIFICATION_ALREADY_TERMINAL", processedAt: now },
      });
      return;
    }
    if (current.status === "CREATED") {
      await transitionVerification(tx, {
        verificationId: current.id,
        from: "CREATED",
        to: "PENDING",
        data: { personaInquiryId: input.event.inquiryId, startedAt: now },
      });
      current = await tx.verificationSession.findUniqueOrThrow({
        where: { id: current.id },
        include: { action: { include: { task: true } }, grant: true },
      });
    }

    if (PASSIVE_EVENTS.has(input.event.eventType)) {
      await tx.verificationSession.update({
        where: { id: current.id },
        data: { lastEventAt: input.event.eventCreatedAt },
      });
      await tx.personaWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "PROCESSED", processedAt: now },
      });
      return;
    }

    const failureTarget = FAILURE_EVENTS[input.event.eventType];
    if (failureTarget) {
      await transitionVerification(tx, {
        verificationId: current.id,
        from: "PENDING",
        to: failureTarget,
        data: {
          activeKey: null,
          lastEventAt: input.event.eventCreatedAt,
          failureReasonCode: `PERSONA_${failureTarget}`,
        },
      });
      await appendAuditEvent(tx, {
        taskId: current.action.taskId,
        actionId: current.actionId,
        actorType: "PERSONA",
        eventType: `IDENTITY_VERIFICATION_${failureTarget}`,
        outcome: failureTarget,
        reasonCode: `PERSONA_${failureTarget}`,
        correlationId: current.action.task.correlationId,
        metadata: { verificationId: current.id, inquiryId: input.event.inquiryId },
      });
      await tx.personaWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "PROCESSED", processedAt: now },
      });
      return;
    }

    if (!current.expiresAt || current.expiresAt <= now) {
      await transitionVerification(tx, {
        verificationId: current.id,
        from: "PENDING",
        to: "EXPIRED",
        data: { activeKey: null, lastEventAt: input.event.eventCreatedAt, failureReasonCode: "VERIFICATION_EXPIRED" },
      });
      await tx.personaWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "PROCESSED", reasonCode: "VERIFICATION_EXPIRED", processedAt: now },
      });
      return;
    }
    if (
      authoritative?.inquiryId !== current.personaInquiryId ||
      authoritative.referenceId !== current.personaReferenceId ||
      (input.event.referenceId && input.event.referenceId !== current.personaReferenceId)
    ) {
      throw new ExecutionError("INQUIRY_BINDING_MISMATCH");
    }
    const currentScope = identityGrantScopeHash({
      actionId: current.action.id,
      type: current.action.type,
      payload: current.action.payloadJson,
      userId: current.userId,
      sessionId: current.sessionId,
    });
    if (currentScope !== current.scopeHash) {
      await transitionVerification(tx, {
        verificationId: current.id,
        from: "PENDING",
        to: "FAILED",
        data: {
          activeKey: null,
          lastEventAt: input.event.eventCreatedAt,
          failureReasonCode: "VERIFICATION_ACTION_CHANGED",
        },
      });
      await tx.personaWebhookEvent.update({
        where: { id: eventRecord.id },
        data: { status: "PROCESSED", reasonCode: "VERIFICATION_ACTION_CHANGED", processedAt: now },
      });
      await appendAuditEvent(tx, {
        taskId: current.action.taskId,
        actionId: current.actionId,
        actorType: "PERSONA",
        eventType: "IDENTITY_VERIFICATION_FAILED",
        outcome: "FAILED",
        reasonCode: "VERIFICATION_ACTION_CHANGED",
        correlationId: current.action.task.correlationId,
        metadata: { verificationId: current.id },
      });
      return;
    }

    await transitionVerification(tx, {
      verificationId: current.id,
      from: "PENDING",
      to: "APPROVED",
      data: { activeKey: null, verifiedAt: now, lastEventAt: input.event.eventCreatedAt, failureReasonCode: null },
    });
    const grant = await issueGrantForApprovedVerification(tx, current.id, now);
    await appendAuditEvent(tx, {
      taskId: current.action.taskId,
      actionId: current.actionId,
      actorType: "PERSONA",
      eventType: "IDENTITY_VERIFICATION_APPROVED",
      outcome: "APPROVED",
      correlationId: current.action.task.correlationId,
      metadata: { verificationId: current.id, inquiryId: input.event.inquiryId },
    });
    await appendAuditEvent(tx, {
      taskId: current.action.taskId,
      actionId: current.actionId,
      actorType: "PERSONA",
      eventType: "IDENTITY_GRANT_ISSUED",
      outcome: "ACTIVE",
      correlationId: current.action.task.correlationId,
      metadata: { verificationId: current.id, grantId: grant.id },
    });
    await tx.personaWebhookEvent.update({
      where: { id: eventRecord.id },
      data: { status: "PROCESSED", processedAt: now },
    });
  });

  return { duplicate: false, processed: true } as const;
}
