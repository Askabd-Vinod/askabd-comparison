# data_reconciliation_ui_test_1 — Data Reconciliation Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3 / master autonomous directive.
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (re-checked this pass — `scripts/playwright-evidence/.auth/staff-state.json` still does not exist).

## What was built

New tab, new page: `clients/[clientId]/data-reconciliation/page.tsx`, new
"Data Reconciliation" tab (segment `/data-reconciliation`), placed next to
the pre-existing "Reconciliation" tab. Verified before naming: the existing
tab is financial/payment reconciliation (`GET .../reconciliation`,
`.../reconciliation/exceptions`) — a genuinely different, unrelated engine;
this page is real, row-level source-vs-target data reconciliation
(`oc_data_reconciliation_runs`).

- **Run picker**: source/target connections sourced from this client's own real `GET .../database-connections` (never a free-typed connection id), tables entered as a comma-separated list, optional row-count tolerance percent. Client-side guards mirror the server's own `InvalidReconciliationInputError` checks (name required, at least one table, source ≠ target) — the server remains authoritative.
- **Run detail**: real summary counts (total/matched/mismatched/missing/errored — never fabricated), per-table results showing real row counts, row-count difference, tolerance flag, checksum match, and the engine's own `evidence` strings verbatim.
- **Honest scope-limit disclosure preserved exactly**: when either connection isn't `postgresql`, the engine returns a real per-table `status: 'error'` with an `EXTERNAL DEPENDENCY` evidence message — this page renders that status and message as-is (via the same `error` badge styling), never reinterpreting it as a pass or hiding it.

## RBAC

Already fully covered — `rules.ts:719-721`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- **Environment note**: this pass began with a full-stack outage (all 4 dev-infra containers + all 3 app services down, root-caused to a host Docker/WSL restart) — recovered first; see `docs/evidence/environment/local_environment_test_2/`. All checks below run against the freshly-recovered, verified-healthy stack.
- Multi-service health: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/data-reconciliation`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff credentials available — the authenticated flow (picking real connections, running a live Postgres-to-Postgres reconciliation, viewing per-table results) could not be exercised live. Correctness rests on an exact contract match against `data-reconciliation-routes.ts` / `data-reconciliation-engine.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 6 of 11 engines wired

Done: Risk, Change Management, UAT, Release Readiness, Data Mapping, Data
Reconciliation. Remaining: Requirements Clarification, Executive Reporting,
API Discovery, Dependency Analysis.
