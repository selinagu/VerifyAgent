import { afterEach, describe, expect, it, vi } from "vitest";

import { envSchema } from "@/lib/config/env";
import { getReadinessSnapshot } from "@/lib/readiness/readiness-service";

const database = { $queryRawUnsafe: async () => [{ result: 1 }] } as never;

describe("readiness snapshot", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports a configured real sandbox without exposing secrets", async () => {
    const env = envSchema.parse({
      DATABASE_URL: "file:./private.db",
      APP_BASE_URL: "https://verifyagent.test",
      DEMO_MODE: "true",
      DEMO_PROFILE: "real-sandbox",
      LLM_PROVIDER: "openai",
      LLM_API_KEY: "llm-secret",
      LLM_MODEL: "gpt-example",
      PERSONA_API_KEY: "persona-secret",
      PERSONA_WEBHOOK_SECRET: "webhook-secret",
      PERSONA_ENVIRONMENT_ID: "env_secret",
      PERSONA_TEMPLATE_ID: "itmpl_secret",
    });
    const snapshot = await getReadinessSnapshot({ prisma: database, env });
    expect(snapshot.status).toBe("ready");
    expect(snapshot.profile).toBe("real-sandbox");
    expect(Object.values(snapshot.checks)).toEqual(["ready", "ready", "ready", "ready", "enabled"]);
    expect(JSON.stringify(snapshot)).not.toMatch(/llm-secret|persona-secret|webhook-secret|private\.db/);
  });

  it("degrades the offline demo honestly when Persona is absent", async () => {
    const env = envSchema.parse({ DEMO_MODE: "true", LLM_PROVIDER: "fake" });
    const snapshot = await getReadinessSnapshot({ prisma: database, env });
    expect(snapshot).toMatchObject({ status: "degraded", profile: "offline-success" });
    expect(snapshot.checks.personaConfiguration).toBe("missing");
  });

  it("blocks readiness for database or planner failures", async () => {
    const env = envSchema.parse({ DEMO_MODE: "false" });
    const missingPlanner = await getReadinessSnapshot({ prisma: database, env });
    expect(missingPlanner.status).toBe("blocked");
    const failedDatabase = await getReadinessSnapshot({
      prisma: { $queryRawUnsafe: async () => { throw new Error("private database failure"); } } as never,
      env: envSchema.parse({ DEMO_MODE: "true", LLM_PROVIDER: "fake" }),
    });
    expect(failedDatabase.status).toBe("blocked");
    expect(failedDatabase.checks.database).toBe("failed");
  });

  it("rejects the fake planner outside demo/test operation", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => envSchema.parse({ DEMO_MODE: "false", LLM_PROVIDER: "fake" })).toThrow("demo/test only");
  });
});
