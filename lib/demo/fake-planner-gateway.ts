import { ExecutionError } from "@/lib/executor/errors";
import type { PlannerGateway, PlannerInput } from "@/lib/planner/types";

export class FakePlannerGateway implements PlannerGateway {
  readonly provider = "fake";
  readonly model = "deterministic-demo-v1";

  constructor(private readonly override?: unknown) {
    if (process.env.NODE_ENV !== "test" && process.env.DEMO_MODE !== "true") {
      throw new ExecutionError("LLM_NOT_CONFIGURED");
    }
  }

  async createPlan(input: PlannerInput): Promise<unknown> {
    if (this.override !== undefined) return this.override;
    const item = input.availableInventory[0];
    if (!item) return { kind: "UNSUPPORTED", summary: "No owned inventory item is available.", actions: [] };
    return {
      kind: "PLAN",
      summary: "Create, price, and publish the requested ticket listing.",
      actions: [
        {
          key: "draft",
          type: "CREATE_DRAFT_LISTING",
          payload: { title: "Rice Stadium Concert Ticket", description: item.description, sourceItemId: item.id },
          rationale: "Prepare a private draft from the owned inventory item.",
          dependsOn: [],
        },
        {
          key: "price",
          type: "SET_LISTING_PRICE",
          payload: { listingRef: "result:draft", priceCents: 8_000, currency: "USD" },
          rationale: "Apply the explicitly requested price.",
          dependsOn: ["draft"],
        },
        {
          key: "publish",
          type: "PUBLISH_LISTING",
          payload: { listingRef: "result:draft" },
          rationale: "Publish only after authorization policy approval.",
          dependsOn: ["price"],
        },
      ],
    };
  }
}
