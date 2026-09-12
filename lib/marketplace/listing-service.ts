import { randomUUID } from "node:crypto";

import type { Listing, Prisma } from "@prisma/client";

import { ExecutionError } from "@/lib/executor/errors";
import { assertDraftListing, assertListingCanPublish } from "./listing-rules";

async function diagnoseListingUpdate(
  tx: Prisma.TransactionClient,
  input: { listingId: string; userId: string; expectedVersion: number; requirePrice?: boolean },
): Promise<never> {
  const current = await tx.listing.findUnique({ where: { id: input.listingId } });
  if (!current) throw new ExecutionError("LISTING_NOT_FOUND");
  if (current.ownerId !== input.userId) throw new ExecutionError("LISTING_OWNERSHIP_MISMATCH");
  if (current.status !== "DRAFT") throw new ExecutionError("INVALID_LISTING_STATE");
  if (input.requirePrice && (!current.priceCents || current.priceCents <= 0)) {
    throw new ExecutionError("LISTING_PRICE_REQUIRED");
  }
  if (current.version !== input.expectedVersion) {
    throw new ExecutionError("CONCURRENT_MODIFICATION");
  }
  throw new ExecutionError("EXECUTION_FAILED");
}

export async function createDraftListing(
  tx: Prisma.TransactionClient,
  input: {
    ownerId: string;
    taskId: string;
    sourceItemId: string;
    title: string;
    description: string;
  },
): Promise<Listing> {
  const item = await tx.inventoryItem.findUnique({ where: { id: input.sourceItemId } });
  if (!item) throw new ExecutionError("SOURCE_ITEM_NOT_FOUND");
  if (item.ownerId !== input.ownerId) throw new ExecutionError("SOURCE_ITEM_OWNERSHIP_MISMATCH");

  return tx.listing.create({
    data: {
      id: randomUUID(),
      ownerId: input.ownerId,
      taskId: input.taskId,
      sourceItemId: input.sourceItemId,
      title: input.title,
      description: input.description,
      currency: "USD",
      status: "DRAFT",
      version: 1,
    },
  });
}

export async function setDraftListingPrice(
  tx: Prisma.TransactionClient,
  input: {
    listing: Listing;
    userId: string;
    priceCents: number;
    currency: "USD";
    expectedVersion: number;
  },
): Promise<Listing> {
  if (input.listing.ownerId !== input.userId) {
    throw new ExecutionError("LISTING_OWNERSHIP_MISMATCH");
  }
  assertDraftListing(input.listing);

  const updated = await tx.listing.updateMany({
    where: {
      id: input.listing.id,
      ownerId: input.userId,
      status: "DRAFT",
      version: input.expectedVersion,
    },
    data: {
      priceCents: input.priceCents,
      currency: input.currency,
      version: { increment: 1 },
    },
  });

  if (updated.count !== 1) {
    return diagnoseListingUpdate(tx, {
      listingId: input.listing.id,
      userId: input.userId,
      expectedVersion: input.expectedVersion,
    });
  }
  return tx.listing.findUniqueOrThrow({ where: { id: input.listing.id } });
}

export async function publishDraftListing(
  tx: Prisma.TransactionClient,
  input: { listing: Listing; userId: string; expectedVersion: number },
): Promise<Listing> {
  if (input.listing.ownerId !== input.userId) {
    throw new ExecutionError("LISTING_OWNERSHIP_MISMATCH");
  }
  assertListingCanPublish(input.listing);

  const updated = await tx.listing.updateMany({
    where: {
      id: input.listing.id,
      ownerId: input.userId,
      status: "DRAFT",
      version: input.expectedVersion,
    },
    data: { status: "PUBLISHED", version: { increment: 1 } },
  });

  if (updated.count !== 1) {
    return diagnoseListingUpdate(tx, {
      listingId: input.listing.id,
      userId: input.userId,
      expectedVersion: input.expectedVersion,
      requirePrice: true,
    });
  }
  return tx.listing.findUniqueOrThrow({ where: { id: input.listing.id } });
}
