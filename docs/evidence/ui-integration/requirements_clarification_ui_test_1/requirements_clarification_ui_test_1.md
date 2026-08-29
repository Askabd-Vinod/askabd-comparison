# requirements_clarification_ui_test_1 — Requirements Clarification Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3 / master autonomous directive.
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (`.auth/staff-state.json` absent, re-checked this pass).

## What was built

New tab, new page: `clients/[clientId]/clarifications/page.tsx`, new
"Clarifications" tab added next to the pre-existing "Business Requirements"
tab (the requirement source this engine's questions are generated from).

- **Generate**: real requirement picker sourced from `GET .../business-requirements` (never a free-typed id); "Generate Clarifications" calls the real, deterministic, rule-based generator — the response honestly reports either the real count generated or that the requirement had no outstanding quality findings, never a fabricated "success."
- **List + filter**: real per-question detail — problem / what's missing / why it matters / possible interpretation / impact — exactly as the engine's own `classifyQuality`-derived findings produced them.
- **Client's answer rendered read-only, verbatim** — this page never edits, paraphrases, or fabricates a client answer; if none exists yet, says so plainly and explains the client answers from their own portal.
- **Resolve / Won't Fix**: both require real, non-empty text (resolution / reason), matching the engine's own validation.

## RBAC

Already fully covered — `rules.ts:731-736`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200 (all three confirmed healthy following this session's Docker/WSL recovery — see `docs/evidence/environment/local_environment_test_2/`).
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/clarifications`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff (or client-portal) credentials available — the full authenticated flow (generating real questions, the client answering via portal, staff resolving) could not be exercised live. Correctness rests on an exact contract match against `requirements-clarification-routes.ts` / `requirements-clarification-engine.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 7 of 11 engines wired

Done: Risk, Change Management, UAT, Release Readiness, Data Mapping, Data
Reconciliation, Requirements Clarification. Remaining: Executive Reporting,
API Discovery, Dependency Analysis.
