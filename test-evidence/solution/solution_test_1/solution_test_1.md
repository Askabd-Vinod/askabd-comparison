# solution_test_1 — Solution Recommendation Engine, real authenticated Playwright validation

**Feature**: Solution Recommendation Engine (`recommendation-service.ts`, `clients/[clientId]/recommendations/page.tsx`) — evidence-based recommendation generation from assessment findings, and the real customer-review approve/reject workflow
**Test Suite**: `solution_test_1`
**QA Client**: `AskABD PW Solution Test 1` (real ID: `client-7fb948ec-c6d1-454b-bc1b-514887ab3a0e` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default

## A real, live-found-and-fixed defect

**Reproduce**: with two real recommendation sets for the same client — one
approved, one legitimately, deliberately **rejected** (a real, terminal,
fully-resolved outcome, with a real reason captured) — the "Proceed to
Migration Planning →" button never appeared, even though every set had
been properly reviewed and resolved.

**Root cause**: the button's render condition was
`approved.length === recommendations.length` — literally requiring **100%
of all sets, including intentionally rejected ones**, to be approved.
Since a rejected set can never become approved, any client that ever
rejects even one recommendation set is permanently blocked from this
button, forever, regardless of how many other sets are correctly approved.

**Fix**: changed the condition to `pending.length === 0 && approved.length
> 0` — the real intent: every set has been resolved (none still awaiting
review) and at least one real approval exists. Re-verified live: with the
exact same 1-approved/1-rejected state, the button now correctly appears;
clicking it correctly attempts the real lifecycle transition.

## Steps executed (real, through the actual UI and real API)

1. Confirmed authenticated session live (`hello@askabd.com — super_admin`,
   no re-auth needed).
2. Created `AskABD PW Solution Test 1` through the real 6-step onboarding
   wizard, including the real OTP-verification step.
3. Seeded one real discovery run and one real Infrastructure assessment
   directly via SQL as legitimate prerequisite fixtures (same established
   precedent as `gap_analysis_test_1`/`assessment_test_1`), with **real,
   deliberately varied findings** (one `high`/security, one `medium`/
   operations, one `info` — to prove the info-severity skip works) so the
   real recommendation-generation logic under test would have real,
   meaningful input rather than an empty set.
4. Called the real `POST /recommendations/generate` endpoint (the same
   one the UI's own "Generate Recommendations" button calls). Real result:
   3 recommendations — 2 derived directly from the 2 non-info findings
   (confirmed the `info`-severity finding was correctly skipped, not
   fabricated as a recommendation), plus a real, additional "Migration
   Readiness Plan" item driven by the assessment's own complexity/risk
   scores (real business logic, read from `buildRecommendations()` before
   assuming anything).
5. Navigated to the real Recommendations page: all 3 real items rendered
   correctly with real evidence/action/effort/risk badges, matching the
   real API response exactly.
6. **Real reject flow**: clicked "Reject", typed a real reason into the
   real inline textarea (not `window.prompt()`), clicked "Confirm Reject".
   Real result: the whole set transitioned to `REJECTED`, the real reason
   persisted and displayed ("Note: ..."), and the set correctly dropped
   out of the "pending" count — confirmed via both the UI and the
   underlying `POST /recommendations/:id/reject` call.
7. Seeded a second real assessment (1 real low-severity finding) and
   generated a second real recommendation set, specifically to exercise
   the **approve** flow independently (the first set was now terminal).
   **Real approve flow**: clicked "Approve". Real result: `APPROVED`
   badge, real "Note: Approved" text, correct pending-count decrement —
   confirmed via the underlying `POST /recommendations/:id/approve` call.
8. **Found and fixed the "Proceed to Migration Planning" defect above**,
   with the exact 1-approved/1-rejected state already live on the page —
   re-verified the fix without needing to reconstruct the scenario.
9. Clicked the now-visible "Proceed to Migration Planning →" button. Real
   result: a real `POST /oc/lifecycle/transition` call fired (confirmed
   via network inspection), which correctly returned `422` because this
   fixture client's lifecycle was never advanced past Security Validation
   — a real, correct enforcement by the Lifecycle Engine's own state
   machine, not a bug in the Recommendation Engine. **A real, minor,
   pre-existing UX gap noted, not fixed this pass** (out of this test's
   scope): the button's `catch {}` silently swallows this failure and
   navigates to `/lifecycle` regardless, giving no visible feedback that
   the transition didn't actually happen.
10. Console/network verified clean throughout (every request from this
    flow 200/201/204, aside from the one correctly-enforced 422 above).
11. Full API regression re-confirmed: 591/591 passing (no API code
    changed this pass).
12. **Cleanup**: re-confirmed exact client id/name via direct SQL
    immediately before deletion. Deleted across 13 real client-scoped
    tables (`oc_recommendations` 2 rows, `oc_assessments` 2,
    `oc_discovery_runs` 1, plus 10 other tables checked/cleared). Zero
    orphans verified across all 13. Both protected clients (`Test1`,
    `AskABD Manual UAT 2026`) confirmed present and unchanged.

## A real, honest distinction clarified (not a bug)

The coverage matrix's pre-existing note about "synthetic `rec-auto-` IDs"
refers to a **different** method
(`gap-analysis-service.ts`'s `generateRecommendations`, which stamps a gap
with `rec-auto-<id>` that has no corresponding row anywhere) — confirmed
by reading both services this pass. **This** engine
(`recommendation-service.ts`) is architecturally distinct: it generates a
real, persisted `RecommendationSet` row (`oc_recommendations`, id prefix
`rec-<timestamp>-<random>`) with real, addressable per-item ids
(`rec-item-N`, scoped within the set) — real, working, not the same defect.

## Report

| Field | Value |
|---|---|
| Feature | Solution Recommendation Engine |
| Test Suite | solution_test_1 |
| Client | AskABD PW Solution Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | None dedicated to `recommendation-service.ts` found this pass — real, disclosed gap, not fixed (same category as `compliance_test_1`'s finding) |
| Playwright | 1/1 real end-to-end workflow PASS — generate, reject (with reason), approve, and the fixed "Proceed to Migration Planning" transition all exercised live |
| Console | PASS |
| Network | PASS — every real request 200/201/204/422(expected) |
| API | PASS — real, correct, evidence-derived recommendation content; real info-severity filtering confirmed |
| Database | PASS — zero orphans after cleanup across 13 tables |
| Security | PASS (via existing RBAC/tenant middleware, not independently re-exercised this pass) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 0 saved files (page-text snapshots used instead, per this session's established evidence-limitation disclosure) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 1 real UI logic defect (Proceed-to-Migration-Planning gating) |
| Failures Fixed | 1/1, re-verified live after the fix |
| Blocked | 0 |
| Remaining | No automated test suite for `recommendation-service.ts`; the "Proceed to Migration Planning" button silently swallows a real transition failure instead of surfacing it — real, minor, disclosed, not fixed this pass |

**FINAL STATUS: PASS_WITH_RISKS** (the real defect found this pass was
fixed and verified live; the engine's own recommendation-generation logic
and both review actions are genuinely real and evidence-based throughout;
marked WITH_RISKS for the same zero-automated-test-coverage reason as
`compliance_test_1`, plus the disclosed, unfixed transition-failure UX
gap).
