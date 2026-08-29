# dependency_analysis_ui_test_1 — Dependency Analysis Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3 / master autonomous directive.
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (`.auth/staff-state.json` absent, re-checked this pass).

## What was built

New tab, new page: `clients/[clientId]/dependencies/page.tsx`, new
"Dependencies" tab added next to API Discovery — the 11th and final engine
from the prior session's build phase to get a staff UI.

Deliberately **not** a list page: the real route surface has no "list all
dependency links" endpoint by design (`TraceabilityEngine` already owns
link storage; this engine only adds cycle detection + impact analysis on
top of it) — confirmed by reading the route file before designing the UI,
rather than inventing a listing endpoint that doesn't exist. The page is
therefore entity-picker-driven, matching the real API shape exactly:

- **Create a Dependency Link**: source/target entity pickers, each a real type selector (`risk`/`gaps`/`change_record`/`deployment`/`requirement` — the engine's own honest ownership-verifiable allowlist) plus a real record list sourced live from that domain's own already-wired engine (Risk Register, Gap Analysis, Change Management, Deployments, Business Requirements) — never a free-typed id, so every link this page can create is guaranteed to resolve against `verifyOwnership`.
- **Analyze an Entity**: same picker pattern; runs real cycle detection (`hasCycle` + the real `cyclePath`, rendered verbatim when a circular dependency genuinely exists) and real impact analysis (real counts of dependents/dependencies, plus the real path lists) — never a fabricated risk score, matching the engine's own header comment.

## RBAC

Already fully covered — `rules.ts:779-781`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/dependencies`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff credentials available — the authenticated flow (picking two real entities, creating a link, running cycle/impact analysis) could not be exercised live. Correctness rests on an exact contract match against `dependency-analysis-routes.ts` / `dependency-analysis-engine.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 10 of 10 previously-UI-less engines wired — Phase 3 engine-integration sweep complete

Risk, Change Management, UAT, Release Readiness, Data Mapping, Data
Reconciliation, Requirements Clarification, Executive Reporting, API
Discovery, Dependency Analysis — all now have a real staff UI, each
verified via a clean `tsc` build and a clean unauthenticated-redirect
browser check, none using fabricated data or a bypassed RBAC/ownership
check. Together with Deployment (real UI from an earlier milestone, never
lacking one — not part of this 10-page sweep), this closes the UI gap for
all 11 engines built in the prior session's engine-build phase.

**What this sweep does NOT claim**: none of these 10 pages have been
exercised through a real authenticated staff session — `staff-state.json`
never existed at any point across this entire pass, so every interactive
flow (create/mutate/transition button, form submission, live validation)
is untested beyond contract-matching against the real route/service code
and a clean compile. This is `IMPLEMENTED`, not `PASS`, for each page's
interactive behavior, per this session's own status-vocabulary rules —
recorded honestly here rather than upgraded to look more complete than it
is. The next genuine step, whenever authenticated Playwright becomes
available, is to re-run each of these 10 evidence passes end-to-end with
real PNG screenshots and real interaction, per the standing directive's
own requirement to automatically re-run blocked browser evidence the
moment authentication is unblocked.
