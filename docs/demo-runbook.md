# Judge Demo Runbook

## Primary path

1. Run `pnpm run release:verify` before the session, then start VerifyAgent and the HTTPS webhook tunnel.
2. Open `http://localhost:3000` for the judge demo. Do not use the free tunnel URL as the browser-facing application.
3. Open the Workspace and point out the readiness/profile badge.
4. Submit `Sell my concert ticket for $80.`.
5. Explain that the model proposes three typed actions but has no execution authority.
6. Run the task. The private draft executes automatically; setting `$80` pauses for exact-payload confirmation.
7. Confirm the price and continue. Public publishing pauses for verified identity.
8. Complete Persona Sandbox verification. Emphasize that the browser callback cannot authorize publishing; VerifyAgent waits for a signed webhook and authoritative server retrieval.
9. Return to the VerifyAgent tab so its safe status polling can resume.
10. Show the completed listing: `$80`, `PUBLISHED`, version `3`; then show the consumed grant and append-only audit events.

## Deterministic backup

If external services or venue networking are unreliable, use `pnpm demo:success`. It exercises the same planner validation, policy, confirmation, signed Persona-shaped webhook, grant, executor, and audit boundaries with injected fakes and no network.

## Failure story

Run `pnpm demo:failure`. It must show:

- task remains `WAITING_IDENTITY`;
- verification is `DECLINED`;
- no identity grant exists;
- listing remains private `DRAFT` at `$80`;
- a duplicate webhook is handled without duplicated effects.

The UI provides the same recovery message and a return path. Never substitute a demo grant for the real Persona route or imply that the offline profile contacted Persona.

## Reset

Use the Workspace reset control or run `pnpm db:seed`. Both target only the fixed demo namespace. After reset, confirm that no task or published listing remains before the next presentation.
