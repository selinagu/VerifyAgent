import type { PrismaClient } from "@prisma/client";

import { configurationFlags, parseEnv, type AppEnv } from "@/lib/config/env";
import { db } from "@/lib/db";

export type HealthSnapshot = {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
  demoMode: boolean;
  llmConfigured: boolean;
  personaConfigured: boolean;
};

export async function getHealthSnapshot(
  dependencies: { prisma: Pick<PrismaClient, "$queryRawUnsafe">; env: AppEnv } = {
    prisma: db,
    env: parseEnv(),
  },
): Promise<HealthSnapshot> {
  let database: HealthSnapshot["database"] = "connected";

  try {
    await dependencies.prisma.$queryRawUnsafe("SELECT 1");
  } catch {
    database = "unavailable";
  }

  const flags = configurationFlags(dependencies.env);
  return {
    status: database === "connected" ? "ok" : "degraded",
    database,
    demoMode: dependencies.env.DEMO_MODE,
    ...flags,
  };
}
