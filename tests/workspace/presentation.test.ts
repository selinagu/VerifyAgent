import { describe, expect, it } from "vitest";

import { actionLabel, actionPayloadSummary, requirementLabel } from "@/lib/presentation/action-display";
import { formatMoney } from "@/lib/presentation/money";

describe("workspace presentation", () => {
  it("formats exact cents without floating point drift", () => {
    expect(formatMoney(8_000)).toBe("$80.00");
    expect(formatMoney(null)).toBe("Not priced");
  });

  it("renders allowlisted actions and safely degrades unknown values", () => {
    expect(actionLabel("PUBLISH_LISTING")).toBe("Publish listing publicly");
    expect(actionLabel("UNKNOWN_ACTION")).toBe("Proposed action");
    expect(requirementLabel("UNKNOWN_REQUIREMENT")).toBe("Authorization requirement");
    expect(actionPayloadSummary({ type: "SET_LISTING_PRICE", payload: { priceCents: 8_000, currency: "USD", secret: "hidden" } })).toBe("$80.00 USD");
    expect(actionPayloadSummary({ type: "UNKNOWN_ACTION", payload: { secret: "never dump me" } })).toBe("Server-validated action details");
  });
});
