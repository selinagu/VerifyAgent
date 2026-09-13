# Phase 7 Final Acceptance Checklist

Run the repeatable engineering gate first:

```bash
pnpm run release:verify
```

It applies committed migrations, seeds the fixed demo namespace, checks readiness, runs lint/typecheck/tests/build, exercises deterministic success and fail-closed paths, and reseeds before exit. It never performs live OpenAI or Persona requests. The remaining browser and real-sandbox checks below are intentionally manual.

## Configuration and safety

- [ ] `pnpm run doctor` has no `BLOCKED` result.
- [ ] `GET /api/readiness` contains categories only—no URLs with credentials, keys, request text, payloads, inquiry IDs, hashes, or cookies.
- [ ] Fake planner is used only with `DEMO_MODE=true` or tests.
- [ ] Production `APP_BASE_URL` is HTTPS and matches the visible application origin.
- [ ] Persona uses Sandbox, a server-created inquiry template, an allowlisted domain, and the correct webhook secret.
- [ ] The Persona webhook is enabled before creating the rehearsal inquiry and its URL uses the current HTTPS tunnel plus `/api/webhooks/persona`.
- [ ] Persona Server API requests use `PERSONA_API_VERSION=2025-10-27`; the Dashboard-controlled Webhook payload version is `2025-12-08` and is treated as a separate contract.
- [ ] Repository and build artifacts contain no secrets or temporary databases.

## Quality gate

- [ ] `pnpm run release:verify`
- [ ] `pnpm run doctor -- --live` succeeds when a deliberate live OpenAI check is appropriate.

## Browser and security gate

- [ ] Desktop and mobile layouts show request, authorization, verification, marketplace, and audit states without horizontal clipping.
- [ ] Keyboard focus and status messages remain visible.
- [ ] Production responses include CSP, `nosniff`, referrer, permissions, and `X-Request-ID` headers.
- [ ] Production CSP excludes `unsafe-eval` and permits only the required Persona SDK/inquiry origins.
- [ ] JSON mutations reject wrong media types, oversized bodies, cross-origin production requests, and unknown fields.
- [ ] Persona webhook verifies the untouched raw body before parsing and handles duplicate/out-of-order events idempotently.

## Demo acceptance

- [ ] Success ends with `$80`, `PUBLISHED`, listing version `3`, one consumed identity grant, and a complete audit trail.
- [ ] Decline ends with no grant and a private draft.
- [ ] Browser completion without signed webhook never publishes.
- [ ] Reset returns the fixed demo namespace to a clean state.
- [ ] The presenter can switch to the deterministic backup without changing authorization rules.
- [ ] With the VerifyAgent tab in the foreground, an approved webhook resumes the exact action and consumes the grant once.

## Delivery boundary

- [ ] The local judge demo uses `http://localhost:3000`; ngrok is used only for Persona's server-to-server webhook.
- [ ] A public judge URL is used only after deployment to a stable HTTPS host with persistent storage.
- [ ] Production authentication, a real marketplace, and public deployment remain explicitly labeled stretch scope.
