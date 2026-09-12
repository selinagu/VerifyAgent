# Phase 6 Release Checklist

## Configuration and safety

- [ ] `pnpm doctor` has no `BLOCKED` result.
- [ ] `GET /api/readiness` contains categories only—no URLs with credentials, keys, request text, payloads, inquiry IDs, hashes, or cookies.
- [ ] Fake planner is used only with `DEMO_MODE=true` or tests.
- [ ] Production `APP_BASE_URL` is HTTPS and matches the visible application origin.
- [ ] Persona uses Sandbox, a server-created inquiry template, an allowlisted domain, and the correct webhook secret.
- [ ] Repository and build artifacts contain no secrets or temporary databases.

## Quality gate

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm db:migrate`
- [ ] `pnpm db:seed`
- [ ] `pnpm demo:success`
- [ ] `pnpm demo:failure`

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
