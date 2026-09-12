import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { ExecutionError } from "./errors";

const actionReferenceSchema = z.string().regex(/^action:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);

export function parseActionReference(reference: string): string {
  const parsed = actionReferenceSchema.safeParse(reference);
  if (!parsed.success) throw new ExecutionError("INVALID_LISTING_REFERENCE");
  return parsed.data.slice("action:".length);
}

function readListingId(result: Prisma.JsonValue | null): string | null {
  if (!result || Array.isArray(result) || typeof result !== "object") return null;
  const listingId = (result as Record<string, unknown>).listingId;
  return typeof listingId === "string" && listingId.length > 0 ? listingId : null;
}

export async function resolveListingReference(
  tx: Prisma.TransactionClient,
  input: { reference: string; taskId: string; userId: string },
) {
  const referencedActionId = parseActionReference(input.reference);
  const referencedAction = await tx.actionRun.findUnique({ where: { id: referencedActionId } });

  if (
    !referencedAction ||
    referencedAction.taskId !== input.taskId ||
    referencedAction.type !== "CREATE_DRAFT_LISTING" ||
    referencedAction.status !== "SUCCEEDED"
  ) {
    throw new ExecutionError("INVALID_LISTING_REFERENCE");
  }

  const listingId = readListingId(referencedAction.resultJson);
  if (!listingId) throw new ExecutionError("INVALID_LISTING_REFERENCE");

  const listing = await tx.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ExecutionError("LISTING_NOT_FOUND");
  if (listing.ownerId !== input.userId) throw new ExecutionError("LISTING_OWNERSHIP_MISMATCH");

  return listing;
}
