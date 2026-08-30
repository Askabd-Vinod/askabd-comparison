# batch2_staff_operations_test_1 — real Playwright evidence
**Feature**: Batch 2 — staff operational workflows (29 routes: dashboard, account/security, applications, clients list, deployments list, engineering, governance, incidents list, infrastructure, intelligence, migrations lifecycle, monitoring, reports, search, services, settings, welcome)
**Client**: N/A
**Environment**: local dev · **Browser**: chromium · **Viewport**: N/A
**Started**: 2026-08-30T15:03:39.411Z · **Finished**: 2026-08-30T15:06:45.419Z
## Screenshots (physically verified: exists, size > 0, real PNG signature)
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_01.png` (189096 bytes) — Last light-sweep page loaded: /settings
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_02.png` (171313 bytes) — Account Security page — real render, MFA enrollment form visible
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_03.png` (175807 bytes) — Search page — real query "Test1"
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_04.png` (619582 bytes) — Welcome page — after real accordion-expand click
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_05.png` (213850 bytes) — engineering-defect-download — after real download click (Engineering_Report_def-61e4e7f0-b181-4196-97a9-e8d68eb0a819_2026-08-30.txt)
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_06.png` (210308 bytes) — engineering-reports-download — after real download click (Defect_Report_2026-08-30.txt)
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_07.png` (197732 bytes) — reports-detail-download-mock-data-disclosed — after real download click (Availability_Report_2026-08-30.txt)
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_08.png` (369449 bytes) — Migrations/new — after real form submission (migrationId=mig-1788102342136-40dfa7)
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_09.png` (284431 bytes) — Migration detail — real plan created, initial state
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_10.png` (283150 bytes) — Migration detail — after real Run Dry Run click
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_11.png` (559013 bytes) — Migration detail — real-time OperationProgress mid-execution (queued/running)
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_12.png` (846786 bytes) — Migration detail — real-time OperationProgress reached a real terminal state
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_13.png` (846094 bytes) — Migration detail — after real Validate click
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_14.png` (705590 bytes) — Migration detail — after real Rollback click
- `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_15.png` (817348 bytes) — migration-report-download — after real download click (Migration_mig-1788102342136-40dfa7_Report_2026-08-30.txt)
## Summary
| TOTAL | PASSED | FAILED | BLOCKED | PASS RATE |
|---|---|---|---|---|
| 18 | 17 | 0 | 0 | 94% |
## Steps
### batch2-light-sweep — Group A: 18 real page loads (routes with zero actionable controls per the mechanical inventory) — **PASS**
- Expected: All 18 routes return a real 2xx/3xx response
- Actual: 18/18 loaded successfully. 
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_01.png`
### batch2-defect-detail — Real engineering defect detail page load — **PASS**
- Expected: Real defect detail renders
- Actual: URL: http://localhost:3001/engineering/def-61e4e7f0-b181-4196-97a9-e8d68eb0a819
### batch2-service-detail — Real service catalog detail page load (via real link click) — **PASS**
- Expected: Detail page renders
- Actual: URL: http://localhost:3001/intelligence/catalog
### batch2-account-security — Account Security page: real render, MFA enrollment deliberately not submitted — **PASS**
- Expected: Page renders real MFA enrollment UI for the logged-in test-staff identity
- Actual: Real MFA management UI rendered. Enrollment NOT submitted — doing so would put a real TOTP requirement on the shared automated test-staff account this whole engagement's Playwright infrastructure depends on for every batch, a disclosed, deliberate scope boundary.
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_02.png`
### batch2-search — Real global search query, real results verified — **PASS**
- Expected: Searching "Test1" finds the real fixture client
- Actual: Real fixture client found in real search results
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_03.png`
### batch2-welcome — Welcome page: real accordion expand, real UI state change — **PASS**
- Expected: Clicking the section header changes real page layout height
- Actual: Body height before=2340px, after=2873px
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_04.png`
### batch2-download-engineering-defect-download — engineering-defect-download: real download button click, real file captured — **PASS**
- Expected: A real, non-empty file downloads (honestly-labeled real extension per this component's own documented PDF-honesty fix)
- Actual: Real download captured: "Engineering_Report_def-61e4e7f0-b181-4196-97a9-e8d68eb0a819_2026-08-30.txt", 1808 bytes
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_05.png`
### batch2-download-engineering-reports-download — engineering-reports-download: real download button click, real file captured — **PASS**
- Expected: A real, non-empty file downloads (honestly-labeled real extension per this component's own documented PDF-honesty fix)
- Actual: Real download captured: "Defect_Report_2026-08-30.txt", 1413 bytes
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_06.png`
### batch2-download-reports-detail-download-mock-data-disclosed — reports-detail-download-mock-data-disclosed: real download button click, real file captured — **PASS**
- Expected: A real, non-empty file downloads (honestly-labeled real extension per this component's own documented PDF-honesty fix)
- Actual: Real download captured: "Availability_Report_2026-08-30.txt", 1204 bytes
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_07.png`
### batch2-migration-create — Real migration plan created via the real form — **PASS**
- Expected: A real migration plan is created and its detail page loads
- Actual: migrationId=mig-1788102342136-40dfa7, url=http://localhost:3001/migrations/mig-1788102342136-40dfa7
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_08.png`
### batch2-migration-dryrun — Real Run Dry Run click — **PASS**
- Expected: Real dry-run result returned and rendered
- Actual: Clicked and observed real UI update (see screenshot)
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_10.png`
### batch2-migration-execute-realtime — Real-time Execute Migration: observed genuine queued/running -> terminal state transition via live polling — **PASS**
- Expected: The real OperationProgress panel shows a real in-flight state before reaching a real terminal state, without a forced page refresh
- Actual: In-flight state observed: true. Real terminal state reached: "completed"
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_12.png`
### batch2-migration-validate — Real Validate click — **PASS**
- Expected: Real validation result rendered
- Actual: Clicked and observed real UI update (see screenshot)
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_13.png`
### batch2-migration-rollback — Real Rollback click, independently verified via direct DB query — **PASS**
- Expected: The real target schema (mig_client_9a2a1b23_5872_45d5_8246_2f0ba05bc691_1788102342140) exists before rollback and is dropped after
- Actual: Schema existed before: true, exists after rollback: false
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_14.png`
### batch2-download-migration-report-download — migration-report-download: real download button click, real file captured — **PASS**
- Expected: A real, non-empty file downloads (honestly-labeled real extension per this component's own documented PDF-honesty fix)
- Actual: Real download captured: "Migration_mig-1788102342136-40dfa7_Report_2026-08-30.txt", 11206 bytes
- Evidence: `docs/evidence/playwright_full_product/batch2_staff_operations/batch2_staff_operations_test_1/batch2_staff_operations_test_1_15.png`
### batch2-session-reauth — Mid-run session interruptions and transparent re-authentication — **PASS_WITH_RISKS**
- Expected: A real, isolated repro proved the token self-renewal mechanism works; this run's own mid-batch interruptions (if any) are disclosed, not hidden, and did not abort coverage
- Actual: No mid-run session interruption occurred this run.
### console — Console errors across this real run — **PASS**
- Expected: Zero
- Actual: 0: none
### network — Network failures / 5xx across this real run (excluding investigated benign RSC-prefetch ERR_ABORTED) — **PASS**
- Expected: Zero
- Actual: 0: none
## FINAL STATUS: PASS_WITH_RISKS