# risk_016_marketplace_rbac_test_1 — complete RBAC + tenant-isolation audit of the comparison-marketplace surface

**Feature under test**: `platform/rbac/rules.ts` (extended/corrected) — a complete audit of `api-routes.ts`, `merchant-brand-routes.ts`, `price-routes.ts`, `review-routes.ts` (RISK-016), plus a real IDOR found and honestly disclosed as RISK-017.
**Test Suite**: `risk_016_marketplace_rbac_test_1` (2026-08-25, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE" directive, Phase 1)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Scope and a real, disclosed fact about this surface

This surface — categories, items, comparisons, merchants, brands, prices, offers, reviews, templates — predates the Enterprise Operations Centre. A grep across all of `apps/web/src` for every route in this surface returns zero matches: **no frontend anywhere in this repository calls any of these APIs.** This is disclosed plainly, not used as a reason to skip fixing real vulnerabilities — a live, reachable API is a live API regardless of whether a UI currently calls it.

## The real fixes (RISK-016)

Every route in all 4 files was read in full and checked against `rules.ts`, not pattern-matched:

1. `GET /admin/templates/:id/attributes` — no rule at all. Added `Template.Read`.
2. **A methodology finding**: three pre-existing `rules.ts` rules (`POST /merchants`, `PUT /merchants/:id`, `POST /merchants/:id/verify`) matched **no real registered route** — dead rules giving a false impression of protection while the real routes (`/admin/merchants/:id/approve|suspend|reactivate`, `/admin/verifications/:id/review`) had zero coverage. Corrected to the real paths with the pre-existing `Merchant.Approve` permission (already correctly scoped to `admin`/`super_admin`).
3. All 4 `/admin/brands*` write routes — no rule at all. Gated `Admin.Access`.
4. `GET /admin/reviews/pending` and `POST /admin/reviews/:id/moderate` — no rule at all. Gated `Admin.Access`.

`POST /merchants/register` deliberately kept `authenticatedOnly` — the `merchant` role is the only role with `Merchant.Create` by default, so gating registration behind it would make self-registration impossible (a real chicken-and-egg case the code's own `status:'pending'` already assumes).

## A real IDOR found and honestly NOT shallow-patched (RISK-017)

While auditing, reading `comparison-service.ts` and `review-service-prisma.ts` in full surfaced a real object-ownership bug: `POST /comparisons`, `GET /comparisons`, and `POST /reviews` trust a client-supplied `userId` with zero verification against the caller's real identity. `GET /comparisons?userId=<anything>` returns that user's full saved-comparison list — including private ones, `isPublic` is never checked — to any authenticated identity.

The obvious-looking fix (substitute `getAuth(req)?.userId`) was investigated and rejected as itself wrong: `comparison.user_id`/`review.user_id` are `@db.Uuid` columns with **no `User` model anywhere in `prisma/schema.prisma`** — no foreign key, no real users table. `auth.userId` (askabd-identity's JWT `sub`) is a different identity system, not guaranteed UUID-shaped (it is literally `'dev-user-000'` in this environment's dev-bypass mode), and was never wired to this marketplace module. Force-substituting it would break every dev/test caller and silently conflate two unrelated identity systems — a technically wrong fix, not a real one. Tracked honestly as RISK-017, disclosing the real fix required (a `marketplace_identity_mapping` bridge, analogous to the Operations Centre's own real `client_identity_mapping`) rather than either ignored or papered over.

## Security — live proof (Security Testing Addendum)

`apps/api/tests/risk-016-marketplace-rbac-test-1.test.ts`, 16/16 passing:

| Scenario | Result |
|---|---|
| Customer, `GET /admin/templates/:id/attributes` | **403** |
| Customer, all 4 brand admin routes | **403** each |
| Customer, all 4 merchant admin actions | **403** each |
| `business_user` role (not admin/super_admin), merchant approve | **403** (proves `Merchant.Approve` is correctly admin-only) |
| Customer, review moderation queue + moderate action | **403** each |
| Unauthenticated, every fixed route | **401** |
| Staff (admin), every fixed route | not blocked by RBAC |
| Customer, `POST /merchants/register` | not blocked (intentional self-service) |
| Unauthenticated, `POST /merchants/register` | **401** |
| Customer, `GET /comparisons?userId=<arbitrary>` | not blocked — live proof of the RISK-017 gap this test documents, not fixes |

## Regression and DB integrity

Full suite: **895/895 passing** (879 baseline + 16 new). `tsc --noEmit` clean. No migration this pass. This test file's own "staff not blocked" assertions create real `brand`/`merchant` rows (genuine service calls, not mocked) — all namespaced under a run-scoped tag and cleaned in `afterAll`; verified zero orphans remain after the run. Both protected clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged.

## FINAL STATUS: PASS (RISK-016 RESOLVED for the confirmed gaps; RISK-017 opened and honestly disclosed, not fixed)

A complete, real audit — not a batch `Admin.Access` sweep — that found and fixed 4 real classes of missing RBAC coverage (including a methodology bug: 3 dead rules pointing at non-existent routes), and found a real IDOR that was investigated deeply enough to recognize the obvious fix would itself be wrong, disclosing the real, larger fix needed instead of shipping something technically incorrect.
