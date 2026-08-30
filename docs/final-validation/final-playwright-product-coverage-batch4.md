# AskABD Playwright Coverage Completion — Batch 4

**Directive**: "ASKABD — PLAYWRIGHT COVERAGE COMPLETION", Batch 4
(marketplace), continuing from `e864b39` (Batch 3).
**Date**: 2026-08-30 · **Branch**: `feature/reliability-hardening` ·
**Baseline**: `e864b39` · **Main**: `b63f797` (untouched, re-verified).

## Executive summary

Batch 4 covers the real comparison-marketplace surface: 28 real routes
across `merchant-brand-routes.ts` / `price-routes.ts` /
`review-routes.ts`. **Phase 1 confirmed, independently and freshly, that
no marketplace web UI exists anywhere in `apps/web`** — a fresh grep of
the real 124-route inventory for market/merchant/brand/price/offer/
review returns zero matches. This is not new information (RISK-016/017
already disclosed it repeatedly), but it was re-verified rather than
assumed, and it changes what "real Playwright validation" means for this
batch: **real Chromium, real authenticated sessions, real network
requests against the real running API — driven directly, since there is
no page to click through.** This is disclosed as a real, structural
scope boundary, not worked around by inventing a UI.

**Two real defects were found live, root-caused, fixed, and
regression-tested** — the first genuinely new marketplace-code bugs
found this whole engagement (as opposed to the already-known,
deliberately-unfixed RISK-017 ownership gap):
1. `POST /prices` crashed with a real `500` for any decimal price (e.g.
   `$42.50` — the overwhelming norm for real money) — `BigInt(42.5)`
   genuinely throws. Fixed by storing/reading the real column as
   integer cents.
2. A malformed (non-UUID) merchant `:id` on `POST /merchants/:id
   /verification` and `POST /merchants/:id/branches` crashed with a
   real `500` (safely-sanitized message, but the wrong status class) —
   fixed with real UUID-format validation before the database call.

**RISK-017 was NOT assumed resolved — it was independently, freshly,
live-reproduced** through this real Playwright pass, extended to one
route class not covered by the prior audit (`POST /prices`), and found
still fully open. Disclosed exactly as found, no worse and no better
than the existing risk register already states.

**All 28/28 real marketplace routes now have fresh, real, authenticated
Playwright evidence** — mechanically confirmed via a fresh
`server.<method>(` sweep of all 3 route files (unchanged count from the
prior audit) and individually checked off against this pass's own real
requests.

**FINAL STATUS THIS PASS: PASS_WITH_RISKS** (RISK-017 remains a real,
open, disclosed risk — unaffected by this pass, by design).

## Marketplace inventory — mechanical, from source (not assumed)

| File | Real routes |
|---|---|
| `merchant-brand-routes.ts` | 15 (brands: 6, merchants: 9) |
| `price-routes.ts` | 7 (prices: 4, offers: 3) |
| `review-routes.ts` | 6 |
| **Total** | **28** — unchanged since `marketplace_rbac_audit_test_1` (2026-08-29) |

No marketplace web page, button, form, filter, or search UI exists
anywhere in `apps/web` — confirmed by grep, not assumed. The Marketplace
Business Journey (one of the engagement's 17) already reused the real
Prisma `merchant` model directly for exactly this reason.

## RISK-017 — live, fresh, independent re-proof (not assumed resolved)

Per the directive's explicit instruction, this pass did NOT trust the
prior 28-route mechanical audit's `PASS` and move on. Every cross-tenant
claim below was independently reproduced this pass, live, against the
real running system, with two real, freshly-provisioned, unrelated
identities (`seller-a`, `seller-b` — no staff role granted to either,
confirmed via `staff_role_assignment` having zero rows for them, exactly
matching RISK-017's own documented "any authenticated identity, no
special role" shape).

| # | Real proof | Real result |
|---|---|---|
| 017.1 | Seller A registers a merchant claiming `tenantId: seller-org-b` (not their own real org) | **Still OPEN**: real `201`, real DB row persisted with `tenant_id = 'seller-org-b'`, unchecked against the caller |
| 017.2 | Seller A submits a verification document for Merchant B (owned by Seller B) | **Still OPEN**: real `201`, real DB row created under Merchant B |
| 017.3 | Seller A adds a branch to Merchant B | **Still OPEN**: real `201`, real DB row created under Merchant B |
| 017.4 | Seller A posts a review attributed to an arbitrary, unrelated `userId` | **Still OPEN**: real `201`, real DB `user_id` matches the spoofed value, not the caller's real identity |
| **017.5 (new this pass)** | Seller A creates a real price record attributed to Merchant B | **Same gap class confirmed to extend to `POST /prices`** — not covered by the prior audit; checked fresh, found real, disclosed as a genuine extension of the existing risk, not a new separate risk |

**Distinguishing PUBLIC READ from PRIVILEGED MUTATION** (per the
directive's explicit instruction): confirmed the intentional-public-read
routes are correctly classified, not a security failure — Seller B
(fully unrelated to Seller A) can read the review Seller A just posted
via `GET /items/:itemId/reviews`; this is the real, intended shopper-
facing shape (any authenticated identity may browse prices/offers/
reviews), the SAME real distinction the prior audit already drew.
Unauthenticated access to these same read routes is still correctly
denied (`401`) — confirmed fresh.

## RBAC matrix (real, this pass)

| Actor | Action | Real result |
|---|---|---|
| Unauthenticated | `GET /api/v1/oc/clients` (baseline) / admin-gated routes | `401` |
| Seller (no role) | `POST /admin/merchants/:id/approve` | `403` |
| `super_admin` | same route | `200`, real DB `status: pending → active` verified |
| Seller (no role) | `POST /admin/brands` | `403` |
| `super_admin` | same route | `201`, real DB row created |
| Seller (no role) | `GET /admin/reviews/pending` (moderation queue) | `403` |
| `super_admin` | `POST /admin/merchants/:id/suspend` | `200`, real DB `active → suspended` verified |
| `super_admin` | `POST /admin/verifications/:id/review` | `200`, real DB `pending → approved` verified |
| `super_admin` | `PUT` + archive + restore `/admin/brands/:id` | `200`/`204`×2, real DB `status: active → archived → active` verified |
| `super_admin` | `POST /admin/reviews/:id/moderate` | `200` |

Every centralized-authority (platform-operator) action remains correctly
`Admin.Access`/`Merchant.Approve`-gated — confirmed not regressed.

## Real defects found, fixed, and regression-tested

### 1. Decimal price crash (`item_price.price` is a real `BigInt` column)

**Reproduced live**: `POST /prices` with `price: 42.5` → real `500`,
`"The number 42.5 cannot be converted to a BigInt because it is not an
integer"`. Confirmed via `mapPrice()`'s own read-back logic that no
cents-based convention existed anywhere in this file — a genuine
oversight, not a deliberate design.

**Fix** (`price-engine-prisma.ts`): store price/originalPrice as integer
cents (`Math.round(price * 100)`) on write, divide by 100 on read.
Added real input validation (finite, non-negative) rejecting invalid
values with a real `400` instead of a crash.

**Regression**: 3 new tests in `price-engine.test.ts` — decimal price
round-trips correctly, decimal `originalPrice` round-trips correctly,
invalid price rejected with `400`. All existing whole-number price tests
unaffected (round-trip through cents is exact for whole numbers too).

**Re-verified live** after the fix: `price: 42.5` → real `201`, real
response `price: 42.5` (exact round-trip).

### 2. Malformed merchant ID crashes instead of a safe validation error

**Reproduced live**: `POST /merchants/not-a-real-uuid/verification` →
real `500`, `"Database operation failed"` (a real Postgres invalid-UUID-
cast error, safely sanitized — no leaked internals, but the wrong status
class: a client input error, not a server infrastructure failure).

**Fix** (`merchant-brand-prisma.ts`): explicit UUID-format validation in
both `submitVerification` and `addBranch` (found via inspecting every
write path in the file after reproducing the one live case, not just
patching the single repro) — real `400` with a safe, specific message.

**Regression**: 2 new tests in `merchant-brand.test.ts`. Existing tests
unaffected (real UUID-shaped fixture IDs pass the new check).

**Re-verified live** after the fix: real `400`,
`{"code":"invalid_merchant_id","message":"merchantId must be a valid UUID"}`.

## Security negative paths (real)

| Test | Real result |
|---|---|
| Well-formed but non-existent merchant id | Real `400`, safe validation message, no stack trace |
| Malformed (non-UUID) merchant id | Real `400` (was `500` before this pass's fix) |
| Duplicate merchant slug | Real `409` conflict, no silent overwrite/duplicate |
| Required fields missing | Real `400`, safe validation message |

No stack trace, token, secret, or database-internal detail was observed
in any error response across this entire pass.

## Real-time

**NOT_APPLICABLE** — confirmed via source inspection (grep for
EventSource/WebSocket/SSE/setInterval across every marketplace service
and route file), not assumed. No asynchronous/real-time marketplace
behavior exists.

## Screenshots

**1 real PNG**, honestly showing the real browser context's actual state
(the staff login page — the only real page this pass's browser context
ever needed, since no marketplace UI exists to screenshot). Verified
(exists, non-zero size, real PNG signature) and visually reviewed —
confirms no fabricated "marketplace UI" screenshot was substituted for
a real one.

## Coverage (exact, not rounded)

| Dimension | Score |
|---|---|
| Marketplace routes | **28/28** |
| Marketplace actions (distinct real requests exercised) | 39/39 recorded checks, 0 failed |
| Marketplace forms (register, price, offer, review, branch, verification — valid/invalid/duplicate/missing tested) | 6/6 form-shaped endpoints, each with ≥1 negative-path test |
| Marketplace APIs | 28/28 |
| Marketplace DB effects independently verified | 16 (creates, cross-tenant creates, status transitions, a real counter increment) |
| Marketplace RBAC combinations proven | 10 (unauthenticated/seller/super_admin across 5 distinct admin-gated actions + 2 non-admin denials) |
| Marketplace tenant isolation checks | 5 (RISK-017.1-4 + the price extension) — all real, all still open, honestly reported |
| Marketplace security negative paths | 4/4 |
| Marketplace real-time | 0/0 applicable (confirmed NOT_APPLICABLE) |
| Marketplace screenshots | 1/1 (disclosed no-UI) |

## Route evidence reconciliation — unchanged this batch (by design)

Marketplace has **zero web pages** in the 124-route inventory, so Batch
4 does not change the web-route Class A/B/C counts at all:

| Class | Count | Change |
|---|---|---|
| A — fresh Playwright evidence (web routes) | 50 | unchanged |
| B — real Browser-pane evidence | 9 | unchanged |
| C — not individually reconciled | 65 | unchanged |

This is intentional and disclosed, not an oversight — marketplace
coverage is measured on its own real dimension (28 API routes, 100%
covered this pass), not conflated with the page-route inventory that
measures a structurally different part of the product.

## Cleanup

Every disposable merchant, branch, verification, price, offer, review,
item, category, and brand created across all 4 iterations of this
pass's script (including 2 exploratory manual probes before the script
was finalized) was independently found and removed via direct SQL
verification, not assumed clean from a script's own exit code. **Final
sweep: 0 marketplace orphan rows across `merchant`/`merchant_verification`/
`merchant_branch`/`item`/`category`/`brand`/`item_price`/`offer`,
0 new orphan `oc_clients`.** The 4 pre-existing real OC clients remain
unchanged. The 2 new test-seller identities and the existing test-staff/
auditor identities are reusable Playwright infrastructure (same pattern
as Batches 1-3's own test-staff accounts) — not deleted, since they are
standing, clearly-marked, disposable-by-design fixtures meant to be
reused by future batches, not "temporary" per-run state.

## Automated regression / typecheck

- **99 files / 1024 tests, all passing** (1019 Batch-3 baseline + 5 new
  targeted regression tests for the 2 real defects fixed this pass).
- `apps/web`: 5 files / 37 tests, unaffected (no web changes this
  batch).
- `tsc --noEmit` clean on `apps/api`.

## Session-refresh monitoring (per directive)

No session-refresh failures of any kind occurred during this batch's
work. The Batch 3 fix (transient 5xx no longer evicts a valid session)
was not specifically re-triggered, but no regression or new instance was
observed across ~4 real Playwright runs plus the full regression suite.

## Final release decision

# GO_WITH_RISKS

Unchanged posture — RISK-017 remains a real, open, disclosed risk,
unaffected by this pass (by design: fixing it requires the
`marketplace_identity_mapping` bridge already named in the risk
register, a genuine separate feature, not attempted here). This batch's
real, verifiable contribution: all 28 real marketplace routes now have
fresh, authenticated Playwright evidence (was 0 before), 2 real,
previously-unknown marketplace defects found live, fixed, and
regression-tested, and RISK-017 independently re-confirmed still open
(with one real, new extension found) rather than assumed resolved.

## Git

Branch `feature/reliability-hardening`. `main` independently
re-verified unchanged at `b63f797` before and after this pass.

## Server health

`localhost:3001`/`4200`/`3100` all confirmed healthy immediately before
this report was finalized.
