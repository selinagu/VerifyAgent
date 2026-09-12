import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";
import { TaskRunner } from "@/lib/orchestrator/task-runner";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    emptyMutationBodySchema.parse(await request.json());
    const { taskId } = await context.params;
    const env = parseEnv();
    const auth = getDemoExecutionContext(env, randomUUID());
    return Response.json(await new TaskRunner(db, env).runTask(taskId, auth));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
