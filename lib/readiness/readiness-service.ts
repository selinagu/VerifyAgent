import type { PrismaClient } from "@prisma/client";

import { configurationFlags, configurationProfile, type AppEnv } from "@/lib/config/env";
import type { ReadinessSnapshot } from "./readiness-types";
import type { CheckState } from "./readiness-types";

export async function getReadinessSnapshot(input: {
  prisma: Pick<PrismaClient, "$queryRawUnsafe">;
  env: AppEnv;
}): Promise<ReadinessSnapshot> {
  let database: ReadinessSnapshot["checks"]["database"] = "ready";
  try {
    await input.prisma.$queryRawUnsafe("SELECT 1");
  } catch {
    database = "failed";
  }
  const flags = configurationFlags(input.env);
  const plannerConfiguration: CheckState = flags.llmConfigured ? "ready" : input.env.LLM_PROVIDER ? "invalid" : "missing";
  const personaConfiguration: CheckState = flags.personaConfigured ? "ready" : "missing";
  const webhookConfiguration: CheckState = input.env.PERSONA_WEBHOOK_SECRET && input.env.APP_BASE_URL.startsWith("https://")
    ? "ready"
    : "missing";
  const checks = {
    database,
    plannerConfiguration,
    personaConfiguration,
    webhookConfiguration,
    demoMode: input.env.DEMO_MODE ? "enabled" as const : "disabled" as const,
  };
  return {
    status: database === "failed" ? "blocked" : plannerConfiguration === "ready" ? (personaConfiguration === "ready" ? "ready" : "degraded") : "blocked",
    profile: configurationProfile(input.env),
    checks,
  };
}
