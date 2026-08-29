# risk_014_triage_test_4 — POST /oc/service-actions RBAC gap closed, plus a real, broader auth-header bug found and fixed

**Directive**: master continuation/hardening directive §30/§45 ("if one vulnerability is discovered, search for the same pattern throughout the application").
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Finding 1 — `POST /oc/service-actions` had no RBAC rule (its GET sibling did)

`GET /oc/service-actions/:entityId` was already `Admin.Access`-gated. `POST
/oc/service-actions` had no rule at all — `defaultPolicy: 'authenticated'`
only. `OperationsCenterService.recordServiceAction()` performs zero
entity-existence or ownership check on its caller-supplied
`entityType`/`entityId` (`oc_service_actions` has no FK to any real entity
table, confirmed by reading the INSERT directly) — so any authenticated
identity, a real customer token included, could POST an arbitrary
`entityType`/`entityId`/`actor`/`previousState`/`newState`, injecting a
fabricated service-state audit entry against ANY client or entity id, real
or invented.

**Fixed**: `rules.ts` — `POST /api/v1/oc/service-actions` now
`Admin.Access`, matching its GET sibling exactly. Confirmed via grep this
route's only real callers are staff `(app)` pages (`applications`,
`clients`, `services` list pages, via `ServiceControlsInline`) — never the
customer `(portal)` — so gating it breaks no live capability.

## Finding 2 — a real, broader, previously-undiscovered production reliability bug

Investigating Finding 1's real caller (`service-controls.tsx` →
`recordServiceAction` in `lib/operations-api.ts`) found `ocFetch` (the
shared fetch wrapper for **17 exported functions**, imported by **11 real
staff files** — client onboarding, edit, lifecycle, contracts, the dynamic
client overview, verify, remediation, file upload/download) sent **no
Authorization header at all**. The API's real auth middleware
(`middleware/auth.ts`) only ever reads `request.headers.authorization` —
no cookie fallback. This was invisible in local dev because the API's
`devBypass` (active when `JWKS_URL` is unset) treats every unauthenticated
request as a synthetic admin identity — the exact same root cause
`lib/staff-session.ts`'s own doc comment already documents for Server
Components' `apiSafe()` calls (found and fixed in an earlier session
milestone). This is that same bug class's **client-side sibling, in a
different file**, never previously found. In production (real JWT
verification active, matching this platform's documented security
posture), every one of these 17 functions would 401 for every staff user —
not a data leak, a real reliability break across 11 real pages/components.

**Fixed**: `ocFetch` now attaches the real staff session's bearer token
(`getStaffSession()`), with the same proactive-renewal-adjacent
retry-once-on-401 policy `staffFetch` already uses (`refreshStaffSession()`
on a genuine 401, retried once with the renewed token) — matching the
established pattern exactly rather than inventing a new one.

## Regression and security testing

- `apps/api/tests/risk-014-triage-test-4.test.ts`, 4/4 passing: customer
  token denied (403) on `POST /oc/service-actions`; unauthenticated denied
  (401); staff (admin) token not blocked; the already-fixed GET sibling
  re-confirmed still gated (no regression).
- `tsc --noEmit` clean on both `apps/api` and `apps/web`.
- Full API regression: **93 files / 936 tests, all passing** (932 baseline
  + 4 new).
- `localhost:3001` → 307, `localhost:4200/health` → 200 `database:
  connected`, `localhost:3100/v1/health` → 200; fresh browser tab shows
  zero console errors.

## FINAL STATUS: RESOLVED

Both findings closed the same pass they were discovered in — a narrow RBAC
gap and, more significantly, a real production-reliability bug affecting
11 real files, found by following the "same vulnerability pattern"
instruction past the first, smaller finding rather than stopping there.
`docs/security-risk-register.md`'s RISK-014 entry updated: `POST
/oc/service-actions` moves from "OPEN, untriaged, disclosed" to
`RESOLVED`; the `ocFetch` finding recorded as a new, related item.
