import { z } from "zod";

import type { AppEnv } from "@/lib/config/env";
import { ExecutionError } from "@/lib/executor/errors";

export const DEFAULT_JSON_BODY_LIMIT = 16 * 1024;

export async function parseMutationJson<T extends z.ZodType>(
  request: Request,
  schema: T,
  env: AppEnv,
  bodyLimit = DEFAULT_JSON_BODY_LIMIT,
): Promise<z.output<T>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new ExecutionError("UNSUPPORTED_MEDIA_TYPE");

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > bodyLimit) throw new ExecutionError("REQUEST_TOO_LARGE");

  const origin = request.headers.get("origin");
  if (process.env.NODE_ENV === "production") {
    let sameOrigin = false;
    try {
      sameOrigin = Boolean(origin && new URL(origin).origin === new URL(env.APP_BASE_URL).origin);
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      throw new ExecutionError("REQUEST_ORIGIN_INVALID");
    }
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > bodyLimit) throw new ExecutionError("REQUEST_TOO_LARGE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  return schema.parse(parsed);
}
