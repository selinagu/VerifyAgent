import { describe, expect, it } from "vitest";

import { envSchema } from "@/lib/config/env";
import { getHealthSnapshot } from "@/lib/health/health-service";

describe("health snapshot", () => {
  it("reports configuration without exposing secrets", async () => {
    const env = envSchema.parse({
      DATABASE_URL: "file:./secret.db",
      DEMO_MODE: "true",
      LLM_PROVIDER: "openai",
      LLM_API_KEY: "llm-secret",
      LLM_MODEL: "example-model",
      PERSONA_API_KEY: "persona-secret",
      PERSONA_WEBHOOK_SECRET: "persona-webhook-secret",
      PERSONA_ENVIRONMENT_ID: "env_example",
      PERSONA_TEMPLATE_ID: "itmpl_example",
    });
    const health = await getHealthSnapshot({
      prisma: { $queryRawUnsafe: async () => [{ result: 1 }] } as never,
      env,
    });
    const serialized = JSON.stringify(health);

    expect(health).toEqual({
      status: "ok",
      database: "connected",
      demoMode: true,
      llmConfigured: true,
      personaConfigured: true,
    });
    expect(serialized).not.toContain("llm-secret");
    expect(serialized).not.toContain("persona-secret");
    expect(serialized).not.toContain("secret.db");
  });

  it("degrades cleanly when the database is unavailable", async () => {
    const env = envSchema.parse({ DATABASE_URL: "file:./test.db", DEMO_MODE: "false" });
    const health = await getHealthSnapshot({
      prisma: {
        $queryRawUnsafe: async () => {
          throw new Error("database error");
        },
      } as never,
      env,
    });

    expect(health.status).toBe("degraded");
    expect(health.database).toBe("unavailable");
  });
});
