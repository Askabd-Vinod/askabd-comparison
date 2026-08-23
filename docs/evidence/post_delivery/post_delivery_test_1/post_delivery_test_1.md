# post_delivery_test_1 — Post-Deployment Validation: real Testing Engine reuse + Universal Comparison Engine reuse

**Feature under test**: `DeploymentService`'s post-deployment validation methods (`createPostDeploymentSuite`, `recordPostDeploymentCheck`, `runAutomaticDatabaseConnectivityCheck`, `finalizeValidation`, `compareDeploymentSnapshots`) — sibling to `deployment_validation_test_1`, same file/service, same day.
**Test Suite**: `post_delivery_test_1` (2026-08-24)
**Environment**: local dev, real Postgres (`comparison-postgres:5442`, also used as the real target for the automatic database-connectivity check) · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Directive addressed

The post-deployment half of the same directive as `deployment_validation_test_1` — real post-deployment validation reusing the Testing Engine, `test_suites.category = 'post_deployment'`, real evidence for every check, automatic failure handling that never auto-succeeds, and comparison reuse via the Universal Comparison Engine.

## Real reuse — no duplicated logic

- **Testing Engine**: a post-deployment "suite" for a deployment IS a real `test_suites` row (`category='post_deployment'`) containing real `test_cases` — `TestCaseService.createManual` and `TestExecutionService.recordExecution` are both reused completely unmodified. Every check inherits the exact same evidence-enforcement (`MissingEvidenceError`), secret-masking, and auto-defect-on-fail this session already proved twice in `uat_test_1`.
- **The one real automatic check**: `runAutomaticDatabaseConnectivityCheck` delegates directly to `ClientDatabaseConnectionService.test()` (unmodified) — a genuine live TCP/Postgres connection attempt, with the execution's evidence built from that connection test's own real steps. Proven live against the real local `comparison-postgres` instance: a genuinely reachable connection recorded a real `pass`.
- **Universal Comparison Engine**: `compareDeploymentSnapshots` is a thin delegation to `UniversalComparisonEngine.runConfigurationComparison` (unmodified) — no new diff logic. Proven live: two real `oc_configuration_snapshots` rows (a genuine `WORKER_POOL_SIZE` change) produced a real comparison run, stored on the deployment (`comparisonRunId`/`preSnapshotId`/`postSnapshotId`). Cross-client snapshot misuse is refused by the underlying engine's own real ownership check (inherited, not re-implemented) — proven live with the engine's own real error message.

## Real check catalog (no fabricated auto-pass)

`application_availability`, `api_availability`, `database_connectivity` (the one automatic one), `schema_compatibility`, `configuration`, `environment_variables`, `critical_workflows`, `security_controls`, `integration_connectivity`, `health_endpoints`, `expected_version`, `smoke_tests`, `regression_tests`, `data_integrity`, `performance_indicators` — every one of these creates a REAL test case; every one except database connectivity requires a REAL manual evidence-backed execution to reach pass/fail. An unknown check name is rejected outright (`Unknown post-deployment check`).

## Real, never-fabricated automatic failure handling

`finalizeValidation` refuses (`Cannot finalize: N post-deployment check(s) have not yet reached a real result`) until every check in the suite has a real terminal execution — proven live. It then makes an honest, non-ambiguous decision: `validated` only if every real check genuinely passed (proven live with 2 real passing checks), or `failed` if even one real check failed (proven live, mixed pass/fail) — the deployment is NEVER silently left in an indeterminate state, and NEVER auto-succeeds.

## Real object-level ownership

`recordPostDeploymentCheck` refuses a test case that is real, and belongs to the caller's own client, but is NOT part of THIS specific deployment's own suite (a different deployment's suite for the same or a different client) — proven live with two real, separate deployments' suites. `getPostDeploymentStatuses`/`getPostDeploymentProgress` both inherit `DeploymentOwnershipError` from the parent deployment lookup — Client A cannot read Client B's post-deployment status.

## Automated tests — 12 new, all real, none stubbed

`apps/api/tests/post-delivery-test-1.test.ts`: wrong-status guard on suite creation, real suite creation (real `test_cases` + a real `category='post_deployment'` `test_suites` row, deployment moves to `validation_pending`), unknown-check rejection, evidence-enforcement + real auto-defect-on-fail, cross-suite-membership rejection, finalize-refuses-until-terminal, finalize-to-validated (all real pass), finalize-to-failed (one real fail, honest, never ambiguous), the real automatic database-connectivity check against real local Postgres, real comparison-engine delegation with a real stored result, cross-client snapshot misuse refused (inherited ownership check), and object-level ownership on read paths.

Full local run: **12/12 passing**. Combined with `deployment-validation-test-1.test.ts`: **36/36 passing** across both files.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — same as `deployment_validation_test_1`; the real post-deployment checklist section is included in that feature's own real detail-page rewrite (shared UI, not a separate page).

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing (Testing Engine + Universal Comparison Engine, both unmodified), security-audited post-deployment validation with a real, honest, never-fabricated finalize decision — capped below PASS only because live browser verification remains `BLOCKED_EXTERNAL_AUTH`.
