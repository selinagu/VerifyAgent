import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { confirmAction } from "@/lib/authorization/confirmation-service";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { parseMutationJson } from "@/lib/http/mutation-guard";
import { confirmationRequestSchema } from "@/lib/http/request-contracts";
import { getTaskSnapshot } from "@/lib/tasks/task-query-service";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
 return observeApiRequest(request, "/api/actions/:actionId/confirm", async () => {
  try {
    const env = parseEnv();
    const body = await parseMutationJson(request, confirmationRequestSchema, env);
    const { actionId } = await context.params;
    const auth = getDemoExecutionContext(env, randomUUID());
    const result = await confirmAction(db, { actionId, ...auth, ...body });
    return Response.json({
      confirmation: { decision: result.decision, idempotent: result.idempotent },
      task: await getTaskSnapshot(db, result.taskId, auth.userId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
