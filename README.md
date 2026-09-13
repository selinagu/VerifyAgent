# VerifyAgent

VerifyAgent is a trust-aware authorization layer for AI agents. It lets an LLM propose useful work while keeping permission, identity verification, and state changes under deterministic application control.

The included demo turns a natural-language request—`Sell my concert ticket for $80.`—into typed marketplace actions. Drafting is allowed automatically, setting the price requires explicit confirmation, and publishing requires a Persona-verified human.

```text
user request
  -> LLM proposes structured actions
  -> strict validation
  -> deterministic policy engine
  -> NONE | CONFIRM | VERIFIED_IDENTITY
  -> exact-action authorization
  -> executor mutates the mock marketplace
  -> append-only audit trail
```

## What it demonstrates

- An LLM can propose actions but cannot authorize or execute them.
- A deterministic policy table decides the requirement for every action.
- Human confirmation is bound to the exact action payload that was reviewed.
- Persona verification authorizes only one user, session, action, and payload.
- Browser completion is not trusted; approval requires a signed webhook and an authoritative server-side inquiry lookup.
- Authorization grants are short-lived, one-time-use, and consumed transactionally with execution.
- Every important decision and mutation is recorded in an append-only audit trail.
- Offline success and failure demos exercise the same boundaries without external services.

## Demo workflow

The marketplace demo supports three actions:

| Action | Policy requirement | Result |
| --- | --- | --- |
| `CREATE_DRAFT_LISTING` | `NONE` | Creates a private listing draft |
| `SET_LISTING_PRICE` | `CONFIRM` | Sets the reviewed price to $80 |
| `PUBLISH_LISTING` | `VERIFIED_IDENTITY` | Publishes only after Persona approval |

The expected successful result is a `$80 USD` listing in `PUBLISHED` state at version `3`, with the identity grant consumed exactly once.

## Tech stack

- Next.js App Router and React
- TypeScript in strict mode
- Tailwind CSS
- Prisma with SQLite
- Zod request, response, and environment validation
- OpenAI Responses API with Structured Outputs
- Persona Embedded Flow and signed webhooks
- Vitest and ESLint

## Requirements

- Node.js 22.5 or newer
- pnpm
- OpenAI API access for the real planner flow
- A Persona Sandbox environment for real identity verification
- An HTTPS tunnel such as ngrok for local Persona webhook delivery

OpenAI and Persona are optional for the deterministic offline demo.

## Quick start: offline demo

Install dependencies and create the local environment file:

```bash
pnpm install
```

Windows:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Use the offline profile in `.env`:

```dotenv
DATABASE_URL="file:./dev.db"
DEMO_MODE="true"
DEMO_PROFILE="offline-success"
APP_BASE_URL="http://localhost:3000"
LLM_PROVIDER="fake"
```

Initialize and start the application:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and submit:

```text
Sell my concert ticket for $80.
```

The fake planner is deterministic and is available only in demo mode or tests.

## Configuration

All secrets are server-side only. Never prefix API keys or webhook secrets with `NEXT_PUBLIC_`, and never commit `.env`.

| Variable | Purpose | Typical local value |
| --- | --- | --- |
| `DATABASE_URL` | Prisma database connection | `file:./dev.db` |
| `DEMO_MODE` | Enables the fixed demo identity and reset APIs | `true` |
| `DEMO_PROFILE` | Readiness profile | `offline-success`, `real-sandbox`, or `failure-demo` |
| `APP_BASE_URL` | Trusted application origin; for local Persona testing, use the current HTTPS tunnel origin | `http://localhost:3000` |
| `LLM_PROVIDER` | Planner implementation | `fake` or `openai` |
| `LLM_API_KEY` | OpenAI API key | Required for `openai` |
| `LLM_MODEL` | OpenAI planner model | `gpt-5-mini` |
| `PERSONA_API_KEY` | Persona Sandbox server API key | Required for real Sandbox verification |
| `PERSONA_WEBHOOK_SECRET` | Signing secret for the specific Persona webhook | Required for signed webhook validation |
| `PERSONA_ENVIRONMENT_ID` | Persona Sandbox environment ID | `env_...` |
| `PERSONA_TEMPLATE_ID` | Active Persona Inquiry Template ID | `itmpl_...` |
| `PERSONA_API_VERSION` | Persona Server API version | `2025-10-27` |

`PERSONA_API_VERSION` controls VerifyAgent's Server API requests. Persona Dashboard controls the webhook payload version independently; the current Sandbox webhook contract used by this project is `2025-12-08`.

## Real OpenAI and Persona Sandbox setup

Configure `.env` without exposing any value to the browser:

```dotenv
DATABASE_URL="file:./dev.db"
DEMO_MODE="true"
DEMO_PROFILE="real-sandbox"
APP_BASE_URL="https://your-current-tunnel.example"

LLM_PROVIDER="openai"
LLM_API_KEY="..."
LLM_MODEL="gpt-5-mini"

PERSONA_API_KEY="..."
PERSONA_WEBHOOK_SECRET="..."
PERSONA_ENVIRONMENT_ID="env_..."
PERSONA_TEMPLATE_ID="itmpl_..."
PERSONA_API_VERSION="2025-10-27"
```

Validate local configuration:

```bash
pnpm run doctor
pnpm run doctor -- --live
```

The second command makes one bounded OpenAI request. Persona remains skipped because creating an inquiry has side effects.

### Persona webhook

For local development, run the application and tunnel in separate terminals:

```bash
pnpm dev
```

```bash
ngrok http 3000
```

In the Persona Dashboard Sandbox environment:

1. Create or select an active Inquiry Template.
2. Allow `http://localhost:3000` for the Embedded Flow.
3. Create a webhook with this exact shape:

   ```text
   https://<current-ngrok-domain>/api/webhooks/persona
   ```

4. Enable at least `inquiry.approved`, `inquiry.completed`, `inquiry.declined`, and `inquiry.failed`. Lifecycle events may also be enabled.
5. Enable the webhook before creating the test inquiry.
6. Copy that webhook's signing secret to `PERSONA_WEBHOOK_SECRET` and restart the application.

Open VerifyAgent at [http://localhost:3000](http://localhost:3000). Use ngrok only for Persona's server-to-server webhook; opening the application through a free ngrok URL may trigger its browser warning page.

After completing Persona, return to the VerifyAgent tab. Polling pauses while the document is hidden and resumes when the tab becomes visible.

## Useful commands

```bash
pnpm dev                         # Start the development server
pnpm build                       # Build the production application
pnpm start                       # Run a completed production build
pnpm lint                        # Run ESLint
pnpm typecheck                   # Run strict TypeScript checks
pnpm test                        # Run all automated tests
pnpm test:watch                  # Run tests in watch mode

pnpm db:generate                 # Generate the Prisma client
pnpm db:migrate                  # Apply committed migrations
pnpm db:migrate:dev              # Create a migration during development
pnpm db:seed                     # Reset and seed the fixed demo namespace

pnpm run doctor                  # Check configuration without network calls
pnpm run doctor -- --live        # Also validate configured OpenAI access
pnpm demo:success                # Deterministic happy-path demo
pnpm demo:failure                # Deterministic fail-closed demo
pnpm run release:verify          # Full automated release gate
```

`pnpm run release:verify` applies migrations, seeds demo data, runs readiness checks, lint, type checking, tests, and a production build, exercises both deterministic demo outcomes, and restores the demo namespace to a clean state. It does not call real OpenAI or Persona services.

## Application routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Non-sensitive health summary |
| `GET` | `/api/readiness` | Categorical release and integration readiness |
| `POST` | `/api/tasks` | Plan a natural-language request; requires `Idempotency-Key` |
| `GET` | `/api/tasks/:taskId` | Return an allowlisted task snapshot |
| `POST` | `/api/tasks/:taskId/run` | Run until completion or an authorization boundary |
| `POST` | `/api/actions/:actionId/confirm` | Approve or reject an exact confirmation payload |
| `POST` | `/api/actions/:actionId/verification/start` | Pre-create or resume a Persona inquiry |
| `GET` | `/api/verifications/:verificationId` | Return safe verification status |
| `POST` | `/api/actions/:actionId/resume` | Resume after server-approved identity authorization |
| `POST` | `/api/webhooks/persona` | Validate and process Persona's raw signed webhook |
| `GET` | `/api/demo/context` | Return the fixed demo prompt and inventory preview |
| `POST` | `/api/demo/reset` | Reset only the fixed demo namespace |

Demo APIs use server-owned demo identity and are unavailable when demo mode is disabled. Callers cannot inject user IDs, session IDs, authorization requirements, or execution state.

## Security model

VerifyAgent treats the browser, model output, and Persona client callbacks as untrusted input.

- The policy engine—not the LLM—assigns `NONE`, `CONFIRM`, or `VERIFIED_IDENTITY`.
- Every persisted action is reloaded and revalidated before execution.
- Confirmation evidence includes the user, session, action, and canonical payload hash.
- Identity grants include the same exact-action scope and expire automatically.
- The Persona webhook verifies the untouched raw body before parsing.
- An approved event is followed by an authoritative Persona API lookup and reference-ID comparison.
- Duplicate and out-of-order webhook deliveries are handled idempotently.
- Marketplace mutation, action result, grant consumption, and audit events commit transactionally.
- JSON mutations enforce content type, strict schemas, size limits, and production same-origin checks.
- API responses include correlation IDs; structured logs recursively redact sensitive values.
- The production CSP permits only the pinned Persona SDK and inquiry surfaces required by the flow.

The project intentionally does not store identity documents or expose Persona attributes in task or verification responses.

## Project structure

```text
app/                    Next.js pages and API routes
components/workspace/   Agent Workspace and authorization UI
lib/actions/            Canonical action schemas
lib/authorization/      Confirmation and identity-grant validation
lib/executor/           The only marketplace execution boundary
lib/marketplace/        Listing invariants and mutations
lib/orchestrator/       Restart-safe task runner
lib/policy/             Deterministic policy engine
lib/planner/            OpenAI/fake planners, validation, and compilation
lib/persona/            Persona API, event parsing, and signatures
lib/verification/       Verification lifecycle and grant issuance
lib/audit/              Append-only audit writer
lib/client/             Browser contracts and response validation
lib/observability/      Correlation IDs, logging, and redaction
prisma/                 Schema, migrations, and seed data
scripts/                Demo, diagnostics, and release verification
tests/                  Unit, contract, integration, and smoke tests
docs/                   Operational and judge-demo runbooks
```

## Troubleshooting

### `pnpm doctor -- --live` runs the wrong command

Some pnpm versions include a built-in command named `doctor`. Use the explicit package-script form:

```bash
pnpm run doctor -- --live
```

### Persona finishes but VerifyAgent keeps waiting

Check Persona Webhook Events and the local ngrok inspector at [http://127.0.0.1:4040](http://127.0.0.1:4040).

- No webhook event: confirm the webhook was enabled before the inquiry was created.
- `404` without a request in the current tunnel: replace an example or stale ngrok domain.
- `404` with a tunnel request: verify the `/api/webhooks/persona` path.
- `400` or `401`: confirm the signing secret belongs to that exact webhook, then restart VerifyAgent.
- `200`: return to the VerifyAgent tab so safe polling can resume the approved action.

Do not paste API keys, webhook secrets, raw webhook bodies, or identity data into logs or issue reports.

## Operational guides

- [Real Sandbox runbook](docs/real-sandbox-runbook.md)
- [Judge demo runbook](docs/demo-runbook.md)
- [Final acceptance checklist](docs/release-checklist.md)
