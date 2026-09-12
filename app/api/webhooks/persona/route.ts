import { parseEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { ExecutionError } from "@/lib/executor/errors";
import { apiErrorResponse } from "@/lib/http/api-response";
import { observeApiRequest } from "@/lib/observability/correlation";
import { parsePersonaEvent } from "@/lib/persona/persona-event-parser";
import { PersonaHttpClient, personaHttpConfigFromEnv } from "@/lib/persona/persona-http-client";
import { verifyPersonaWebhookSignature } from "@/lib/persona/persona-webhook-verifier";
import { processPersonaWebhook } from "@/lib/verification/persona-webhook-service";

export async function POST(request: Request) {
 return observeApiRequest(request, "/api/webhooks/persona", async () => {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
      throw new ExecutionError("REQUEST_TOO_LARGE");
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 256 * 1024) {
      throw new ExecutionError("REQUEST_TOO_LARGE");
    }
    const env = parseEnv();
    verifyPersonaWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("persona-signature"),
      webhookSecret: env.PERSONA_WEBHOOK_SECRET,
    });
    const event = parsePersonaEvent(rawBody);
    const gateway = new PersonaHttpClient(personaHttpConfigFromEnv(env));
    const result = await processPersonaWebhook({ prisma: db, gateway, event });
    return Response.json({ received: true, duplicate: result.duplicate, processed: result.processed });
  } catch (error) {
    return apiErrorResponse(error);
  }
 });
}
