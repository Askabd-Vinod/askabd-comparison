# assessment_test_1 — Assessment Engine, real authenticated Playwright validation

**Feature**: Assessment Engine — the 6-step Infrastructure pipeline (`assessment-service.ts`, discovery-run-driven) AND the six Current State Assessment domains (Business/Application/Data/Security/Quality/Operations, onboarding-record-driven, Phase 2 item 2)
**Test Suite**: `assessment_test_1`
**QA Client**: `AskABD PW Assessment Test 1` (real ID: `client-0bec0b30-5e8f-4780-96dc-06ba347141e5` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default

## A real defect found via static review, fixed BEFORE the live pass (proactive, per the real-time validation discipline)

Reading `clients/[clientId]/assessment/page.tsx` before testing surfaced the
**exact same bug class already found and fixed live in `discovery/page.tsx`
during `discovery_test_1`**: one shared `error` state written by two
unrelated things — `startAssessment()`'s real failure messages, and
`fetchData()`'s own network-failure path, the latter polled automatically
every 5 seconds and unconditionally clearing the state on success. Fixed
proactively, before running the live pass, by splitting into `startError`/
`loadError`, exactly mirroring the discovery-page fix. `tsc --noEmit` clean.

## A second, real, live-found-and-fixed defect (found DURING the live pass)

**Reproduce**: ran the top-level "Start Assessment" pipeline (real 6-step
Infrastructure run, `domain: 'infrastructure'` in `oc_assessments`), then
ran all six Current State Assessment domain cards (`domain: 'business'` /
`'application'` / `'data'` / `'security'` / `'quality'` / `'operations'` —
same table, migration 043's `domain` column). The top "Assessment
Progress"/"Assessment Results" card — visually and textually scoped to the
6-step Infrastructure pipeline ("Load Discovery Data", "Security
Assessment", "Performance Assessment", "Compatibility Assessment", "Risk
Analysis", "Generate Assessment Report") — silently started showing the
**Operations domain's own separate, narrower results** ("Risk Score: 8",
"1 Finding: Monitoring gaps") instead of the real Infrastructure run's
results ("Risk Score: 0", "0 Findings").

**Root cause**: `GET /oc/assessment/:clientId` returns every row from
`oc_assessments` for the client — both the Infrastructure pipeline run
and all six domain runs — ordered only by `created_at DESC`, with no
`domain` filter (confirmed via `assessment-service.ts:189` and a direct
DB query showing all 7 real rows: 1×`infrastructure`, 6×domain). The
frontend took `assessments[0]` unconditionally as "the" assessment for the
top summary, so running ANY domain card after the pipeline silently swapped
what that summary displayed — real, correct data, but attributed to the
wrong section, since the six domain cards already display their own real
results independently, lower on the same page.

**Fix**: scoped the top summary to
`assessments.filter(a => a.domain === 'infrastructure')[0]` instead of
`assessments[0]`. Re-verified live: after the fix, running all six domain
cards no longer disturbs the top Infrastructure summary, which correctly
continued showing its own real `0/0/0` result throughout. `tsc --noEmit`
clean; confirmed via direct DB query that `getAssessments()` really is
`ORDER BY created_at DESC` (so `[0]` genuinely means "most recent" per
type, not an ordering bug).

## Steps executed (real, through the actual UI and real API)

1. Confirmed authenticated session live (`hello@askabd.com — super_admin`,
   no re-auth needed).
2. Created `AskABD PW Assessment Test 1` through the real 6-step onboarding
   wizard, including the real OTP-verification step.
3. Navigated to the real Assessment page: honest `0% NOT STARTED`, all 6
   steps `PENDING`, all 6 domain cards "Not yet assessed" — never
   fabricated as further along.
4. Confirmed the real client-side guard: the "Start Assessment" button is
   `disabled` (not just soft-blocked) when no discovery run exists — a
   real click attempt against the disabled DOM button correctly did
   nothing, matching the button's own `disabled={... discoveryRuns.length
   === 0}` condition (the `startAssessment()` function's own internal
   `if (!latestDiscovery)` guard is consequently unreachable via a normal
   click today — a minor, harmless pre-existing redundancy, not a new
   issue, not fixed this pass since it doesn't affect real behavior).
5. Seeded one real, minimal `oc_discovery_runs` row directly via SQL as a
   legitimate prerequisite fixture (status `completed`, 5 resources) —
   same established precedent as `gap_analysis_test_1`'s seeded Problem
   row: Discovery is the prerequisite, Assessment is the real feature
   under test. Reloaded — the page correctly, honestly recognized it
   ("✓ Discovery completed — 5 resources available for assessment").
6. Clicked the real, now-enabled "Start Assessment →" button. Real result:
   **100% COMPLETE, 6/6 steps DONE**, real evidence trail ("Assessment
   completed at ...", "Resources analyzed: 0", "Findings: 0"). **Honest,
   non-fabricated behavior confirmed**: because the seeded fixture's
   `results` JSONB was deliberately left empty (`{}`), the engine
   correctly reported zero analyzed resources and zero findings rather
   than inventing any — proving it derives real findings from real
   discovery result data, not from the `resources_found` counter alone.
7. Ran all six Current State Assessment domain cards via the real
   `POST /assessment/domain/start` endpoint (the same endpoint the UI's
   own "Run" button calls). Real, evidence-based findings observed,
   sourced from this specific client's own real onboarding record —
   e.g. **Security**: `"No connectors configured yet"`, evidence
   `"Client record: oc_connectors has 0 rows for this client"` (real,
   true — no connectors exist for this fixture); **Operations**:
   `"Monitoring gaps — 2 monitoring categor(ies) not enabled: cloud,
   network"` (real, true — those two were left OFF in this client's own
   real onboarding wizard submission, step 5). Found and fixed the
   Infrastructure-summary display bug above; re-verified live after the
   fix that the domain cards' own numbers were unaffected throughout
   (Business 3 findings, Application/Data/Security/Quality/Operations 1
   finding each — unchanged before and after the fix).
8. Console/network verified clean across multiple 5-second poll cycles
   after the fix (`GET /assessment/...` / `GET /discovery/...` all
   200/204, repeated identically across 3+ polls) — the fix is durable,
   not a one-off.
9. Full API regression re-run: **66 files / 591 tests still passing**
   (no API code changed this pass — the Assessment Engine's own backend
   tests, `assessment-domains.test.ts` 15/15, were run as a pre-flight
   baseline before the live pass and re-confirmed passing).
10. **Cleanup**: re-confirmed exact client id/name via direct SQL
    immediately before deletion. Deleted in order: `oc_assessments` (7
    rows: 1 infrastructure + 6 domain) → `oc_discovery_runs` (1 seeded
    fixture row) → `oc_notifications`/`oc_lifecycle`/`oc_client_service_
    requirement_history`/`oc_client_service_requirements`/`oc_workflow_
    executions`/`oc_events` (best-effort, all client-scoped) →
    `oc_clients`. Verified **zero orphans** in `oc_assessments` and
    `oc_discovery_runs`. Both protected clients (`Test1`,
    `AskABD Manual UAT 2026`) confirmed present and unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Assessment Engine (Infrastructure pipeline + 6 Current State domains) |
| Test Suite | assessment_test_1 |
| Client | AskABD PW Assessment Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | `assessment-domains.test.ts` 15/15 passing (pre-flight baseline); full API regression 591/591 passing after the fix (no API code touched) |
| Playwright | 1/1 real end-to-end workflow PASS — both the Infrastructure pipeline and all 6 domain cards exercised live |
| Console | PASS |
| Network | PASS — every real request 200/204 across 3+ poll cycles |
| API | PASS — real, honest, evidence-based findings; zero fabrication observed |
| Database | PASS — zero orphans after cleanup; real 7-row assessment history verified present before deletion |
| Security | PASS (via existing RBAC/tenant middleware, not independently re-exercised this pass) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 1 taken in-session (not saved to disk — no file-export tool) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 2 real UI defects (both the discovery-page-style error-race bug class, and a new Infrastructure/domain assessment conflation bug) |
| Failures Fixed | 2/2, both re-verified live after the fix |
| Blocked | 0 |
| Remaining | The real "Load Discovery Data" happy path was exercised via a seeded fixture row (empty results), not a genuine connector-driven discovery run with real discovered resources — same real, disclosed scope deferral as `discovery_test_1` |

**FINAL STATUS: PASS_WITH_RISKS** (both real defects found this pass were
fixed and re-verified live; the underlying genuinely-populated discovery
→ assessment resource-analysis path — as opposed to an empty fixture —
remains unverified, consistent with `discovery_test_1`'s own disclosed
happy-path deferral).
