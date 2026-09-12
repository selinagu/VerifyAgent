import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { parseMutationJson } from "@/lib/http/mutation-guard";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";
import { TaskRunner } from "@/lib/orchestrator/task-runner";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
 return observeApiRequest(request, "/api/tasks/:taskId/run", async () => {
  try {
    const env = parseEnv();
    await parseMutationJson(request, emptyMutationBodySchema, env);
    const { taskId } = await context.params;
    const auth = getDemoExecutionContext(env, randomUUID());
    return Response.json(await new TaskRunner(db, env).runTask(taskId, auth));
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
