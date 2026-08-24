# uat_ui_test_1 — UAT Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3.
**Date**: 2026-08-25 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (unchanged, disclosed below).

## What was built

New tab, new page: `clients/[clientId]/uat/page.tsx`, new "UAT" tab
(segment `/uat`) added to `client-tabs.tsx` — deliberately distinct from the
pre-existing "Testing" tab, which is a different, unrelated real page
(`/connection-tests`). No prior page/tab existed at `/uat`.

Wired against `uat-routes.ts`'s **staff-management** surface only, by
design — matching the route file's own documented staff/customer-portal
split: the client executes test cases and requests sign-off from their own
portal (`/oc/portal/:clientId/uat/*`, out of scope for a staff page); staff
create cycles and decide sign-off. Building an execution-recording UI here
would have bypassed the entire point of the engine (the client's own
acceptance) — investigated the route file's header comment before deciding
scope, not assumed.

- **Create cycle**: real test-case picker sourced from `GET .../test-cases` (the already-real Testing Engine) — never a free-typed id list, so every cycle's `testCaseIds` are guaranteed real, existing test cases for this client.
- **Per-cycle progress**: `GET .../status` → real per-test-case latest execution status (pass/fail/blocked/skipped/not_executed/not_applicable) and aggregate progress counts — read-only, reflecting exactly what the client has recorded via the portal.
- **Sign-off decision**: shown only once a workflow exists; Approve/Reject/Request Changes wired to the real routes, reject/request-changes requiring a note (mirrors the Risk/Change Management acceptance-workflow pattern already established this pass).
- When no sign-off has been requested yet and outstanding test cases remain, shows the real reason honestly (`SignoffNotReadyError`'s own count) rather than a generic "not ready" message.

## RBAC

Already fully covered — `rules.ts:641-647`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health re-verified: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200 — same PIDs, nothing restarted.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/uat`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff (or client-portal) credentials available in this environment — the full authenticated flow (client executing test cases, requesting sign-off, staff deciding) could not be exercised live. Correctness rests on an exact contract match against `uat-routes.ts` / `uat-service.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 3 of 11 engines wired

Done: Risk, Change Management, UAT. Remaining: Release Readiness, Data
Mapping, Data Reconciliation, Requirements Clarification, Executive
Reporting, API Discovery, Dependency Analysis.
