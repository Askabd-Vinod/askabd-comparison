# risk_014_triage_test_6 — 22-route catalog group closed, plus 3 real Server-Component auth bugs found and fixed

**Directive**: master continuation/hardening directive §58 (RISK-014 remaining 22-route group — real per-route determination, real tests, real evidence, never asserted).
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## The 22-route group, closed

Every remaining route from the original 22-route catalog/reference
candidate list (2 of 22 already fixed in `test_3`) was individually
classified by reading its real backing table's actual schema via direct
query — not by re-reading the earlier "plausibly public, not individually
confirmed" note and trusting it.

**Real, previously-mis-assessed gaps found and fixed:**
- `GET /oc/workflow/rules` — `test_3` explicitly decided to leave this
  ungated, reasoning it was "genuinely global reference/config data."
  That reasoning is wrong: `oc_workflow_rules` has a real `client_id`
  column and `getRules()` has no client-scoping option at all — the same
  unscoped-aggregate-leak shape already fixed for `GET /oc/workflow
  /executions`. Not yet exploitable with real data (0 of 8 real rows
  currently have `client_id` set — verified directly, not assumed), but
  latent: the instant a real per-client rule is created, this route
  leaks it to any authenticated identity.
- `GET /oc/optimization/rules` — identical shape (`oc_optimization_rules`
  also has a real, currently-unused `client_id` column).
- `POST /oc/optimization/rules` — had no rule at all (its sibling `POST
  /oc/workflow/rules` already did).

All 3 now `Admin.Access`, live-proven, 17/17 in
`risk-014-triage-test-6.test.ts`. The superseded assertion in
`risk-014-triage-test-3.test.ts` was corrected (not deleted) to assert the
right behavior.

**Confirmed genuinely safe via real schema checks**: `GET
/oc/capabilities*` (7 routes), `GET /oc/scheduler/jobs` (real table is
`oc_scheduled_jobs`), `GET /oc/compliance/*` (4 routes, real backing table
`oc_control_mappings`), `GET /oc/service-bundles*` (2 routes), `GET
/oc/client-services/definitions` (static, no args) — none have any
`client_id` concept anywhere in their real query chain. Re-verified live
in the same test file rather than left as an unverified assertion.

**`GET /oc/jira/config` deliberately left as-is** — already a deliberate,
disclosed, accepted-risk decision from the 2026-08-24 triage pass (real
token masked; only `baseUrl`/`authEmail` visible); not re-litigated
without new evidence.

**`POST /oc/jira/issues` live-verified for the first time** — its own
code comment claimed tenant-access coverage; proven, not trusted: a real
customer token with a foreign `clientId` is denied (`403`,
`tenant_not_resolved`).

## A separate, more severe finding from the same investigative thread

Confirming `platform/workflows/page.tsx` (real caller of `GET
/oc/workflow/rules`) still worked post-fix led to checking whether it
sends an auth header — it doesn't, but is safe (a client component
covered by the pre-existing global `window.fetch` interceptor in
`staff-auth-guard.tsx`). This prompted a full, clean mechanical sweep of
the entire `apps/web/src/app` tree for the one class of file that
interceptor CANNOT help: Server Components (no `window` object exists
server-side).

**3 real, genuinely broken instances found and fixed:**
- `clients/[clientId]/layout.tsx` — wraps every client-scoped page,
  including all 10 Phase 3 engine pages; all 3 of its real fetch calls
  target `Admin.Access`-gated routes with no auth header.
- `clients/[clientId]/incidents/[incidentId]/page.tsx` — worse than
  degraded: a real, existing incident would render as a genuine 404.
- `clients/[clientId]/reports/page.tsx` — a pure auth failure was
  indistinguishable from genuine emptiness, contradicting the page's own
  "real counts" claim.

All 3 fixed via `apiSafe()` — the exact fix `lib/api.ts`'s own doc
comment already documents for "57 Server Components," missed for these 3.
A complete, fresh mechanical sweep (every file under `apps/web/src/app`,
excluding `(portal)`, with no `'use client'` and no `lib/api` import)
confirms zero remaining instances.

## A correction to this session's OWN earlier claim (test_4)

`risk_014_triage_test_4`'s "ocFetch" finding (17 functions / 11 files,
"would 401 for every staff user") was checked against the real
architecture and found overstated: all 11 consumer files are genuinely
client components under `(app)/**`, already covered by the pre-existing
global fetch interceptor before that fix was ever written. The `ocFetch`
fix itself remains correct (real defense-in-depth), but the severity
claim is corrected in the security register rather than left standing.

## Regression

- `apps/api/tests/risk-014-triage-test-6.test.ts`: 17/17 passing.
- `apps/api/tests/risk-014-triage-test-3.test.ts`: corrected assertion, re-passing.
- `tsc --noEmit` clean on both `apps/api` and `apps/web`.
- Full API regression: **95 files / 960 tests, all passing** (943 baseline + 17 new).
- `localhost:3001/4200/3100` all healthy throughout.

## FINAL STATUS: RESOLVED

RISK-014's full original 46+2-candidate audit (48 total) is now completely
triaged: every route individually classified with real evidence, no
remaining "plausibly safe, not confirmed" items. 3 genuinely broken
Server Components found via the same investigative thread and fixed,
independent of the RBAC finding that led to discovering them.
