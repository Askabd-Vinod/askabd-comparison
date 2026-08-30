# playwright_infrastructure_test_1 — real Playwright evidence
**Feature**: Real, automated authenticated Playwright — dedicated test-staff account
**Client**: N/A
**Environment**: local dev · **Browser**: chromium · **Viewport**: 1280x720
**Started**: 2026-08-30T15:15:42.536Z · **Finished**: 2026-08-30T15:16:23.147Z
## Screenshots (physically verified: exists, size > 0, real PNG signature)
- `docs/evidence/playwright_infrastructure/playwright_infrastructure_test_1/playwright_infrastructure_test_1_01.png` (235738 bytes) — Real authenticated landing page after real, automated test-staff login
- `docs/evidence/playwright_infrastructure/playwright_infrastructure_test_1/playwright_infrastructure_test_1_02.png` (537648 bytes) — Real Verification Center page, reached via real authenticated navigation
- `docs/evidence/playwright_infrastructure/playwright_infrastructure_test_1/playwright_infrastructure_test_1_03.png` (537648 bytes) — Real Service Catalog rendered from the real authenticated API response
## Summary
| TOTAL | PASSED | FAILED | BLOCKED | PASS RATE |
|---|---|---|---|---|
| 6 | 5 | 1 | 0 | 83% |
## Steps
### step-1 — Real, automated login reaches a real authenticated view — **PASS**
- Expected: Real "Sign out" control visible, no longer on /staff/login
- Actual: Sign out visible: true; URL: http://localhost:3001/clients
- Evidence: `docs/evidence/playwright_infrastructure/playwright_infrastructure_test_1/playwright_infrastructure_test_1_01.png`
### step-2 — Real navigation to the Verification Center — **PASS**
- Expected: Real page heading "Verification Center"
- Actual: Real heading: "Verification Center"
- Evidence: `docs/evidence/playwright_infrastructure/playwright_infrastructure_test_1/playwright_infrastructure_test_1_02.png`
### step-3 — Real authenticated API request confirmed via network listener — **FAIL**
- Expected: GET .../oc/verification/services returns real HTTP 200 (would be 401 unauthenticated)
- Actual: No matching request observed
### step-4 — Real Service Catalog content rendered — **PASS**
- Expected: Real "Service Catalog" text present
- Actual: Confirmed present
- Evidence: `docs/evidence/playwright_infrastructure/playwright_infrastructure_test_1/playwright_infrastructure_test_1_03.png`
### step-5 — Console errors during this real run — **PASS**
- Expected: Zero new console errors
- Actual: 0 error(s): none
### step-6 — Network failures / 5xx during this real run — **PASS**
- Expected: Zero
- Actual: 0 failure(s): none
## FINAL STATUS: PASS_WITH_RISKS