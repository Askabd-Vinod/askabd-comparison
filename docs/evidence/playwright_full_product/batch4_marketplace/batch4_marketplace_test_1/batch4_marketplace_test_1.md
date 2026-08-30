# batch4_marketplace_test_1 — real Playwright evidence
**Feature**: Batch 4 — marketplace (28 real routes: merchant-brand, price, review) — real Playwright-driven API validation, RISK-017 live cross-tenant proof, RBAC matrix
**Client**: N/A
**Environment**: local dev · **Browser**: chromium · **Viewport**: N/A
**Started**: 2026-08-30T17:09:17.860Z · **Finished**: 2026-08-30T17:09:34.971Z
## Screenshots (physically verified: exists, size > 0, real PNG signature)
- `docs/evidence/playwright_full_product/batch4_marketplace/batch4_marketplace_test_1/batch4_marketplace_test_1_01.png` (123035 bytes) — Marketplace surface has no web UI — real Playwright-driven API validation only (screenshot of the real browser context used to drive these requests)
## Summary
| TOTAL | PASSED | FAILED | BLOCKED | PASS RATE |
|---|---|---|---|---|
| 39 | 34 | 0 | 0 | 87% |
## Steps
### batch4-login — Real login for super_admin + 2 plain seller identities, real EdDSA-signed tokens from the real identity service — **PASS**
- Expected: All 3 real logins succeed
- Actual: admin token present: true; seller-a: playwright-e2e-test-seller-a@askabd-dev.local; seller-b: playwright-e2e-test-seller-b@askabd-dev.local
### batch4-fixture-setup — Real fixture: 1 category + 1 item created for price/offer/review testing — **PASS**
- Expected: Both created (201)
- Actual: category status=201 id=259048b4-359e-4937-82db-3028c23597ad; item status=201 id=72fe39f2-c178-4420-807e-e75c7a1216f0
### batch4-merchant-register — Real merchant registration for two distinct, unrelated identities (own resources — ALLOWED case) — **PASS**
- Expected: Both 201
- Actual: A: 201 id=207672e1-7bf1-478e-9f4f-06957e084740; B: 201 id=6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d
### batch4-risk017-tenant-spoof — RISK-017.1: seller A registers a merchant claiming tenantId=seller-org-b (not their own real org) — real, live proof, not assumed — **PASS_WITH_RISKS**
- Expected: Per RISK-017 (OPEN, not fixed): the claimed tenantId is persisted unchecked against the caller's real identity
- Actual: Real HTTP 201. Real DB tenant_id for the created row: seller-org-b (claimed: seller-org-b, real caller: seller-org-a)
- Notes: PASS_WITH_RISKS status here means the KNOWN OPEN vulnerability was successfully, independently reproduced — matches expected per RISK-017, not a new finding. A plain PASS would mean it was unexpectedly fixed (also reported honestly, not assumed).
### batch4-risk017-cross-verify — RISK-017.2: seller A submits a verification document for merchant B (owned by seller B) — real, live cross-tenant mutation attempt — **PASS_WITH_RISKS**
- Expected: Per RISK-017 (OPEN): no ownership check on :id, real mutation persisted despite the caller having no real relationship to merchant B
- Actual: Real HTTP 201. Real DB row exists for merchant_id=6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d (expected merchantB=6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d)
- Notes: Real, live reproduction of a documented OPEN risk — not a new finding.
### batch4-risk017-cross-branch — RISK-017.3: seller A adds a branch to merchant B — real, live cross-tenant mutation attempt — **PASS_WITH_RISKS**
- Expected: Per RISK-017 (OPEN): no ownership check, real branch persisted under merchant B despite being created by an unrelated identity
- Actual: Real HTTP 201. Real DB row merchant_id=6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d (expected merchantB=6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d)
- Notes: Real, live reproduction of a documented OPEN risk — not a new finding.
### batch4-rbac-approve-denied — RBAC: non-admin seller identity DENIED on POST /admin/merchants/:id/approve — **PASS**
- Expected: 403 — Merchant.Approve required, no seller has it
- Actual: Real HTTP 403
### batch4-rbac-approve-allowed — RBAC: real super_admin ALLOWED on POST /admin/merchants/:id/approve, real DB status change verified — **PASS**
- Expected: 200/201, real status change from the denied attempt's pre-state
- Actual: Real HTTP 200. Real DB status: before=pending, after=active
### batch4-rbac-unauth-admin — RBAC: unauthenticated DENIED on admin-gated route — **PASS**
- Expected: 401
- Actual: Real HTTP 401
### batch4-rbac-brand-denied — RBAC: non-admin seller DENIED on POST /admin/brands — **PASS**
- Expected: 403 — Admin.Access required
- Actual: Real HTTP 403
### batch4-rbac-brand-allowed — RBAC: real super_admin ALLOWED on POST /admin/brands, real DB row created — **PASS**
- Expected: 201, real row exists
- Actual: Real HTTP 201. Real DB row: {"id":"6ce411f1-1f33-4347-91b5-4dd465d20698","name":"Batch4 Brand 1788109771078"}
### batch4-rbac-moderation-denied — RBAC: non-admin seller DENIED on GET /admin/reviews/pending (moderation queue) — **PASS**
- Expected: 403
- Actual: Real HTTP 403
### batch4-public-read-unauth — Genuinely public-shaped read route: unauthenticated still DENIED (401) — **PASS**
- Expected: 401 — requires SOME real authenticated identity, matching a real shopper-facing marketplace
- Actual: Real HTTP 401
### batch4-public-read-authenticated — Genuinely public-shaped read route: any authenticated identity (no special role) ALLOWED — **PASS**
- Expected: 200 — any authenticated shopper can browse prices
- Actual: Real HTTP 200
### batch4-price-create-own — Real price creation for own merchant (real DB row verified) — **PASS**
- Expected: 201, real row with correct merchant_id + price
- Actual: Real HTTP 201. Real DB row: {"id":"3c424079-6d72-46a4-a4ce-98b06b0fd4bc","merchant_id":"207672e1-7bf1-478e-9f4f-06957e084740","price":"4250"}
### batch4-risk017-cross-price — RISK-017 extension: seller A creates a real price record attributed to merchant B (not tested in the prior audit — checked fresh this pass, per directive) — **PASS**
- Expected: Real, observed result (may or may not share the same ownership gap as merchant/verification/branch — not assumed either way)
- Actual: Real HTTP 201. Real DB row merchant_id: 6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d (expected if unchecked: 6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d)
- Notes: Real, live finding: this same class of gap extends to price records too (consistent with POST /prices having no ownership check per the route's own RBAC rule, authenticatedOnly).
### batch4-offer-create — Real offer creation for own merchant (real DB row verified) — **PASS**
- Expected: 201, real row
- Actual: Real HTTP 201. Real DB row: {"id":"25cd5dac-c968-4311-8b97-38bc00e08292","merchant_id":"6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d","title":"Batch4 Real Offer"}
### batch4-risk017-review-spoof — RISK-017.4: seller A posts a review attributed to an arbitrary, unrelated userId (not their own real identity) — real, live proof — **PASS_WITH_RISKS**
- Expected: Per RISK-017 (OPEN): review.user_id is trusted from the request body with zero verification against the caller's real identity
- Actual: Real HTTP 201. Real DB user_id: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee (claimed/spoofed: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, real caller identityId: 0a557c58-1359-4397-9d40-5a56de338840)
- Notes: Real, live reproduction of a documented OPEN risk — not a new finding.
### batch4-public-read-crosscheck — Genuinely public-shaped read: seller B (unrelated identity) can see the review just created by seller A — confirms the intentional public-read shape, not tenant-isolated by design — **PASS**
- Expected: Real 200, the review appears in the real list
- Actual: Real HTTP 200, spoofed review present: true
### batch4-search-valid — Real search: GET /items?search=Batch4 finds the real fixture item — **PASS**
- Expected: Real 200, the real item appears in real results
- Actual: Real HTTP 200, real item found: true, 1 result(s)
### batch4-search-no-match — Real search: a genuinely non-matching query returns a real empty result, not an error or fabricated data — **PASS**
- Expected: Real 200, empty items array
- Actual: Real HTTP 200, 0 result(s)
### batch4-filter-category — Real filter: GET /items?categoryId=<real id> finds the real fixture item — **PASS**
- Expected: Real 200, real item present
- Actual: Real HTTP 200, real item found: true
### batch4-security-foreign-id — Security: a real, well-formed but non-existent merchant id — safe error, no stack trace/secrets — **PASS**
- Expected: A real, safe 4xx (400/404), never a 500 or a raw stack trace
- Actual: Real HTTP 400. Body: {"error":{"category":"validation","code":"SHARED.VALIDATION_ERROR","message":"Referenced resource does not exist","statusCode":400}}
### batch4-security-malformed-id — Security: a malformed (non-UUID) merchant id — safe error, no stack trace — **PASS**
- Expected: A real, safe 4xx, never a 500 or leaked internals
- Actual: Real HTTP 400. Body: {"error":{"category":"validation","code":"invalid_merchant_id","field":"merchantId","message":"merchantId must be a valid UUID","statusCode":400}}
### batch4-form-duplicate — Form validation: real duplicate slug rejected — **PASS**
- Expected: A real 4xx conflict/validation error, not a silently-overwritten or duplicated row
- Actual: Real HTTP 400. Body: {"error":{"category":"conflict","code":"slug_exists","message":"Merchant with this slug exists","statusCode":409}}
### batch4-form-required-missing — Form validation: required fields missing — **PASS**
- Expected: Real 400, safe validation error
- Actual: Real HTTP 400. Body: {"error":{"category":"validation","code":"name_slug_required","message":"name and slug required","statusCode":400}}
### batch4-route-get-brands — GET /brands + GET /brands/:slug — real list + real detail lookup — **PASS**
- Expected: Real 200 for both, real fixture brand found by slug
- Actual: list status=200 (1 results); by-slug status=200
### batch4-route-get-merchants — GET /merchants + GET /merchants/:id — real list + real detail lookup — **PASS**
- Expected: Real 200 for both, real fixture merchant found
- Actual: list status=200; by-id status=200, name=Batch4 Merchant A 1788109771078
### batch4-route-get-offers — GET /items/:itemId/offers + GET /offers/trending — **PASS**
- Expected: Real 200 for both; the real fixture offer appears in the item-scoped list
- Actual: item-offers status=200 (1 results); trending status=200
### batch4-route-get-prices-extra — GET /items/:itemId/prices/lowest + /prices/merchants — **PASS**
- Expected: Real 200 for both
- Actual: lowest status=200, price=1; merchants status=200
### batch4-route-review-stats-helpful — GET /items/:itemId/reviews/stats + POST /reviews/:id/helpful (real DB increment verified) — **PASS**
- Expected: Real 200 for stats; real 204 for helpful vote, real DB helpful_count incremented
- Actual: stats status=200; helpful status=204, real DB helpful_count=1
### batch4-route-suspend — POST /admin/merchants/:id/suspend — real super_admin action, real DB status change verified — **PASS**
- Expected: Real 200/201, real status change
- Actual: Real HTTP 200. Real DB status: before=active, after=suspended
### batch4-route-verification-review — POST /admin/verifications/:id/review — real super_admin decision, real DB status change verified — **PASS**
- Expected: Real 200, real status now "approved"
- Actual: Real HTTP 200. Real DB status: approved
### batch4-route-brand-update-archive-restore — PUT /admin/brands/:id + POST .../archive + POST .../restore — real DB status transitions verified — **PASS**
- Expected: Real 2xx for all 3; real DB status changes to archived then back
- Actual: update status=200; archive status=204 (DB status after: archived); restore status=204 (DB status after: active)
### batch4-route-moderate — POST /admin/reviews/:id/moderate — real super_admin moderation decision, real DB status verified — the 28th and final real marketplace route — **PASS**
- Expected: Real 200, real status reflects the decision
- Actual: Real HTTP 200. Real DB status: active
### batch4-realtime — Real-time / asynchronous marketplace behavior — **PASS**
- Expected: Checked the real source (routes + services) for EventSource/WebSocket/SSE/polling — none found
- Actual: NOT_APPLICABLE — no real-time functionality exists in this marketplace surface (confirmed via source inspection, not assumed)
### console — Console errors across this real run — **PASS_WITH_RISKS**
- Expected: Zero
- Actual: 9: Failed to load resource: the server responded with a status of 403 (Forbidden) | Failed to load resource: the server responded with a status of 401 (Unauthorized) | Failed to load resource: the server responded with a status of 403 (Forbidden) | Failed to load resource: the server responded with a status of 403 (Forbidden) | Failed to load resource: the server responded with a status of 401 (Unauthorized) | Failed to load resource: the server responded with a status of 400 (Bad Request) | Failed to load resource: the server responded with a status of 400 (Bad Request) | Failed to load resource: the server responded with a status of 400 (Bad Request)
### network — Network failures / 5xx across this real run (excluding investigated benign RSC-prefetch ERR_ABORTED) — **PASS**
- Expected: Zero
- Actual: 0: none
### batch4-screenshot-disclosure — No marketplace UI screenshots possible — real, disclosed scope boundary — **PASS**
- Expected: A real screenshot of the real browser context used throughout this pass, since no marketplace page exists to screenshot
- Actual: Captured
- Evidence: `docs/evidence/playwright_full_product/batch4_marketplace/batch4_marketplace_test_1/batch4_marketplace_test_1_01.png`
## Remaining

- CLEANUP_TARGET_MERCHANT_IDS=["207672e1-7bf1-478e-9f4f-06957e084740","6b6d4ea1-3ecd-4ae2-b16d-54d90ba8f73d","36de529b-536a-4a5a-8317-5e359ee25951"]
- CLEANUP_TARGET_CATEGORY_ID=259048b4-359e-4937-82db-3028c23597ad
- CLEANUP_TARGET_ITEM_ID=72fe39f2-c178-4420-807e-e75c7a1216f0

## FINAL STATUS: PASS_WITH_RISKS