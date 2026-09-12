import type { AppEnv } from "@/lib/config/env";
import { ExecutionError } from "@/lib/executor/errors";

export function assertDemoApiEnabled(env: AppEnv): void {
  if (!env.DEMO_MODE && process.env.NODE_ENV !== "test") {
    throw new ExecutionError("AUTH_CONTEXT_UNAVAILABLE");
  }
}
