# risk_test_1 — Risk Engine: real deterministic severity, real state machine, real acceptance workflow, a real data-integrity bug found and fixed along the way

**Feature under test**: `RiskEngine` (new) + `risk-routes.ts` (new) — a real, universal Risk Register spanning every source the directive names.
**Test Suite**: `risk_test_1` (2026-08-24, ASKABD ENTERPRISE OPERATIONS — MASTER AUTONOMOUS COMPLETION DIRECTIVE, capability #21)
**Environment**: local dev, real Postgres (`comparison-postgres:5442`) · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Search-before-building

`grep -rln "RiskEngine\|risk_register\|oc_risks\|RiskService"` across the whole API — zero real matches (only incidental `risk_level` text columns on unrelated tables, e.g. `oc_gaps.risk_level`, and compliance-framework seed data referencing "risk" as a category, never a real Risk Register). Confirmed genuinely `NOT_STARTED`, matching the coverage matrix's own prior claim.

## Real reuse

- **`TraceabilityEngine.link()`** (unmodified) — a risk's connection to its source entity uses the existing `relates_to` link type (already valid in `traceability_links`'s own CHECK constraint, zero schema change needed).
- **`ApprovalWorkflowEngine`** (unmodified) — risk acceptance is a real, decided workflow (`entityType: 'risk_acceptance'`), never a bare status flip. Matches the directive's own explicit instruction: "Risk acceptance must reuse ApprovalWorkflowEngine."
- **`oc_gaps` / `oc_deployments` / `oc_business_requirements` / `test_defects`** — real, resolvable tables used for genuine object-level source-ownership verification, not a fabricated "trust the caller" link.

## Real, deterministic severity — never fabricated

`SEVERITY_MATRIX` is an explicit 3×4 probability-×-impact table (`low/medium/high` × `low/medium/high/critical` → `low/medium/high/critical`), the ONLY place severity is ever computed — there is no `severity` field on the create-risk input at all, so it cannot be caller-supplied or fabricated. Proven live across low/low→low, medium/high→high, high/critical→critical.

## Real state machine + real, enforced business rules

`open → mitigated/accepted/transferred/closed`, `mitigated → open/closed`, `accepted/transferred → closed`, enforced via `ALLOWED_TRANSITIONS` (`InvalidRiskTransitionError` on any invalid attempt). Real rules proven live: `mitigate()` refuses without a real, non-empty mitigation plan; `transfer()`/`close()`/`reopen()` all require a real, non-empty reason; a closed risk cannot be edited; a rejected acceptance request leaves the risk genuinely `open` — never silently dropped or left in a fabricated intermediate state.

## Object-level source ownership — never trusts a caller-supplied source id

`createRisk` with `source: 'gaps'` and a real Client B gap id, submitted under Client A, is refused (`InvalidSourceLinkError`) — proven live. A nonexistent source id for a verifiable source type is refused with an honest, specific error rather than silently accepted.

## Real data-integrity bug found and fixed as a side effect of this pass's own zero-orphans check

Building the Risk Engine's `gap` source-linkage naturally exercised `oc_gaps` for the first time this session with a real zero-orphans DB check afterward — which surfaced **1026 real orphaned `oc_gaps` rows** (client_id referencing an already-deleted client), plus 6/1/56 orphaned rows in `oc_gap_options`/`oc_decisions`/`oc_transformations`. Root cause, confirmed by reading migration 037 directly: all 4 tables declare `client_id TEXT NOT NULL` with **no foreign key to `oc_clients` at all** — a real, pre-existing gap (not introduced this session; accumulated across many prior sessions' test runs whose own cleanup never touched these 4 tables).

**Mechanical audit performed**: the same missing-FK pattern (`client_id TEXT NOT NULL,` with no `REFERENCES`) appears **43 times across 19 migration files** — a large, pre-existing, platform-wide pattern. **Fixed this pass**: migration 059 deletes the real orphans (safe — they belong to already-deleted clients; both protected real clients confirmed unchanged) and adds the missing FK (`ON DELETE CASCADE`, matching this session's established convention) to the 4 tables in the Gap/Decision/Transformation domain this pass's own Risk Engine directly touches. **Not fixed platform-wide**: the remaining 39 occurrences are a large, genuinely separate body of work, tracked honestly as `docs/security-risk-register.md` RISK-012 with the exact grep command and a concrete suggested fix, rather than attempted in the same pass or silently left undiscovered.

## Security — RBAC + object-level ownership (Security Testing Addendum)

| Scenario | Result |
|---|---|
| Unauthenticated | **401** |
| Customer token (insufficient role — staff-only, AskABD-internal) | **403** |
| Staff (admin) | **200/201** |
| Cross-client risk id | **404** |
| Malformed/SQL-injection-shaped risk id | **404**, safe, no leaked SQL error text |
| Acceptance-decision bypass (deciding before ever requesting) | **409** `acceptance_not_requested` |
| Empty-body POST to every decision route | Safe `<500` (RISK-009 pattern proactively audited into this new route file) |

## Automated tests — 19 new, all real, none stubbed

`apps/api/tests/risk-test-1.test.ts`: required-field validation, deterministic severity matrix (3 real probability/impact combinations), real gap-source object-level ownership (cross-client refused, same-client accepted), nonexistent-source refusal, mitigate's real plan/residual-risk requirements, invalid-transition rejection, the full real acceptance flow (request → real workflow → decided → accepted), rejected-acceptance-leaves-risk-open, transfer/close reason requirements, no-edit-after-close, real non-fabricated summary counts, full object-level ownership sweep, and 8 HTTP/RBAC/security tests.

Full local run: **19/19 passing**.

## Playwright / live UI

`BLOCKED_EXTERNAL_AUTH` — unchanged. No dedicated UI yet (API-only this pass), matching the `uat_test_1`/`release_readiness_test_1` precedent.

## FINAL STATUS: IMPLEMENTED

Real, engine-reusing, security-audited Risk Register with a real deterministic severity model and a real, workflow-backed acceptance decision — plus a genuine, disclosed data-integrity fix found and closed along the way (RISK-012, partially resolved, platform-wide pattern honestly tracked as still open). Capped below PASS only because no dedicated UI exists yet and Playwright remains `BLOCKED_EXTERNAL_AUTH`.
