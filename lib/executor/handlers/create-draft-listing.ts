import type { CandidateAction } from "@/lib/actions/schema";
import { createDraftListing } from "@/lib/marketplace/listing-service";
import type { HandlerInput, HandlerResult } from "./types";

type CreateDraftAction = Extract<CandidateAction, { type: "CREATE_DRAFT_LISTING" }>;

export async function handleCreateDraftListing(
  input: HandlerInput<CreateDraftAction>,
): Promise<HandlerResult> {
  const listing = await createDraftListing(input.tx, {
    ownerId: input.context.userId,
    taskId: input.taskId,
    sourceItemId: input.action.payload.sourceItemId,
    title: input.action.payload.title,
    description: input.action.payload.description,
  });

  return {
    result: { listingId: listing.id, status: listing.status, version: listing.version },
    eventType: "DRAFT_LISTING_CREATED",
    metadata: { listingId: listing.id, status: listing.status, version: listing.version },
  };
}
