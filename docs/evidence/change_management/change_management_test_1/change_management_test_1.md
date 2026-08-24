# change_management_test_1 — Change Management Engine: real impact/risk/rollback content, real approval, real linkage to Risk + Deployment engines

**Feature under test**: `ChangeManagementEngine` (new) + `change-management-routes.ts` (new) — real change lifecycle with enforced content and real cross-engine linkage.
**Test Suite**: `change_management_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capability #71)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Search-before-building: distinct from an existing, deliberately lightweight capability

`client-request-service.ts` already has a real `requestType: 'change'` intake — read in full before building anything. It's genuinely real (persisted, state-machined, audited) but deliberately lightweight: the same simple `requested → under_review → approved → in_progress → completed` flow shared with service/connector/support/incident requests, with no fields for a real impact assessment, risk linkage, or implementation/rollback plan. Building a second, richer layer on top — rather than modifying that shared, already-tested file — was the safer, more targeted choice. A Change Record MAY originate from a real, ownership-verified `ClientRequest` (`clientRequestId`), but never duplicates its intake logic.

## Real, enforced content requirements — never a fabricated "assessed" or "done"

`assess()` refuses to transition a change to `assessed` without a real, non-empty impact assessment, implementation plan, AND rollback plan — proven live, all three independently required. `close()` refuses to reach `closed` without real, non-empty post-change validation evidence — proven live — matching the directive's own explicit "Post-change validation" requirement and this session's consistent "never a fabricated success" discipline.

## Real cross-engine linkage — ownership-verified, never a bare id

- **Risk linkage** (`linkRisk`): reuses `oc_risks` (this session's own `risk_test_1`) unmodified — a real Client B risk id is refused when linking under Client A (`ChangeOwnershipError`), proven live. Linking the same real risk twice is idempotent, not a duplicate.
- **Deployment linkage** (`linkDeployment`): reuses `oc_deployments` (this session's own `deployment_validation_test_1`) unmodified — same real cross-client refusal, proven live. This is the real mechanism by which a change's "implementation" can point at a genuine deployment record.
- **Client request linkage**: a real Client B `ClientRequest` id is refused when creating a change under Client A.

## Real approval workflow — reused, plus real self-approval prevention

`requestApproval` opens a real `ApprovalWorkflowEngine` workflow (`entityType: 'change_approval'`, unmodified engine). `decideApproval` adds a genuinely new control at this layer: the deciding actor must not be the change's own creator (`SelfApprovalError`) — proven live both at the service layer and over real HTTP with an admin token that both created and attempted to approve the same change.

## Real state machine

`draft → assessed → approval_pending → approved → implementing → validating → closed`, with `cancelled` reachable from any non-terminal state, enforced via `ALLOWED_TRANSITIONS` (`InvalidChangeTransitionError` on any invalid attempt) — proven live end-to-end, including a real rejected-approval path (cancels with a required reason) and the full real happy path through to a real, evidenced closure.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role — staff-only, AskABD-internal) | **403** |
| Staff (admin) | **200/201** |
| Cross-client change id | **404** |
| Malformed/SQL-injection-shaped change id | **404**, safe, no leaked SQL error text |
| Self-approval attempt | **403** `self_approval_forbidden` |
| Empty-body POST to every decision route | Safe `<500` |

## Automated tests — 16 new, all real, none stubbed

`apps/api/tests/change-management-test-1.test.ts`: required-field validation, real enforced assess-content requirements, invalid-transition rejection, real ownership-verified risk linkage (with idempotency proof), real ownership-verified deployment linkage, the full real approval flow (including real self-approval prevention), reject-cancels-with-required-reason, real client-request-linkage ownership check, full object-level ownership sweep, and 7 HTTP/RBAC/security tests.

Full local run: **16/16 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated UI yet (API-only this pass).

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing (Risk + Deployment + Approval Workflow, all unmodified), security-audited change management with real enforced content and real never-fabricated closure evidence. Capped below PASS only because no dedicated UI exists yet and Playwright remains `BLOCKED_EXTERNAL_AUTH`.
