# data_mapping_ui_test_1 — Data Mapping Engine wired into the staff UI

**Directive**: "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", Phase 3.
**Date**: 2026-08-25 · **Branch**: `feature/reliability-hardening` · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (unchanged, disclosed below).

## What was built

New tab, new page: `clients/[clientId]/data-mappings/page.tsx`, new "Data
Mapping" tab (segment `/data-mappings`) added next to the existing
Migrations tab. No prior page/tab existed at this route.

Two-level real hierarchy, matching `data-mapping-engine.ts` exactly:
- **Mapping sets** (`GET/POST .../data-mappings`): name/description/source
  system/target system/owner, status badge, canonical expandable row.
- **Fields within a set**, lazily loaded on expand: real completeness stats
  (`GET .../completeness` — total, transformed-where-required, missing data
  type, missing validation, never fabricated percentages), the full field
  list with source→target, transform/condition/lookup detail shown only
  when the field actually has one, and removal (`DELETE
  .../data-mapping-fields/:fieldId`).
- **Add field mapping** form enforces the same per-type shape rules as the
  server (`validateShape`) via a visible hint per mapping type
  (`one_to_one` needs exactly 1→1, `calculated` needs a transformation,
  `lookup` needs a table+key, etc.) — the server's own
  `InvalidMappingShapeError` remains authoritative; the hint only tells
  staff what to expect before submitting.
- **Status transitions** (`POST .../status/:status`) gated by the engine's
  own `STATUS_TRANSITIONS` map, mirrored client-side exactly (draft →
  approved/deprecated → implemented → validated → deprecated).

## RBAC

Already fully covered — `rules.ts:704-713`, all `Admin.Access`. No RBAC
change needed.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Multi-service health re-verified: `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200 — same PIDs, nothing restarted.
- Live browser (fresh tab) navigation to `/clients/verification-probe-000/data-mappings`: clean 307 to `/staff/login`, zero console errors.
- **Limitation, unchanged and honestly disclosed**: no staff credentials available — the authenticated flow (creating a set, adding typed field mappings, transitioning status) could not be exercised live. Correctness rests on an exact contract match against `data-mapping-routes.ts` / `data-mapping-engine.ts`, a clean `tsc` build, and the confirmed-clean unauthenticated redirect. Playwright remains `BLOCKED_EXTERNAL_AUTH`.

## Status: 5 of 11 engines wired

Done: Risk, Change Management, UAT, Release Readiness, Data Mapping.
Remaining: Data Reconciliation, Requirements Clarification, Executive
Reporting, API Discovery, Dependency Analysis.
