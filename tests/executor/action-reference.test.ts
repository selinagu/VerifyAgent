import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseActionReference } from "@/lib/executor/action-reference";
import { ExecutionError } from "@/lib/executor/errors";

describe("action reference parser", () => {
  it("extracts a valid action UUID", () => {
    const id = randomUUID();
    expect(parseActionReference(`action:${id}`)).toBe(id);
  });

  it.each(["listing:123", "action:", "action:not-a-uuid", " action:123 "])(
    "rejects malformed reference %s",
    (reference) => {
      expect(() => parseActionReference(reference)).toThrowError(ExecutionError);
    },
  );
});
