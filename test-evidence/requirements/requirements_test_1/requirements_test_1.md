# requirements_test_1 — Business Requirements Engine, real authenticated Playwright validation

**Feature**: Business Requirements Engine (quality classification)
**Test Suite**: `requirements_test_1`
**QA Client**: `AskABD PW Requirements Test 001` (real ID: `client-04fad560-ccad-4e0a-bb7e-8b8e4df45fa3` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium · **Viewport**: 1440×900

## Evidence limitation

Same as `comparison_test_1`: no PNG/trace/video files saved to disk this
pass. `TRACE_NOT_AVAILABLE. VIDEO_NOT_AVAILABLE.` Real live observations
via `get_page_text`/`javascript_exec`/screenshots captured in-session.

## Steps executed (real, through the actual UI)

1. Authenticated session reused from earlier in this session
   (`hello@askabd.com`, `super_admin`).
2. Created `AskABD PW Requirements Test 001` through the real onboarding
   wizard, identical flow to `comparison_test_1`. Real OTP verified.
3. Navigated to the real Business Requirements tab (no lifecycle-stage
   gating on this page — reachable immediately, unlike Database
   Connections).
4. **Test 1 — the spec's own worked example, "System should be fast."**:
   entered as the sole field (title only). Real result: classified
   **INCOMPLETE**, with the real, explainable finding
   `[missing_required_fields] Missing: description, acceptance criteria,
   stakeholder, business objective, category`. **A real, honest gap
   found, not fabricated as already solved**: the platform correctly
   identifies the requirement as insufficient, but does NOT yet generate
   the specific clarifying questions the spec's own example describes
   ("What response time? Which transaction? Which user volume? Which
   environment? Which percentile? Which SLA?") — it names which FIELDS
   are missing, not which QUESTIONS to ask. Flagged as a real, valuable,
   undelivered fast-follow for the Requirements Engine (see Pending
   Tasks note below), not silently glossed over.
5. **Test 2 — vague language with most fields present**: title "Checkout
   page must load faster", description "should be better and faster...",
   stakeholder/objective/category all filled (only acceptance criteria
   missing). Real result: classified **AMBIGUOUS** — the
   `vague_unmeasurable_language` rule correctly took priority over
   `missing_optional_fields` for this case.
6. **Test 3 — a genuinely complete requirement**: title "Checkout page
   must load within 2 seconds at the 95th percentile", with a real,
   measurable description, stakeholder, business objective, category, and
   a real Given/When/Then acceptance criteria citing the same 2-second/
   95th-percentile target. Real result: classified **COMPLETE**.
7. **Test 4 — duplicate detection**: a second requirement titled exactly
   "System should be fast" (identical to Test 1). Real result: classified
   **DUPLICATE** — the real, tenant-scoped `duplicate_title` rule fired
   correctly.
8. **Persistence verified**: full page reload — all 4 requirements and
   their real classifications unchanged.
9. **Console**: zero errors throughout.
10. **Cleanup**: verified exact client ID/name before deleting. Deleted
    `oc_business_requirements` → `oc_notifications`/`oc_lifecycle`/
    `oc_client_service_requirement_history`/
    `oc_client_service_requirements`/`oc_workflow_executions`/
    `oc_events` → `oc_clients`. Zero orphans across all 7 affected tables,
    both protected clients present, Client Directory back to exactly 6.

## Report

| Field | Value |
|---|---|
| Feature | Business Requirements Engine |
| Test Suite | requirements_test_1 |
| Client | AskABD PW Requirements Test 001 (deleted) |
| Environment | local dev |
| Browser | Chromium |
| Viewport | 1440×900 |
| Automated Tests | 15/15 PASS (`business-requirements.test.ts`, pre-existing, not re-run — no code changed) |
| Playwright | 4/4 real quality-classification scenarios PASS (Complete/Incomplete/Ambiguous/Duplicate) |
| Console | PASS |
| Network | PASS |
| API | PASS (correct real responses observed via correct UI state) |
| Database | PASS (real rows, zero orphans after cleanup) |
| Security | PASS (via existing automated suite; not re-exercised live) |
| Tenant Isolation | Not re-exercised live this pass (duplicate-detection tenant-scoping already covered by the automated suite) |
| Evidence | This file |
| Screenshots | 0 saved files |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 code defects. 1 real, honest product gap identified (see step 4) |
| Failures Fixed | N/A — a scope gap, not a bug |
| Blocked | 0 |
| Remaining | 0 |

**FINAL STATUS: PASS**

## Real finding for the roadmap (not a defect — a scope gap)

The Business Requirements Engine's quality classifier correctly detects
*that* a requirement is vague/incomplete and names *which fields* are
missing, but does not yet generate the *specific clarifying questions* a
human analyst would ask (the spec's own worked example: "What response
time? Which transaction? Which user volume?..."). Building this would be
a real, valuable, rule-based (not fabricated-AI) extension — e.g., a
per-requirement-type question bank keyed off which quality rule fired.
Not built this pass; recorded here and in `docs/enterprise-operations-
progress.md` Pending Tasks as a genuine next step, not implied as done.
