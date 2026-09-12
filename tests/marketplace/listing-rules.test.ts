import type { Listing } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ExecutionError } from "@/lib/executor/errors";
import { assertDraftListing, assertListingCanPublish } from "@/lib/marketplace/listing-rules";

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing",
    ownerId: "user",
    sourceItemId: "item",
    taskId: "task",
    title: "Ticket",
    description: "A ticket",
    priceCents: 8_000,
    currency: "USD",
    status: "DRAFT",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("listing rules", () => {
  it("allows a draft listing to be priced and published", () => {
    expect(() => assertDraftListing(listing())).not.toThrow();
    expect(() => assertListingCanPublish(listing())).not.toThrow();
  });

  it.each(["PUBLISHED", "SOLD", "DELETED"])("rejects %s listings for draft mutations", (status) => {
    expect(() => assertDraftListing(listing({ status }))).toThrowError(ExecutionError);
  });

  it("rejects publishing without a positive price", () => {
    expect(() => assertListingCanPublish(listing({ priceCents: null }))).toThrowError(
      expect.objectContaining({ code: "LISTING_PRICE_REQUIRED" }),
    );
  });
});
