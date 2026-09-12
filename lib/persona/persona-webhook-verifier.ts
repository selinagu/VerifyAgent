import { createHmac, timingSafeEqual } from "node:crypto";

import { ExecutionError } from "@/lib/executor/errors";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function verifyPersonaWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string | undefined;
  now?: Date;
  toleranceSeconds?: number;
}): void {
  if (!input.webhookSecret) throw new ExecutionError("PERSONA_NOT_CONFIGURED");
  if (!input.signatureHeader) throw new ExecutionError("PERSONA_WEBHOOK_SIGNATURE_MISSING");

  const groups = input.signatureHeader.trim().split(/\s+/);
  const timestamp = groups[0]?.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];
  const signatures = groups.flatMap((group) => {
    const signature = group.match(/(?:^|,)v1=([a-fA-F0-9]{64})(?:,|$)/)?.[1];
    return signature ? [signature.toLowerCase()] : [];
  });
  if (!timestamp || signatures.length === 0) {
    throw new ExecutionError("PERSONA_WEBHOOK_SIGNATURE_INVALID");
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)
  ) {
    throw new ExecutionError("PERSONA_WEBHOOK_SIGNATURE_INVALID");
  }

  const expected = createHmac("sha256", input.webhookSecret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");
  const valid = signatures.some((signature) =>
    timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")),
  );
  if (!valid) throw new ExecutionError("PERSONA_WEBHOOK_SIGNATURE_INVALID");
}
