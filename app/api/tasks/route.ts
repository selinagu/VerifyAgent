import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { parseMutationJson } from "@/lib/http/mutation-guard";
import { planningIdempotencyKeySchema, taskCreationRequestSchema } from "@/lib/http/request-contracts";
import { createPlannerGateway } from "@/lib/planner/planner-factory";
import { PlanningService } from "@/lib/planner/planning-service";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function POST(request: Request) {
  return observeApiRequest(request, "/api/tasks", async () => {
   try {
    const env = parseEnv();
    const body = await parseMutationJson(request, taskCreationRequestSchema, env);
    const idempotencyKey = planningIdempotencyKeySchema.parse(request.headers.get("idempotency-key"));
    const context = getDemoExecutionContext(env, randomUUID());
    const task = await new PlanningService(db, createPlannerGateway(env)).createTask({
      requestText: body.requestText,
      idempotencyKey,
      context,
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
  });
}
