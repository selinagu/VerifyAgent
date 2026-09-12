import type { AppEnv } from "@/lib/config/env";
import { FakePlannerGateway } from "@/lib/demo/fake-planner-gateway";
import { ExecutionError } from "@/lib/executor/errors";
import { OpenAIPlannerGateway } from "./providers/openai-planner";
import type { PlannerGateway } from "./types";

export function createPlannerGateway(env: AppEnv): PlannerGateway {
  if (env.LLM_PROVIDER === "fake") return new FakePlannerGateway();
  if (env.LLM_PROVIDER === "openai" && env.LLM_API_KEY && env.LLM_MODEL) {
    return new OpenAIPlannerGateway(env.LLM_API_KEY, env.LLM_MODEL);
  }
  throw new ExecutionError("LLM_NOT_CONFIGURED");
}
