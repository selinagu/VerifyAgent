import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_IDS } from "@/lib/demo/fixtures";

const databasePath = resolve("prisma/test-phase0.db");
const databaseUrl = "file:./test-phase0.db";
const prismaCli = resolve("node_modules/prisma/build/index.js");
const tsxCli = resolve("node_modules/tsx/dist/cli.mjs");
let prisma: PrismaClient;

describe("database migration and seed", () => {
  beforeAll(() => {
    if (existsSync(databasePath)) rmSync(databasePath);
    new DatabaseSync(databasePath).close();

    const env = { ...process.env, DATABASE_URL: databaseUrl };
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
    });
    execFileSync(process.execPath, [tsxCli, "prisma/seed.ts"], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (existsSync(databasePath)) rmSync(databasePath);
  });

  it("creates the demo user, valid session, and ticket without a published listing", async () => {
    const [user, session, item, publishedListings, tasks] = await Promise.all([
      prisma.user.findUnique({ where: { id: DEMO_IDS.userId } }),
      prisma.userSession.findUnique({ where: { id: DEMO_IDS.sessionId } }),
      prisma.inventoryItem.findUnique({ where: { id: DEMO_IDS.inventoryItemId } }),
      prisma.listing.count({ where: { ownerId: DEMO_IDS.userId, status: "PUBLISHED" } }),
      prisma.taskRun.count({ where: { userId: DEMO_IDS.userId } }),
    ]);

    expect(user?.displayName).toBe("Alex");
    expect(session?.userId).toBe(DEMO_IDS.userId);
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(item?.type).toBe("CONCERT_TICKET");
    expect(publishedListings).toBe(0);
    expect(tasks).toBe(0);
  });
});
