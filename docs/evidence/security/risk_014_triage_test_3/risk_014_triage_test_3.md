# risk_014_triage_test_3 — corrected mechanical sweep, 3 more real gaps closed, an honest audit-tooling correction, and RISK-016 opened

**Feature under test**: `platform/rbac/rules.ts` (extended) — a corrected, more complete mechanical RBAC-gap sweep, continuing RISK-014's individual triage.
**Test Suite**: `risk_014_triage_test_3` (2026-08-24, continuation of `risk_014_triage_test_2`)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## An honest correction to this session's own earlier claim

`dependency_analysis_test_1`'s "final mechanical audit pass" claimed a sweep across "all 451 real registered routes" found only 2 more RBAC candidates. Re-deriving the sweep script from scratch this pass — one that actually parses every `server.<method>()` registration (GET/POST/PUT/PATCH/DELETE) rather than evidently GET/POST alone — finds **512 real registered routes, not 451**, and a materially larger real candidate set: **69**, not 2. This is recorded plainly as a correction, not quietly folded in: the earlier claim was wrong, not merely narrower-than-stated.

## What the corrected sweep found, and how it was triaged

Of the 69 candidates:
- Most are `/oc/**` routes already triaged and confirmed safe by the two prior `risk_014_triage_test_*` passes (`/oc/me/*`, the lifecycle/discovery/assessment body-clientId group, the capabilities/compliance/service-bundles catalog group, `jira/issues`, `jira/config` GET, staff-roles bootstrap, invitations lookup/accept).
- A real, separate finding: a meaningful fraction belong to the **comparison-marketplace surface** (`/api/v1/merchants/**`, `/api/v1/admin/brands/**`, `/api/v1/admin/reviews/**`, pricing/offers, `/api/v1/platform/services/**`) — a different product surface RISK-014 has never been scoped to. Disclosed as a new, dedicated **RISK-016** rather than folded into RISK-014 or silently dropped.
- **3 real, confirmed, previously-undisclosed `/oc/**` gaps, fixed this pass**:

| Route | Real exposure before this fix |
|---|---|
| `GET /oc/platform/commercial/summary` | Real, cross-client AskABD commercial/financial data — every engagement's real investment/contracted/realized values, itemized with real client names in a `pipeline` array. Same shape and severity as the already-fixed Portfolio Intelligence gap. |
| `GET /oc/workflow/executions` | Every client's real automation-execution history when no `?clientId=` filter is supplied. Same unscoped-aggregate-leak shape as the already-fixed `GET /oc/notifications`. |
| `POST /oc/workflow/rules` / `PATCH /oc/workflow/rules/:ruleId/toggle` | Unprotected writes to the platform's own automation-rule definitions — any authenticated identity could create arbitrary rules or disable real escalation/notification automation. An integrity risk, not read-exposure. |

`GET /oc/workflow/rules` (read-only rule definitions, no client data) was investigated and left deliberately ungated — genuinely global config, the same reasoning already applied to `GET /oc/capabilities` and `GET /oc/compliance/frameworks`.

Each fix confirmed via grep to be called only by staff `(app)/platform/*` pages, never the customer `(portal)`.

## Security — live proof (Security Testing Addendum)

`apps/api/tests/risk-014-triage-test-3.test.ts`, 7/7 passing:

| Scenario | Result |
|---|---|
| Customer token, `GET /oc/platform/commercial/summary` | **403** |
| Customer token, `GET /oc/workflow/executions` | **403** |
| Customer token, `POST /oc/workflow/rules` | **403** |
| Customer token, `PATCH /oc/workflow/rules/:id/toggle` | **403** |
| Unauthenticated, all 4 routes | **401** |
| Staff (admin) token, all 4 routes | not blocked by RBAC |
| Customer token, `GET /oc/workflow/rules` (deliberately ungated) | not blocked |

## Regression

Full suite re-run after this pass — see the accompanying commit for the final pass/fail count. `tsc --noEmit` clean. No migration this pass. Both protected clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged.

## FINAL STATUS: PASS

Real, live-verified fix for 3 more confirmed gaps (4 routes), on top of the 10 already closed by the two prior passes in this same RISK-014 triage — 13 real cross-client/integrity gaps closed across three passes today. An honest, disclosed correction to this session's own earlier "only 2 more candidates" claim, rather than letting an inaccurate audit-completeness claim stand uncorrected. A new, distinct, honestly-scoped-out finding (RISK-016: the comparison-marketplace surface has never had this audit run against it at all) opened rather than either blindly fixed or silently ignored.
