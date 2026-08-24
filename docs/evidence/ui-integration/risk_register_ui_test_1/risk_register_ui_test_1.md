# risk_register_ui_test_1 — Risk Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3 (integrate every engine into one cohesive staff UI).
**Date**: 2026-08-25 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (unchanged, disclosed below).

## Gap found (not assumed)

A mechanical search confirmed **zero** web UI files referenced any of the 11
`/oc/clients/:clientId/*` engine routes built in the prior session (uat,
release-readiness, risks, data-mappings, reconciliation-runs, clarifications,
changes, executive-reports, api-specs, dependencies). Each has a real,
RBAC-gated route file and service layer, but no page in `apps/web` called any
of them. This page closes the gap for the Risk Engine (`risk-engine.ts` /
`risk-routes.ts`, `oc_risks`), the first of the 11.

## A real pre-existing page was found at the same route — investigated, not blindly overwritten

`clients/[clientId]/risks/page.tsx` already existed, showing risks derived
from `GET /oc/clients/:clientId/health-score` dimension weaknesses (a real,
already-honest page fixed in the 2026-08-22 UX audit — no fabricated
likelihood/impact/owner fields). Before overwriting it, verified the same
data is not lost: `scorecard/page.tsx` already renders `topRisks`, every
dimension's `weaknesses`, and `recommendedActions` from the identical
endpoint — a strict superset. `consulting/page.tsx` already links to this
same tab with the label "Risk Register" (pre-existing, anticipating exactly
this replacement). Only after confirming both did the replacement proceed.

## What was built

`clients/[clientId]/risks/page.tsx`, rewritten as a real client component
against every route in `risk-routes.ts`:
- List + summary stats (total / open / critical+high / closed), status filter, "show closed" toggle.
- Canonical expandable-row pattern (matches the approved Connector Configuration page standard): each risk is an independently expandable row with severity + status badges, description/mitigation/contingency/residual-risk detail, and full event history.
- "+ Add a risk" row (canonical dashed-border creation pattern) — real `POST .../risks` with title/description/source/probability/impact/owner/dueDate/mitigation/contingency.
- Every real state transition wired to its real route: Mitigate (`.../mitigate`, requires a residual risk level), Reopen (`.../reopen`, requires a reason), Transfer (`.../transfer`), Close (`.../close`, requires a reason) — buttons are gated by the engine's own `ALLOWED_TRANSITIONS` map, mirrored client-side from `risk-engine.ts` so no invalid transition can even be attempted from the UI.
- Risk-acceptance sub-workflow: "Request Acceptance" (`.../acceptance/request`, requires justification) and, once a workflow is pending (`in_review`), Approve/Reject (`.../acceptance/:decision`) — fetched lazily via `.../acceptance` only when a row is expanded.
- Uses `staffFetch` (bearer-token client auth, same as `requests/page.tsx`/`invitations/page.tsx`) since every one of these routes is `Admin.Access`-gated per `rules.ts:688-699` — already covered, no RBAC change needed.
- Severity is never client-computed — always the value the server returns from its deterministic probability×impact matrix.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health re-verified immediately before and after: `localhost:3001` → 307 (expected, unauthenticated), `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200 — same PIDs as the last checkpoint, nothing restarted.
- Live browser (Browser pane, fresh tab) navigation to `/clients/verification-probe-000/risks`: real, clean 307 redirect to `/staff/login` — the same expected, documented behavior as every other authenticated page in this app (per the standing "a `/staff/login` redirect is not a failure" rule), not a 500. Zero console errors, zero failed network requests recorded during the redirect.
- **Limitation, honestly disclosed (unchanged from every prior pass)**: no staff credentials are available in this environment, so the authenticated interactive flow (loading real risks, creating one, transitioning it) could not be exercised live in the browser this pass; Playwright remains `BLOCKED_EXTERNAL_AUTH` for the same reason. Correctness here rests on (a) an exact, field-by-field match against the real route/service contracts in `risk-routes.ts` / `risk-engine.ts`, (b) a clean `tsc` build, and (c) the confirmed-clean unauthenticated redirect proving the route itself renders without a server-side exception.

## Status: 1 of 11 engines wired

Risk Engine: **DONE**. Remaining, not yet started: UAT, Release Readiness,
Data Mapping, Data Reconciliation, Requirements Clarification, Change
Management, Executive Reporting, API Discovery, Dependency Analysis.
(Deployment already has a real UI — see `enterprise-feature-gap-register.md`,
2026-08-24 — so it is not counted in the 11.)
