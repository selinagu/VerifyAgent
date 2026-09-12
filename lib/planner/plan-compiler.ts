import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { candidateActionSchema, hashCanonicalPayload } from "@/lib/actions/schema";
import { ExecutionError } from "@/lib/executor/errors";
import type { ValidatedPlannerPlan } from "./types";

export type CompiledAction = {
  id: string;
  taskId: string;
  sequence: number;
  type: string;
  payloadJson: Prisma.InputJsonValue;
  dependsOnJson: Prisma.InputJsonValue;
  rationale: string;
  status: "PROPOSED";
  idempotencyKey: string;
};

export function compilePlan(
  plan: ValidatedPlannerPlan,
  taskId: string,
  idFactory: () => string = randomUUID,
): CompiledAction[] {
  const ids = new Map(plan.actions.map((action) => [action.key, idFactory()]));
  return plan.actions.map((proposed, sequence) => {
    const id = ids.get(proposed.key)!;
    const dependencies = proposed.dependsOn.map((key) => {
      const dependencyId = ids.get(key);
      if (!dependencyId) throw new ExecutionError("PLAN_DEPENDENCY_INVALID");
      return `action:${dependencyId}`;
    });
    let payload: Prisma.InputJsonObject;
    if (proposed.type === "CREATE_DRAFT_LISTING") {
      payload = proposed.payload;
    } else {
      const referencedId = ids.get(proposed.payload.listingRef.slice("result:".length));
      if (!referencedId) throw new ExecutionError("PLAN_REFERENCE_INVALID");
      payload = { ...proposed.payload, listingRef: `action:${referencedId}` };
    }
    const parsed = candidateActionSchema.safeParse({
      type: proposed.type,
      payload,
      rationale: proposed.rationale,
      dependsOn: dependencies,
    });
    if (!parsed.success) {
      throw new ExecutionError("PLAN_REFERENCE_INVALID", { cause: parsed.error });
    }
    return {
      id,
      taskId,
      sequence,
      type: parsed.data.type,
      payloadJson: parsed.data.payload,
      dependsOnJson: parsed.data.dependsOn,
      rationale: parsed.data.rationale,
      status: "PROPOSED",
      idempotencyKey: `plan:${hashCanonicalPayload({ taskId, sequence, id })}`,
    };
  });
}
