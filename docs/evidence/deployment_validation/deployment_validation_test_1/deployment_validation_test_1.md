# deployment_validation_test_1 — Deployment Engine: real state machine, readiness gate, approval reuse, deployment-safety boundary

**Feature under test**: `DeploymentService` (new) + `deployment-routes.ts` (new) — real deployment lifecycle management with a 13-status state machine, gated on `ReleaseReadinessService` at two checkpoints, backed by `ApprovalWorkflowEngine`.
**Test Suite**: `deployment_validation_test_1` (2026-08-24, coordinated with `post_delivery_test_1` per the master directive's own "same deployment lifecycle" framing)
**Environment**: local dev, real Postgres (`comparison-postgres:5442`) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (staff Browser-pane session still expired)

## Directive addressed

The full "AskABD Master Autonomous Build + Validation + Security + Real-Time UAT Directive" continuation, specifically targeting rows #52-53 of the coverage matrix after their 2026-08-24 correction (the prior "Deployment Validation Engine — IMPLEMENTED" claim was itself fabricated — see that correction commit and `docs/enterprise-feature-gap-register.md`'s 2026-08-17 P1 finding). Explicit instruction: do not preserve any fabricated deployment claim; replace the mock behavior with a real implementation.

## Investigation before writing any code (per the directive's own 10-point checklist)

1. **Existing deployment-related code**: confirmed zero `oc_deployments` table/service/route anywhere (`grep -rln "oc_deployments" apps/api/src` — no matches). `deployments/page.tsx` and `deployments/[deploymentId]/page.tsx` read `client.deployments` unconditionally from `mockClients` — hardcoded release notes, an always-all-`✓` checklist, hardcoded "Reviewer/Approver: hello@askabd.com", fabricated post-deploy metrics, a fabricated "95% confidence" AI insight.
2. **LifecycleService**: read `validTransitions` in full — a real `go_live` transition gated at `audit-passed`, confirming a genuine existing "is this client ready to go live" concept to build the readiness gate against (via `ReleaseReadinessService`, not duplicated here).
3. **ReleaseReadinessService**: this session's own prior feature — reused unmodified as the real gate.
4. **ApprovalWorkflowEngine**: reused unmodified for the deployment approval decision (`entityType: 'deployment_approval'`).
5. **TestSuite/TestCase/TestExecution engines**: confirmed `test_suites.category` already includes `'post_deployment'` (migration 049), unused until this pass — same reuse pattern as `uat_test_1`'s `'uat'` category.
6. **Audit Engine**: confirmed no dedicated `AuditService` exists — `oc_audit_log` is written via direct `INSERT` across the whole codebase (an established convention, not a service to reuse); followed the same convention rather than inventing a new one.
7. **Notification Engine**: `notification-service.ts` exists (`sendNotification`, `getNotifications`) — not wired into this pass's deployment transitions (a real, disclosed fast-follow; the directive's own priority list put readiness/approval/execution/validation ahead of notification wiring).
8. **Environment/Connector engines**: confirmed "environment" is a free-text field on connections/deployments, not a first-class entity; `ClientDatabaseConnectionService.test()` reused unmodified for the one real automatic post-deployment check (covered in `post_delivery_test_1`).
9. **Existing deployment-related migrations**: none (confirmed).
10. **Confirmed no existing deployment persistence layer** before creating migration 057.

## Real deployment model (migration 057)

`oc_deployments`: id, client_id, environment, application, version, previous_version, source, target, deployment_type, planned_start/actual_start/actual_completion, requested_by, status (13-value CHECK), risk, `release_readiness_snapshot` (a real, point-in-time JSONB snapshot of `ReleaseReadinessService`'s own output, never re-fabricated later), approval_workflow_id, notes, rollback_plan, rollback_status, `post_deployment_suite_id` (real FK to `test_suites`), pre/post snapshot ids + comparison_run_id (real FKs into the Universal Comparison Engine's own tables), `events` JSONB (mirrors `oc_lifecycle.events` — an established pattern, not a new convention). No hardcoded release notes, metrics, reviewers, approvers, confidence percentages, success states, or validation results anywhere in this schema or its service.

## Real, explicit state machine

`draft → planned → readiness_pending → approval_pending → approved → in_progress → deployed → validation_pending → validated | failed → rollback_pending → rolled_back | cancelled`, enforced via an explicit `ALLOWED_TRANSITIONS` table (`InvalidDeploymentTransitionError` on any invalid attempt — same discipline as `ApprovalWorkflowEngine`'s own transition table). Every transition writes both a real `events` JSONB entry AND a real `oc_audit_log` row.

## Release Readiness gate — reused, not duplicated, checked at TWO checkpoints

`requestApproval` re-checks `ReleaseReadinessService.getReadiness(clientId)` **fresh** (never trusts a stale cached snapshot) and refuses with a real `ReadinessGateError` (naming the actual blocking dimensions) unless the result is genuinely `go`. `startExecution` re-checks it **again**, independently — proven live in this pass's own test: a deployment approved while readiness was `go` had its client's real lifecycle stage reverted afterward, and the subsequent `startExecution` call correctly refused with the same `ReadinessGateError` — proving readiness cannot be bypassed at either checkpoint, and that approval does not permanently "bank" a stale readiness result.

## Approval — reused, not duplicated, plus real self-approval prevention

`requestApproval` opens (or, for a genuine re-submission after "request changes", correctly `resubmit`s the SAME still-open workflow rather than opening a duplicate — a real bug found and fixed by this pass's own test suite, see below) a real `ApprovalWorkflowEngine` workflow. `decideApproval` adds a genuinely new control this pass: the deciding actor must not be the deployment's own `requestedBy` identity (`SelfApprovalError`, real, tested, both at the service layer and over real HTTP with an admin token that had both created and attempted to approve the same deployment).

## Deployment safety — the directive's own explicit boundary, honored

No real external CI/CD or deployment-orchestration infrastructure exists in this sandbox. `startExecution`/`recordDeploymentOutcome` (and their rollback equivalents) record the REAL decision and REAL reported outcome — evidence-enforced (`MissingEvidenceError`, same discipline as `TestExecutionService.recordExecution`) — but never simulate that an external deployment succeeded. Real external execution is tracked as `BLOCKED_EXTERNAL_DEPENDENCY` (`docs/security-risk-register.md` RISK-011), not fabricated.

## Rollback — honest, never fabricated

`initiateRollback` refuses with a real `RollbackNotAvailableError` when no `rollback_plan` was ever recorded — proven live. When a plan exists, the rollback flow is real and evidence-enforced through to `rolled_back`, mirroring the deployment-outcome discipline exactly (never pretends a rollback happened).

## Real bug found and fixed during this pass's own testing

`requestApproval` originally always called `openWorkflow()`, which collided with `ApprovalWorkflowEngine`'s own real DB constraint (`idx_approval_workflows_one_open_per_entity`) when re-submitting after a "request changes" decision (the existing workflow was still open in `changes_requested`, not closed). Root-caused live via the actual Postgres constraint-violation error, fixed by detecting an existing open `changes_requested` workflow and calling the engine's own `resubmit()` instead of opening a duplicate. Regression test added and passing.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role — deployments are staff-only, AskABD-internal, no portal route exists at all) | **403** |
| Staff (admin) | **200/201** |
| Cross-client deployment id (a real Client A deployment id under Client B's own URL clientId) | **404** — object-level ownership catches this even for staff, not just tenant-access.ts's own clientId-URL check |
| Malformed/SQL-injection-shaped deployment id | **404**, safe, no crash, no leaked SQL error text |
| Readiness bypass attempt (`request-approval` while not go) | **409** `readiness_not_met` with real named blockers |
| Approval bypass attempt (`start-execution` without ever being approved) | **409** `invalid_transition` |
| Self-approval attempt | **403** `self_approval_forbidden` |
| Deletion authorization (only `draft`/`cancelled` deletable) | `DeploymentNotDeletableError` for any in-flight/completed deployment |
| Empty-body POST to every decision/outcome route | Safe `<500` (mechanical audit of this session's own RISK-009 pattern, applied proactively to this new route file) |

## Automated tests — 24 new, all real, none stubbed

`apps/api/tests/deployment-validation-test-1.test.ts`: required-field validation, invalid-transition rejection, readiness-gate-blocks-approval (with real named blockers), the full real happy path (create→plan→readiness→approval→execution→real reported deployed outcome, 5+ real audit events), evidence-enforcement on outcome recording, real self-approval prevention, readiness re-checked fresh at the execution boundary (a real lifecycle regression after approval correctly blocks execution), reject-cancels-with-required-reason, request-changes loops back to planned and a real re-submission works, rollback-refused-without-a-plan, the real evidence-enforced rollback flow, cancel-requires-a-reason, delete-only-from-draft/cancelled, full object-level ownership sweep, and 11 HTTP/RBAC/security tests covering the table above.

Full local run: **24/24 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — staff session still expired, never worked around. Unlike `uat_test_1`/`release_readiness_test_1`, this pass DID replace the fabricated UI with a real one (list page: real fetch, real create form, real status badges; detail page: real fetch, real contextual per-status action buttons, real readiness/approval/rollback/audit-trail display, "Not available from current evidence" for any missing field) — `tsc --noEmit` and `next build` both clean for the whole web app, but no live click-through has been possible yet.

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing, security-audited backend AND a real, non-fabricated UI rewrite — capped below PASS only because live browser verification remains `BLOCKED_EXTERNAL_AUTH`. Real external deployment/rollback execution is honestly `BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011) by design, not a gap.
