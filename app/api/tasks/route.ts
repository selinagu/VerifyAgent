import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { planningIdempotencyKeySchema, taskCreationRequestSchema } from "@/lib/http/request-contracts";
import { createPlannerGateway } from "@/lib/planner/planner-factory";
import { PlanningService } from "@/lib/planner/planning-service";

export async function POST(request: Request) {
  try {
    const body = taskCreationRequestSchema.parse(await request.json());
    const idempotencyKey = planningIdempotencyKeySchema.parse(request.headers.get("idempotency-key"));
    const env = parseEnv();
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
}
