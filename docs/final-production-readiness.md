# Final Production Readiness

**Date:** 2026-08-19 (fourth update, same day). Verdict: **TEST READY WITH
BLOCKERS** — not "production ready". Each update in this doc's history
reflects newly verified/fixed state, not a re-assertion of the previous one.

**2026-08-20 fifth update:** Two real, live-reported UAT defects found and fixed —
see `docs/session-architecture.md` and `docs/invitation-lifecycle.md` for full
detail:

- **Session interruption during active use** — root-caused to a real,
  short-lived access token (≤15 min, by design) that this app never renewed.
  Fixed with a real proactive+reactive renewal architecture (rotating refresh
  tokens, single-use, reuse detection — all pre-existing in askabd-identity and
  now actually wired up), on both the staff and customer domains. Live-verified:
  a real session survived a full renewal cycle with zero interruption; a
  genuinely dead refresh token failed closed with an honest message and no loop;
  a fresh login returned the user to their exact original destination.
- **Duplicate invitation rows for the same customer email** — root-caused to a
  non-atomic check-then-insert. Rewritten around a persistent-invitation-object
  model (reuse a live invitation, auto-renew an expired one, real Postgres unique
  partial index as the concurrency authority) plus two new real product paths: an
  existing customer can now discover and explicitly accept a pending invitation
  just by signing in normally (no email link required), and a returning customer
  accepting a second client's invitation via the email link signs in with their
  real existing password instead of hitting a dead end. Live-verified end to end,
  including real tenant isolation on the new self-service accept route.
- 15 new/updated automated tests (invitation lifecycle, concurrency, multi-client,
  tenant isolation) + 5 new session-renewal unit tests. Full regression after
  these changes: 358/358 (comparison API) + 204/204 (identity) + 33/33 (web), all
  three production builds clean.

## What is genuinely, freshly verified as of this update

- **Real MFA login challenge — completed.** askabd-identity's MFA backend
  (enroll/activate/disable/challenge, real TOTP) was real but had no UI to
  reach it and no real replay prevention. Both fixed:
  - New `/account/security` staff page — real enroll → activate → disable
    lifecycle, calling askabd-identity directly.
  - Both login pages now handle the real `mfa_required` outcome: password
    accepted → 6-digit code prompt → verified via askabd-identity's real
    `MfaService.challenge()` → session issued. Wrong/expired codes rejected
    with an honest message, never silently falling back to re-asking for the
    password.
  - **Real replay prevention added** (migration 004,
    `mfa_method.last_used_step`) — a valid TOTP code could previously be
    reused multiple times within its own ~90s validity window; now rejected
    after first use.
  - **Live-verified end-to-end** with a temporary fixture identity: real
    enrollment (real secret via `POST /mfa/enroll`), real TOTP computed and
    used to activate, full login flow tested with a wrong code (rejected,
    stayed on the code screen), a valid code (session issued, landed in the
    correct workspace), and an immediate replay of the same code (rejected).
    Fixture cleaned up by exact ID afterward.
  - 1 new unit test (replay) + reused the existing MFA/credential test
    suites — 204/204 identity tests green throughout.
- **CRM customer visibility — resolved** (migration 031). Every
  Contact/Note/Task now has a real `visibility` field, defaulting to
  `'internal'` — nothing is customer-visible unless staff explicitly opts it
  in. Real customer-portal read routes (`/oc/portal/:clientId/contacts|notes|tasks`)
  filter at the SQL level; a new "Team & Notes" portal tab shows only shared
  items. 3 new tests prove default-internal, correct filtering, and real
  tenant isolation (a genuinely mapped customer sees the shared note; an
  unmapped org gets 403). See `docs/crm-completeness.md`.
- **A real, previously-undiscovered, unauthenticated account-takeover hole in
  askabd-identity, found and fixed.** No route in
  `askabd-identity/src/routes/api-routes.ts` checked a caller's bearer token
  at all — reproduced live (enrolled MFA on the real staff identity with zero
  Authorization header, cleaned up immediately). The worst instance:
  `POST /identities/:id/credential/store` was an unconditional upsert — anyone
  knowing an identity's UUID + org context could silently overwrite their
  password. Fixed: made create-only (409 if a credential already exists) and
  added real self-only bearer-auth to MFA enroll/activate/disable/status and
  session list/terminate. 5 live, no-mock integration tests
  (`self-auth-routes.test.ts`) plus unit tests prove it. Full detail and the
  explicit list of routes deliberately NOT yet fixed (need a real
  admin-permission model that doesn't exist yet — identity's own `role`/
  `role_assignment` tables are completely empty) in
  `docs/identity-unauthenticated-routes-audit.md` — **this remains the single
  most significant open blocker**, unchanged this update.
- Real CRM built (migration 030): Contacts, Notes, Tasks — previously
  entirely MISSING (fabricated sample-only "Contacts" page, no Notes/Tasks
  capability). Real DB/service/API/RBAC/tenant-isolation/audit/UI/tests,
  live-verified end-to-end.
- Real password-recovery email delivery built and live-verified end-to-end
  (request → real Mailpit email → real link → reset → login with new
  password → token replay honestly rejected).
- Runtime restored from a full infrastructure outage; real JWKS-based
  authentication is the actual default local-dev behavior; two more real,
  live-found-and-fixed defects from closing that gap (SSR pages missing auth
  headers; a config-merge bug that broke 78 of the API's own tests, fixed at
  the root cause).
- Route-group layout separation (`(auth)`/`(app)`/`(portal)`) fixed
  structurally and live-verified.
- **Full regression, run fresh after every change today: 346/346
  (comparison) + 204/204 (identity) + 28/28 (web).** All three production
  builds clean, all re-run at the very end from a clean state after the
  final code changes.

## Why NOT "production ready" yet

- **askabd-identity's admin-only routes (role management, cross-identity
  audit read, webhooks) remain genuinely unauthenticated** — the single
  largest remaining security gap. Not fixed because a correct fix needs a
  real, seeded admin-permission model this service currently has zero data
  for; inventing one unilaterally was judged riskier than leaving it clearly
  documented (`docs/identity-unauthenticated-routes-audit.md`). **This is the
  most important remaining blocker for a real production deployment.**
- Production-shaped authentication is now the real local-dev default, but a
  genuine production deployment's exact auth-enforcement configuration,
  secrets management, and infra have not been deployed and soak-tested — see
  `docs/production-readiness-baseline.md` / `docs/AWS_*`, a separate,
  unchanged track.
- MFA has no backup/recovery codes and no admin-forced-reset path if a user
  loses their authenticator device — a real, undone follow-up.
- MFA secrets (`mfa_method.secret_enc`) are stored in plaintext, not
  encrypted at rest — flagged in the existing code comment, not addressed
  this pass (separate from the auth/access-control fixes made here).
- `sessionStorage`-based session storage (plus one same-site cookie for SSR
  reads) remains the session architecture; a full httpOnly-cookie BFF
  migration is a documented, deliberate, larger future step.
- Two pre-existing leftover identity rows (`hello@askabd.com`,
  `second-attempt@askabd.com`) and ~13 historical migration-run records
  referencing client identifiers that no longer resolve to a live `oc_clients`
  row remain untouched (no broad/pattern-based deletion performed), flagged
  for a human decision.
- CRM Notes/Tasks notifications (@mentions, task-assignment alerts) are not
  wired — real `oc_notifications` infrastructure exists elsewhere; connecting
  it here is a small, real, undone follow-up.

## Immediate next real steps (not invented, not started this pass)

1. Decide and seed a real admin-permission model for askabd-identity's own
   RBAC tables, then gate the routes listed in
   `docs/identity-unauthenticated-routes-audit.md`.
2. Encrypt MFA secrets at rest; add backup/recovery codes and an admin-forced
   MFA reset path.
3. Investigate and, if genuinely orphaned, clean up the pre-existing
   `second-attempt@askabd.com` identity and the historical migration-run rows.
4. Wire CRM task/note events into the existing notification infrastructure.
5. A real production infrastructure deployment/soak test, tracked separately.
