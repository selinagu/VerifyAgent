import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { ZodError } from "zod";

import { hashCanonicalPayload } from "@/lib/actions/schema";
import { appendAuditEvent } from "@/lib/audit/audit-service";
import { ExecutionError } from "@/lib/executor/errors";
import { transitionAction } from "@/lib/state-machine/action-transitions";
import { transitionTask } from "@/lib/state-machine/task-transitions";
import { getTaskSnapshot } from "@/lib/tasks/task-query-service";
import { compilePlan } from "./plan-compiler";
import { validatePlannerSemantics } from "./plan-validator";
import { PLANNER_PROMPT_VERSION } from "./prompt-builder";
import { parsePlannerProposal } from "./proposal-schema";
import type { PlannerGateway } from "./types";

const SUPPORTED_ACTIONS = ["CREATE_DRAFT_LISTING", "SET_LISTING_PRICE", "PUBLISH_LISTING"] as const;

type PlanningContext = { userId: string; sessionId: string };

export class PlanningService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly gateway: PlannerGateway,
  ) {}

  async createTask(input: {
    requestText: string;
    idempotencyKey: string;
    context: PlanningContext;
  }) {
    const requestHash = hashCanonicalPayload({ requestText: input.requestText });
    const scopedKey = hashCanonicalPayload({
      userId: input.context.userId,
      sessionId: input.context.sessionId,
      key: input.idempotencyKey,
    });
    const existing = await this.prisma.taskRun.findUnique({ where: { requestIdempotencyKey: scopedKey } });
    if (existing) return this.replayOrConflict(existing, requestHash, input.context);

    const taskId = randomUUID();
    const correlationId = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskRun.create({
          data: {
            id: taskId,
            userId: input.context.userId,
            sessionId: input.context.sessionId,
            requestText: input.requestText,
            status: "PLANNING",
            correlationId,
            agentProvider: this.gateway.provider,
            agentModel: this.gateway.model,
            promptVersion: PLANNER_PROMPT_VERSION,
            requestIdempotencyKey: scopedKey,
            requestHash,
          },
        });
        await appendAuditEvent(tx, {
          taskId,
          actorType: "AGENT",
          eventType: "TASK_PLANNING_STARTED",
          outcome: "PLANNING",
          correlationId,
          metadata: {
            provider: this.gateway.provider,
            model: this.gateway.model,
            promptVersion: PLANNER_PROMPT_VERSION,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.prisma.taskRun.findUniqueOrThrow({ where: { requestIdempotencyKey: scopedKey } });
        return this.replayOrConflict(winner, requestHash, input.context);
      }
      throw error;
    }

    try {
      const ownedInventory = await this.prisma.inventoryItem.findMany({
        where: { ownerId: input.context.userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, title: true, description: true },
      });
      const raw = await this.gateway.createPlan({
        requestText: input.requestText,
        availableInventory: ownedInventory,
        supportedActions: SUPPORTED_ACTIONS,
        promptVersion: PLANNER_PROMPT_VERSION,
      });
      let proposal;
      try {
        proposal = parsePlannerProposal(raw);
      } catch (error) {
        if (error instanceof ZodError) throw new ExecutionError("PLAN_SCHEMA_INVALID", { cause: error });
        throw error;
      }
      const sourceIds = proposal.kind === "PLAN"
        ? proposal.actions.flatMap((action) => action.type === "CREATE_DRAFT_LISTING" ? [action.payload.sourceItemId] : [])
        : [];
      const referencedInventory = sourceIds.length === 0 ? [] : await this.prisma.inventoryItem.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, ownerId: true },
      });
      const validated = validatePlannerSemantics(proposal, {
        requestText: input.requestText,
        userId: input.context.userId,
        inventory: referencedInventory,
      });
      const actions = compilePlan(validated, taskId);

      await this.prisma.$transaction(async (tx) => {
        for (const action of actions) {
          await tx.actionRun.create({ data: action });
          await appendAuditEvent(tx, {
            taskId,
            actionId: action.id,
            actorType: "AGENT",
            eventType: "ACTION_PROPOSED",
            outcome: "PROPOSED",
            correlationId,
            metadata: { sequence: action.sequence, actionType: action.type },
          });
          await transitionAction(tx, { actionId: action.id, from: "PROPOSED", to: "VALIDATED" });
          await appendAuditEvent(tx, {
            taskId,
            actionId: action.id,
            actorType: "SYSTEM",
            eventType: "ACTION_VALIDATED",
            outcome: "VALIDATED",
            correlationId,
          });
        }
        await transitionTask(tx, { taskId, from: "PLANNING", to: "READY", data: { planningErrorCode: null } });
        await appendAuditEvent(tx, {
          taskId,
          actorType: "AGENT",
          eventType: "TASK_PLAN_READY",
          outcome: "READY",
          correlationId,
          metadata: { actionCount: actions.length },
        });
      });
      return getTaskSnapshot(this.prisma, taskId, input.context.userId);
    } catch (error) {
      const planningError = error instanceof ExecutionError
        ? error
        : new ExecutionError("LLM_REQUEST_FAILED", { cause: error });
      await this.prisma.$transaction(async (tx) => {
        await transitionTask(tx, {
          taskId,
          from: "PLANNING",
          to: "FAILED",
          data: { planningErrorCode: planningError.code },
        });
        await appendAuditEvent(tx, {
          taskId,
          actorType: "AGENT",
          eventType: "TASK_PLANNING_FAILED",
          outcome: "FAILED",
          reasonCode: planningError.code,
          correlationId,
        });
      });
      throw planningError;
    }
  }

  private async replayOrConflict(
    existing: { id: string; userId: string; sessionId: string; requestHash: string | null },
    requestHash: string,
    context: PlanningContext,
  ) {
    if (
      existing.userId !== context.userId ||
      existing.sessionId !== context.sessionId ||
      existing.requestHash !== requestHash
    ) {
      throw new ExecutionError("PLANNING_IDEMPOTENCY_CONFLICT");
    }
    return getTaskSnapshot(this.prisma, existing.id, context.userId);
  }
}
