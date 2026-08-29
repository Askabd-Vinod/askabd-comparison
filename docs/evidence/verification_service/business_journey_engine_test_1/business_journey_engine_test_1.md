# business_journey_engine_test_1 — Business Journey Validation (Priority 1)

**Directive**: "CONTINUE ASKABD VERIFICATION & VALIDATION SERVICE" — Priority 1,
"COMPLETE BUSINESS-JOURNEY VALIDATION". Explicit constraint honored: *"Do not
merely call existing unit tests and claim the business journey passed."*
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## What this is

An extension of the existing Verification Service (v1, `verification_service_test_1`)
— not a rebuild, not a duplicate testing architecture (directive rule honored:
"DO NOT rebuild v1... continue extending the existing service architecture").
Adds a real **Business Journey Engine** that executes genuine end-to-end
business workflows against the live application and records a full,
directive-mandated result structure — never a wrapper around an existing
unit test relabeled as a "journey pass."

## Architecture

- **Database** (migration 069): `oc_verification_journey_runs` — exactly the
  directive's required field list: `preconditions`, `steps`, `expected_result`,
  `actual_result`, `api_result`, `database_result`, `security_result`,
  `audit_result`, `post_conditions`, `evidence`, `cleanup_performed`,
  `cleanup_evidence`, plus `client_id` (FK to `oc_clients`, `ON DELETE SET
  NULL`) and `run_id` (FK to `oc_verification_runs`, nullable — journeys can
  run standalone or as part of a larger verification run).
- **Service** (`business-journey-engine.ts`): `BusinessJourneyEngine` class +
  a `JOURNEY_DEFINITIONS` registry of all **17** directive-named journeys
  (client onboarding, assessment, discovery, database comparison,
  configuration comparison, migration, migration validation, security
  validation, release readiness, deployment, post-deployment validation,
  incident resolution, commercial engagement, workflow execution, report
  generation, client portal, marketplace). Each entry honestly declares
  `implemented: boolean`.
- **API** (`verification-routes.ts`, 4 new routes, all `Admin.Access`-gated):
  `GET /oc/verification/journeys` (registry), `POST
  /oc/verification/journeys/:journeyId/run` (execute), `GET
  /oc/verification/journeys/runs` (history), `GET
  /oc/verification/journeys/runs/:id` (detail).
- **UI**: extended the existing `/platform/verification` page with a
  "Business Journeys" section (registry with implemented/not-implemented
  badges, a Run button per journey, recent-run history), and a new detail
  page `/platform/verification/journeys/[runId]` rendering every real
  field: preconditions, steps, expected/actual result, API/DB/security/audit
  result blocks, post-conditions, cleanup outcome, and evidence.

## Honest scope: 3 of 17 fully implemented this pass

Per the directive's own "never overstate" rule and this session's standing
"do not create artificial work" instruction, **3 journeys are fully, deeply
real**; the other 14 are registered (so the full catalog is visible and
plannable) but return an honest `status: 'blocked'` result with the message
*"No real implementation exists for this journey yet"* — never a simulated
pass.

1. **Client Onboarding** (`client-onboarding`) — creates a real disposable
   client via `OperationsCenterService.createClient`, verifies the real DB
   row, asserts a real RBAC denial (`GET /api/v1/oc/clients/:id`
   unauthenticated → 401), asserts a real `oc_audit_log` entry, then deletes
   the client and independently re-verifies deletion.
2. **Report Generation** (`report-generation`) — creates a real client,
   calls `ExecutiveReportingEngine.generateReport` for real, asserts the
   report references the real client, asserts a real RBAC denial on the
   report export route, then cleans up with independent re-verification.
3. **Workflow Execution** (`workflow-execution`) — creates a real client,
   creates a real rule via `WorkflowAutomationService.createRule`, emits a
   real event via `emitEvent`, asserts a real execution row exists, asserts
   a real RBAC denial, then cleans up with independent re-verification.

Each of the 3 asserts every directive-required dimension: preconditions,
step-by-step results, expected vs. actual, real API result, real database
result (queried directly via `sharedPool`, never trusted from the engine's
own return value alone), real security result (a live unauthenticated
`fetch` against the real route, not an assumption), real audit result,
post-conditions, evidence strings naming the real rows/routes touched, and
`cleanup_performed` confirmed by an independent post-delete query — not by
trusting the cleanup step's own report.

## A real bug found and fixed during this work

First test run of all 3 journeys failed uniformly:
`insert or update on table "oc_verification_journey_runs" violates foreign
key constraint "oc_verification_journey_runs_client_id_fkey"`. Root cause:
the original code order was run steps → delete the disposable client
(cleanup) → persist the journey row referencing `client_id` — by the time
of the INSERT, the referenced client no longer existed. Fixed by splitting
`persist()` (called **before** cleanup, while the client still exists) from
a new `updateCleanup(id, cleanupPerformed, cleanupEvidence)` (an UPDATE,
called **after** cleanup) across all 3 implemented journeys. Re-ran: 6/6
passing.

## Real, live verification

`apps/api/tests/business-journey-engine-test-1.test.ts`, **6/6 passing**:
registry lists all 17 journeys with the correct 3 marked implemented; each
of the 3 real journeys runs end-to-end and asserts `status === 'passed'`,
every result field, `cleanupPerformed === true`, and an independent
`SELECT 1 FROM oc_clients WHERE id = $1` returning zero rows after cleanup;
an unimplemented journey (`marketplace`) returns `status: 'blocked'` with
the honest message rather than a fabricated pass; a genuinely unknown
journey id throws `'Unknown journey'`. Full API regression: **98 files /
1005 tests, all passing** (999 baseline + 6 new). `tsc --noEmit` clean on
`apps/web` after the UI additions.

**Then verified live in the browser, authenticated, using the real staff
session already active this session**: navigated to
`/platform/verification`, confirmed the new "Business Journeys (17)"
section renders all 17 journeys with correct implemented/not-implemented
badges. Clicked "Run" on Client Onboarding — the button showed a loading
state, the run genuinely executed against the live API, and "Recent
Journey Runs" updated with a real new row: `Client Onboarding · 29/08/2026,
2:41:50 pm · cleanup verified · PASSED`. Clicked into the run and confirmed
the detail page renders every real field: expected/actual result text,
step-by-step results (`Create client` → `Created real client
client-10d64e1a-7e01-4c43-972b-c8c024f2d6a1`, `Verify database row` →
passed, etc.), a real `securityResult` block (`{"check":"unauthenticated
GET denied","denied":true,"httpStatus":401}`), a real `auditResult` block
(`{"found":true,"action":"created","entityId":"client-10d64e1a-...",
"entityType":"client"}`), post-conditions, a genuine cleanup confirmation
("Real client client-10d64e1a-... deleted, verified absent"), and evidence
naming the real `oc_clients` row created. No fabricated data anywhere in
the chain — every value shown was produced by the real run against the
real database.

## What is NOT built this pass, disclosed plainly

- The other 14 journeys (assessment, discovery, database comparison,
  configuration comparison, migration, migration validation, security
  validation, release readiness, deployment, post-deployment validation,
  incident resolution, commercial engagement, client portal, marketplace)
  are registered but not implemented — each honestly returns `blocked`,
  never a simulated pass. Several depend on infrastructure not yet built
  in this pass (change-aware selection, post-deployment/post-migration
  automation) which are separate, later priorities in the same directive.
- No scheduling, notifications, or automatic repair loop for journey
  failures yet (Priorities 5, 6, 11 of the same directive).
- Playwright/cross-browser orchestration for journeys remains
  `BLOCKED_EXTERNAL_AUTH` by design — no credentials were extracted or
  persisted (per the session's standing, explicit prohibition on that),
  so only the already-active live staff browser session was used for
  manual verification above.

## Commit

Migration 069, `business-journey-engine.ts`, 4 new routes, 4 new RBAC
rules, `business-journey-engine-test-1.test.ts`, the extended
`/platform/verification` page, and the new
`/platform/verification/journeys/[runId]` detail page — committed together
on `feature/reliability-hardening`. `main` independently re-verified
unchanged at `b63f797` before and after.
