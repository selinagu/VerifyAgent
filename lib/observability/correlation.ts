import { randomUUID } from "node:crypto";

import { apiErrorResponse } from "@/lib/http/api-response";
import { logStructured } from "./logger";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

export function requestIdFor(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

export async function observeApiRequest(
  request: Request,
  route: string,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const started = performance.now();
  const requestId = requestIdFor(request);
  let response: Response;
  try {
    response = await handler(requestId);
  } catch (error) {
    response = apiErrorResponse(error);
  }
  response.headers.set("X-Request-ID", requestId);
  logStructured({
    kind: "api_request",
    requestId,
    route,
    method: request.method,
    outcome: response.ok ? "success" : "failure",
    status: response.status,
    durationMs: Math.round(performance.now() - started),
  });
  return response;
}
