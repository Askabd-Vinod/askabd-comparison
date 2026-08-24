# risk_012_platform_fk_integrity_test_1 — RISK-012 resolved platform-wide, all 43 tables

**Feature under test**: Migration 067 — real `client_id → oc_clients(id) ON DELETE CASCADE` foreign keys added to the 39 tables migration 059 left disclosed and open.
**Test Suite**: `risk_012_platform_fk_integrity_test_1` (2026-08-25, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE" directive, Phase 1)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Scope

Migration 059 (2026-08-24) fixed the 4 tables in the Gap/Decision/Transformation domain and disclosed 39 more occurrences across 18 migration files as a genuinely separate body of work. This pass closes all 39.

## The real scale, confirmed before writing any SQL

A direct per-table orphan-count query against the real database found over 40,000 real orphaned rows: `oc_client_service_requirements` had 21,681 orphaned rows out of 21,761 total (99.6%); `oc_events` had 16,439 of 16,462 (99.9%). Sample orphaned `client_id` values were spot-checked and confirmed to be real, recognizable test/QA client patterns (`client-<uuid>`, `cert-client-alpha/beta/gamma`), not suspicious data. Both real protected clients (`AskABD Manual UAT 2026`, `Test1`) were independently confirmed — by directly querying their row counts in the two highest-volume tables — to have real, non-orphaned data that could never match the deletion condition, by construction (their `client_id` genuinely exists in `oc_clients`).

## Two real ordering bugs found and fixed before the migration ever ran cleanly

Both caught by the migration failing loudly on `npm run migrate` and rolling back atomically — verified after each failure: no row in `_migrations`, no partial constraint added, orphan counts unchanged.

1. **First attempt**: several of the 39 tables have real foreign keys to each other (`oc_baselines.metric_id → oc_metric_definitions.id`, `oc_workflow_executions.event_id → oc_events.id`, `oc_reconciliation_items.run_id → oc_reconciliation_runs.id`, and more) — confirmed via a direct `information_schema` query. Deleting a still-referenced parent row before its child failed with `oc_baselines_metric_id_fkey`. Fixed by re-deriving the delete order topologically (children strictly before parents), not by guessing.
2. **Second attempt**: `oc_engagement_pricing` — a table OUTSIDE the 39, not itself client-scoped — has its own un-cascaded FK to `oc_commercial_engagements` (`confdeltype = 'a'`, no cascade). 3 real orphaned pricing rows needed cleanup before their parent engagements could be deleted. Found via a second, broader query for every real FK anywhere in the database referencing INTO the 39-table set — confirming no other external child table had the same issue (the only other one found, `comparison_runs → oc_client_database_connections`, can never trigger it since that table has zero orphans).

## A real, expected downstream break — found and fixed properly, not weakened around

The new constraints correctly rejected 4 pre-existing test files that created rows against bare, non-existent client ids: `reliability-hardening.test.ts`, `commercial-engagement.test.ts`, `payment-reconciliation.test.ts`, `connection-tests-history.test.ts` — 46 tests failing with real FK violations on the first full-regression run after the migration. Per the standing "stop, find root cause, fix, repeat all affected tests" discipline: each fixed to create a real `oc_clients` row first (the same `minimalClient()` helper already established this session), never by loosening the constraint. All 4 files, 62 tests, now passing; the constraint itself was never touched.

A benign side-effect confirmed during investigation: `assessment-domains.test.ts`'s own deliberate negative test (`'a nonexistent client returns a real, honest failed result'`) triggered a real, pre-existing, already-caught `console.error('Failed to persist assessment: ...')` — `AssessmentService.persistAssessment` has always been a best-effort, non-fatal write (try/catch, never throws). The test's actual assertions (an honest `failed` status, empty findings) were unaffected before or after this migration — the only real change is that this exact negative-test scenario no longer silently writes a new orphaned `oc_assessments` row, confirmed by direct query (0 rows for `client_id = 'client-does-not-exist'`).

## Result

All 43 known occurrences (4 from migration 059 + 39 from this pass) now carry a real `client_id → oc_clients(id) ON DELETE CASCADE` foreign key. Verified by direct query: 43 `fk_*_client` constraints exist; zero orphans remain across all 43 tables.

## Regression and DB integrity

Full suite: **895/895 passing** (no new test files — a repair, not new coverage; the migration's first full-regression run showed 46 real failures across the 4 affected files, all now fixed). `tsc --noEmit` clean. Both protected clients (`AskABD Manual UAT 2026`, `Test1`) reconfirmed unchanged — same ids, same `created_at` timestamps, same real row counts in every affected table before and after.

## FINAL STATUS: RESOLVED

RISK-012 closed completely — zero of the originally-disclosed 43 occurrences remain open. Two real ordering bugs and one real downstream test-suite break were found and fixed properly (topological delete order derived from real schema queries; broken tests repaired by creating real fixtures, never by weakening the new constraint) rather than worked around.
