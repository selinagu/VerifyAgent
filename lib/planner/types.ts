import type { PlannerProposal } from "./proposal-schema";

export type PlannerInventoryItem = {
  id: string;
  type: string;
  title: string;
  description: string;
};

export type PlannerInput = {
  requestText: string;
  availableInventory: PlannerInventoryItem[];
  supportedActions: readonly string[];
  promptVersion: string;
};

export interface PlannerGateway {
  readonly provider: string;
  readonly model: string;
  createPlan(input: PlannerInput): Promise<unknown>;
}

export type ValidatedPlannerPlan = Extract<PlannerProposal, { kind: "PLAN" }>;
