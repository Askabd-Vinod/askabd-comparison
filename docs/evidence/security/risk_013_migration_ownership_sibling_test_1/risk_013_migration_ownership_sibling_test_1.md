# migration_execute_validate_ownership_test_1 — RISK-013 fully resolved, plus a real 137-schema orphan discovery and fix

**Feature under test**: `MigrationExecutionService.getRun/validate/dryRun/execute` — the exact optional-`clientId` ownership pattern already proven for `rollback()`, applied to its siblings, plus the real `execute-async` route the web app actually uses.
**Test Suite**: `migration_execute_validate_ownership_test_1` (2026-08-25, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE" directive, Phase 1)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## The real fix

`clientId` optional everywhere — exactly matching `rollback`'s own already-shipped, backward-compatible shape. `getRun`'s ownership check is deliberately outside its own DB-query `try/catch` so a real mismatch is never silently swallowed as "not found." Extended to `POST /oc/migration/:migrationId/execute-async` too — beyond the originally-disclosed list — because that is the REAL route the web app's migration detail view calls for execution (the synchronous `/execute` is registered but unused by any real UI); leaving it unprotected would have made the `execute` fix real in name only. The real web UI updated to send `clientId` on all 3 newly-protected calls.

## A real syntax bug caught before it ever ran

Wiring `clientId` through `execute-async`'s fire-and-forget async callback left a stray duplicate `});` from the original code — caught immediately by `tsc --noEmit`, never reached a test run.

## A much larger, real, pre-existing discovery

Verifying this pass's own new test's cleanup surfaced **137 orphaned Postgres schemas** (`mig_<clientId>_<timestamp>`) — real schemas `execute()` created across many prior sessions' migration tests, left behind because schemas aren't rows in a table with a `client_id` foreign key (RISK-012's fix cannot reach them). Every one confirmed to have no corresponding live `oc_clients` row before any were dropped — zero false positives, both real protected clients confirmed unchanged before and after.

A full-suite regression run immediately after that cleanup found exactly **one new orphan**, proving this wasn't just historical — traced to a real, pre-existing bug in `operation-framework.test.ts` (unrelated to this pass's own changes): its cleanup dropped the source schema but never `plan.targetSchema`, the schema `execute()` actually creates. The exact same class of mistake this pass had just found and fixed in its own new test file. Fixed the same way; re-ran that file alone (9/9 passing) and confirmed zero orphans remain.

## Security — live proof (Security Testing Addendum)

`apps/api/tests/migration-execute-validate-ownership-test-1.test.ts`, 10/10 passing:

| Check | Result |
|---|---|
| `getRun`/`validate`/`dryRun`/`execute` — real Client B cannot access Client A's migration | blocked, `MigrationOwnershipError`, independently re-verified via `information_schema` that nothing happened |
| Omitting `clientId` | unaffected — backward compatible |
| Nonexistent migration id | `null`, not an ownership error |
| `POST /oc/migration/dry-run`, `POST .../validate`, `GET /oc/migrations/:id`, `POST .../execute-async` over real HTTP | mismatched `clientId` → **404**; correct `clientId` → succeeds |
| `execute-async` real completion | polled the real `oc_operations` row until genuinely non-running before asserting cleanup correctness |

## Regression and DB integrity

Full suite: **932/932 passing** (922 baseline + 10 new). `tsc --noEmit` clean. No migration this pass. Zero `mig_*` schemas remain (verified after every relevant run, including the final full-suite run). Both protected clients confirmed unchanged throughout.

## FINAL STATUS: RESOLVED

RISK-013 fully closed (5 methods + 1 additional real route). A real, large, historical orphan-schema backlog (137) discovered and safely cleaned, and its actively-recurring source (a real bug in an unrelated, pre-existing test file) found and fixed — not just a one-time cleanup.
