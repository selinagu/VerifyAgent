import type { Listing } from "@prisma/client";

import { ExecutionError } from "@/lib/executor/errors";

export function assertDraftListing(listing: Listing): void {
  if (listing.status !== "DRAFT") throw new ExecutionError("INVALID_LISTING_STATE");
}

export function assertListingCanPublish(listing: Listing): void {
  assertDraftListing(listing);
  if (!listing.title.trim() || !listing.description.trim()) {
    throw new ExecutionError("INVALID_LISTING_STATE");
  }
  if (!listing.priceCents || listing.priceCents <= 0) {
    throw new ExecutionError("LISTING_PRICE_REQUIRED");
  }
}
