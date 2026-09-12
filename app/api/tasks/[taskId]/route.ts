import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getTaskSnapshot } from "@/lib/tasks/task-query-service";

export async function GET(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    const auth = getDemoExecutionContext(parseEnv(), "task-query");
    return Response.json(await getTaskSnapshot(db, taskId, auth.userId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
