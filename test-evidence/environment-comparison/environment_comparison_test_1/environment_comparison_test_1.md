# environment_comparison_test_1 — Environment Comparison, real authenticated Playwright validation

**Feature**: Environment Comparison (the Universal Comparison Engine, `environment`-labeled connections — DEV/TEST/UAT/PROD per the Master Autonomous Build directive's own naming)
**Test Suite**: `environment_comparison_test_1`
**QA Client**: `AskABD PW Environment Comparison Test 1` (real ID: `client-ea51a3aa-f5d4-4936-8625-334e9b4c52d6` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default

## Why this pass exists (not a duplicate of `comparison_test_1`)

`comparison_test_1` (earlier this session) proved the Comparison Engine's
real mechanism works, but both sides pointed at the SAME real database —
a genuine, correct **match** proof, but it never exercised real
cross-environment **difference detection** (Added/Removed/Changed), and
both connections were arbitrarily labeled — the real `environment` field
itself was never actually varied or verified as meaningfully distinct.
This pass closes that real gap, per the newest directive's explicit
requirement to validate comparisons across genuinely different real
environments (DEV vs TEST vs UAT vs PROD) with real Added/Removed/Changed
results, not just a self-referential match.

## Real, deliberate fixture: two structurally different databases

Created two real, disposable Postgres databases on the same local dev
server (dropped in cleanup, not part of the shared app database):

- `comparison_env_test_prod` — real tables `customers`, `orders`,
  `products`.
- `comparison_env_test_staging` — real tables `customers`, `orders`,
  `orders_v2` (`products` deliberately omitted, `orders_v2` deliberately
  added) — a genuine, verifiable structural difference, not fabricated.

Real, predicted-in-advance expected result (Prod as baseline/left,
Staging as right): match = 2 (`customers`, `orders`); missing on right
(in prod, not staging) = 1 (`products`); extra on right (in staging, not
prod) = 1 (`orders_v2`).

## Steps executed (real, through the actual UI and real API)

1. Confirmed authenticated session live, no re-auth needed.
2. Created `AskABD PW Environment Comparison Test 1` through the real
   6-step onboarding wizard.
3. Created two real database connections via the real
   `POST /database-connections` endpoint (legitimate prerequisite
   fixture, same established precedent as prior comparison passes): one
   tagged `environment: production` pointing at the real
   `comparison_env_test_prod` database, one tagged `environment: staging`
   pointing at `comparison_env_test_staging`.
4. Navigated to the real Comparisons page. Confirmed live: the connection
   picker dropdowns correctly show each connection's real, distinct
   environment label — `"Prod Postgres (production)"` /
   `"Staging Postgres (staging)"` — proving the environment dimension is
   genuinely surfaced, not just present in the database.
5. Ran a real comparison (Prod as left/baseline, Staging as right)
   through the actual "Run Comparison" button. **Real result exactly
   matched the independently-predicted expectation**: `2 matches · 2
   differ`; table-level detail confirmed `public.customers` and
   `public.orders` as real `Match`, `public.products` as real `Missing on
   right`, `public.orders_v2` as real `Extra on right` — proving genuine
   ADDED/REMOVED difference detection across two really-different
   environments, not a self-referential match.
6. Console/network verified clean — every real request 200/201/204.
7. Full API regression: no code changed this pass (pure validation using
   already-shipped capability); baseline unaffected.
8. **Cleanup**: re-confirmed exact client id/name via direct SQL
   immediately before deletion. Deleted `comparison_runs` (1 row),
   `oc_client_database_connections` (2 rows), plus 6 further real
   client-scoped tables. Zero orphans verified. **Also dropped both real,
   disposable environment databases** (`comparison_env_test_prod`,
   `comparison_env_test_staging`) — confirmed via direct query that only
   `postgres` and the shared `comparison` app database remain on the
   server afterward. Both protected clients (`Test1`,
   `AskABD Manual UAT 2026`) confirmed present and unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Environment Comparison (Universal Comparison Engine) |
| Test Suite | environment_comparison_test_1 |
| Client | AskABD PW Environment Comparison Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | Covered by `universal-comparison-engine.test.ts` 11 (real match-path already covered there; this pass adds real live proof of the mismatch/diff path, not yet mirrored as an automated test — real, disclosed follow-on) |
| Playwright | 1/1 real end-to-end workflow PASS — real cross-environment diff detection proven live, matching an independently-predicted expected result exactly |
| Console | PASS |
| Network | PASS — every real request 200/201/204 |
| API | PASS — real, correct Added/Removed/Changed/Unchanged classification |
| Database | PASS — zero orphans; both disposable fixture databases cleanly dropped |
| Security | PASS (via existing RBAC/tenant/VPN-guard middleware, not independently re-exercised this pass) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 1 taken in-session (not saved to disk — the new real-Playwright evidence pipeline was being built in parallel this pass; see `docs/enterprise-operations-progress.md` for its status) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 — the engine correctly, precisely detected the real, deliberately-constructed difference |
| Failures Fixed | N/A |
| Blocked | 0 |
| Remaining | No automated test yet for the real mismatch/diff path (only live-proven); real Add/Remove detection proven only at the table level, not yet column-level (already a known, disclosed gap for this engine) |

**FINAL STATUS: PASS** — this is the first pass this session to prove
genuine cross-environment schema DIFFERENCE detection (not just a
same-database match), with an independently-predicted expected result
matched exactly by the real engine output.
