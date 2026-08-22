# Final Adversarial Security Audit

**Date:** 2026-08-19. This is the audit explicitly demanded before any completion claim: "Do not
accept the current green test suite as proof of security. Enumerate every API route and every
client-facing page, map each to authentication, authorization, tenant resolution, real database
source, and browser verification. For every opaque resource ID, trace the ID back to its owning
client server-side and prove cross-tenant denial with real identities."

This document **supersedes** the tenant-model claims in `docs/tenant-authorization-matrix.md` and
`docs/resource-authorization-register.md` (both dated 2026-08-17) — those were written before the
real identity/JWKS integration and the `client_identity_mapping` table existed, so their central
claim ("no tenant mapping exists anywhere, and cannot be invented this milestone") is **no longer
true**. Their route-by-route breakdown is otherwise still a valid historical record and is not
reproduced here in full — this document gives the current, re-verified state and the specific
deltas since.

---

## 1. What changed since the stale docs (verified against current code, not assumed)

| Claim in the 2026-08-17 docs | Current reality (2026-08-19) |
|---|---|
| "apps/web sends no Authorization header on any request — no live path presents a real, role-bearing identity" | **False now.** `staff-auth-guard.tsx`'s fetch interceptor attaches a real staff session's bearer token to every API call made from a guarded (internal-console) page; `client-portal` pages attach their own token via `authFetch` (`lib/session.ts`). Both are real, live, in production code paths — confirmed by reading the current source, not by re-running the old docs' searches. |
| "There is no trustworthy, existing way to answer which `oc_clients` row(s) an identity may see" | **False now.** `client_identity_mapping` (table + `ClientIdentityMappingService`) is the real, DB-backed answer, enforced in `tenant-access.ts`: `admin`/`super_admin` cross all boundaries; every other identity is checked against an *active* mapping row for its own `org_context`. |
| "DEV bypass grants super_admin unconditionally — the platform's actual current behavior in every environment used so far" | Still true for local dev (`devBypass` when `NODE_ENV !== 'production'` and no `JWKS_URL` configured), but this session proved the **real, JWKS-enforcing path** end-to-end with two genuinely distinct, non-bypassed identities (Section 3) — the DEV bypass is no longer the only path that has actually been exercised. |

## 2. API route enumeration — current coverage (re-counted, not carried over)

Direct count from `apps/api/src/routes/operations-center-routes.ts`: **226 Operations-Center
routes** (`grep -oE "\.(get|post|patch|put|delete)\('"`), plus the pre-existing e-commerce-catalog
surface (`platform/rbac/rules.ts` lines 20–52, unrelated product, unchanged this pass).

Coverage mechanism (two independent, composable layers, both re-read this pass):
- **`tenant-access.ts`** — applies to every route whose path or body/query carries a literal
  `clientId` field (or `:id` under `/clients/`). ~130 routes. Enforced via
  `client_identity_mapping` as described above.
- **`platform/rbac/rules.ts`** explicit `Admin.Access` grants — for routes identified only by an
  opaque, non-`clientId` ID (`:problemId`, `:gapId`, `:defectId`, `:escalationId`, `:findingId`,
  `:migrationId`, `:jobId`, `:ruleId`, `:entityId`, `:metricId`, engagement/proposal/transformation
  `:id`, etc.), where `tenant-access.ts` structurally cannot resolve an owning client from the URL
  alone. **111 explicit rules** exist in `rules.ts` today; **48 of them** are this class of
  opaque-ID governance/financial mutation-or-read gate (29 mutations + 19 reads — the 16 found in
  the prior milestone's audit plus 3 more found and closed in this pass, see below).

### New findings this pass, fixed

Re-deriving the opaque-ID route list directly from the route file (not from the prior docs) and
diffing against `rules.ts` surfaced **3 previously-uncovered client-data-bearing GET routes**,
confirmed against the real handler and real schema before fixing (not assumed):

| Route | Real handler | Real schema evidence it's client-owned | Fix |
|---|---|---|---|
| `GET /oc/service-actions/:entityId` | `OperationsCenterService.getServiceActions` → `SELECT * FROM oc_service_actions WHERE entity_id = $1` | `entity_id` is a client (or client-owned entity) ID for `entity_type='client'`; returns real `action`/`actor`/`reason`/`previous_state`/`new_state` operational history | Gated `Admin.Access` |
| `GET /oc/transformations/:id` | `DecisionTransformationService.getTransformation` | Row carries a real `client_id` column (confirmed via the adjacent audit-entry call using `tfm.clientId`) | Gated `Admin.Access` |
| `GET /oc/optimization/metrics/:metricId` | `ContinuousOptimizationService.getMetric` → `oc_metric_definitions` | `client_id TEXT NOT NULL` in the migration — every metric definition belongs to exactly one client, no shared/catalog rows | Gated `Admin.Access` |

Proven closed in `apps/api/tests/opaque-id-rbac.test.ts` (real fixtures via the real services, a
real customer token denied 403, a real admin token still genuinely allowed 200 with the correct
`clientId` echoed back). Confirmed via `grep` that none of the three has a caller anywhere in
`apps/web` today, so gating them breaks no live capability.

### Checked and confirmed NOT gaps (read the schema before concluding, per this session's standing rule)

| Route | Why it's correctly ungated |
|---|---|
| `GET /oc/compliance/frameworks/:frameworkId/controls` | `oc_compliance_frameworks`/`oc_compliance_controls` have no `client_id` column at all — a platform-wide catalog (SOC2/ISO27001-style framework definitions), not client data. |
| `GET /oc/compliance/controls/:controlId/related` | Same catalog, same reasoning. |
| `GET /oc/service-bundles/:id` | `oc_service_bundles` is a platform-wide package catalog (name/description/serviceIds/businessValue) — no per-client row. Matches the already-established "capabilities catalog" pattern. |
| `GET /oc/capabilities/:id` | Same catalog pattern — capability definitions, not client instances. |

## 3. Live adversarial cross-tenant proof — real identities, not test stubs (executed this pass)

Test-suite assertions prove the *rule* is correct against a synthetic Fastify app. This section
proves the **actual running dev API server**, with **real JWKS verification enabled** (not the DEV
bypass), denies a real, distinct identity — closing the gap between "the test passes" and "the
system, running for real, behaves correctly."

**Setup** (all real, all cleaned up after):
1. Dev API server relaunched with `JWKS_URL`/`JWT_AUDIENCE` as **inline env vars for that one
   process only** (never written to the shared `.env`, per the lesson learned earlier this
   session — doing so once already broke 60 tests reading the same file).
2. Two real, distinct identities registered via askabd-identity's actual HTTP API (create → verify
   → credential-store → login), in two different `org_context` values: `adversarial-org-a` and
   `adversarial-org-b`.
3. A real client created via the real staff API; a real `client_identity_mapping` row inserted
   mapping **only** `adversarial-org-a` to it (Org B deliberately left unmapped).
4. A real, sensitive payment method (`credit_card`, last4 `9999`) added to that client via the real
   `PaymentMethodService`.

**Live HTTP requests, real EdDSA-signed tokens, against `http://localhost:4200`:**

| Request | Expected | Actual |
|---|---|---|
| User B (unrelated org, no mapping) reads Client A's payment method, no `?clientId=` (the exact bypass shape found earlier this session) | 403 | **403** |
| User A (legitimately mapped) reads the **same** payment method | 403 (this route is staff-only regardless of tenant mapping — `Admin.Access`-gated, not tenant-scoped) | **403** |
| User B reads Client A's client record (`GET /oc/clients/:id`, tenant-access-gated) | 403 (no mapping) | **403** |
| User A reads the same client record | 200 (real, legitimate mapping) | **200** |
| User B attempts the same read via query-string ID tamper (`?clientId=`) instead of the path | 403 | **403** |
| No token at all | 401 | **401** |

All six real, live results matched the expected authorization outcome exactly. Fixtures (2
identities, 1 client, 1 mapping row, 1 payment method) deleted by exact ID afterward — confirmed
zero remaining rows for either identity ID.

## 4. Client-facing page enumeration

`apps/web/src/app` contains **~96 `page.tsx` routes**. Every one falls into exactly one of three
auth classes, enforced by exactly one mechanism each (verified by reading `layout.tsx` and
`components/staff-auth-guard.tsx` directly, not assumed from naming):

### Class A — Internal staff console (~91 pages: `/`, `/clients/**`, `/platform/**`, `/engineering/**`, `/intelligence/**`, `/migrations/**`, `/reports/**`, `/services/**`, `/settings`, `/welcome`, `/search`, `/monitoring`, `/deployments`, `/incidents`, `/infrastructure`, `/applications`, `/governance`, `/verify`)

- **Authentication:** `StaffAuthGuard` (`components/staff-auth-guard.tsx`), mounted globally in
  `layout.tsx`. On every guarded-path navigation: (a) requires a `staff-session` in
  `localStorage`; (b) makes a **real, live** `GET /oc/me` call with the stored token — a merely
  *present* session object is not trusted, an expired or revoked one is evicted and the user is
  bounced to `/staff/login` immediately, not just at the next full reload.
- **Authorization:** Client-side redirect is UX only — the actual boundary is server-side
  (`platform/rbac/middleware.ts` + `rules.ts`, resolving real DB-backed roles via
  `StaffRoleService`). Documented as such in the guard's own code comment; independently
  re-confirmed this pass by directly hitting the API with no/invalid tokens (Section 3, last row)
  and getting a real 401 regardless of what the browser UI would have shown.
- **Tenant resolution:** `admin`/`super_admin` cross all client boundaries by design (internal
  consulting-staff operating model — see `docs/tenant-authorization-matrix.md` §"Admin cross-tenant
  access", still accurate).
- **Real DB source:** every page under `/clients/[clientId]/*` fetches through
  `lib/operations-api.ts` against the real `apps/api` routes above — no page in this class reads
  client business data from `localStorage` as a source of truth (the last remaining instances of
  that were removed earlier this session — `lifecycle/page.tsx`, `client-command-center.tsx`,
  `onboarded-clients.tsx`, `verify/page.tsx`; see `docs/real-data-integrity-register.md`).
- **Browser verification:** spot-checked live this session for `/clients/[clientId]` (executive
  dashboard), `/migrations/[migrationId]` (async operation progress), `/staff/login` →
  `/clients` (post-login redirect); full continuous journey in Section 5.

### Class B — Customer portal (`/client-portal/[clientId]`, `/client-portal/[clientId]/journey`)

- **Authentication:** `getSession()` (`lib/session.ts`) checked client-side; redirects to `/login`
  if absent. All API calls use `authFetch`, which attaches the real customer bearer token.
- **Authorization/tenant resolution:** server-side, same `client_identity_mapping` boundary as
  Class A's non-admin path — a customer identity can only ever resolve `:clientId` values with an
  active mapping to their own `org_context`. Live-proven for the general mechanism in Section 3
  (User A/User B); the customer-portal-specific path was previously verified in this session's
  earlier client-invitation-and-login UAT work (`docs/askabd-client-auth-onboarding-final-report.md`).
- **Real DB source:** confirmed no fabricated/localStorage business data on these pages in the
  fabrication sweeps already completed this session (`docs/real-data-integrity-register.md`).

### Class C — Public/unauthenticated (`/login`, `/staff/login`, `/accept-invitation`)

- **Authentication:** None required to *reach* the page (that's the point) — each performs its own
  real credential exchange against askabd-identity (`/login`, `/staff/login`) or a real,
  single-use invitation token (`/accept-invitation`), never a client-side-only "success" state.
- **Tenant resolution:** N/A pre-authentication; `/login` explicitly asks for `org_context` since
  nothing infers it from an email alone (documented in the page's own comment, re-read this pass —
  accurate).

No page in any class was found reachable without going through one of these three real mechanisms
— there is no fourth, ungated path into `/clients/**` or `/client-portal/**` data.

## 5. Continuous fresh-browser journey, fabrication sweep, and P0–P3 classification

Tracked as separate, still-in-progress sections of this final pass — see the master status report
for current status of each; this document will be extended in place (not duplicated) as those
complete, consistent with "never represent anything as complete until verified."
