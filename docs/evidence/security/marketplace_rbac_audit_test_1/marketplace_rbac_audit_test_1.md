# marketplace_rbac_audit_test_1 — full, mechanical, live RBAC + cross-tenant audit of the marketplace surface

**Directive**: master continuation/hardening directive's dedicated "Marketplace Audit — Do Not Stop At Route Security" section.
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Scope, established mechanically not assumed

A mechanical `server.<method>(` sweep of `merchant-brand-routes.ts`,
`price-routes.ts`, `review-routes.ts` (the complete real marketplace
surface — confirmed via a broader search across every other route file for
`catalog`/`inventory`/`settlement`/`commission`/`publish`/`products`,
which found nothing outside these 3 files) found **28 real, registered
routes**, all under `/api/v1/**` (never `/oc/**` — `tenant-access.ts`'s
`pathPrefix: '/api/v1/oc/'` genuinely does not apply here; only
`platform/rbac/rules.ts` and `defaultPolicy: 'authenticated'` protect this
surface at all).

A separate real service layer (`merchant-portal-prisma.ts` —
`InventoryService`, `PricingConsole`, `CampaignService`) was found to have
**zero HTTP route wiring anywhere** (confirmed via grep — only referenced
from a barrel export and its own unit test) — genuinely no attack surface
to audit; noted rather than silently skipped.

## Method

For every route: read the real handler + service method, determine the
real ownership/tenant model from `prisma/schema.prisma` directly (not
assumed from column names), then prove the real behavior live via
`app.inject` against the actual registered routes with the real
auth/RBAC middleware chain — using real Prisma-backed fixtures (two
distinct real merchants under two distinct real `tenant_id`s) for every
cross-tenant claim, cleaned up afterward and verified via a direct
post-run query.

## Findings

**Correctly protected, confirmed not regressed** (real, unrelated
authenticated identity denied `403`; real admin token allowed through,
verified via a real DB state change after the admin call):
`POST /admin/merchants/:id/{approve,suspend,reactivate}`, `POST
/admin/verifications/:id/review`, `POST/PUT/archive/restore
/admin/brands*`, `GET /admin/reviews/pending`, `POST /admin/reviews/:id
/moderate`.

**Confirmed intentional, not a gap**: `GET /items/:itemId/{prices,offers,
reviews}*` require real authentication (`401` with none) but not a
specific role — any authenticated identity can browse them, matching a
real shopper-facing marketplace's expected shape (prices/reviews are
meant to be visible to any logged-in shopper).

**Real, confirmed gaps — an extension of the already-disclosed RISK-017,
same root cause (no real identity-mapping bridge), reaching further than
previously documented**:
- `merchant.register()`'s `tenantId` is caller-supplied with zero
  verification against the caller's real org — live-proven: an identity
  whose real org is `seller-org-a` successfully registered a merchant
  claiming `tenantId: 'seller-org-b'`.
- `POST /merchants/:id/verification` and `POST /merchants/:id/branches`
  have zero ownership check on `:id` — live-proven: `seller-org-a`'s
  identity successfully submitted verification documents and added a
  branch to a real merchant genuinely owned by `seller-org-b`, both
  persisted to the real database.

**A separate, minor inconsistency**: `POST /reviews` and `POST /reviews
/:id/helpful` have no explicit rule at all (not even `authenticatedOnly`),
unlike every sibling write route — falls to `defaultPolicy:
'authenticated'` so still requires a real token, not itself a security
hole, but a real inconsistency in how this surface's rules were authored.

## Real evidence — no false pass

`apps/api/tests/marketplace-rbac-audit-test-1.test.ts`, **28/28 passing**,
including 4 tests explicitly marked `CONFIRMED GAP` — these assert the
CURRENT, undesirable behavior on purpose, so a future real fix (the
`marketplace_identity_mapping` bridge RISK-017 already calls for) will
fail them loudly and force a deliberate update, rather than the fix going
unnoticed or the gap being silently re-introduced.

Not fixed this pass, same reasoning RISK-017 already states and
re-confirmed fresh here: the real fix is a genuine, separate feature (the
identity-mapping bridge), and a fresh grep across `apps/web` this pass
still finds zero real frontend consumers of this entire marketplace
surface — not the highest-value security work available right now.

## Regression

- `tsc --noEmit` clean on `apps/api`.
- `marketplace-rbac-audit-test-1.test.ts`: 28/28 passing.
- Full API regression: **96 files / 988 tests, all passing** (960 baseline + 28 new).
- Real cleanup verified: a direct post-run query for every test-created
  merchant name pattern found zero orphans.
- `localhost:3001/4200/3100` all healthy throughout.

## FINAL STATUS: PASS_WITH_EVIDENCE

Every route in the real marketplace surface has now been individually
classified with real, live HTTP-layer evidence — never route naming,
middleware presence, or a prior pass's characterization alone. The
correctly-protected routes are genuinely `PASS`; the confirmed gaps are
`OPEN` (tracked under the extended RISK-017, not silently accepted); the
public-shaped read routes and the minor rule-authoring inconsistency are
disclosed with their real reasoning. Nothing here was asserted without a
real test proving it.
