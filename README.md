# VerifyAgent

VerifyAgent is an identity-gated authorization layer for AI agents. The core pipeline is:

```text
user request
  -> LLM proposes typed actions
  -> deterministic policy engine
  -> NONE | CONFIRM | VERIFIED_IDENTITY
  -> Persona verification when required
  -> executor mutates marketplace state
  -> append-only audit trail
```

This repository currently contains **Phase 0 and Phase 1**: project infrastructure, canonical contracts, persistent domain models, validated configuration, and an idempotent marketplace executor. It intentionally does not yet implement the agent, policy engine, confirmation flow, Persona integration, or Agent Workspace.

## Security invariants

1. The LLM may propose typed actions; it cannot authorize or execute them.
2. The deterministic policy engine is the only source of authorization requirements.
3. Business mutations may only pass through the executor boundary.
4. A Persona browser callback is never authoritative proof of verification.
5. Identity grants bind to one user/session, exact action payload, resource, and expiry.
6. Business mutations and audit writes execute in one database transaction.

The UI, LLM output, and Persona client callbacks are all untrusted inputs. None can write marketplace state directly.

## Stack

- Next.js App Router and strict TypeScript
- Tailwind CSS
- Zod contracts and environment validation
- Prisma with SQLite
- Vitest
- ESLint

Node.js 22.5 or newer is required. The migration smoke test uses Node's built-in SQLite driver to create a valid, empty database before applying migrations.

## Project structure

```text
app/                    Minimal application and health endpoint
lib/actions/            Canonical action schemas and display catalog
lib/audit/              Append-only audit writer
lib/config/             Environment validation
lib/domain/             Shared status schemas and inferred types
lib/executor/           Execution boundary, dispatcher, handlers, and safe errors
lib/health/             Non-sensitive health reporting
lib/demo/               Stable demo fixture identifiers
lib/marketplace/        Listing invariants and transactional mutations
prisma/                 Database schema, migration, and seed
scripts/                Repeatable Phase 1 executor demo
tests/                  Contract, configuration, migration, and seed tests
```

## Setup

```bash
pnpm install
copy .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

On macOS/Linux, use `cp .env.example .env` instead of `copy`.

The local application is available at `http://localhost:3000`. The health endpoint is `GET /api/health`.

## Commands

```bash
pnpm dev             # Start the development server
pnpm build           # Create a production build
pnpm lint            # Run ESLint
pnpm typecheck       # Run strict TypeScript checks
pnpm test            # Run all tests
pnpm db:generate     # Generate the Prisma client
pnpm db:migrate      # Apply committed migrations
pnpm db:migrate:dev  # Create a development migration after schema changes
pnpm db:seed          # Reset and seed the demo namespace
pnpm demo:phase1      # Run draft -> set $80 -> publish through the executor
```

## Environment

Copy `.env.example` to `.env`. Phase 0 only requires `DATABASE_URL`; LLM and Persona variables are optional and must remain server-side secrets. Do not prefix API keys or webhook secrets with `NEXT_PUBLIC_`.

## Demo seed

The repeatable seed creates:

- demo user `Alex`;
- a long-lived local demo session;
- one Rice Stadium concert ticket inventory item;
- no task runs and no published listings.

It is designed for the future prompt: `Sell my concert ticket for $80.`

## Phase 1 executor

Phase 1 implements a single capability boundary:

```text
persisted VALIDATED ActionRun
  -> ownership and session checks
  -> strict Zod re-validation
  -> atomic execution claim
  -> dependency/reference resolution
  -> action-specific handler
  -> transactional mutation + result + success audit
```

The supported handlers are:

- `CREATE_DRAFT_LISTING`: validates inventory ownership and creates a private draft.
- `SET_LISTING_PRICE`: resolves a same-task draft result, sets USD cents, and increments the listing version.
- `PUBLISH_LISTING`: requires a complete, priced draft and performs `DRAFT -> PUBLISHED`.

The executor receives an `ActionRun` ID, reloads all authoritative data from the database, and never trusts caller-supplied ownership, status, result, or idempotency values. Logical listing references may only resolve successful `CREATE_DRAFT_LISTING` actions in the same task.

### Idempotency, concurrency, and audit

- A conditional `VALIDATED -> EXECUTING` update atomically claims execution.
- A successful retry replays the persisted result without repeating the mutation.
- Listing mutations use version-based compare-and-swap updates.
- The business mutation, persisted action result, domain audit event, and success audit event commit in one Prisma transaction.
- A failed transaction rolls back the marketplace mutation; a separate failure transaction records a safe error code without a false success event.
- Audit metadata excludes secrets and sensitive identity data.

SQLite serializes writes, but the explicit action claim and listing version checks preserve the intended boundary when the project later moves to a multi-writer database.

### Phase 1 demo

```bash
pnpm db:migrate
pnpm demo:phase1
```

The command resets only the demo namespace, creates a task with three validated fixture actions, and sends all three through `ActionExecutor`. The expected final listing is `$80 USD`, `PUBLISHED`, version `3`, with all actions `SUCCEEDED` and nine audit events.

`VALIDATED` is a temporary Phase 1 integration seam, not proof of user authorization. The executor does not yet check policy decisions, confirmations, or Persona grants. Those controls must be placed before this capability boundary in later phases.

## Phase boundary

The next step is **Phase 2: Policy engine and orchestrator**. It will introduce deterministic `NONE / CONFIRM / VERIFIED_IDENTITY` decisions and pause/resume state transitions. Phase 2 has not been implemented here.

Still intentionally absent:

- deterministic policy evaluation;
- confirmation and authorization grants;
- Persona SDK, API, and webhooks;
- LLM planning;
- Agent Workspace and marketplace UI.
