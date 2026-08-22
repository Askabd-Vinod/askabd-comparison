# askabd-identity — Unauthenticated Route Audit

**2026-08-20 update: the "deliberately NOT fixed" section below is now
CLOSED.** `role`/`role_assignment`/`permission` (migration 001) were real,
already-designed tables that were simply never seeded. `requireAdmin()`
(`api-routes.ts`) now gates `POST /roles`, `POST /roles/assign`,
`POST /roles/revoke`, `POST /policy/check`, `GET /audit/events`, and
`POST /webhooks` behind a real `manage:platform_admin` permission, checked via
the exact same `AuthorizationService.check()` engine `/policy/check` itself
already exposed — no new/parallel authorization logic. `scripts/seed-admin-role.mjs`
(idempotent) grants this real permission to a named real identity; it has
been run for this checkout's real known operator (`hello@askabd.com` /
`askabd-internal`). Live-verified: no token → 401; a real but non-privileged
identity's token → 403; the seeded operator's token → 200. 6 new tests in
`tests/admin-routes.test.ts`, full identity suite 219/219 green. `POST
/identities`/`verify`, `credential/reset/*`, `/tokens/*`, `/auth/*`,
`/sessions/:id/validate` remain intentionally public for the same reasons
documented below — those reasons are unchanged.

**Date:** 2026-08-19. Found this pass, during an MFA-completeness audit: **no
route in `askabd-identity/src/routes/api-routes.ts` checked a caller's bearer
token at all** — confirmed by reading every route handler in the file and by
a repo-wide grep for `Authorization`/`Bearer`/`req.headers`, all with zero
matches outside imports. Reproduced live: successfully enrolled MFA on the
real staff identity (`hello@askabd.com`) with **zero Authorization header**,
just its UUID and a known org context. Cleaned up immediately; no lasting
effect on the real identity.

## Fixed this pass

| Route | Was | Now |
|---|---|---|
| `POST /identities/:id/credential/store` | Unconditional UPSERT — anyone knowing an identity's UUID + org context could silently overwrite their password with **zero proof of ownership**. The single most severe finding: a full unauthenticated account-takeover primitive. | **Create-only** (`ON CONFLICT DO NOTHING`) — refuses with `409 credential_already_set` if a credential already exists. The one real caller (`invitation-service.ts`, confirmed by repo grep) only ever calls this on a brand-new identity with no credential yet, so this closes the hole with **zero behavior change** for the real flow. A legitimate password change already has a real, protected path: `credential/change` (requires the current credential to match, R4.2) or `credential/reset/confirm` (requires a real single-use emailed token). |
| `POST /identities/:id/mfa/enroll` | No auth at all. | Requires a valid bearer token whose `sub` equals `:id` (self-only). |
| `POST /identities/:id/mfa/activate` | No auth at all. | Self-only, same as above. |
| `POST /identities/:id/mfa/disable` | No auth at all — anyone could **strip an already-active MFA method off a real account**, weakening a security control without consent. | Self-only, same as above. |
| `GET /identities/:id/sessions` | No auth at all — leaked real session metadata for any identity. | Self-only. |
| `DELETE /sessions/:id` | No auth at all — anyone could terminate any real session by ID (forced logout / DoS). | Looks up the session's real owner, then requires a bearer token matching that owner. |

All six are covered by new, real, passing tests against a live server and
database: `askabd-identity/tests/self-auth-routes.test.ts` (5 tests, full
create→verify→credential→login→attack-attempt cycles, no mocks) and
`credential-manager.test.ts`'s new `storeCredential` overwrite test.

The fix uses `requireSelf()` (`api-routes.ts`), built on
`tokenService.validate()` — the exact same verification `/tokens/validate`
already exposed — no new crypto or verification logic invented.

## Deliberately NOT fixed this pass — genuine business decision required

The following routes remain unauthenticated. They are **not self-service**
(they act on or reveal data for an identity other than the caller by design),
so `requireSelf()` cannot apply — they need a real **admin/service**
permission concept instead:

- `POST /roles`, `POST /roles/assign`, `POST /roles/revoke` — role management.
- `POST /policy/check` — arbitrary permission check for any `identityId`.
- `GET /audit/events` — cross-identity audit log read.
- `POST /webhooks` — webhook registration.
- `POST /identities` (create) and `POST /identities/:id/verify` — deliberately
  left alone: both are genuinely part of the **no-prior-token-exists-yet**
  onboarding flow (invitation-accept calls these from askabd-comparison with
  no end-user token, by construction — see `invitation-service.ts`). Gating
  these with `requireSelf()` is not possible (there is no "self" yet); the
  real fix here is a **service-to-service credential** between
  askabd-comparison and askabd-identity, a separate architectural decision.
- `POST /credential/reset/request` / `/credential/reset/confirm` — correctly
  public by design (a brand-new/locked-out user has no token; the emailed
  token itself is the authorization — same pattern as invitation-accept).
- `POST /tokens/refresh`, `POST /auth/login`, `POST /auth/logout` — correctly
  public by design (these are literally how a token is obtained/discarded).
- `POST /sessions/:id/validate`, `POST /tokens/validate` — deliberately left
  public: they disclose only a boolean valid/invalid (no session/token
  content), matching a legitimate service-to-service health-check pattern.

**Why not invented here:** identity's own internal RBAC tables (`role`,
`role_assignment`, `permission` — migration 001) are **completely empty** in
this environment — confirmed live, zero rows in all three. Gating the routes
above on "does the caller have an admin permission" would either lock out
every real caller (nothing is seeded) or require inventing what "admin" means
at this layer and seeding it unilaterally — exactly the kind of policy
invention the platform's standing rules prohibit. This is a real, concrete,
actionable next step, not a shrug: someone who owns this service's security
model needs to decide (a) what the admin-permission model is here (reuse
askabd-comparison's `staff_role_assignment` concept somehow, or a genuinely
separate one), and (b) seed it for the real operators of this service.
