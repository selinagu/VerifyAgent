import type { Prisma } from "@prisma/client";

import { hashCanonicalPayload } from "@/lib/actions/schema";

export function confirmationPayloadHash(input: {
  actionId: string;
  type: string;
  payload: Prisma.JsonValue;
  userId: string;
  sessionId: string;
}): string {
  return hashCanonicalPayload(input);
}

export const identityGrantScopeHash = confirmationPayloadHash;
