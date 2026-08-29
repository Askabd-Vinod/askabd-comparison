# api_discovery_ui_test_1 — API Discovery / Validation Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3 / master autonomous directive.
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (`.auth/staff-state.json` absent, re-checked this pass).

## What was built

New tab, new page: `clients/[clientId]/api-specs/page.tsx`, new "API
Discovery" tab added next to Traceability. No prior page/tab existed.

- **Ingest**: paste real OpenAPI 3.0 / Swagger 2.0 JSON, client-side `JSON.parse` validation before submit (the server's own `InvalidSpecError` remains authoritative for structural validity — a real `paths` object).
- **Gap report**: real per-spec completeness counts (missing description / missing response schema / missing security / not validated) — never fabricated percentages.
- **Endpoint list**: real per-endpoint flags rendered inline (`no description`, `no security`) plus its real last validation status.
- **Live validation — explicit opt-in, not loosened**: the engine refuses `validateEndpoint` outright unless `liveValidationAuthorized` is true on the spec; this page mirrors that exactly — the "Validate" button per endpoint is only rendered once staff has explicitly clicked "Authorize Live Validation" (disabled if the spec has no base URL, since there's nothing to validate against), and an explicit "Revoke Authorization" is always available. The banner text is honest about what authorizing actually means: a real outbound request to the client's real base URL, SSRF-protected via the engine's own existing `assertSafeOutboundDestination`.
- Validation status badges render the server's real vocabulary (`reachable`/`unreachable`/`blocked`/`not_checked`) — `not_checked` is visually distinct (dashed, muted) and never presented as a pass.

## RBAC

Already fully covered — `rules.ts:767-773`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/api-specs`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff credentials available — the authenticated flow (ingesting a real spec, authorizing live validation, validating a real endpoint) could not be exercised live. Correctness rests on an exact contract match against `api-discovery-routes.ts` / `api-discovery-engine.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 9 of 11 engines wired

Done: Risk, Change Management, UAT, Release Readiness, Data Mapping, Data
Reconciliation, Requirements Clarification, Executive Reporting, API
Discovery. Remaining: Dependency Analysis.
