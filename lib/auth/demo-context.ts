import type { AppEnv } from "@/lib/config/env";
import { DEMO_IDS } from "@/lib/demo/fixtures";
import { ExecutionError } from "@/lib/executor/errors";

export function getDemoExecutionContext(env: AppEnv, correlationId: string) {
  if (!env.DEMO_MODE && process.env.NODE_ENV !== "test") {
    throw new ExecutionError("AUTH_CONTEXT_UNAVAILABLE");
  }
  return {
    userId: DEMO_IDS.userId,
    sessionId: DEMO_IDS.sessionId,
    correlationId,
  };
}
