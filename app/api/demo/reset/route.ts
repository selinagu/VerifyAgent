import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { assertDemoApiEnabled } from "@/lib/demo/demo-api";
import { resetDemoNamespace } from "@/lib/demo/reset-demo";
import { apiErrorResponse } from "@/lib/http/api-response";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";

export async function POST(request: Request) {
  try {
    emptyMutationBodySchema.parse(await request.json());
    assertDemoApiEnabled(parseEnv());
    await resetDemoNamespace(db);
    return Response.json({ reset: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
