# release_readiness_ui_test_1 — Release Readiness Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3.
**Date**: 2026-08-25 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (unchanged, disclosed below).

## What was built

New tab, new page: `clients/[clientId]/release-readiness/page.tsx`, new
"Release Readiness" tab (segment `/release-readiness`) added to
`client-tabs.tsx`. Verified before building that this is distinct from the
pre-existing "Readiness" tab (health-score dimensions) — this engine
computes a different, real go/no-go verdict from 5 hard operational gates
(lifecycle stage, migration validation, testing, open defects, UAT sign-off),
each independently re-derived from its own real source of truth server-side.

- Real GO/NO-GO banner — never client-computed, always the server's own `overall` verdict.
- Per-gate detail with real pass/fail/not_determined status and the server's own explanation text, `(blocking)` marked where relevant.
- **Request Release Sign-off**: disabled client-side when `overall !== 'go'` (matching the server's own `ReleaseNotReadyError` gate); on a 409 from a race (readiness changed between page load and click), the real blocker list from the error body is surfaced rather than a generic failure message.
- **Sign-off decision**: Approve/Reject/Request Changes once a workflow is pending, reject/request-changes requiring a note — same established pattern as Risk/Change Management/UAT this pass.

## RBAC

Already fully covered — `rules.ts:654-657`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health re-verified: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200 — same PIDs, nothing restarted.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/release-readiness`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff credentials available — the authenticated flow (viewing a real client's 5 gates, requesting/deciding sign-off) could not be exercised live. Correctness rests on an exact contract match against `release-readiness-routes.ts` / `release-readiness-service.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 4 of 11 engines wired

Done: Risk, Change Management, UAT, Release Readiness. Remaining: Data
Mapping, Data Reconciliation, Requirements Clarification, Executive
Reporting, API Discovery, Dependency Analysis.
