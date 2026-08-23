# uat_test_1 — UAT Engine: real client execution + sign-off workflow, engine-reuse verified

**Feature under test**: `UatService` (new) + `uat-routes.ts` (new) — a UAT Cycle (`test_suites` row with `category='uat'`), real client-recorded test execution (`TestExecutionService.recordExecution`, unmodified), and a real sign-off decision (`ApprovalWorkflowEngine`, unmodified, `entityType='uat_signoff'`).
**Test Suite**: `uat_test_1` (2026-08-24 master directive pass — "UAT Engine" was the next genuinely NOT_STARTED feature per the coverage matrix)
**Environment**: local dev, real Postgres (`comparison-postgres:5442`) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (staff Browser-pane session still expired; user has not re-authenticated — never bypassed)

## Directive addressed

Section 48 of the 2026-08-24 master directive: verify current roadmap position, do not redo completed work, continue with the next feature. Coverage matrix row #50 ("UAT Engine") was the only Testing-family row still `NOT_STARTED`; rows #45-49 (Testing/Generation/Execution/Defect/Retest Engines) are already `PASS`/`IMPLEMENTED` with real prior evidence and were correctly NOT re-run.

## Search-before-building (per the "engines-first" mandate)

Before writing any code:
1. `grep -rn "UAT\|user acceptance\|sign.?off"` across `apps/api/src` and `docs/` — confirmed zero genuine UAT/sign-off concept existed anywhere; only incidental matches (`'uat'` as an *environment* enum value in unrelated services).
2. Read migration 049 in full: `test_suites.category` CHECK constraint **already includes `'uat'`**, but `grep -rln "test_suites\|TestSuite" apps/api/src/services/*.ts` returned zero files — genuinely unused schema, first real consumer this pass.
3. Read migration 040 + `approval-workflow-engine.ts` in full: a fully generic, already-tested, polymorphic (`entityType`/`entityId`) approval state machine (`draft → in_review → approved|rejected`, with a `changes_requested` loop) — reused unmodified for `entityType: 'uat_signoff'`.
4. Read `test-execution-service.ts` in full: `recordExecution(clientId, testCaseId, input, actor)` already tenant-scoped (re-checks `client_id` at the query layer independently of the caller), evidence-enforced (`MissingEvidenceError` on a PASS/FAIL with no real `actualResult`/evidence), secret-masked, and auto-creates a real `test_defects` row on FAIL — reused unmodified.

**Result**: `uat-service.ts` (new, ~250 lines) adds only what didn't already exist — the UAT "cycle" concept, the terminal-status business rule, and the object-level ownership checks tying the three engines together for a client-facing flow. No test-case, execution, evidence, masking, or approval-state-machine logic was duplicated.

## Real, enforced business rule

A sign-off cannot be **requested** until every test case in the cycle has reached a terminal execution status (`pass`/`fail`/`blocked`/`skipped`/`not_applicable`) — verified by a real `getProgress()` computation against real `test_executions` rows, not a client-supplied flag. Proven both at the service layer (`SignoffNotReadyError`) and the HTTP layer (`409 signoff_not_ready`).

## Object-level ownership — never trust an opaque cycle/workflow id alone

Every `UatService` method re-verifies the cycle (or, for sign-off decisions, the workflow's parent cycle) genuinely belongs to the caller's `clientId` before doing anything — including revealing whether the id even exists. "Doesn't exist" and "exists but isn't yours" return the **same** `UatCycleOwnershipError` → the same 404 shape, matching the established pattern from `DatabaseConnectionOwnershipError` etc.

**Real bug found and fixed during this pass's own testing** (not a pre-existing production bug — caught before merge): the route layer's generic error handler mapped "cycle not found" to `400` (a bare `Error`) but "cycle belongs to someone else" to `404` (`UatCycleOwnershipError`) — two different HTTP shapes for what should be indistinguishable to an attacker. Fixed by having `getOwnedCycle`/`getOwnedSignoffWorkflow` throw `UatCycleOwnershipError` in **both** cases, so a malformed or nonexistent id now returns the identical `404` a wrong-tenant id does. Regression test (`uat-test-1.test.ts`, scenario 7) added and passing.

## Security — minimum 7 scenarios (Security Testing Addendum), all executed as real HTTP requests through the full middleware stack

| # | Scenario | Result |
|---|---|---|
| 1 | Unauthenticated → staff route | **401**, DENIED |
| 2 | Staff (admin) → own client's cycles | **200**, ALLOWED |
| 3 | Client A's genuinely-mapped customer → Client A's own cycle (create attempt correctly 404 — no portal create route by design; read after staff-created cycle) | **200**, ALLOWED |
| 4 | Client A's mapped customer → Client B's cycles via portal URL | **403**, DENIED (tenant isolation) |
| 5 | Customer with no mapping at all → staff route | **403**, DENIED (insufficient role/no membership) |
| 6 | Client B's mapped customer → Client A's real cycle id via Client B's own portal URL (cross-client **resource id**, valid tenant boundary) | **404**, DENIED (object-level ownership, not just RBAC) |
| 7 | Malformed cycle id (SQL-injection-shaped string) → staff route | **404**, safe failure, no crash, no leaked SQL error text |

Plus two additional real, evidence-focused checks: the terminal-status business rule enforced at the HTTP layer (`409`, not a fabricated success), and evidence-enforcement on the real portal execution-recording endpoint (`400 missing_evidence` for a PASS with no evidence, `201` once real evidence is supplied).

## Automated tests — 16 new, all real, none stubbed

`apps/api/tests/uat-test-1.test.ts`:
- **Service layer (7 tests)**: foreign test-case-id rejected on cycle creation; sign-off refused while not all-terminal; full real PASS → request → approve flow (context carries real pass/fail counts); real FAIL auto-creates a real defect, then a real reject decision; empty-reason reject refused; execution against a test case outside the cycle refused; full object-level ownership sweep (get/list-executions/record/request-signoff all denied cross-client).
- **HTTP/RBAC/tenant-isolation layer (9 tests)**: the 7 minimum scenarios above, plus the business-rule-at-HTTP-layer and evidence-enforcement-at-HTTP-layer checks.

Full local run: **16/16 passing**. Full API regression: see below.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — the staff Browser-pane session expired earlier this session (documented in `connector_test_1_tls_ssrf_fastfollow`) and remains expired; per this session's standing rule, this was never worked around by entering a real password. No dedicated UI exists yet for the UAT Engine regardless (API-only this pass) — the coverage matrix caps this row at `IMPLEMENTED`, not `PASS`, for that reason independent of the auth block, matching the `migration_test_1` precedent (row #43).

## Cleanup

All fixture clients/orgs/test cases/suites/executions/defects/approval-workflows deleted in `afterAll` (FK-safe order, cascade-assisted); no QA client naming convention needed since these are ephemeral vitest fixtures, not persistent client-portal QA accounts. Zero rows left behind — verified via the same `afterAll` pattern already established across this session's other HTTP-layer test files.

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing, security-audited backend implementation with full RBAC/tenant-isolation/object-level-ownership coverage and a real enforced business rule — capped below PASS only because no dedicated client-facing UI exists yet to walk through in a browser (real, disclosed fast-follow) and because live Playwright evidence remains `BLOCKED_EXTERNAL_AUTH` pending the user's own re-authentication.
