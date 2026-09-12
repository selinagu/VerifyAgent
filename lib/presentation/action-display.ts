import type { TaskActionSnapshot } from "@/lib/client/contracts";
import { formatMoney } from "./money";

const LABELS: Record<string, string> = {
  CREATE_DRAFT_LISTING: "Create private draft",
  SET_LISTING_PRICE: "Set listing price",
  PUBLISH_LISTING: "Publish listing publicly",
};

const REQUIREMENTS: Record<string, string> = {
  NONE: "No approval needed",
  CONFIRM: "Human confirmation required",
  VERIFIED_IDENTITY: "Verified identity required",
};

export function actionLabel(type: string): string {
  return LABELS[type] ?? "Proposed action";
}

export function requirementLabel(requirement: string | null): string {
  return requirement ? REQUIREMENTS[requirement] ?? "Authorization requirement" : "Not evaluated yet";
}

export function actionPayloadSummary(action: Pick<TaskActionSnapshot, "type" | "payload">): string {
  if (!action.payload || typeof action.payload !== "object") return "Details unavailable";
  const payload = action.payload as Record<string, unknown>;
  if (action.type === "CREATE_DRAFT_LISTING" && typeof payload.title === "string") return payload.title;
  if (action.type === "SET_LISTING_PRICE" && typeof payload.priceCents === "number") {
    return `${formatMoney(payload.priceCents, typeof payload.currency === "string" ? payload.currency : "USD")} USD`;
  }
  if (action.type === "PUBLISH_LISTING") return "Make the prepared listing visible to buyers";
  return "Server-validated action details";
}
