import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getTaskSnapshot } from "@/lib/tasks/task-query-service";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
 return observeApiRequest(request, "/api/tasks/:taskId", async () => {
  try {
    const { taskId } = await context.params;
    const auth = getDemoExecutionContext(parseEnv(), "task-query");
    return Response.json(await getTaskSnapshot(db, taskId, auth.userId));
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
