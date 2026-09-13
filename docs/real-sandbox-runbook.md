# Real Sandbox Runbook

This runbook validates VerifyAgent with OpenAI and Persona Sandbox while preserving the rule that only an authoritative server-side verification result can authorize publishing.

## Preconditions

- Use sandbox/test data only. Never submit a real identity document during a hackathon rehearsal.
- Use an HTTPS application URL reachable by Persona webhooks.
- Configure the Persona template to require server-created inquiries and allow the application domain.
- Store every key in the local environment or deployment secret store; never use `NEXT_PUBLIC_` for a server key.

```dotenv
APP_BASE_URL="https://your-stable-demo-host.example"
DEMO_MODE="true"
DEMO_PROFILE="real-sandbox"
LLM_PROVIDER="openai"
LLM_API_KEY="..."
LLM_MODEL="..."
PERSONA_API_KEY="..."
PERSONA_WEBHOOK_SECRET="..."
PERSONA_ENVIRONMENT_ID="env_..."
PERSONA_TEMPLATE_ID="itmpl_..."
PERSONA_API_VERSION="2025-10-27"
```

## Verification sequence

1. Run `pnpm run doctor`. Resolve every `BLOCKED` result before continuing.
2. Run `pnpm run doctor -- --live` to make one bounded planner validation. This command does not create a Persona inquiry.
3. Apply migrations, seed the demo namespace, and start the production build.
4. Confirm `GET /api/readiness` reports `ready` and profile `real-sandbox` without exposing any configured value.
5. In the Workspace, submit `Sell my concert ticket for $80.` and advance through draft creation and exact-price confirmation.
6. At `WAITING_IDENTITY`, open the Persona flow and complete it with Persona-provided Sandbox test data.
7. Verify that browser completion alone leaves publishing blocked.
8. After the signed webhook is processed and the server retrieves an approved inquiry, verify the exact action resumes once, the grant is consumed, and the listing reaches `PUBLISHED` at `$80`, version `3`.

## Fail-closed checks

- Stop the webhook/tunnel: the task must remain `WAITING_IDENTITY`.
- Decline or expire an inquiry: no grant may exist and the listing must remain private.
- Replay the same webhook: the response is idempotent and no second grant or publication occurs.
- Change `APP_BASE_URL` or send a cross-origin production mutation: the server rejects the request.

## Rollback

Switch to the deterministic offline profile, remove real credentials from the process environment, reseed, and use the local success/failure demos. Do not weaken signature validation, origin checks, or the policy table to rescue a live demo.
