import type { CandidateAction } from "@/lib/actions/schema";
import { publishDraftListing } from "@/lib/marketplace/listing-service";
import { resolveListingReference } from "../action-reference";
import type { HandlerInput, HandlerResult } from "./types";

type PublishAction = Extract<CandidateAction, { type: "PUBLISH_LISTING" }>;

export async function handlePublishListing(
  input: HandlerInput<PublishAction>,
): Promise<HandlerResult> {
  const listing = await resolveListingReference(input.tx, {
    reference: input.action.payload.listingRef,
    taskId: input.taskId,
    userId: input.context.userId,
  });
  const updated = await publishDraftListing(input.tx, {
    listing,
    userId: input.context.userId,
    expectedVersion: listing.version,
  });

  return {
    result: {
      listingId: updated.id,
      previousStatus: "DRAFT",
      status: updated.status,
      version: updated.version,
    },
    eventType: "LISTING_PUBLISHED",
    metadata: { listingId: updated.id, status: updated.status, version: updated.version },
  };
}
