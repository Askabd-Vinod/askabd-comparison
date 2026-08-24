# change_management_ui_test_1 — Change Management Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3.
**Date**: 2026-08-25 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (unchanged, disclosed below).

## What was built

New tab, new page: `clients/[clientId]/changes/page.tsx`, plus a new
"Change Management" entry added to `client-tabs.tsx` (segment `/changes` —
no prior page or tab existed here; confirmed via `find`/`grep` before
building, unlike Risk this was a genuinely new route, not a replacement).

Real, full lifecycle wired against every route in `change-management-routes.ts`:
- Create (`POST .../changes`), list + filter by status, Stat strip (total / active / awaiting approval / closed+cancelled).
- **Assess**: requires real, non-empty impact assessment + implementation plan + rollback plan (client-side gating mirrors the engine's own validation — `assess()` throws server-side if any is blank; the button is additionally disabled client-side with the same per-field messages, but the server check remains authoritative).
- **Request Approval → Approve/Reject/Request Changes**: real `ApprovalWorkflowEngine` integration, lazily fetched only when a row is expanded; reject/request-changes require a note (mirrors `risks/page.tsx`'s established acceptance-workflow UI pattern).
- **Link Risk / Link Deployment**: dropdowns populated from this client's own real, already-wired Risk Register (`GET .../risks`) and Deployments (`GET .../deployments`) — never a free-typed id, so every link is guaranteed to resolve to a real, ownership-verified record (matching the engine's own server-side ownership check).
- **Start Implementation → Move to Validating → Close**: close requires real post-change validation evidence (server-enforced, mirrored client-side).
- **Cancel**: available from every non-terminal state per `ALLOWED_TRANSITIONS`, requires a reason.
- Full event history rendered per record, same as the Risk Register page.

## RBAC

Already fully covered — `rules.ts:741-753`, all `Admin.Access`. No RBAC
change needed; `staffFetch` used throughout for the same reason as the Risk
Register page.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health re-verified: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200 — same PIDs, nothing restarted.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/changes`: clean 307 to `/staff/login` (expected, documented behavior), zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff credentials available in this environment — the authenticated interactive flow (create → assess → approve → implement → validate → close) could not be exercised live. Correctness rests on an exact field-by-field match against `change-management-routes.ts` / `change-management-engine.ts`'s real contracts, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 2 of 11 engines wired

Done: Risk, Change Management. Remaining: UAT, Release Readiness, Data
Mapping, Data Reconciliation, Requirements Clarification, Executive
Reporting, API Discovery, Dependency Analysis.
