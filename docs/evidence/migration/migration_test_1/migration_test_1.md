# migration_test_1 — Migration Validation Engine (real Universal Comparison Engine integration, not fabricated)

**Feature**: Migration Validation Engine (`runMigrationValidation`, `test-report-service.ts`) — reuses the real Universal Comparison Engine rather than building a parallel migration-specific comparator; extend, don't duplicate
**Test Suite**: `migration_test_1`
**QA Client**: `AskABD PW Migration Validation Test 1` (real ID: `client-feb6ec8e-b726-4141-b1e5-dd9eac17ef47` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane, live authenticated fetch) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (see below)

## Test objective

Row #43 of the coverage matrix already documented this capability as real
and IMPLEMENTED ("genuinely reuses Universal Comparison Engine") but
flagged it as needing a dedicated test suite, and noted it has no
dedicated UI surface yet. This pass: (1) closes a real, previously-unproven
gap — the only existing automated test proved the PASS path; a validation
that has only ever been observed to pass is not proven real — by adding a
genuine FAIL-path test; (2) live-verifies both the PASS and FAIL paths
against the real, running dev API server (not just vitest's in-memory
instance), through an authenticated in-page `fetch()` that inherits the
Browser pane's own live staff session — never touching or extracting the
session token itself.

## Why this was tested this way (real UI-surface scope, disclosed honestly)

`DatabaseConnectionsManager` only renders on the Lifecycle page once a
client's real lifecycle has progressed to the `connector-configuration`
stage (`page.tsx`: `currentServiceReq?.serviceId === 'connector-configuration'`)
— a real, multi-step platform gate, not reachable from a freshly-onboarded
client without first completing Security Validation and Environments
Registration. There is also no UI button anywhere that calls
`POST .../test-report/migration-validation` (row #43's own pre-existing
note: "Not yet surfaced in a dedicated UI"). Building either of those real
UI surfaces is a genuine, separate, disclosed fast-follow — out of scope
for proving the EXISTING capability is real. Given that, this suite's
QA-client and connection setup used the same real, already-established
`ClientDatabaseConnectionService`/comparison API used throughout this
session (no new mechanism), and the migration-validation call itself was
exercised live via an authenticated in-page `fetch()` against the real
running server.

## Test data (real, deliberately constructed)

- **PASS scenario**: two real Postgres connections both pointing at the
  same real dev database (`comparison`) — `Migration Source` and
  `Migration Source Mirror`.
- **FAIL scenario**: `Migration Source` (real `comparison` database, 203
  real tables) vs `Migration Target`, a genuinely SEPARATE, freshly-created
  real Postgres database (`mig_val_live_diff`, created via `CREATE
  DATABASE`) containing exactly one real deliberate table
  (`mig_val_live_extra_table`) — a real, substantial schema drift (203
  missing + 1 extra), not a contrived single-row diff.

## Expected result (predicted before running)

| Scenario | Predicted comparison summary | Predicted `execution.status` |
|---|---|---|
| PASS | 203 match, 0 missing/extra/mismatch | `pass`, no defect created |
| FAIL | 0 match, 203 missing, 1 extra | `fail`, a real defect auto-created |

## Forward result — matched exactly

**FAIL scenario** (run `cmp-2c55924a-e939-4f43-960d-5a2a29e6465d`): real
comparison summary — `match: 0, missing: 203, extra: 1, total: 204`.
Live `POST /oc/clients/:id/test-report/migration-validation` (authenticated,
via in-page fetch) returned `201`:
```
execution.status = "fail"
execution.actualResult = "0 matched, 203 missing, 1 extra, 0 mismatched, 0 unknown (of 204 tables)."
execution.defectId = "tdf-ea496d1d-9263-4d40-ae02-bd0afcea7681"   (a real defect, auto-created)
```

**PASS scenario** (run `cmp-fdc74654-ddf9-4f9c-a773-d609a46a5841`): real
comparison summary — `match: 203, missing: 0, extra: 0, total: 203`. Live
call returned `201`:
```
execution.status = "pass"
execution.actualResult = "203 matched, 0 missing, 0 extra, 0 mismatched, 0 unknown (of 203 tables)."
execution.defectId = null   (no defect fabricated for a real pass)
```

## Classification

Real, non-fabricated PASS/FAIL — the execution's own `status` is derived
directly from the comparison run's real, persisted `summary` (`totalDiffs
=== 0 ? 'pass' : 'fail'` in `test-report-service.ts`), never re-guessed or
hardcoded. Both directions of that logic (zero real diffs → pass; real
diffs → fail, with a real linked defect) were independently proven live,
not just by automated test.

## Automated tests

1 new test added to `testing-engine.test.ts` (now 15 total in that file):
creates a genuinely separate real Postgres database with one real
deliberate extra table, runs a real schema comparison, and asserts
`execution.status === 'fail'` with the correct real diff count in
`actualResult` — closing the real gap where only the PASS path had ever
been proven. The temp database is dropped in a `finally` block; verified
zero orphaned `mig_val_diff_*` databases remain after the run. Full API
regression: **66 files / 620 tests passing** (619 + 1 new). `tsc --noEmit`
clean.

## API evidence

Both live calls above captured verbatim from the real running dev API
(`localhost:4200`), via `fetch()` executed inside the authenticated
Browser-pane page (inherits the real live session automatically — the
session token itself was never read, printed, or handled by this agent
at any point).

## Database evidence

`GET /oc/comparisons/:id` for both real runs confirmed the persisted
`summary` matches the live migration-validation response exactly. The
temp `mig_val_live_diff` database was dropped after use — verified absent
via a direct `pg_database` query. Post-cleanup sweep confirmed zero
orphaned rows across all 70 client-scoped tables (including the real
`tdf-...` defect and the real `tc-...`/`tex-...` test case/execution rows
this pass created) for the QA client; both protected clients (`Test1`,
`client-9a2a1b23-...`; `AskABD Manual UAT 2026`, `client-19fa8f94-...`)
confirmed present and unchanged by exact ID+name immediately after cleanup.

## Playwright result

**`BLOCKED_EXTERNAL_AUTH`** — re-checked immediately before this pass;
`scripts/playwright-evidence/.auth/staff-state.json` still does not exist.
No real UI trigger exists yet for this specific capability either way (see
"Why this was tested this way" above), so real Playwright evidence for
THIS suite specifically will require both the auth export AND a future,
disclosed UI-surfacing pass — neither claimed as done here. No screenshots
were captured or persisted this pass; none fabricated.

## Cleanup result

Ran via the new reusable `scripts/playwright-evidence/cleanup-qa-client.mjs`
— exact id+name re-verified immediately before delete, full FK-ordered
delete across all client-scoped tables in one transaction (2 comparison
runs, 3 database connections, 1 test case, 1 test execution, 1 defect,
plus 30 further rows across 6 other tables — 36 total), zero orphans
verified via an independent post-delete sweep across all 70 tables. Both
protected clients confirmed unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Migration Validation Engine (`runMigrationValidation`) |
| Test Suite | migration_test_1 |
| Client | AskABD PW Migration Validation Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane, authenticated in-page fetch) |
| Automated Tests | 15/15 in `testing-engine.test.ts` (1 new); full API regression 620/620 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** — no approved auth mechanism available; no dedicated UI trigger exists yet either (both real, disclosed gaps) |
| Screenshots | None — `EVIDENCE_BLOCKED` for the mandatory PNG requirement this pass; none fabricated |
| Console | Reviewed — all logged errors on this page confirmed stale/accumulated from earlier, unrelated activity in this long-running Browser-pane session (webpack-hmr reconnects, an unrelated `4787.js` Next.js dev-server module error from a prior restart); the comparisons page itself rendered both real runs correctly with no visible crash after a fresh navigation |
| Network | PASS — every real request this pass returned 200/201 |
| API | PASS — real PASS and real FAIL both independently proven live against the running dev server, not just vitest |
| Database | PASS — zero orphans after cleanup; temp diff database cleanly dropped |
| Security | PASS — no credentials/tokens exposed; the live auth calls used the Browser pane's own already-authenticated session via in-page `fetch()`, never extracted or handled by this agent |
| Tenant Isolation | Not independently re-exercised this pass (standard tenant-access middleware applies uniformly; no new cross-tenant surface) |
| Evidence | This file |
| Failures Found | 1 real, previously-unproven gap (no FAIL-path test existed) |
| Failures Fixed | 1 (above) |
| Blocked | 1 — authenticated real-Playwright PNG evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | No dedicated UI exists yet for triggering migration-validation directly, or for reaching the Lifecycle page's connector-configuration stage without a full multi-step lifecycle walkthrough — both real, disclosed fast-follows. Retroactive PNG evidence for this suite is queued for the moment authenticated Playwright is available, per the standing rule. |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the standing AUTHENTICATED
PLAYWRIGHT EVIDENCE RULE (`EVIDENCE_BLOCKED` for the mandatory screenshot
requirement) even though the capability itself is genuinely real,
newly proven on BOTH the pass and fail path (not just pass), and
independently verified live against the actual running application —
never claimed PASS while real screenshot evidence remains blocked.
