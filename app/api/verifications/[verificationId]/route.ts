import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { getVerificationSnapshot } from "@/lib/verification/verification-service";
import { observeApiRequest } from "@/lib/observability/correlation";

export async function GET(request: Request, context: { params: Promise<{ verificationId: string }> }) {
 return observeApiRequest(request, "/api/verifications/:verificationId", async () => {
  try {
    const { verificationId } = await context.params;
    const auth = getDemoExecutionContext(parseEnv(), randomUUID());
    return Response.json(await getVerificationSnapshot(db, verificationId, auth));
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
