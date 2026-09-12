import type { CandidateAction } from "@/lib/actions/schema";
import { setDraftListingPrice } from "@/lib/marketplace/listing-service";
import { resolveListingReference } from "../action-reference";
import type { HandlerInput, HandlerResult } from "./types";

type SetPriceAction = Extract<CandidateAction, { type: "SET_LISTING_PRICE" }>;

export async function handleSetListingPrice(
  input: HandlerInput<SetPriceAction>,
): Promise<HandlerResult> {
  const listing = await resolveListingReference(input.tx, {
    reference: input.action.payload.listingRef,
    taskId: input.taskId,
    userId: input.context.userId,
  });
  const updated = await setDraftListingPrice(input.tx, {
    listing,
    userId: input.context.userId,
    priceCents: input.action.payload.priceCents,
    currency: input.action.payload.currency,
    expectedVersion: listing.version,
  });

  return {
    result: {
      listingId: updated.id,
      priceCents: updated.priceCents ?? 0,
      currency: updated.currency,
      status: updated.status,
      version: updated.version,
    },
    eventType: "LISTING_PRICE_SET",
    metadata: {
      listingId: updated.id,
      priceCents: updated.priceCents ?? 0,
      currency: updated.currency,
      version: updated.version,
    },
  };
}
