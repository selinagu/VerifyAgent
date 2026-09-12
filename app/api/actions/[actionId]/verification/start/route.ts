import { randomUUID } from "node:crypto";

import { getDemoExecutionContext } from "@/lib/auth/demo-context";
import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/http/api-response";
import { emptyMutationBodySchema } from "@/lib/http/request-contracts";
import { PersonaHttpClient, personaHttpConfigFromEnv } from "@/lib/persona/persona-http-client";
import { startVerification } from "@/lib/verification/verification-service";

export async function POST(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    emptyMutationBodySchema.parse(await request.json());
    const { actionId } = await context.params;
    const env = parseEnv();
    const auth = getDemoExecutionContext(env, randomUUID());
    const gateway = new PersonaHttpClient(personaHttpConfigFromEnv(env));
    return Response.json(await startVerification({ prisma: db, gateway, env, actionId, context: auth }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
