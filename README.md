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

This repository currently contains **Phase 0 only**: project infrastructure, canonical contracts, persistent domain models, validated configuration, demo seed data, and tests. It intentionally does not yet implement the agent, policy engine, Persona flow, executor, or marketplace mutations.

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
lib/config/             Environment validation
lib/domain/             Shared status schemas and inferred types
lib/health/             Non-sensitive health reporting
lib/demo/               Stable demo fixture identifiers
prisma/                 Database schema, migration, and seed
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

## Phase boundary

The next step is **Phase 1: Marketplace domain and executor**. Phase 1 should introduce transactional, idempotent listing mutations and audit writes. It must not be implemented until the Phase 0 contracts, migration, seed, tests, lint, typecheck, and production build are green.
