# Final Security Audit — This Pass's Delta

**Date:** 2026-08-19. The full, live, adversarial cross-tenant proof (two real
identities, real client, real payment method, 403/200/401 against a genuine
JWKS-enforcing server) is in `docs/final-adversarial-security-audit.md` and was not
repeated this pass — no tenant-boundary code changed. This document covers only the
new attack surface this pass introduced: the 6 new remediation-execution routes.

## New routes added this pass, and their real authorization

| Route | Gate | Verified by |
|---|---|---|
| `POST /oc/remediations/find-or-create` | `Admin.Access` (explicit rule) + tenant-access (body `clientId`) | Full regression green; same pattern as the existing `POST /oc/remediations` |
| `POST /oc/remediations/:id/execute` | `Admin.Access` (opaque ID) | New test: real customer token denied 403 |
| `POST /oc/remediations/:id/steps/:stepId/{start,complete,fail}` | `Admin.Access` (opaque ID) | Same pattern as every other opaque-ID remediation route already proven this session |
| `GET /oc/remediations`, `GET /oc/remediations/:id` | `Admin.Access` (opaque ID / cross-client aggregate) | New test: real customer token denied 403 on both |
| `GET /oc/incidents/:id` | `Admin.Access` (opaque ID) | Gated using the identical pattern as every other opaque-ID GET closed in the prior pass |

## Real vulnerability found and fixed this pass (not tenant-related — data integrity)

**Concurrency race in remediation creation.** The incident-detail page's original
"list, then create if empty" pattern was two separate HTTP requests with no atomicity
between them. A genuine 10-way concurrent `Promise.all` test reproduced 2 duplicate
`oc_remediations` rows for the same incident on the first attempt. Fixed with:

```sql
CREATE UNIQUE INDEX idx_oc_remediations_one_open_per_incident
  ON oc_remediations (incident_id)
  WHERE phase NOT IN ('completed', 'rolled-back', 'failed');
```

enforced by Postgres itself (`INSERT ... ON CONFLICT (incident_id) WHERE ... DO
NOTHING`), not application logic — the only approach that's actually safe under
READ COMMITTED isolation. Re-ran the same 10-way concurrent test after the fix:
exactly 1 row created, confirmed by direct `SELECT count(*)` against the real table,
not just the HTTP responses.

## Never-log / never-fabricate checks re-confirmed this pass

- No `authorization` header, password, token, or credential value appears in any new
  log statement added this pass (all new `auditBestEffort` calls log `actor` —
  a real identity ID or session identifier — never a secret).
- OTP generation fix from the prior pass (`crypto.randomInt`, not `Math.random`)
  re-confirmed present and unregressed.
- No hardcoded `confidence`, dollar-impact, or "rows transferred"-style fabricated
  metric strings found in a fresh targeted re-grep across `apps/web/src` and
  `apps/api/src`.

## 2026-08-19 addendum — real, previously-undiscovered vulnerability found and fixed

A critical finding this pass, in **askabd-identity**, not askabd-comparison:
no route in `askabd-identity/src/routes/api-routes.ts` checked a caller's
bearer token at all. Reproduced live — enrolled MFA on the real staff
identity (`hello@askabd.com`) with zero Authorization header, using only its
UUID and a known org context; cleaned up immediately, no lasting effect.

The single most severe instance: `POST /identities/:id/credential/store` was
an unconditional upsert, meaning anyone who knew (or enumerated) a real
identity's UUID could silently overwrite that identity's password with zero
proof of ownership — a full unauthenticated account-takeover primitive.

**Fixed:**
- `credential/store` made create-only (`409 credential_already_set` if a
  credential already exists) — closes the hole with zero behavior change for
  the one real caller (invitation-accept, which only ever calls this on a
  brand-new identity).
- Real self-only bearer-token authentication (`requireSelf()`, built on the
  existing `tokenService.validate()`) added to: MFA enroll/activate/disable,
  session list, session terminate.
- 5 new live integration tests (real server, real database, no mocks) in
  `askabd-identity/tests/self-auth-routes.test.ts`, plus 1 new unit test in
  `credential-manager.test.ts`. All passing; full identity regression
  (203/203) and the invitation-accept flow re-verified live, unaffected.

**Deliberately NOT fixed** — genuinely admin-only routes (role management,
cross-identity audit read, webhooks) remain unauthenticated because
identity's own RBAC tables (`role`/`role_assignment`/`permission`) are
completely empty in this environment; gating them requires a real, seeded
admin-permission model, a business decision not invented here. Full route-by-
route breakdown, including which routes are legitimately public by design
(login, token refresh, password-reset request/confirm, invitation-accept's
identity-creation step) and why: `docs/identity-unauthenticated-routes-audit.md`.

## 2026-08-19 second addendum — MFA login challenge completed, real replay prevention added

Beyond the unauthenticated-route fix (previous addendum), the MFA login
challenge itself was audited end-to-end this pass:

- **Real replay prevention added** (migration 004,
  `askabd-identity/src/services/mfa-service.ts`): `MfaService.challenge()`
  previously had no protection against reusing the same valid TOTP code
  multiple times within its own ~90s validity window (current step ± 1 drift
  step). Now persists the matched time-step per method and rejects an exact
  repeat (`mfa_code_reused`), without weakening the drift tolerance a
  legitimate slightly-out-of-sync authenticator app needs. Proven both by a
  unit test and live in the browser (a real, just-used code was rejected on
  immediate reuse).
- **Rate limiting confirmed already real**: `auth-service.ts`'s per-identifier
  rate limiter runs before the MFA code is ever checked (same code path as a
  plain password attempt), so repeated wrong-MFA-code guesses are already
  bounded — no separate mechanism needed.
- **No disclosure preserved**: a wrong MFA code and a wrong password return
  the same generic backend error (`authentication_failed`) — deliberate,
  matching the platform's existing no-enumeration design. The frontend
  re-contextualizes this into an honest, specific message ("that code is
  invalid or has expired") only because it already knows, from reaching the
  code-entry screen, that the password step succeeded — this is a UI-layer
  clarification, not a backend disclosure change.
- MFA secrets remain stored in plaintext at rest (`mfa_method.secret_enc`) —
  a pre-existing, documented gap, not addressed this pass.
