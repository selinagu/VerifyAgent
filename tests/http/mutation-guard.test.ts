import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { envSchema } from "@/lib/config/env";
import { ExecutionError, type ExecutionErrorCode } from "@/lib/executor/errors";
import { parseMutationJson } from "@/lib/http/mutation-guard";

const schema = z.object({ actionId: z.string() }).strict();
const env = envSchema.parse({ APP_BASE_URL: "https://verifyagent.test", DEMO_MODE: "true" });

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://verifyagent.test/api/actions/run", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function expectCode(promise: Promise<unknown>, code: ExecutionErrorCode) {
  await expect(promise).rejects.toMatchObject({ code } satisfies Partial<ExecutionError>);
}

describe("mutation request guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts strict JSON without Origin in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(parseMutationJson(request('{"actionId":"act_1"}'), schema, env)).resolves.toEqual({ actionId: "act_1" });
  });

  it("requires an exact same-origin request in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(parseMutationJson(request('{"actionId":"act_1"}', { origin: "https://verifyagent.test" }), schema, env)).resolves.toEqual({ actionId: "act_1" });
    await expectCode(parseMutationJson(request("{}"), schema, env), "REQUEST_ORIGIN_INVALID");
    await expectCode(parseMutationJson(request("{}", { origin: "https://evil.example" }), schema, env), "REQUEST_ORIGIN_INVALID");
    await expectCode(parseMutationJson(request("{}", { origin: "not a valid origin" }), schema, env), "REQUEST_ORIGIN_INVALID");
  });

  it("rejects unsupported media types and oversized bodies", async () => {
    await expectCode(parseMutationJson(request("{}", { "content-type": "text/plain" }), schema, env), "UNSUPPORTED_MEDIA_TYPE");
    await expectCode(parseMutationJson(request("{}", { "content-length": "20000" }), schema, env), "REQUEST_TOO_LARGE");
    await expectCode(parseMutationJson(request(JSON.stringify({ actionId: "x".repeat(20_000) })), schema, env), "REQUEST_TOO_LARGE");
  });

  it("rejects injected fields through strict schemas", async () => {
    await expect(parseMutationJson(request('{"actionId":"act_1","isAdmin":true}'), schema, env)).rejects.toBeInstanceOf(z.ZodError);
  });
});
