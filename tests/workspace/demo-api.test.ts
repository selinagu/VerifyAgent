import { afterEach, describe, expect, it, vi } from "vitest";

import { parseEnv } from "@/lib/config/env";
import { assertDemoApiEnabled } from "@/lib/demo/demo-api";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";

describe("demo API boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects reset outside demo/test and accepts no caller-selected namespace", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertDemoApiEnabled(parseEnv({ ...process.env, DEMO_MODE: "false" }))).toThrowError(expect.objectContaining({ code: "AUTH_CONTEXT_UNAVAILABLE" }));
    expect(emptyMutationBodySchema.safeParse({ userId: "another-user" }).success).toBe(false);
    expect(emptyMutationBodySchema.safeParse({ namespace: "all" }).success).toBe(false);
  });
});
