import { describe, expect, it } from "vitest";

import { requestAttempt, viewStateForTask } from "@/lib/client/task-controller";

describe("workspace controller", () => {
  it("maps durable server states to non-authoritative UI states", () => {
    expect(viewStateForTask()).toBe("IDLE");
    expect(viewStateForTask({ status: "READY" })).toBe("TASK_READY");
    expect(viewStateForTask({ status: "WAITING_CONFIRMATION" })).toBe("AWAITING_CONFIRMATION");
    expect(viewStateForTask({ status: "WAITING_IDENTITY" })).toBe("AWAITING_IDENTITY");
    expect(viewStateForTask({ status: "COMPLETED" })).toBe("COMPLETED");
    expect(viewStateForTask({ status: "UNRECOGNIZED" })).toBe("FAILED");
  });

  it("reuses an idempotency key only for the same normalized request", () => {
    let next = 0;
    const ids = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;
    const first = requestAttempt(" Sell my ticket for $80. ", undefined, ids);
    expect(requestAttempt("Sell my ticket for $80.", first, ids)).toBe(first);
    expect(requestAttempt("Sell my ticket for $90.", first, ids).idempotencyKey).not.toBe(first.idempotencyKey);
  });
});
