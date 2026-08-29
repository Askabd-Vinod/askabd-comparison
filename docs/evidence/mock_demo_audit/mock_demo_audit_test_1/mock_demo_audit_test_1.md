# mock_demo_audit_test_1 — full mock/demo-data disclosure re-audit

**Directive**: master continuation/hardening directive §36 (Mock/Demo Client Audit) + §49 (Known Open Areas).
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Objective

Re-derive, from scratch, whether the two previously-flagged gaps in
`docs/enterprise-feature-gap-register.md` (`"15 of 32 CapabilityPlaceholder
consumers lack DemoDataBanner"`, `"9 files reading the fabricated
deployments field, none fixed"`) are still real — not assumed accurate
just because they were written earlier this engagement.

## Method

1. Mechanically listed every real `CapabilityPlaceholder` consumer
   (`grep -rl "CapabilityPlaceholder"`) — 25 real consumers found (not 32;
   the count itself had drifted).
2. Mechanically listed every file importing anything from
   `apps/web/src/app/lib/mock-clients.ts` — 41 files, a superset of both
   previously-named lists.
3. For every client-scoped file (`clients/[clientId]/**`), checked whether
   `clients/[clientId]/layout.tsx` unconditionally renders
   `<DemoDataBanner />` for demo clients (it does — lines 115 and 163,
   both the "client found" and "client not found" branches) — if so, the
   page needs no banner of its own.
4. For every non-client-scoped file, checked directly for its own
   `<DemoDataBanner />` import/render.
5. Anything in neither category was flagged as a real, current gap.

## Findings

- **Stale**: "15 of 32 lack `DemoDataBanner`" — false. All 25 real
  consumers are client-scoped and inherit the layout's automatic banner.
  Zero real gaps in this category.
- **Stale**: "9 files reading fabricated `deployments`, none fixed" —
  false for 8 of 9. `applications/[appId]`, `environments/[envName]`,
  `knowledge`, `timeline` inherit the layout banner; `governance`,
  `reports/page.tsx`, `reports/[reportId]/page.tsx` each already import
  `DemoDataBanner` directly; `search/page.tsx` uses its own, more precise
  per-result `"Sample"` badge (correct, not a gap).
- **Real, previously-undisclosed gap found**: `apps/web/src/app/(app)/services/page.tsx`
  (top-level Platform Services catalog) — reads `platformServices` from
  `mock-clients.ts` (18 hardcoded entries: `status` almost entirely
  `'healthy'`, fabricated `version`/`clientCount`), zero disclosure,
  while its own detail page (`services/[serviceId]/page.tsx`) already had
  one. A real, narrow inconsistency, not caught by either prior list.

## Fix applied

`services/page.tsx`: added `<DemoDataBanner />` (identical pattern to the
detail page), plus a code comment pointing to the real, live alternative
(`/platform/services`, `GET /oc/platform/services`) for anyone looking for
actual platform health data.

## Readiness/testing/roadmap hardcoded-math finding — re-assessed, not rewritten

The directive's own bar for intentional demo content is "label it
clearly," not necessarily rewrite it. `readiness/page.tsx`,
`testing/page.tsx`, `roadmap/page.tsx` are all client-scoped, so all three
already carry the same automatic, prominent disclosure for the ~20 static
demo clients they apply to, and never render for a real client (which gets
the honest `CapabilityPlaceholder` "not yet available" fallback,
unchanged since the P0 fix). That bar is already met; a rewrite of
illustrative demo-only arithmetic would have zero real-customer benefit
since no real client can reach that branch. Downgraded from "open" to
"closed by disclosure" in the gap register, with the reasoning recorded
rather than silently dropped.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- `localhost:3001` → 307, `localhost:4200/health` → 200 `database: connected`, `localhost:3100/v1/health` → 200.
- Fresh browser tab navigation to `/services`: clean 307 to `/staff/login`, zero console errors.
- No backend touched — no regression run needed beyond the standing full suite (932/932, last run this session, unaffected by a UI-only single-file change).

## FINAL STATUS: PASS

A genuinely fresh, complete mechanical sweep (not a re-read of prior
claims) found the two previously-recorded gaps were stale/already closed,
and surfaced one real, narrow, previously-uncaught gap, which was fixed.
`docs/enterprise-feature-gap-register.md` updated with the corrected,
current state.
