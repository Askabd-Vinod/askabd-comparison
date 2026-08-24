# portfolio_intelligence_rbac_test_1 — real security gap found and fixed while verifying the Analytics Engine (coverage matrix row #68)

**Feature under test**: `PortfolioIntelligenceService`'s real routes (`operations-center-routes.ts`) — a real, pre-existing, substantial cross-client analytics capability found unprotected.
**Test Suite**: `portfolio_intelligence_rbac_test_1` (2026-08-24, continuation of `executive_reporting_test_1` while investigating coverage matrix row #68 "Analytics Engine")
**Environment**: local dev · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## What was found

Investigating row #68's claim ("Portfolio Intelligence page exists, real scope unconfirmed") led to reading `portfolio-intelligence-service.ts` in full: a real, substantial, SQL-backed analytics service — real per-client financial investment/savings/ROI, real cross-client problem/gap/technology pattern detection, real resource views, and real "engineering intelligence" (top risks, top financial opportunities, underperforming transformations, real rule-based recommendations derived from actual thresholds — never AI-fabricated, matching this session's own `executive_reporting_test_1` discipline).

**The real gap**: 8 real, wired routes exist under `/oc/portfolio/*`. Only ONE (`/portfolio/clients/:clientId/health`) carried an RBAC rule. The other 7 — `health`, `clients`, `financial`, `transformations`, `patterns`, `resources`, `intelligence` — fell through to `defaultPolicy: 'authenticated'`, meaning **any authenticated identity, staff or a real customer token, could read AskABD's own aggregate cross-client financial and business intelligence data**.

## Fix

Added a real `Admin.Access` RBAC rule to all 7 previously-unprotected routes, matching the existing precedent on the one already-protected sibling route.

## Real, live proof

`apps/api/tests/portfolio-intelligence-rbac-test-1.test.ts` (4 new tests, all real):
- A real customer token (no admin role) is denied (**403**) on every one of the 7 real portfolio routes — the actual gap this closes.
- An unauthenticated request is denied (**401**) on every route.
- A real staff (admin) token can still reach every route (**<300**) — proving the fix does not over-block legitimate staff use.
- The pre-existing already-protected route is confirmed unaffected.

Full local run: **4/4 passing**.

## Mechanical audit performed — a real, larger finding disclosed, not silently fixed piecemeal

A real script parsed every `server.<method>('/oc/...')` registration in `operations-center-routes.ts` and diffed against every RBAC rule, filtered to routes with no `:clientId` in their path (the highest-risk class: platform-wide data with no tenant-scoping backstop at all). It found **47 total candidates** — the 7 fixed here, and **46 more**, honestly disclosed and NOT blindly fixed: several look like legitimate exceptions (`/oc/me/*` — resolve against the caller's own identity; OTP onboarding steps; a Jira webhook likely using its own auth), several look like already-covered body-clientId routes (lifecycle/discovery/assessment `start` endpoints), several look like legitimate public reference/catalog data (compliance framework definitions, service bundle catalogs), and several look like real further candidates deserving priority triage (`/oc/clients` client listing, `/oc/audit`, cross-client `/oc/defects`/`/oc/incidents`/`/oc/notifications`). The full list and reasoning is tracked in `docs/security-risk-register.md` RISK-014, with the reusable script itself, rather than attempting an unverified blind mass-fix that risks breaking legitimate customer-portal functionality.

## FINAL STATUS: RESOLVED (for the 7 confirmed routes); RISK-014 tracks the remaining 46 candidates as OPEN, individually untriaged

A real, severe, confirmed security gap found and fixed with live proof — plus an honest, actionable disclosure of the wider mechanical-audit surface rather than either ignoring it or attempting an unverified mass-fix.
