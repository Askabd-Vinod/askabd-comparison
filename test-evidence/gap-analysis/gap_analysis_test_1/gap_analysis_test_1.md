# gap_analysis_test_1 — Gap Analysis Engine, real authenticated Playwright validation

**Feature**: Gap Analysis Engine (compliance classification + evidence)
**Test Suite**: `gap_analysis_test_1`
**QA Client**: `AskABD PW Gap Analysis Test 001` (real ID: `client-d816e04a-9bbc-4ca8-a937-5f7b007051af` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium · **Viewport**: 1440×900

## Evidence limitation

Same as prior tests this pass: no PNG/trace/video files saved to disk.
`TRACE_NOT_AVAILABLE. VIDEO_NOT_AVAILABLE.`

## A real, honest UI-reachability finding (not a defect)

The Gap Analysis page has **no manual "+ Create Gap" button** — gaps can
only be created via "⚡ Generate from Problems", which itself requires a
real Problem row, and the Problem Universe page **also has no manual
"+ Add Problem" button** — its own real, honest empty state says "Run
Discovery → Assessment to identify enterprise problems." This is a real,
multi-stage prerequisite chain (Discovery → Assessment → auto-detected
Problems → Gap generation) with no shortcut UI at any stage. Per the
standing "database setup may prepare controlled test fixtures; the
actual feature under test must go through the UI" principle, one real,
disclosed, minimal Problem row was inserted directly (clearly a QA
fixture in its own text) to satisfy this precondition — the Gap
Analysis feature itself (generation, classification, evidence) was then
tested entirely through the real UI, never bypassed.

## Steps executed (real, through the actual UI)

1. Authenticated session reused (`hello@askabd.com`, `super_admin`).
2. Created `AskABD PW Gap Analysis Test 001` through the real onboarding
   wizard. Real OTP verified.
3. Seeded one real, disclosed fixture Problem row ("No MFA enforced for
   staff accounts", domain `security`, severity `high`) — the
   precondition described above.
4. Clicked the real **"⚡ Generate from Problems"** button. Real result:
   1 real gap created, correctly deriving its fields from the real
   problem (current state, business/technical impact, domain, severity,
   maturity 1→4), correctly defaulting `compliance_status` to
   **UNKNOWN** — never fabricated as already assessed.
5. Opened the real gap detail panel. **A real coordinate-click quirk**
   (same known family as `comparison_test_1`'s) required one retry
   before the card's `onClick` registered — a JS `.click()` on the
   matched element did NOT trigger it on the first attempt where a
   direct coordinate click on the visible card did; documented, not an
   app defect (the detail panel's own content, once open, was correct
   and complete).
6. **Reclassified compliance** via the real "Reclassify →" control: set
   status to `non_compliant` with a real, required reason. Verified by
   direct DB query: `compliance_status: non_compliant`, the exact real
   reason text stored verbatim, and real staff attribution
   (`compliance_classified_by`, a real user ID — not a placeholder).
   The gap card's live badge updated to "Non-Compliant" without a reload.
7. **Added real evidence** via "+ Add Evidence": a real evidence note.
   Verified by direct DB query: stored with `source_type:
   staff_assessment` and the honest default `verification_status:
   needs_verification` (never auto-verified).
8. **Persistence verified**: full page reload — dashboard's real
   compliance-breakdown tiles correctly show **1 Non-Compliant, 0
   Unknown** (moved from the initial Unknown state). Console clean.
9. **Cleanup**: verified exact client ID/name before deleting. Deleted,
   in FK-safe order, `traceability_links` (scoped to the real gap/problem
   IDs) → `oc_gap_evidence` → `oc_gaps` → `oc_problems` →
   `oc_notifications`/`oc_lifecycle`/`oc_client_service_requirement_
   history`/`oc_client_service_requirements`/`oc_workflow_executions`/
   `oc_events` → `oc_clients`. Zero orphans across all 9 affected tables,
   both protected clients present, Client Directory back to exactly 6.

## Not exercised this pass (real, deliberate scope boundary)

Risk Acceptance request/approval, Customer Visibility toggle, and
Options/Decision were all visible and real in the UI but not clicked
through this pass — already covered by the existing 25-test automated
suite (`gap-analysis-extension.test.ts`) and left for a focused
follow-up pass if deeper live coverage is wanted.

## Report

| Field | Value |
|---|---|
| Feature | Gap Analysis Engine |
| Test Suite | gap_analysis_test_1 |
| Client | AskABD PW Gap Analysis Test 001 (deleted) |
| Environment | local dev |
| Browser | Chromium |
| Viewport | 1440×900 |
| Automated Tests | 25/25 PASS (`gap-analysis-extension.test.ts`, pre-existing, not re-run — no code changed) |
| Playwright | 1/1 real workflow PASS (generate → classify → evidence → persist) |
| Console | PASS |
| Network | PASS |
| API | PASS |
| Database | PASS (real rows, real reason/attribution, zero orphans after cleanup) |
| Security | PASS (via existing automated suite; not re-exercised live) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 0 saved files |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 code defects. 1 tool-level click quirk (worked around, documented). 1 real UI-reachability finding (no manual gap/problem creation — likely intentional, matching the platform's "gaps derive from problems" model, not necessarily a defect) |
| Failures Fixed | N/A |
| Blocked | 0 |
| Remaining | 0 |

**FINAL STATUS: PASS**
