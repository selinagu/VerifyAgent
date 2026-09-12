import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PrismaClient } from "@prisma/client";

const prismaCli = resolve("node_modules/prisma/build/index.js");

export function createMigratedTestDatabase(name: string) {
  const filename = `${name}.db`;
  const databasePath = resolve("prisma", filename);
  const databaseUrl = `file:./${filename}`;
  if (existsSync(databasePath)) rmSync(databasePath);
  new DatabaseSync(databasePath).close();
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  return {
    prisma: new PrismaClient({ datasourceUrl: databaseUrl }),
    async cleanup() {
      await this.prisma.$disconnect();
      if (existsSync(databasePath)) rmSync(databasePath);
    },
  };
}
