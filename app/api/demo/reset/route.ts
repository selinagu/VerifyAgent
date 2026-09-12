import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { assertDemoApiEnabled } from "@/lib/demo/demo-api";
import { resetDemoNamespace } from "@/lib/demo/reset-demo";
import { apiErrorResponse } from "@/lib/http/api-response";
import { parseMutationJson } from "@/lib/http/mutation-guard";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function POST(request: Request) {
 return observeApiRequest(request, "/api/demo/reset", async () => {
  try {
    const env = parseEnv();
    await parseMutationJson(request, emptyMutationBodySchema, env);
    assertDemoApiEnabled(env);
    await resetDemoNamespace(db);
    return Response.json({ reset: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
