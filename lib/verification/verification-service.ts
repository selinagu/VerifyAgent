import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { appendAuditEvent } from "@/lib/audit/audit-service";
import { identityGrantScopeHash } from "@/lib/authorization/scope-hash";
import type { AppEnv } from "@/lib/config/env";
import { ExecutionError } from "@/lib/executor/errors";
import type { ExecutionContext } from "@/lib/executor/types";
import type { PersonaGateway } from "@/lib/persona/persona-gateway";
import { transitionVerification } from "./verification-transitions";

const VERIFICATION_TTL_MS = 30 * 60 * 1_000;

export type VerificationStartResult = {
  verificationId: string;
  status: string;
  verificationUrl: string;
  flow: { inquiryId: string; environmentId: string; sessionToken?: string };
  idempotent: boolean;
};

export async function startVerification(input: {
  prisma: PrismaClient;
  gateway: PersonaGateway;
  env: AppEnv;
  actionId: string;
  context: ExecutionContext;
  now?: Date;
}): Promise<VerificationStartResult> {
  const now = input.now ?? new Date();
  if (!input.env.PERSONA_TEMPLATE_ID || !input.env.PERSONA_ENVIRONMENT_ID) {
    throw new ExecutionError("PERSONA_NOT_CONFIGURED");
  }
  const action = await input.prisma.actionRun.findUnique({
    where: { id: input.actionId },
    include: { task: true },
  });
  if (!action) throw new ExecutionError("ACTION_NOT_FOUND");
  if (action.task.userId !== input.context.userId) throw new ExecutionError("TASK_OWNERSHIP_MISMATCH");
  if (action.task.sessionId !== input.context.sessionId) throw new ExecutionError("SESSION_MISMATCH");
  if (
    action.status !== "WAITING_IDENTITY" ||
    action.requirement !== "VERIFIED_IDENTITY" ||
    action.task.status !== "WAITING_IDENTITY"
  ) {
    throw new ExecutionError("VERIFICATION_NOT_STARTABLE");
  }

  const scopeHash = identityGrantScopeHash({
    actionId: action.id,
    type: action.type,
    payload: action.payloadJson,
    userId: action.task.userId,
    sessionId: action.task.sessionId,
  });
  const existing = await input.prisma.verificationSession.findFirst({
    where: {
      actionId: action.id,
      userId: action.task.userId,
      sessionId: action.task.sessionId,
      scopeHash,
      status: { in: ["CREATED", "PENDING"] },
      expiresAt: { gt: now },
      personaInquiryId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.personaInquiryId) {
    const inquiry = await input.gateway.retrieveInquiry(existing.personaInquiryId);
    if (inquiry.inquiryId !== existing.personaInquiryId || inquiry.referenceId !== existing.personaReferenceId) {
      throw new ExecutionError("INQUIRY_BINDING_MISMATCH");
    }
    const session = inquiry.status === "pending" ? await input.gateway.resumeInquiry(inquiry.inquiryId) : undefined;
    return {
      verificationId: existing.id,
      status: existing.status,
      verificationUrl: `/verify/${existing.id}`,
      flow: {
        inquiryId: inquiry.inquiryId,
        environmentId: input.env.PERSONA_ENVIRONMENT_ID,
        sessionToken: session?.sessionToken,
      },
      idempotent: true,
    };
  }

  const activeAttempt = await input.prisma.verificationSession.findUnique({ where: { activeKey: scopeHash } });
  if (activeAttempt) {
    if (
      activeAttempt.expiresAt &&
      activeAttempt.expiresAt <= now &&
      (activeAttempt.status === "CREATED" || activeAttempt.status === "PENDING")
    ) {
      const sourceStatus: "CREATED" | "PENDING" = activeAttempt.status;
      await input.prisma.$transaction((tx) =>
        transitionVerification(tx, {
          verificationId: activeAttempt.id,
          from: sourceStatus,
          to: "EXPIRED",
          data: { activeKey: null, failureReasonCode: "VERIFICATION_EXPIRED" },
        }),
      );
    } else {
      throw new ExecutionError("PERSONA_REQUEST_FAILED");
    }
  }

  const verificationId = randomUUID();
  const referenceId = `vref_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
  try {
    await input.prisma.$transaction(async (tx) => {
      await tx.verificationSession.create({
        data: {
          id: verificationId,
          userId: action.task.userId,
          sessionId: action.task.sessionId,
          actionId: action.id,
          personaReferenceId: referenceId,
          scopeHash,
          activeKey: scopeHash,
          status: "CREATED",
          expiresAt,
        },
      });
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actionId: action.id,
        actorType: "PERSONA",
        eventType: "IDENTITY_VERIFICATION_CREATED",
        outcome: "CREATED",
        correlationId: action.task.correlationId,
        metadata: { verificationId },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await input.prisma.verificationSession.findUnique({ where: { activeKey: scopeHash } });
      if (winner?.personaInquiryId) return startVerification(input);
      throw new ExecutionError("PERSONA_REQUEST_FAILED");
    }
    throw error;
  }

  try {
    const inquiry = await input.gateway.createInquiry({
      templateId: input.env.PERSONA_TEMPLATE_ID,
      referenceId,
      idempotencyKey: verificationId,
    });
    if (inquiry.referenceId !== referenceId) throw new ExecutionError("INQUIRY_BINDING_MISMATCH");
    await input.prisma.$transaction(async (tx) => {
      await transitionVerification(tx, {
        verificationId,
        from: "CREATED",
        to: "PENDING",
        data: { personaInquiryId: inquiry.inquiryId, startedAt: now },
      });
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actionId: action.id,
        actorType: "PERSONA",
        eventType: "PERSONA_INQUIRY_CREATED",
        outcome: "PENDING",
        correlationId: action.task.correlationId,
        metadata: { verificationId, inquiryId: inquiry.inquiryId },
      });
    });
    return {
      verificationId,
      status: "PENDING",
      verificationUrl: `/verify/${verificationId}`,
      flow: {
        inquiryId: inquiry.inquiryId,
        environmentId: input.env.PERSONA_ENVIRONMENT_ID,
        sessionToken: inquiry.sessionToken,
      },
      idempotent: false,
    };
  } catch (error) {
    await input.prisma.$transaction(async (tx) => {
      await transitionVerification(tx, {
        verificationId,
        from: "CREATED",
        to: "FAILED",
        data: {
          activeKey: null,
          failureReasonCode: error instanceof ExecutionError ? error.code : "PERSONA_REQUEST_FAILED",
        },
      });
      await appendAuditEvent(tx, {
        taskId: action.taskId,
        actionId: action.id,
        actorType: "PERSONA",
        eventType: "IDENTITY_VERIFICATION_FAILED",
        outcome: "FAILED",
        reasonCode: error instanceof ExecutionError ? error.code : "PERSONA_REQUEST_FAILED",
        correlationId: action.task.correlationId,
        metadata: { verificationId },
      });
    });
    throw error instanceof ExecutionError ? error : new ExecutionError("PERSONA_REQUEST_FAILED", { cause: error });
  }
}

export async function getVerificationSnapshot(
  prisma: PrismaClient,
  verificationId: string,
  context: Pick<ExecutionContext, "userId" | "sessionId">,
) {
  const verification = await prisma.verificationSession.findUnique({
    where: { id: verificationId },
    include: { grant: { select: { status: true } } },
  });
  if (!verification) throw new ExecutionError("VERIFICATION_NOT_FOUND");
  if (verification.userId !== context.userId) throw new ExecutionError("TASK_OWNERSHIP_MISMATCH");
  if (verification.sessionId !== context.sessionId) throw new ExecutionError("SESSION_MISMATCH");
  return {
    id: verification.id,
    status: verification.status,
    actionId: verification.actionId,
    canResume: verification.status === "APPROVED" && verification.grant?.status === "ACTIVE",
    expiresAt: verification.expiresAt,
    failureReasonCode: verification.failureReasonCode,
  };
}
