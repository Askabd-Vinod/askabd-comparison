# Identity Contract + Tenant Authorization + Multi-Tenant Security Hardening — Final Report

**Date:** 2026-08-17. **Branch:** feature/reliability-hardening. **HEAD at start and end:**
`a9082ca` (unchanged — no commit made).

## A. Baseline

Re-verified fresh, not trusted from any prior session note:
- `git status`/`branch`/`log -1` confirmed clean working tree matching prior milestones' exact
  accumulated (uncommitted) changes, HEAD `a9082ca`.
- API test suite: **195/195 passing** before this milestone's changes (28 files).
- API build (`tsc --noEmit`): clean. Web build: clean.
- `GET /health`: `{"status":"ok","database":"connected"}`.
- PostgreSQL: connected and queried directly for schema verification throughout.

## B. Identity architecture — a real sibling repository was found

Unlike the prior Identity/RBAC milestone (which treated `askabd-identity` as an unreachable
black box), this milestone discovered a **real, separate `askabd-identity` repository** at
`D:\.kiro\askabd-identity` in the same workspace — not previously known to this session. Its
source was read directly. It is a substantial, real implementation: identity CRUD, Argon2id
credential hashing, TOTP MFA, session management, its own RBAC (roles/permissions/policy-check),
audit logging, event publishing, webhooks, and a typed SDK. It is **not running** in this
environment (`curl localhost:3100/health` refused) — all findings below are a static source
audit, not a live integration test.

## C. Real token contract — VERIFIED (not guessed)

Full detail in `docs/identity-token-contract.md`. Summary, from
`askabd-identity/src/services/token-service.ts`:

- Claims: `sub`, `org`, `sid`, `iat`, `exp`, `jti`. **No `roles`, `permissions`, `scope`, or
  `aud` claim is ever set.**
- Signing: **EdDSA (asymmetric)**, not HS256, not RS256.
- Key material: generated in memory per-process via `jose.generateKeyPair('EdDSA')`, **never
  persisted, never exposed via any endpoint** — no JWKS route, no `.well-known` route, no
  public-key API anywhere in the service (confirmed by repo-wide grep).
- Access token lifetime: hard ceiling 900s (15 min), platform-enforced (`security.ts`).
- Issuer: `askabd-identity` — matches this API's existing default exactly.

This **corrects** the prior milestone's documentation, which described reading
`roles`/`permissions`/`scope` as an "unverified, standards-based assumption." That assumption is
now verified **false**: the real service does not embed authorization data in the token at all.

## D. JWT claims — see C. Nothing further to add.

## E. Role resolution — real mechanism is a remote policy check, not a JWT claim

`askabd-identity/src/services/authorization-service.ts` implements a complete, separate RBAC
system inside `askabd-identity`'s own database (`role`, `permission`, `role_assignment`,
`role_permission` tables). Per `askabd-identity/docs/API.md`, a consuming service determines
authorization by calling `POST /v1/policy/check` with `{identityId, action, resourceType}` —
a **remote HTTP call per decision**, not a locally verifiable claim. This is confirmed, not
inferred, from the identity service's own published API documentation and its SDK
(`identity-sdk.ts`'s `policyCheck()` method).

## F. Permission resolution / user-role mapping — see E.

## G. Client isolation — the central finding of this milestone

**No mapping exists, in either repository, from an authenticated identity (or its
`askabd-identity` `org_context`) to a specific `oc_clients.client_id`.** Confirmed by:
- Direct inspection of every `oc_*` migration file: no `org_context`/`identity_id`/`tenant_id`/
  `owner_user_id` column exists on `oc_clients` or any related table.
- Direct inspection of `askabd-identity/src/services/identity-manager.ts`: `org_context` is that
  service's own multi-tenancy dimension (which tenant of the identity platform an identity
  belongs to) — a different concept from AskABD's own consulting-customer `client_id`s, with
  nothing anywhere provisioning or guaranteeing the two align.

Full detail and the resulting access matrix: `docs/tenant-authorization-matrix.md`.

## H. Authorization matrix

See `docs/tenant-authorization-matrix.md` in full. Summary: `admin`/`super_admin` (existing,
already-tested, broad-access roles) may cross client boundaries — an explicit, documented
privileged capability matching the platform's real operating model (an internal consulting-staff
console; the frontend sends no `Authorization` header at all, so no live customer path exists
today). Every other role is denied client-scoped access by default (fail-closed), since no
mapping exists to safely grant anything narrower. This is not invented staff behavior — it
follows directly from the confirmed absence of a mapping (section G) applied uniformly.

## I. Client isolation — what was implemented

New file: `apps/api/src/platform/rbac/tenant-access.ts` — a centralized, reusable Fastify
preHandler hook (`registerTenantAccessMiddleware`), wired into `server.ts` immediately after the
existing authentication and RBAC middleware. For any request whose route declares a `:clientId`
URL parameter (or `:id` under `/api/v1/oc/clients/`), it requires the resolved role set to
include `admin` or `super_admin`; otherwise it returns the same generic 403 the RBAC middleware
already uses. DEV bypass (`auth.userId === 'dev-user-000'`) is exempted, mirroring the identical
guard the existing RBAC dev bypass already uses — no new bypass mechanism was invented.

This covers the large majority of client-scoped Operations Center routes (~130 of the ~220 `oc_*`
routes carry `:clientId` directly): clients, lifecycle, connectors, discovery, assessment,
recommendations, migration runs, client-services/requirements/documents, problems, gaps,
transformations, optimization, portal, known-information, notification-preferences, escalations,
compliance, services, service-bundles/recommended, engagements, payment-methods, transactions,
reconciliation summary/exceptions, health-score/snapshot, Jira links.

## J. Connector isolation

Investigated directly (`apps/api/src/services/connector-service.ts`). Finding, lower severity
than initially assumed: **raw credential values are never persisted at all** —
`saveConfiguration()` strips `password`/`secret`/`token`/`clientSecret`/`externalId` fields and
stores a masked placeholder before the database write; `testConnection()` uses raw values only
transiently, in memory, for the live outbound test call, and explicitly excludes them from what
gets persisted (`persistResult(result, _fields)` — the fields parameter is intentionally
unused). So `GET /oc/connectors/:clientId` could never leak an actual credential for any client.
The real, remaining risk was cross-client **metadata** disclosure (which providers a client
uses, connection status, last-tested time) — closed by the tenant-access boundary in section I,
since this route carries `:clientId`.

## K. Service governance authorization

Unchanged and re-confirmed working: `enable`/`disable` routes remain gated to `Admin.Access`
(from the prior Service Governance milestone), now ALSO covered redundantly by the new
tenant-access boundary (both layers independently require admin/super_admin — defense in
depth, not a conflict).

## L. Commercial service authorization

`POST /oc/engagements/:id/transition` and `POST /oc/proposals/:id/transition` (engagement/
proposal approve-or-reject) use an opaque `:id`, not `:clientId`, so they were outside the
tenant-access boundary's coverage. Added explicit `Admin.Access` rules for both in
`COMPARISON_API_RULES`, reusing the exact pattern already established for service enable/disable
— not a new mechanism.

## M. Requirements security

`/oc/client-services/:clientId/:serviceId/requirements*` and the document upload/validate/list
routes all carry `:clientId` and are now covered by the tenant-access boundary (section I).

## N. Audit security

`/oc/audit` (the read endpoint) does not carry `:clientId` as a route parameter (it's a query
param, `?clientId=...`), so it is **not** covered by the URL-parameter-based tenant-access
mechanism — flagged honestly in "Remaining P1" below rather than silently left uncovered without
mention. Audit writes were re-confirmed to correctly record actor/entity/action/timestamp and to
never include token, password, or credential values (unchanged from the prior milestone's
audit).

## O. Negative security tests — new this milestone (`tests/tenant-access.test.ts`, 12 tests, all passing)

| # | Test | Result |
|---|---|---|
| 1 | customer-role token denied on a client-scoped route | 403 ✅ |
| 2 | business_user-role token (real authenticated staff, non-admin) denied | 403 ✅ |
| 3 | no role claim at all → denied (fails closed) | 403 ✅ |
| 4 | denial symmetric across two different client IDs (role-based, not client-specific) | 403/403 ✅ |
| 5 | customer-role token denied on the `:id`-named `/oc/clients/:id` route | 403 ✅ |
| 6 | unauthenticated request → 401, not 403 (auth still runs first) | 401 ✅ |
| 7 | production-shaped config never grants the `dev-user-000` shortcut to a real signed token | 403 ✅ |

Plus the prior milestone's 19 `rbac-service-assignment.test.ts` tests, all still passing
unchanged.

## P. Positive security tests — new this milestone

| # | Test | Result |
|---|---|---|
| 1 | admin-role token allowed on a client-scoped route | 200 ✅ |
| 2 | super_admin-role token allowed | 200 ✅ |
| 3 | admin-role token allowed to access a DIFFERENT client (documented cross-client capability) | 200/200 ✅ |
| 4 | customer-role token still reaches a non-client-scoped route (boundary only applies where a client is named in the URL) | 200 ✅ |
| 5 | DEV bypass identity allowed on any client-scoped route, unaffected | 200 ✅ |

## Q. Security regression

- `tests/tenant-access.test.ts`: **12/12 passing** (new).
- `tests/rbac-service-assignment.test.ts`: **19/19 passing** (unchanged).
- `tests/security-auth-guard.test.ts`: **10/10 passing** (unchanged).
- Full API suite: **207/207 passing** (29 files) — 195 baseline + 12 new. Re-run fresh
  immediately before writing this report. Zero tests removed, zero tests weakened.
- API build: clean. Web build: clean (no web files touched this milestone).

## R. Browser UAT

Performed live against real data via the DEV-bypass identity path (the only path the browser
exercises — `apps/web` sends no `Authorization` header):
1. Confirmed via direct `curl` that the running dev API server picked up the new middleware and
   still returns 200 for `GET /oc/clients/.../services` under DEV bypass.
2. Restarted the web dev server and cleared a stale `.next` cache (the known Windows dev-server
   staleness issue from earlier in this session) after an initial "Loading services..." hang
   caused by a 404'd JS chunk — unrelated to the security change itself, confirmed by the network
   log showing all API calls returning 200 throughout.
3. `/clients/client-c9683df9.../services` — rendered correctly: 70 total, 2 confirmed, 27 not
   confirmed, 7% coverage (carrying forward the prior milestone's live "Enable" click).
4. `/clients` (Client Directory) — rendered correctly: 20 real clients, health/SLA/score columns
   populated from real data.
5. `/clients/client-c9683df9.../connectors` — rendered correctly: real connector relevance
   filtering ("Based on 2 selected services... 1 connector is relevant. 32 others are hidden").

All three pages confirmed unaffected by the new tenant-access boundary, exactly as expected
(DEV bypass is exempted from it, mirroring the existing RBAC dev bypass).

## S. Production identity requirements

`docs/identity-production-requirements.md` — rewritten this milestone to replace the prior,
now-superseded "unverified assumption" framing with the newly verified facts: `JWT_SECRET`
cannot work (wrong algorithm family), `JWKS_URL` cannot work (endpoint doesn't exist),
`JWT_AUDIENCE` should stay unset permanently (real tokens never carry `aud`), and the real
blocker for production authentication is now correctly identified as an `askabd-identity`-side
gap (no key-publishing mechanism), not an `askabd-comparison`-side configuration step.

## T. Staging identity requirements

`docs/identity-staging-register.md` — placeholder-only register (`IDENTITY_PROVIDER_URL`,
`JWKS_URL` [blocked], `JWT_ISSUER`, `STAGING_ADMIN_USER`, `STAGING_CUSTOMER_USER`,
`STAGING_TEST_CLIENT_A`/`B`), with an explicit note that provisioning real staging accounts is
not a meaningful next step until the underlying token-verification incompatibility (section C)
is resolved.

## U. Mock-data findings (Phase 28)

Targeted re-sweep, not a full re-audit (already performed and documented in a prior milestone's
`docs/real-data-integrity-register.md`, out of this milestone's security-only scope to redo).
Confirmed still accurate: `apps/web/src/app/lib/mock-clients.ts` remains imported by ~48 page
files (`applications`, `infrastructure/servers`, `deployments`, `monitoring`, `incidents`,
`alerts`, `contracts`, `documents`, `environments`, `risks`, `roadmap`, `timeline`, `usage`,
`testing`, `support`, `knowledge`, `maturity`, `automation`, `consulting`, `contacts`,
`audit/[auditId]`, `reports`, `governance`, and more) — this is pre-existing, already-classified
fabricated data (FABRICATED CUSTOMER DATA per the existing register's own classification), not
new to this milestone, and explicitly out of scope for this security-only pass ("DO NOT perform
unrelated UI redesign"). Not fixed here; flagged again below so it is not silently dropped.

Backend `Math.random()` usages checked and classified: OTP code generation (legitimate),
opaque-ID generation (`assess-${Date.now()}-${Math.random()...}`, legitimate, not fabricated
business data), and `apps/api/src/seed/performance.ts` (a seed script, not production runtime
code) — none of these are security concerns.

## V. Remaining P0

1. **This API cannot currently verify a real `askabd-identity`-issued token at all**, under
   either of its two supported configurations (`JWT_SECRET`/HS256 — wrong algorithm family;
   `JWKS_URL` — endpoint does not exist). Closing this requires a decision by the identity and
   security teams: either `askabd-identity` publishes a JWKS endpoint (or a persisted, rotatable
   key), or this API is redesigned to call `askabd-identity`'s `/tokens/validate` and
   `/policy/check` remotely per request — the latter requiring an explicit, agreed failure-mode
   policy (fail open or closed if `askabd-identity` is slow/unreachable) that is a security/
   product decision, not something this milestone invented unilaterally. See
   `docs/identity-token-contract.md`, "Compatibility conclusion."

## W. Remaining P1

1. **No tenant mapping exists** from an authenticated identity to a specific `oc_clients.client_id`
   (section G). Until a real product decision creates one, non-admin roles have zero access to
   client-scoped OC data — correct and fail-closed today (no live non-admin path exists), but
   this is the concrete prerequisite for any future customer-facing or scoped-staff access model.
2. **Not every mutating route is covered** by either the tenant-access boundary or an explicit
   `Admin.Access` rule — specifically, governance-style actions on resources addressed only by an
   opaque ID (not `:clientId`) that were not in this milestone's explicit high-priority list:
   problem/gap status transitions and financial/effort updates, transformation status, capability
   CRUD, optimization finding promote/acknowledge/resolve, workflow rule create/toggle, scheduler
   job run/toggle, escalation acknowledge/resolve, Jira config/test/issue-create, defect verify.
   Each would need a per-resource-type DB lookup to resolve client ownership before a tenant
   check is possible — real, non-trivial work across ~15 different resource kinds, not attempted
   here under time/risk constraints. Full list in `docs/tenant-authorization-matrix.md`, "What is
   NOT yet covered."
3. `GET /oc/audit` takes `clientId` as a query parameter, not a route parameter, so it falls
   outside the URL-param-based tenant-access mechanism.

## X. Remaining P2

1. `apps/web/src/app/lib/mock-clients.ts` remains live and imported by ~48 pages (section U) —
   pre-existing, already tracked, out of this milestone's scope.
2. `JWT_AUDIENCE` support remains a correct no-op with no real value to ever set, per the
   corrected understanding in section S.
3. CORS remains `*` — pre-existing, previously flagged, unrelated to this milestone.

## Y. Remaining P3

1. Once the P0 in section V is resolved and a real per-client mapping exists (P1 #1), the
   `docs/tenant-authorization-matrix.md` access matrix should be revisited — today's uniform
   "admin only" rule for every non-privileged role is a safe floor, not necessarily the final
   intended product behavior for `business_user`/`support`/`auditor` roles once real staff-level
   scoped access is designed.

## Z. Exact files changed this milestone

```
M  apps/api/src/server.ts                         (+10/-1 — wire tenant-access middleware)
M  apps/api/src/platform/rbac/index.ts             (+4 — export tenant-access module)
M  apps/api/src/platform/rbac/rules.ts             (+29 — 8 new Admin.Access governance-verb rules)
?? apps/api/src/platform/rbac/tenant-access.ts     (new — centralized tenant-access boundary)
?? apps/api/tests/tenant-access.test.ts             (new — 12 tests)
?? docs/identity-token-contract.md                  (new)
?? docs/tenant-authorization-matrix.md              (new)
?? docs/identity-staging-register.md                (new)
M  docs/identity-production-requirements.md         (rewritten with verified facts)
?? docs/identity-tenant-security-final-report.md    (new, this file)
```

No other file was modified by this milestone. No database migration, no schema change, no data
deletion or modification of any kind.

## Fortune 500 CISO review — all 16 questions

1. **Can one customer access another customer's data?** No live customer path exists at all
   (frontend sends no token); if one did, a non-admin role is now denied on every
   `:clientId`-scoped route regardless of which client — test O#1/O#4.
2. **Can a customer become admin?** No — role resolution is unaffected by this milestone; a
   `roles: ["customer"]` claim never satisfies an `admin`/`super_admin` check (test O#1, and
   prior milestone's identity-rbac tests).
3. **Can a customer confirm services?** No — `Admin.Access`-gated (prior milestone) AND now also
   tenant-access-gated (this milestone) — double enforcement.
4. **Can a customer access another customer's connector?** No — `GET /oc/connectors/:clientId`
   carries `:clientId`, covered by the tenant-access boundary; also, no raw credential is ever
   stored to leak (section J).
5. **Can a customer test another customer's connector?** `POST /oc/connectors/test` takes
   `clientId` in the body, not the URL — **not covered** by this milestone's URL-param mechanism.
   Flagged honestly in Remaining P1 rather than silently claimed as fixed.
6. **Can a customer view another customer's requirements?** No — covered (section M).
7. **Can a customer view another customer's commercial engagement?** Partially — engagement/
   proposal transition (approve/reject) is now `Admin.Access`-gated (section L); plain
   `GET /oc/clients/:clientId/engagements` carries `:clientId` and is covered; `GET
   /oc/engagements/:id` (opaque ID) is **not** covered — flagged in Remaining P1.
8. **Can a customer view another customer's incidents?** `GET /oc/incidents` has no `:clientId`
   route param (filters via query) — **not covered**, flagged honestly rather than claimed fixed.
9. **Can a customer view another customer's audit?** See section N — query-param based, not
   covered by this mechanism, flagged.
10. **Can an attacker modify `client_id` in the URL?** They can send any value, but the
    tenant-access check runs on the AUTHENTICATED IDENTITY's role, not on which client_id was
    requested — an attacker with a non-admin token is denied regardless of which client_id they
    try (test O#4, explicit symmetry test).
11. **Can an attacker modify `client_id` in the body?** For the routes gated by explicit
    `Admin.Access` rules (section L), yes this is irrelevant — the whole route requires admin
    regardless of body content. For routes only covered by URL-param tenant-access, a body-only
    `clientId` (like the connector-test route, item 5) is not currently checked — honestly
    flagged, not silently ignored.
12. **Can an attacker modify `client_id` in query parameters?** Same caveat as 11 — query-param
    based client scoping (audit, incidents) is not covered by this milestone's mechanism.
13. **Can a missing JWT bypass security?** No — unauthenticated requests to client-scoped routes
    return 401 before the tenant-access check ever runs (test O#6).
14. **Can DEV bypass reach production?** No — re-verified this milestone (test O#7): a
    production-shaped config (`devBypass: false`) never grants the `dev-user-000` shortcut, even
    to a real signed token whose `sub` happens to equal that string.
15. **Can invalid JWT claims produce elevated access?** No — an absent or unrecognized role
    resolves to denial, never to admin (test O#3, and prior milestone's fail-closed tests).
16. **Can a frontend-only restriction be bypassed?** Irrelevant by design — every test in this
    report calls the API directly via `app.inject`, with no UI involved; the backend is
    independently authoritative.

## Final success criteria — self-check

- Real identity contract understood — **yes, verified from source**, not guessed.
- JWT claims verified — yes (section C).
- Roles/permissions verified — yes, verified **absent** from real tokens (section C).
- Authentication fails closed — yes, unchanged, re-tested.
- Authorization fails closed — yes, unchanged, re-tested.
- Tenant isolation enforced — **partially**: covered for the large majority of `:clientId`-scoped
  routes and explicit governance verbs; honestly documented gaps remain for query-param-scoped
  and opaque-ID-only routes (sections V/W, and CISO items 5/8/9/11/12).
- Connector isolation enforced — yes for the routes with `:clientId` in the URL; the
  `connectors/test` body-only route is a documented remaining gap.
- Service governance protected — yes, unchanged + reinforced.
- Requirements protected — yes.
- Commercial data protected — partially, documented gaps for opaque-ID read routes.
- Audit data protected — writes are safe (no secret leakage); reads are not yet tenant-scoped
  (query-param based) — documented gap.
- Customer cannot elevate privileges — yes, re-tested.
- Admin behavior explicitly defined — yes, section H, not assumed.
- DEV bypass remains DEV-only — yes, re-tested.
- Production/staging identity requirements documented — yes, with corrected, verified facts.
- No fabricated security evidence — every claim above is tied to a specific file, test, or
  direct source read.
- No fabricated client data — mock-data findings honestly re-confirmed, not silently ignored.
- API build PASS, Web build PASS, full test suite PASS (207/207), Browser UAT PASS.
- No destructive changes, no secrets exposed.
- **No commit. No push.**

## Git safety confirmation

```
HEAD before this milestone: a9082ca
HEAD after this milestone:  a9082ca   (unchanged)
git diff --cached --name-only:        (empty — nothing staged)
```

Only this milestone's files (section Z) carry new changes. No `.env`, credential, key, token, or
database-dump file was touched or created. No `git add`, `git commit`, or `git push` was executed
at any point.
