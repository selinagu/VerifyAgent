# Real Sandbox Runbook

This runbook validates VerifyAgent with OpenAI and Persona Sandbox while preserving the rule that only an authoritative server-side verification result can authorize publishing.

## Preconditions

- Use sandbox/test data only. Never submit a real identity document during a hackathon rehearsal.
- For local rehearsal, open the application at `http://localhost:3000` and expose port 3000 through an HTTPS tunnel used only by Persona webhooks.
- Configure the Persona template to require server-created inquiries and allow `http://localhost:3000`.
- Create and enable the Sandbox webhook before creating an inquiry. Its URL must be the current tunnel origin followed by `/api/webhooks/persona`.
- Treat versions independently: VerifyAgent pins Server API requests to `2025-10-27`; the Persona Dashboard currently serializes webhook payloads as `2025-12-08`.
- Store every key in the local environment or deployment secret store; never use `NEXT_PUBLIC_` for a server key.

```dotenv
APP_BASE_URL="https://your-current-tunnel.example"
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
3. Apply migrations, seed the demo namespace, start VerifyAgent, and keep the HTTPS tunnel running.
4. Confirm `GET /api/readiness` reports `ready` and profile `real-sandbox` without exposing any configured value.
5. In the Workspace, submit `Sell my concert ticket for $80.` and advance through draft creation and exact-price confirmation.
6. At `WAITING_IDENTITY`, open the Persona flow and complete it with Persona-provided Sandbox test data.
7. Verify that browser completion alone leaves publishing blocked.
8. After the signed webhook is processed and the server retrieves an approved inquiry, verify the exact action resumes once, the grant is consumed, and the listing reaches `PUBLISHED` at `$80`, version `3`.

For a localhost rehearsal, keep the VerifyAgent verification tab in the foreground after completing Persona. Browser polling intentionally pauses while its document is hidden; returning to the tab or refreshing safely resumes the server-approved action.

## Webhook delivery diagnosis

- No Webhook Events and no tunnel request: the webhook was disabled, configured in another environment, or enabled after the inquiry events occurred. Enable it and create a new rehearsal inquiry.
- Persona shows `404` and the current tunnel saw no POST: the webhook URL points to an example, stale, or different tunnel origin.
- Persona shows `404` and the tunnel saw the POST: verify the exact `/api/webhooks/persona` path.
- Persona shows `400` or `401`: verify that `PERSONA_WEBHOOK_SECRET` belongs to this exact webhook, then restart VerifyAgent.
- Persona shows `200` but the task remains blocked: inspect only categorical local status; never paste webhook payloads, API keys, or identity data into logs.
- Existing delivery records may be selected and re-run after configuration is corrected. Enabling a webhook later does not create delivery records for events that occurred while it was disabled.

## Fail-closed checks

- Stop the webhook/tunnel: the task must remain `WAITING_IDENTITY`.
- Decline or expire an inquiry: no grant may exist and the listing must remain private.
- Replay the same webhook: the response is idempotent and no second grant or publication occurs.
- Change `APP_BASE_URL` or send a cross-origin production mutation: the server rejects the request.

## Rollback

Switch to the deterministic offline profile, remove real credentials from the process environment, reseed, and use the local success/failure demos. Do not weaken signature validation, origin checks, or the policy table to rescue a live demo.
