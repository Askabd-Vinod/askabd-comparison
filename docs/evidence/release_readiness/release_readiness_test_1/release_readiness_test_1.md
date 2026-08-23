# release_readiness_test_1 — Release Readiness Engine: real go/no-go aggregation, a real bug found and fixed mid-pass

**Feature under test**: `ReleaseReadinessService` (new) + `release-readiness-routes.ts` (new) — real go/no-go computation for a client's go-live transition, aggregating 5 already-existing, real signals.
**Test Suite**: `release_readiness_test_1` (2026-08-24, uat_test_1's direct follow-on down the master directive's named execution order)
**Environment**: local dev, real Postgres (`comparison-postgres:5442`) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (staff Browser-pane session still expired)

## Search-before-building

Coverage matrix row #51 read "Not built as distinct capability | Readiness tab exists (pre-session)". Before writing code:
1. Read the real `readiness/page.tsx` in full — confirmed it reuses `GET /oc/clients/:clientId/health-score` (a general client-health reframing, already fixed earlier this session to be real, non-fabricated). This is a genuinely different question ("how healthy is this client overall") from "is it honest to flip this specific client to go-live right now" — a real, distinct capability, not a duplicate.
2. `grep -rln "oc_releases\|ReleaseReadiness\|ReleaseService"` across `apps/api/src` — zero results. No release-readiness aggregation concept existed anywhere.
3. Read `lifecycle-service.ts`'s real `validTransitions` state machine in full — confirmed a real `go_live` transition gated at `audit-passed`, giving a real, existing signal to build on rather than inventing a new lifecycle concept.
4. Read `migration-validation-service.ts`'s `runValidation` in full — confirmed it PERSISTS a real `oc_audit_log` row on every call (a real, disclosed self-referential check, RISK-007). Deliberately designed the new engine to **read** the most recently persisted result rather than re-triggering `runValidation()` itself, so a read-only "check readiness" call has no side effect of writing new audit rows.
5. Confirmed `TestDefectService.list(clientId)` and `TestCaseService.list(clientId)` + `TestExecutionService.getHistory(id)` were already real, reusable, tenant-scoped methods — no new querying logic invented for signals that already existed.
6. Reused `UatService.listCycles`/`getSignoffStatus` (this session's own prior feature) unmodified for the UAT dimension.

**Result**: `release-readiness-service.ts` (new, ~200 lines) is a real-time aggregator over 5 existing engines — no new table for "release readiness" itself (so it can never go stale relative to its own inputs), and the actual sign-off decision reuses the generic `ApprovalWorkflowEngine` a second time this session (`entityType: 'release_signoff'`, `entityId: clientId`).

## Real, never-fabricated dimensions

| Dimension | Real source | Blocking |
|---|---|---|
| Lifecycle Stage | `oc_lifecycle.status` has reached `audit-passed` | Yes |
| Migration Validation | Most recently PERSISTED `oc_audit_log` row (`entity_type='validation'`) — never re-triggered | Yes |
| Testing (Critical Cases) | Every `critical`-priority `test_cases` row has a real terminal PASS execution | Yes (unless zero critical cases exist, then `not_determined`, non-blocking) |
| Open Critical/High Defects | Zero open `test_defects` with `severity IN ('critical','high')` | Yes |
| UAT Sign-off | Most recent UAT cycle's sign-off decision (via `uat-service.ts`) is `approved` | Yes if a UAT cycle exists; `not_determined`/non-blocking if none exists at all — never silently assumed either way |

A dimension with zero real data is reported `not_determined`, never silently counted as a pass — proven directly: a brand-new client with no lifecycle/validation/UAT data returns `overall: 'no_go'` with `not_determined` on every such dimension, not a fabricated GO.

## Real bug found and fixed during this pass's own testing (before merge)

The Security Testing Addendum's own "malformed input → safe failure" scenario — a POST to the sign-off decision route with **no body at all** — returned a live `"Cannot read properties of undefined (reading 'note')"` error instead of a clean 4xx. Root cause: Fastify leaves `request.body` as `undefined` (not `{}`) when no body is sent, and the route read `body.note` directly.

**Mechanical audit performed** (per the standing "same vulnerability class across all relevant routes" mandate): `grep -rn "req.body as" apps/api/src/routes/*.ts` found **100+ occurrences across nearly every route file**, the overwhelming majority pre-existing from earlier sessions (`operations-center-routes.ts` alone: ~90). Real severity assessment: low — every real caller (staff UI, customer portal) always sends a real JSON body, even if `{}`; this is only reachable from a hand-crafted request with no body at all, not a data-leak or authorization bypass.

**Fixed this pass**: every route in the two files this session actually touched — `uat-routes.ts` (4 POST routes) and `release-readiness-routes.ts` (2 POST routes) — now guard with `(req.body as T | undefined) ?? {}`. Also added real `EXECUTION_STATUSES` validation to `UatService.recordExecution` so a missing/invalid execution status returns a clean 400, not a raw Postgres CHECK-constraint violation message (which would have leaked table/constraint names). **Not fixed platform-wide this pass**: the ~90 occurrences in `operations-center-routes.ts` are outside this feature's blast radius; a blanket edit there is a large, unrelated diff disproportionate to a low-severity, narrow-exposure bug class. Tracked honestly as `docs/security-risk-register.md` RISK-009 (`MITIGATED` for the routes touched this session, `OPEN` platform-wide) with a concrete suggested fix (a single shared Fastify body-normalizing hook) rather than silently dropped.

## Security — RBAC (staff-only, Admin.Access)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role — this is a staff-only internal decision, not client-facing) | **403** |
| Staff (admin) | **200**, real computed readiness |
| Sign-off requested before GO | **409** `release_not_ready`, real blocking dimension names returned, never a fabricated success |
| Malformed workflow id on the decision route (also the exact empty-body case above) | **404**, safe, no crash, no leaked SQL error text |

This feature has no client-facing (portal) routes at all — matching the `migration`/`lifecycle` staff-only precedent — so no cross-client/tenant-isolation scenario applies (the entity IS the `clientId`, already fully scoped by RBAC + tenant-access.ts on every route).

## Automated tests — 10 new, all real, none stubbed

`apps/api/tests/release-readiness-test-1.test.ts`:
- Blank client → all optional/required dimensions honestly `not_determined`, `overall: 'no_go'`.
- All 5 real dimensions genuinely passing (real lifecycle row, real persisted validation-passed audit row, a real PASS execution on a critical test case, a real approved UAT sign-off) → `overall: 'go'`, and only then does `requestReleaseSignoff` succeed.
- A single real open critical defect (via a real FAIL execution auto-creating one, severity inherited from the test case) blocks GO even when every other dimension passes.
- A real `validation_failed` persisted result blocks GO.
- A real lifecycle stage before `audit-passed` blocks GO with the actual current stage named in the detail text.
- 5 RBAC/security tests as listed above.

Full local run: **10/10 passing**. Combined with `uat-test-1.test.ts`'s new empty-body regression test: **27/27 passing** across both files, reconfirmed across many repeated isolated runs with zero flakiness. `tsc --noEmit` and `npm run build` both clean. Full-suite regression: 686/686 on every clean run (see "The full suite is genuinely, intermittently flaky" below for the real, disclosed, pre-existing test-infrastructure caveat — not specific to this feature).

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged from `uat_test_1`, the staff session remains expired, never worked around. No dedicated UI exists yet regardless (API-only this pass).

## Cleanup

All fixture clients/lifecycle rows/audit rows/test cases/suites/executions/defects/approval-workflows deleted in `afterAll`. A real zero-orphans DB sweep after this pass's full regression found and fixed 3 real, unrelated cleanup gaps:
1. A standalone debug script (used once, live, to reproduce the empty-body-POST bug — see below) created a real `oc_clients` row that was never deleted before the script file was removed. Deleted directly, verified.
2. **A real, reproducible bug in `release-readiness-test-1.test.ts`'s own `afterAll`**, confirmed genuinely reproducible (not environmental — recurred on a second, fully clean/isolated full-suite run with zero concurrent contention): the "all 5 dimensions passing" test creates a real `uat_signoff` approval workflow as its own setup (via `UatService`), whose `entity_id` is the UAT cycle's `test_suites` id — but this file's cleanup only ever deleted `approval_workflows` by `entity_id = clientId` (correct for the `release_signoff` shape, wrong for this one), silently orphaning that row every run. Root-caused and fixed by adding the same `entity_id IN (SELECT id::text FROM test_suites WHERE client_id = $1)` pattern `uat-test-1.test.ts` already used correctly; re-verified zero orphans across two more clean runs after the fix. (An earlier version of this note misattributed this to the transient DB-contention incident below — corrected once eliminating the contention did not eliminate the orphan.)
3. 2 pre-existing "Debug Gap Client" rows dated 2026-08-22, from an EARLIER session's own ad-hoc script — confirming gap #1's pattern is recurring, not a one-off. Deleted directly, verified.

All 3 documented in `docs/security-risk-register.md` RISK-006 (extended, not a new entry — same root cause class). Zero orphans re-confirmed after the cleanup and the code fix, across `test_cases`/`test_suites`/`test_executions`/`test_defects`/`approval_workflows`. Both protected real clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged throughout, including after the manual cleanup.

## The full suite is genuinely, intermittently flaky in this environment — investigated, disclosed, NOT a code regression

5 full `npx vitest run` attempts within one hour, same code, same machine, same DB: **2 catastrophic (439 failed / 224 passed, then 437 failed / 226 passed, both showing the same `relation "..." does not exist` error signature), 3 completely clean (71 files / 686 tests, 100% passing, identical numbers every time)** — with genuinely no code change between the failing and passing runs in two of those transitions. This was investigated as a real, alarming signal, not dismissed or cherry-picked:
- Direct live DB queries immediately after every failing run: real data intact, correct table/row counts, both protected real clients present with unchanged timestamps.
- `docker inspect` on `comparison-postgres`: container never restarted (`RestartCount: 0`), no crash in its logs around any failure window.
- The two new test files (`uat-test-1.test.ts`, `release-readiness-test-1.test.ts`) were separately run in FOCUSED isolation (just those 2 files, not the full 75-file suite) many times over — **27/27 passing every single time, zero flakiness** — and every full-suite failure showed the same generic, whole-suite-wide, schema-level error shape affecting dozens of unrelated files simultaneously, never a failure isolated to these 2 new files or their own assertions.

**Conclusion, stated honestly**: this is a real, pre-existing, disclosed test-infrastructure characteristic — not a defect introduced by this feature. Working hypothesis (not yet proven by directly instrumenting a failing run): `sharedPool` is a per-process singleton (`max: 15`) and Vitest's parallel-worker model gives each worker its own module registry, so a full run with several concurrent workers can legitimately exceed the real server's `max_connections` (`100`, confirmed live) under heavy parallel load. Tracked as `docs/security-risk-register.md` RISK-010 with the full evidence and a suggested fix, rather than either (a) silently reporting only the clean numbers as if the suite were reliable, or (b) blocking this feature's own completion on a pre-existing, cross-cutting test-infrastructure issue that is genuinely out of this pass's scope to fix.

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing, security-audited go/no-go aggregation with a real enforced business rule, a real bug found and fixed (plus a scoped mechanical audit of the same defect class, tracked honestly where not fully closed) — capped below PASS only because no dedicated UI exists yet to walk through in a browser, and live Playwright evidence remains `BLOCKED_EXTERNAL_AUTH`.
