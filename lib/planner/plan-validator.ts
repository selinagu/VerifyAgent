import { ExecutionError } from "@/lib/executor/errors";
import type { PlannerProposal, PlannerAction } from "./proposal-schema";
import type { ValidatedPlannerPlan } from "./types";

type InventoryRecord = { id: string; ownerId: string };

function referencedKey(reference: string): string {
  return reference.slice("result:".length);
}

function requestedPriceCents(requestText: string): number | undefined {
  const dollars = requestText.match(/\$\s*(\d+(?:\.\d{1,2})?)/)?.[1] ?? requestText.match(/\b(\d+(?:\.\d{1,2})?)\s+dollars?\b/i)?.[1];
  if (!dollars) return undefined;
  return Math.round(Number(dollars) * 100);
}

export function validatePlannerSemantics(
  proposal: PlannerProposal,
  context: { requestText: string; userId: string; inventory: InventoryRecord[] },
): ValidatedPlannerPlan {
  if (proposal.kind === "UNSUPPORTED") throw new ExecutionError("PLAN_UNSUPPORTED_REQUEST");
  if (!/\b(sell|list|post|publish)\b/i.test(context.requestText)) {
    throw new ExecutionError("PLAN_UNSUPPORTED_REQUEST");
  }

  const positions = new Map<string, number>();
  for (const [index, action] of proposal.actions.entries()) {
    if (positions.has(action.key)) throw new ExecutionError("PLAN_SEMANTIC_INVALID");
    positions.set(action.key, index);
  }

  const actionByKey = new Map<string, PlannerAction>();
  for (const [index, action] of proposal.actions.entries()) {
    for (const dependency of action.dependsOn) {
      const position = positions.get(dependency);
      if (position === undefined || position >= index) throw new ExecutionError("PLAN_DEPENDENCY_INVALID");
    }
    actionByKey.set(action.key, action);
  }

  const drafts = proposal.actions.filter((action) => action.type === "CREATE_DRAFT_LISTING");
  const prices = proposal.actions.filter((action) => action.type === "SET_LISTING_PRICE");
  const publishes = proposal.actions.filter((action) => action.type === "PUBLISH_LISTING");
  if (drafts.length !== 1 || prices.length !== 1 || publishes.length !== 1) {
    throw new ExecutionError("PLAN_SEMANTIC_INVALID");
  }

  const draft = drafts[0];
  const inventory = context.inventory.find((item) => item.id === draft.payload.sourceItemId);
  if (!inventory) throw new ExecutionError("PLAN_RESOURCE_NOT_FOUND");
  if (inventory.ownerId !== context.userId) throw new ExecutionError("PLAN_RESOURCE_OWNERSHIP_MISMATCH");

  const price = prices[0];
  const priceDraftKey = referencedKey(price.payload.listingRef);
  if (actionByKey.get(priceDraftKey)?.type !== "CREATE_DRAFT_LISTING") {
    throw new ExecutionError("PLAN_REFERENCE_INVALID");
  }
  if (!price.dependsOn.includes(priceDraftKey)) throw new ExecutionError("PLAN_DEPENDENCY_INVALID");

  const publish = publishes[0];
  const publishDraftKey = referencedKey(publish.payload.listingRef);
  if (publishDraftKey !== priceDraftKey || actionByKey.get(publishDraftKey)?.type !== "CREATE_DRAFT_LISTING") {
    throw new ExecutionError("PLAN_REFERENCE_INVALID");
  }
  if (!publish.dependsOn.includes(price.key)) throw new ExecutionError("PLAN_DEPENDENCY_INVALID");

  const requested = requestedPriceCents(context.requestText);
  if (!requested) throw new ExecutionError("PLAN_UNSUPPORTED_REQUEST");
  if (price.payload.priceCents !== requested) throw new ExecutionError("PLAN_PRICE_MISMATCH");
  return proposal;
}
