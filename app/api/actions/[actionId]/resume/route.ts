import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { ExecutionError } from "@/lib/executor/errors";
import { apiErrorResponse } from "@/lib/http/api-response";
import { parseMutationJson } from "@/lib/http/mutation-guard";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";
import { TaskRunner } from "@/lib/orchestrator/task-runner";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
 return observeApiRequest(request, "/api/actions/:actionId/resume", async () => {
  try {
    const env = parseEnv();
    await parseMutationJson(request, emptyMutationBodySchema, env);
    const { actionId } = await context.params;
    const auth = getDemoExecutionContext(env, randomUUID());
    const action = await db.actionRun.findUnique({ where: { id: actionId }, select: { taskId: true } });
    if (!action) throw new ExecutionError("ACTION_NOT_FOUND");
    return Response.json(await new TaskRunner(db, env).runTask(action.taskId, auth));
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
