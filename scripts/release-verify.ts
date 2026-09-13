import { spawnSync } from "node:child_process";

type ReleaseStep = {
  label: string;
  script: string;
  mutatesDemoData?: boolean;
};

const steps: ReleaseStep[] = [
  { label: "Apply committed database migrations", script: "db:migrate" },
  { label: "Seed the fixed demo namespace", script: "db:seed", mutatesDemoData: true },
  { label: "Check environment and integration readiness", script: "doctor" },
  { label: "Lint source", script: "lint" },
  { label: "Type-check source", script: "typecheck" },
  { label: "Run automated tests", script: "test" },
  { label: "Build the production application", script: "build" },
  { label: "Exercise the deterministic success path", script: "demo:success", mutatesDemoData: true },
  { label: "Exercise the deterministic fail-closed path", script: "demo:failure", mutatesDemoData: true },
];

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("Release verification must be started with `pnpm run release:verify`.");
  process.exit(1);
}

const pnpmIsJavaScript = /\.(?:c?js|mjs)$/i.test(pnpmCli);
const pnpmCommand = pnpmIsJavaScript ? process.execPath : pnpmCli;
const pnpmPrefix = pnpmIsJavaScript ? [pnpmCli] : [];

function runScript(step: Pick<ReleaseStep, "label" | "script">): boolean {
  console.info(`\n[release] ${step.label}`);
  const result = spawnSync(pnpmCommand, [...pnpmPrefix, "run", step.script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[release] ${step.script} could not start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`[release] ${step.script} failed with exit code ${result.status ?? "unknown"}.`);
    return false;
  }
  return true;
}

let passed = true;
let demoDataTouched = false;
for (const step of steps) {
  if (step.mutatesDemoData) demoDataTouched = true;
  if (!runScript(step)) {
    passed = false;
    break;
  }
}

if (demoDataTouched) {
  const resetPassed = runScript({
    label: "Restore the fixed demo namespace to a clean state",
    script: "db:seed",
  });
  passed = passed && resetPassed;
}

if (!passed) {
  console.error("\n[release] BLOCKED");
  process.exit(1);
}

console.info("\n[release] PASS — automated Phase 7 engineering gate completed.");
