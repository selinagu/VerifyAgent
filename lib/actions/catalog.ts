import type { ActionType } from "./schema";

export const ACTION_CATALOG: Record<
  ActionType,
  { label: string; description: string }
> = {
  CREATE_DRAFT_LISTING: {
    label: "Create draft listing",
    description: "Prepare a private marketplace draft without publishing it.",
  },
  SET_LISTING_PRICE: {
    label: "Set listing price",
    description: "Set the exact price that will be shown to buyers.",
  },
  PUBLISH_LISTING: {
    label: "Publish listing",
    description: "Publicly publish the listing on behalf of its owner.",
  },
};
