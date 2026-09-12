import type { Prisma, PrismaClient } from "@prisma/client";

import type { CandidateAction } from "@/lib/actions/schema";
import { parseActionReference, resolveListingReference } from "@/lib/executor/action-reference";
import type { ExecutionContext } from "@/lib/executor/types";
import type { PolicyContext } from "./types";

type ContextAction = {
  id: string;
  taskId: string;
  sequence: number;
  task: { userId: string; sessionId: string };
};

async function dependenciesSatisfied(
  tx: Prisma.TransactionClient,
  action: ContextAction,
  dependencies: string[],
): Promise<boolean> {
  for (const reference of dependencies) {
    let id: string;
    try {
      id = parseActionReference(reference);
    } catch {
      return false;
    }
    const dependency = await tx.actionRun.findUnique({ where: { id } });
    if (
      !dependency ||
      dependency.taskId !== action.taskId ||
      dependency.sequence >= action.sequence ||
      dependency.status !== "SUCCEEDED"
    ) {
      return false;
    }
  }
  return true;
}

export async function buildPolicyContext(
  prisma: PrismaClient,
  persisted: ContextAction,
  action: CandidateAction,
  executionContext: ExecutionContext,
  environment: PolicyContext["environment"],
): Promise<PolicyContext> {
  return prisma.$transaction(async (tx) => {
    const dependenciesOk = await dependenciesSatisfied(tx, persisted, action.dependsOn);
    const base = {
      userId: executionContext.userId,
      sessionId: executionContext.sessionId,
      taskId: persisted.taskId,
      dependenciesSatisfied: dependenciesOk,
      environment,
    } as const;

    if (action.type === "CREATE_DRAFT_LISTING") {
      const item = await tx.inventoryItem.findUnique({ where: { id: action.payload.sourceItemId } });
      return {
        ...base,
        resourceExists: Boolean(item),
        resourceOwnerId: item?.ownerId,
      };
    }

    try {
      const listing = await resolveListingReference(tx, {
        reference: action.payload.listingRef,
        taskId: persisted.taskId,
        userId: executionContext.userId,
      });
      return {
        ...base,
        resourceExists: true,
        resourceOwnerId: listing.ownerId,
        listingStatus: listing.status as PolicyContext["listingStatus"],
      };
    } catch {
      return { ...base, resourceExists: false };
    }
  });
}
