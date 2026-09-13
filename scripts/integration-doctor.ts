import "dotenv/config";

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { parseEnv, configurationFlags } from "../lib/config/env";
import { db } from "../lib/db";
import { ExecutionError } from "../lib/executor/errors";
import { OpenAIPlannerGateway } from "../lib/planner/providers/openai-planner";
import { PLANNER_PROMPT_VERSION } from "../lib/planner/prompt-builder";

type State = "PASS" | "FAIL" | "SKIP";
const rows: Array<{ check: string; state: State; detail: string }> = [];
const add = (check: string, state: State, detail: string) => rows.push({ check, state, detail });

async function main() {
  const live = process.argv.includes("--live");
  if (Number(process.versions.node.split(".")[0]) >= 22) add("Node version", "PASS", process.versions.node);
  else add("Node version", "FAIL", `Requires Node 22.5+, found ${process.versions.node}`);

  let env;
  try {
    env = parseEnv();
    add("Environment schema", "PASS", "Configuration is structurally valid");
  } catch {
    add("Environment schema", "FAIL", "Configuration is invalid; no secret values were printed");
    print();
    process.exitCode = 1;
    return;
  }

  try {
    await db.$queryRawUnsafe("SELECT 1");
    add("Database", "PASS", "Connected");
    const migrationDirs = (await readdir(resolve("prisma", "migrations"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).length;
    const applied = await db.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT COUNT(*) as count FROM _prisma_migrations WHERE finished_at IS NOT NULL");
    const appliedCount = Number(applied[0]?.count ?? 0);
    add("Migrations", migrationDirs === appliedCount ? "PASS" : "FAIL", `${appliedCount}/${migrationDirs} applied`);
  } catch {
    add("Database", "FAIL", "Unavailable or migrations table missing");
  }

  const flags = configurationFlags(env);
  add("OpenAI configuration", flags.llmConfigured ? "PASS" : "SKIP", flags.llmConfigured ? `${env.LLM_PROVIDER} provider configured` : "Not fully configured");
  add("Persona configuration", flags.personaConfigured ? "PASS" : "SKIP", flags.personaConfigured ? "Sandbox boundary configured" : "Not fully configured");
  const base = new URL(env.APP_BASE_URL);
  add("App base URL", "PASS", base.origin);
  add("Webhook URL", base.protocol === "https:" ? "PASS" : "SKIP", `${base.origin}/api/webhooks/persona`);
  add("Demo safety", !env.DEMO_MODE && env.LLM_PROVIDER === "fake" ? "FAIL" : "PASS", env.DEMO_MODE ? `Demo profile: ${env.DEMO_PROFILE}` : "Demo APIs disabled");

  if (live && env.LLM_PROVIDER === "openai" && env.LLM_API_KEY && env.LLM_MODEL) {
    try {
      await new OpenAIPlannerGateway(env.LLM_API_KEY, env.LLM_MODEL, fetch, 20_000).createPlan({
        requestText: "Sell my doctor-test ticket for $1.",
        availableInventory: [{ id: "doctor_test_item", type: "TICKET", title: "Doctor test ticket", description: "Synthetic integration-check inventory." }],
        supportedActions: ["CREATE_DRAFT_LISTING", "SET_LISTING_PRICE", "PUBLISH_LISTING"],
        promptVersion: PLANNER_PROMPT_VERSION,
      });
      add("OpenAI live check", "PASS", "Strict structured plan returned");
    } catch (error) {
      const code = error instanceof ExecutionError ? error.code : "UNKNOWN_ERROR";
      add("OpenAI live check", "FAIL", `Provider validation failed (${code})`);
    }
  } else {
    add("OpenAI live check", "SKIP", live ? "OpenAI credentials not configured" : "Run with --live to enable");
  }
  add("Persona live check", "SKIP", "No side-effect-free endpoint used; validate through the real sandbox runbook");
  print();
  if (rows.some((row) => row.state === "FAIL")) process.exitCode = 1;
}

function print() {
  for (const row of rows) console.log(`${row.check.padEnd(24)} ${row.state.padEnd(5)} ${row.detail}`);
  const overall = rows.some((row) => row.state === "FAIL") ? "BLOCKED" : rows.some((row) => row.state === "SKIP") ? "DEGRADED" : "READY";
  console.log(`Overall${" ".repeat(17)} ${overall}`);
}

main().finally(async () => db.$disconnect());
