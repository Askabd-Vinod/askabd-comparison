# Identity, Authentication & RBAC Integrity — Final Report

**Milestone:** Enterprise Identity, Authentication & RBAC Integrity — Fortune 500 Security Foundation
**Date:** 2026-08-17
**Branch:** feature/reliability-hardening · **HEAD at start and end:** `a9082ca` (unchanged — no commit made)

---

## A. Baseline

Re-verified before any change, per this milestone's non-negotiable rule to never trust previously-reported numbers:

- `git status` / `git diff --stat` inspected fresh (not assumed from any earlier session note).
- API test suite run fresh: **180/180 passing** before this milestone's changes.
- Trigger finding (from the immediately-prior Service Governance milestone, re-confirmed by direct code read, not taken on faith): `apps/api/src/middleware/auth.ts` set `permissions: []` unconditionally on every verified token and never populated `metadata.roles`, so `extractRoles()` (`platform/rbac/middleware.ts`) fell through to its `['customer']` default for **every** authenticated request regardless of the real identity in the token.

## B. Authentication architecture

JWT-based bearer-token authentication, verified by `apps/api/src/middleware/auth.ts` via the `jose` library. Two independent, mutually-exclusive verification modes:
- **Symmetric** — `JWT_SECRET` (HS256).
- **Asymmetric** — `JWKS_URL`, keys fetched live via `jose.createRemoteJWKSet`.

Issuer is always validated (`issuer: 'askabd-identity'` by default). Expiry is validated automatically by `jose.jwtVerify`. Token creation/login itself is entirely external — no login endpoint, password store, or session table exists anywhere in this repository (confirmed by direct search, see [identity-rbac-architecture-audit.md](../docs/identity-rbac-architecture-audit.md)).

## C. JWT architecture

`TokenClaims` interface extended this milestone (previously `sub`/`org`/`sid`/`jti`/`iat`/`exp` only) to include optional `roles` (string array), `permissions` (string array), and `scope` (RFC 6749 §3.3 space-separated string). A new `normalizeClaimList()` helper accepts either shape and never throws. This is a **standards-based, best-effort read** — not a confirmed contract with the real `askabd-identity` service, whose source is outside this repository. Documented as unverified in both new docs.

## D. Role architecture

Role catalog (`platform/rbac/roles.ts`) is static, in-code, pre-existing, unchanged this milestone: `super_admin`, `admin`, `business_user`, `merchant`, `partner`, implicit `customer` default. `extractRoles()` itself was **not modified** — only what feeds it (`auth.metadata.roles`) was fixed.

## E. Permission architecture

`resolvePermissions(roles, ROLE_MAP)` expands role names to static permission sets (pre-existing, unchanged). `AuthContext.permissions` (direct grants layered on top of role-derived permissions) now correctly reads the token's `permissions`/`scope` claim instead of always being `[]`.

## F. User-role mapping — authoritative source

**No local `users`/`roles`/`permissions`/`user_roles`/`role_permissions` table exists in PostgreSQL** — confirmed via direct `\dt` against the running instance. All ~80 real tables are business-domain data. Role assignment is entirely the external identity service's responsibility, communicated only via the JWT's claims. No local identity table was invented; none exists to reuse.

## G. Client isolation

`AuthContext.tenantId = claims.org ?? 'public'` — sourced from the verified token's `org` claim, never from a browser-supplied header or query parameter. Route handlers that operate on a specific `:clientId` path segment (e.g. `/oc/clients/:clientId/services/:serviceId/enable`) authorize via the RBAC permission model (`Admin.Access`), not via tenant-claim comparison — this repo's current model is role-based, not per-tenant-scoped enforcement at the middleware layer. No change made here this milestone; documented as-is (see Remaining P1, section T).

## H. DEV bypass

Two independent bypass flags, unchanged this milestone, both verified to remain DEV-only:
- **Auth bypass** (`registerAuthMiddleware`): `NODE_ENV !== 'production' && !JWT_SECRET && !JWKS_URL`. Confirmed by test that a production-shaped config (`devBypass: false` explicitly) never bypasses, returning 401 with no `Authorization` header.
- **Authorization/RBAC bypass** (`registerAuthorizationMiddleware`, `server.ts`): `NODE_ENV !== 'production'` alone. Unchanged, pre-existing, out of this milestone's file-change scope.

Both are computed from `NODE_ENV`, never from any request-supplied value — cannot be triggered remotely.

## I. Production authentication requirements

Documented in full, placeholders only, in [identity-production-requirements.md](../docs/identity-production-requirements.md): `JWT_SECRET` / `JWKS_URL` (choose exactly one), `JWT_ISSUER`, `JWT_AUDIENCE` (new, optional, no-op until set). No real secret value appears anywhere in either new document.

## J. RBAC implementation

`registerAuthorizationMiddleware` + `COMPARISON_API_RULES` (declarative `{method, path, permissions}` rules) + `authorizeAny()` (vendored `@askabd/shared-authorization`). Unchanged this milestone — already correct; the bug was entirely upstream of this layer (bad input, not bad logic).

## K. Service governance authorization

`enable`/`disable` routes for client services remain gated to `Admin.Access` (declared in the prior Service Governance milestone, re-verified unchanged this milestone: `git diff --stat` shows zero changes to `rules.ts` in this milestone's window).

## L. Commercial service authorization

Unchanged this milestone — the Path A/B commercial-engagement bridge from the prior milestone is unaffected; its confirmation endpoint is the same `enable` route covered above.

## M. Negative security tests (all passing, `rbac-service-assignment.test.ts`)

| # | Test | Result |
|---|---|---|
| 1 | Unauthenticated (no header) → 401 | ✅ |
| 2 | Customer-role token → 403 on Admin.Access route | ✅ |
| 3 | business_user-role token (non-admin staff) → 403 | ✅ |
| 4 | Unknown/unmapped role → 403 (fails closed) | ✅ |
| 5 | No role/permission claim at all → 403 (fails closed, never elevated) | ✅ |
| 6 | Expired token → 401 | ✅ |
| 7 | Tampered token (wrong signing key), even claiming `super_admin` → 401 | ✅ |
| 8 | Malformed token (not a JWT) → 401 | ✅ |
| 9 | Wrong issuer → 401 | ✅ |
| 10 | Wrong audience (when audience configured) → 401 | ✅ |
| 11 | Production-shaped config never bypasses (DEV bypass stays DEV-only) → 401 | ✅ |

## N. Positive security tests (all passing)

| # | Test | Result |
|---|---|---|
| 1 | `roles: ["admin"]` claim → 200 on Admin.Access route | ✅ |
| 2 | `scope: "Admin.Access Product.Read"` (OAuth2 string convention) → resolved into permissions correctly | ✅ |
| 3 | `admin`-shaped role set granted via RBAC engine directly | ✅ |
| 4 | `super_admin`-shaped (wildcard) role set granted | ✅ |
| 5 | Customer-role token still allowed on a real customer-facing read route (`/api/v1/categories`) — fix did not lock out legitimate non-admin traffic | ✅ |
| 6 | No audience configured → token with no `aud` claim still accepted (no behavior change until audience is explicitly set) | ✅ |
| 7 | RBAC rule declaration itself verified (`enable`/`disable` routes require `Admin.Access`) | ✅ |

## O. Security regression

- `security-auth-guard.test.ts` — **10/10 passing**, unchanged, none weakened or deleted.
- `rbac-service-assignment.test.ts` — expanded from 4 → **19/19 passing** (15 net-new tests, all listed in M/N above).
- Full API suite: **195/195 passing** (28 test files), re-run fresh at the time of writing this report, not carried over from an earlier session note.
- API build: clean. Web build: clean (no web files touched this milestone).

## P. Browser UAT

Performed live against the real client `client-c9683df9-1a9d-4424-9eb8-bba6dbf6ca79` ("E2E Lifecycle...", the same client used for live verification throughout this session's prior milestones), via the dev server's DEV-bypass identity path (the only path exercised by the browser, since `apps/web` sends no `Authorization` header — confirmed, see section on Frontend below):

1. Navigated to `/clients/client-c9683df9-1a9d-4424-9eb8-bba6dbf6ca79/services`. Page rendered correctly: 70 total capabilities, 1 Confirmed, 0 Proposed, 28 Not Confirmed, 3 Recommended, 3% coverage, recommended-bundle cards, category/status filters — all real, all matching the pre-milestone data shape.
2. Clicked the real **Enable** button on "Engineering Intelligence" (a genuine `not yet confirmed` capability, not a decoration).
3. Stats updated live and correctly: Confirmed 1 → **2**, Not Confirmed 28 → **27**, Coverage 3% → **7%**.
4. Verified via `GET /api/v1/oc/audit?clientId=...` that a real audit row was written for the action: `action: "service_enabled"`, `entity_id: client-c9683df9-...`, `entity_name: "cap-engineering-intelligence"`, `actor: "admin"`, timestamped to the moment of the click.

**Conclusion:** the DEV-bypass flow (which is what the browser actually exercises, since the frontend sends no bearer token) is provably unaffected by this milestone's `auth.ts` changes — DEV bypass returns before `verifyToken()` is ever called, exactly as before. No regression introduced to the only auth path the UI currently uses.

## Q. Production requirements

Full placeholder-only environment variable and environment-matrix documentation: [identity-production-requirements.md](../docs/identity-production-requirements.md). No real secret, key, or credential value appears in it.

## R. External identity dependencies

The real `askabd-identity` service (issuer string `"askabd-identity"`) is **not present in this repository** — no source, OpenAPI contract, or database schema for it exists here. This milestone could not and did not verify:
- The real token's exact `roles`/`permissions`/`scope` claim names or value format.
- Whether the real service uses OIDC/OAuth2 conventions at all (assumed as the best-effort standard, explicitly flagged unverified in both docs).
- The real `JWT_AUDIENCE` value, or whether the identity service issues an `aud` claim at all today.
- Key rotation cadence / JWKS endpoint URL / clock-skew tolerance in the real deployment.

None of this was invented. Per the milestone's explicit stop-condition rule, where real integration facts were unavailable, the safe, standards-based, fail-closed default was implemented and the gap was documented rather than guessed at as fact.

## S. Remaining P0

- **Confirm real token claim format against the actual `askabd-identity` service** before trusting any Admin.Access-gated action in any environment above DEV. This is the single most important open item — everything else in this milestone is provably correct *given* that assumption holds; the assumption itself is unverified. Owner: identity/security team, requires a real or realistic sample token.

## T. Remaining P1

- **No per-request tenant-claim enforcement at the middleware layer.** `tenantId` is correctly extracted from the verified token (`claims.org`), but route handlers do not currently cross-check it against the `:clientId` path parameter — authorization today is role-based (`Admin.Access`), not tenant-scoped. If a future real-identity rollout issues admin tokens scoped to a single client/org, this gap should be closed by adding an explicit tenant-match check alongside the existing permission check. Not fixed this milestone (would require inventing an enforcement rule not evidenced anywhere in the current codebase — correctly out of scope per the "do not invent architecture" rule).

## U. Remaining P2

- **`JWT_AUDIENCE` not yet set in any environment.** The capability is implemented and tested (no-op until configured), but the real value must come from the identity team before it can be turned on in staging/production.
- **CORS remains `*`** — pre-existing, previously flagged in an earlier milestone's production-readiness report, unrelated to this milestone's scope (not an authentication or RBAC gap), re-confirmed still open.

## V. Remaining P3

- Once real frontend authentication exists (out of scope here — `apps/web` currently sends no `Authorization` header at all, by design, since customer self-service auth was intentionally removed in commit `2c288ff`), the UI-side authorization audit (Phase 12/13 of this milestone) should be re-run against real logged-in sessions rather than DEV bypass.

## W. Exact files changed this milestone

```
M  apps/api/src/middleware/auth.ts                  (+41 / -4 — TokenClaims, normalizeClaimList, audience support, role/permission claim reads)
?? apps/api/tests/rbac-service-assignment.test.ts    (rewritten in place, 4 → 19 tests; file itself was already untracked before this milestone)
?? docs/identity-rbac-architecture-audit.md          (new)
?? docs/identity-production-requirements.md          (new)
?? docs/identity-rbac-final-report.md                (new, this file)
```

No other file was modified by this milestone. `apps/api/src/platform/rbac/rules.ts` was modified but **in the prior Service Governance milestone**, not this one — re-verified via `git diff --stat` scoped to this milestone's working session, zero net change to that file this time.

## Fortune 500 security review — 12 questions

1. **Can a customer become admin?** No — `roles: ["customer"]` (or no role claim at all) is explicitly tested to return 403 on every Admin.Access route (tests M#2, M#5).
2. **Can a customer modify another client's service?** The `enable`/`disable` routes require `Admin.Access` regardless of client — a customer-role token is rejected before the client ID is ever considered (test M#2). Tenant-scoped enforcement itself is a documented P1 gap (section T), not a customer-privilege-escalation path.
3. **Can a customer confirm a service?** No — same `Admin.Access` gate (test M#2).
4. **Can a forged/tampered JWT bypass authorization?** No — signature verification rejects any token not signed by the configured key, even one claiming `super_admin` (test M#7).
5. **Can a missing role become admin?** No — verified to fail closed to `customer`/403, never elevated (test M#5).
6. **Can frontend-only controls be bypassed?** Irrelevant to whether they can be bypassed — the backend independently enforces the same rule regardless of what the UI shows or hides (all M/N tests call the API directly via `app.inject`, no UI involved).
7. **Can `client_id` be manipulated from the browser?** `tenantId` used in `AuthContext` comes from the verified token's `org` claim, never from a browser-supplied field — a client cannot claim a different `org` without a validly-signed token asserting it.
8. **Can secrets appear in logs?** Not changed this milestone; `request.log.warn` on auth failure logs only a reason string (`"Token expired"`/`"Invalid signature"`/`"Invalid token"`) and the underlying error message, never the token or key material — confirmed by reading the exact log call (`auth.ts` catch block).
9. **Can tokens appear in API responses?** No response path in `auth.ts` echoes the token; `getAuth()` returns `AuthContext` (userId/tenantId/permissions/metadata), not the raw JWT.
10. **Can auth fail open?** No — every failure path (missing header, verification exception) returns 401 before any handler runs; the try/catch has no fall-through success case.
11. **Can DEV bypass reach production?** No — both bypass flags are computed from `NODE_ENV !== 'production'` (auth) or gated the same way at the call site (authorization); a production-shaped config with `devBypass: false` explicitly returns 401 with zero exceptions (test M#11).
12. **Can an authorization failure still execute the business operation?** No — `registerAuthorizationMiddleware` runs as a `preHandler` before the route handler; a denied request never reaches the handler body (pre-existing `denyAccess()` behavior, unchanged, re-confirmed by every 403 test in this suite actually returning before any state mutation — e.g. the audit log shows no `service_enabled` entry for any of the denied test requests).

## Final success criteria — self-check against the milestone's own list

- No fake authentication — confirmed: all verification goes through real `jose.jwtVerify`, no shortcut added.
- No fake authorization — confirmed: real RBAC engine, real permission sets, no hardcoded "always allow."
- No new identity architecture invented — confirmed: reused existing `TokenClaims`/`AuthContext`/`extractRoles()`/`ROLE_MAP`, added only a claims *read*, not a new model.
- No default-to-admin, no blanket default-to-customer-regardless-of-real-role — confirmed: role-less tokens still resolve to `customer` (safe default), role-bearing tokens now resolve to their real role.
- DEV bypass confirmed DEV-only, unchanged, re-tested.
- Full regression: 195/195 passing, zero tests weakened or deleted.
- Browser UAT: performed live, real state change, real audit trail confirmed.
- **No commit. No push.** — confirmed below.

## Git safety confirmation

```
HEAD before this milestone: a9082ca
HEAD after this milestone:  a9082ca   (unchanged)
git diff --cached --name-only:        (empty — nothing staged)
```

Only this milestone's five files (section W) carry new changes; no `.env`, credential, key, token, or database-dump file was touched or created. No `git add`, `git commit`, or `git push` was executed at any point in this milestone.
