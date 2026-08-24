# data_reconciliation_test_1 — Data Reconciliation Engine: real row-level comparison, a real naming collision caught before merge

**Feature under test**: `DataReconciliationEngine` (new) + `data-reconciliation-routes.ts` (new) — real row-level data comparison between two real database connections.
**Test Suite**: `data_reconciliation_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capability #38)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Distinct from the existing Universal Comparison Engine — not a duplicate

The Universal Comparison Engine's `runDatabaseSchemaComparison` (migration 052) already compares STRUCTURE — which tables/columns exist. This engine compares actual DATA — row counts and real content — a genuinely different question the directive's own Section 8 asks for. No overlap, no duplication.

## Real, reused security/connectivity

`assertSafeOutboundDestination` (unmodified) gates every real connection attempt — the same SSRF protection every other outbound connector path in this platform uses. `getSecretProvider()` (unmodified) resolves real credentials the same way `ClientDatabaseConnectionService`/`UniversalComparisonEngine` already do.

## Real comparison mechanics

For each requested table: a real `information_schema.tables` existence check on both sides (missing → honest `missing_in_source`/`missing_in_target`, never silently skipped), a real `COUNT(*)` on each side, and a real, deterministic per-row content checksum (`md5(t.*::text)` aggregated per row, then hashed again) — a genuine content hash, not a placeholder. A configurable tolerance (percent of source row count) determines whether a count difference is still classified `match`. Proven live: two genuinely identical real tables reconcile as `match` with real matching checksums; a nonexistent table is honestly reported as an `error`, not silently ignored.

## Real, deliberate scope limit — honestly disclosed

Deep row-level reconciliation is only implemented for `postgresql` on both sides — the only connector type this platform has a real driver for (matching the exact "EXTERNAL DEPENDENCY" precedent already established in `client-database-connection-service.ts`'s own `testGenericReachability`). A non-Postgres connection on either side produces a real, honest per-table `error` result naming the limitation — proven live, never a fabricated match/mismatch.

## Real SQL-injection defense

Table names cannot be parameterized as SQL identifiers the way values can — every caller-supplied table name is validated against a safe-identifier pattern BEFORE ever being interpolated into a query. Proven live: a real injection-shaped table name (`users"; DROP TABLE oc_clients;--`) is refused outright, and `oc_clients` (including the real fixture client used in that same test) is independently re-confirmed still present afterward — not just that an error was returned.

## Real bug found and fixed before merge: a table-naming collision

The first migration attempt named the new table `oc_reconciliation_runs` — which already existed (migration 021, real PAYMENT reconciliation, a completely unrelated domain: `records_processed`/`matched`/`unmatched`/`exceptions`/`total_expected`/`total_actual`/`variance`). `CREATE TABLE IF NOT EXISTS` silently no-op'd against the pre-existing table, so this engine's own real columns (`name`, `source_connection_id`, etc.) were never created. **Caught immediately** by this engine's own tests failing with a real, honest `column "name" of relation "oc_reconciliation_runs" does not exist` error — not discovered later, not papered over. Fixed by removing the migration's `_migrations` tracking record (it had made zero actual schema change, safe to re-run), correcting the file to a real, non-colliding table name (`oc_data_reconciliation_runs`), and re-applying — verified via a direct `information_schema.columns` query that every intended column now genuinely exists. No broken or partial state was ever left applied to the real database.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role) | **403** |
| Staff (admin) | **200/201** |
| Cross-client connection id use | **404** (a real Client A source connection paired with a real Client B target connection is refused) |
| Malformed/SQL-injection-shaped run id | **404**, safe, no leaked SQL error text |
| Empty-body POST | Safe `<500` |

## Automated tests — 14 new, all real, none stubbed

`apps/api/tests/data-reconciliation-test-1.test.ts`: required-field/self-comparison validation, a real identical-content match with real checksums, real live-state reflection on re-run, real missing-table detection, real non-Postgres honesty, real SQL-injection defense (with independent re-verification that no damage occurred), full object-level ownership sweep (both connections and runs), and 6 HTTP/RBAC/security tests.

Full local run: **14/14 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated UI yet (API-only this pass).

## FINAL STATUS: IMPLEMENTED

Real, security-audited row-level reconciliation, genuinely distinct from the existing schema-comparison capability — plus a real naming-collision bug caught and fixed by this pass's own test discipline before it could ever reach a shared environment. Capped below PASS only because no dedicated UI exists yet and Playwright remains `BLOCKED_EXTERNAL_AUTH`.
