import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { resetDemoNamespace } from "@/lib/demo/reset-demo";
import { createPhase2Fixture } from "@/lib/demo/phase2-fixture";
import { assertActionTransition, transitionAction } from "@/lib/state-machine/action-transitions";
import { assertTaskTransition } from "@/lib/state-machine/task-transitions";
import { InvalidStateTransitionError } from "@/lib/state-machine/transition-error";
import { createMigratedTestDatabase } from "@/tests/helpers/test-database";

const database = createMigratedTestDatabase(`phase2-transitions-${randomUUID()}`);
afterEach(async () => resetDemoNamespace(database.prisma));
afterAll(async () => database.cleanup());

describe("state transitions", () => {
  it("accepts legal transitions and rejects illegal ones", () => {
    expect(() => assertActionTransition("VALIDATED", "POLICY_EVALUATED")).not.toThrow();
    expect(() => assertTaskTransition("RUNNING", "WAITING_IDENTITY")).not.toThrow();
    expect(() => assertActionTransition("VALIDATED", "SUCCEEDED")).toThrow(InvalidStateTransitionError);
    expect(() => assertTaskTransition("COMPLETED", "RUNNING")).toThrow(InvalidStateTransitionError);
  });

  it("rejects a stale compare-and-swap transition", async () => {
    await resetDemoNamespace(database.prisma);
    const fixture = await createPhase2Fixture(database.prisma);
    await database.prisma.$transaction((tx) =>
      transitionAction(tx, { actionId: fixture.createId, from: "VALIDATED", to: "POLICY_EVALUATED" }),
    );
    await expect(
      database.prisma.$transaction((tx) =>
        transitionAction(tx, { actionId: fixture.createId, from: "VALIDATED", to: "POLICY_EVALUATED" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});
