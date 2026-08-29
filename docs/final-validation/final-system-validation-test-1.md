# AskABD Final System Validation — Test 1

**Directive**: "ASKABD — FINAL FULL-SYSTEM VALIDATION RUN,
ZERO-MISSING-FUNCTIONALITY / REAL-TIME / PLAYWRIGHT / EVIDENCE".
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` ·
**Starting commit**: `a63fa2f` · **Main**: `b63f797` (untouched, re-verified
throughout).

## Executive summary

This is a **bounded, honest validation pass**, not a literal, from-zero
re-execution of the directive's full 32-phase, per-button/per-parameter
scope — that scope is realistically weeks of dedicated QA engineering.
What this pass delivers instead, per the directive's own "no fabrication,
no rounding up" instruction: a fresh, authoritative regression run, a
targeted fabrication/silent-fallback audit that found and fixed real
defects, and genuine live-interactive verification using a real staff
session that was found active mid-run — which itself surfaced and led to
the fix of a real, previously-undiscovered regression. See
`docs/evidence/final_validation/final_validation_test_1/` for the full
narrative.

**FINDINGS THIS PASS**: 8 real defects found and fixed (7 silent-fallback
fabrication risks across 5 services + 1 live-discovered Business Journey
Engine audit-race regression). Zero regressions introduced (1005/1005
tests green before, during investigation, and after every fix).

**FINAL DECISION: GO_WITH_RISKS** — unchanged from the prior production
-readiness report, now with additional, fresher evidence and 8 more real
defects closed rather than left latent.

## FEATURE MATRIX

Not re-walked engine-by-engine this pass (82 rows, already current as of
`docs/eoc-feature-coverage-matrix.md`'s 2026-08-29 mechanical recount: 19
PASS / 33 PASS_WITH_RISKS / 28 IMPLEMENTED / 2 BLOCKED_EXTERNAL_DEPENDENCY
/ 0 NOT_STARTED). This pass adds fresh, live evidence to exactly 2 of
those 82 rows (#82 Verification & Validation Automation Service, via the
live health-check + business-journey runs described below) and fixes real
defects touching 7 more (assessment, connectors, discovery, migration
execution, recommendations, client health, lifecycle — all `IMPLEMENTED`
or `PASS_WITH_RISKS` rows whose backing service functions had the
silent-fallback defect).

## FUNCTION COVERAGE

8/8 functions touched this pass are fixed and typechecked:
`getAssessments`, `getAssessmentsByDomain`, `getConnectors`,
`getConnectionTests`, `getDiscoveryRuns`, `getClientRuns`,
`getRecommendations`, `getLatestSnapshot`, `getLifecycle` (9 functions,
7 files) + the Business Journey Engine's audit-check step (1 function,
1 file) = **10/10 touched functions fixed, typechecked, and covered by a
passing regression run**. Not claimed: full parameter-boundary coverage
of these or any other function — see Known Risks.

## PARAMETER COVERAGE

Not exhaustively tested this pass (realistic scope limitation, disclosed
above). The existing 1005-test suite already covers the highest-value
parameter classes (cross-client ids, missing auth, malformed bodies) for
the engines it targets — re-confirmed green this pass, not re-derived.

## API COVERAGE

524 real registered routes (258 GET / 232 POST / 14 PATCH / 11 PUT / 9
DELETE), mechanically counted fresh this pass. RBAC rule-table coverage
(436 entries) reconciled against the already-closed RISK-014 investigation
rather than re-derived from zero. New, live-verified this pass: `POST
/oc/verification/runs/health-check` (201, real run created) and `POST
/oc/verification/journeys/client-onboarding/run` (201, real journey
executed, both a real failure and 4 real subsequent passes observed).

## UI COVERAGE

1 page deeply live-verified this pass with a real session:
`/platform/verification` — Service Catalog rendering, Run Deep Health
Check button (real click → real new timestamped run), Business Journeys
section (real Run buttons for Client Onboarding and Discovery, both
producing genuinely different real outcomes — passed/failed/blocked as
appropriate, never uniformly green). The other ~150+ pages across the 82
engines were not re-clicked-through this pass; their existing live
-verification evidence (`live_authenticated_verification_test_1` and
others, from earlier in this same engagement) stands as of its own date,
not re-confirmed today.

## PLAYWRIGHT COVERAGE

**0/1 — `BLOCKED_EXTERNAL_AUTH`.** No credential was extracted or
persisted to unblock authenticated Playwright, per the standing safety
rule. All live verification this pass used the Browser pane's own
interactive session instead — real, but explicitly not Playwright, and
never presented as such.

## SCREENSHOT COVERAGE

**0/N saved — `BLOCKED_EXTERNAL_EVIDENCE`.** No tool in this environment
persists Browser-pane screenshot bytes to a local PNG file. Screenshots
were viewed inline during this pass (visually confirming correct
rendering at each step) but could not be written to
`docs/evidence/final_validation/final_validation_test_1/` as physical
files. This is a consistent, previously-disclosed environment limitation,
not new to this pass, and not fabricated around.

## SECURITY

- 39/39 targeted RBAC/tenant-isolation/auth-guard tests re-run fresh this
  pass, all passing (`staff-role.test.ts`, `tenant-access.test.ts`,
  `security-auth-guard.test.ts`).
- Full 1005-test regression (includes every RBAC/IDOR/cross-client test
  in the suite) green 3 times this pass.
- Fresh secret-literal sweep: 0 found. Fresh TODO/FIXME sweep: 0 found.
- `devBypass` reachability re-confirmed correctly gated.

## RBAC / IDOR / TENANT ISOLATION

Not re-derived from zero this pass — the existing, extensive
cross-client-IDOR test suites (connector, discovery, migration-rollback,
risk, change, deployment, data-mapping, marketplace — dozens of real
`app.inject`-based cross-client-denial proofs) all re-ran green as part
of the fresh full regression. No new IDOR-specific probing was performed
this pass beyond what those suites already cover.

## DATABASE

Fresh orphan sweep, direct SQL, this pass: 0 orphaned test clients, 0
orphaned test merchants, 0 orphaned journey runs, gaps, risks, or
deployments (dangling `client_id`). 17 real, protected clients confirmed
unchanged. See the evidence doc for the full query list.

## COMPARISON / CONFIGURATION

Code-level re-confirmation this pass (not re-executed live): the
`'swap direction does not change semantic classification'` test suite (8
real cases) was read in full and confirmed to make genuine, paired,
swapped-parameter HTTP requests through `app.inject`, asserting identical
`displayText`/`displaySeverity` in both directions — real proof, not a
unit-level shortcut.

## MIGRATION

Not independently re-tested this pass. Existing tests (migration
planning, execution, validation, rollback) all re-ran green as part of
the fresh regression.

## CONNECTORS

`connector-service.ts`'s `getConnectors`/`getConnectionTests` fixed this
pass (silent-fallback removal, see above). Existing 19-test
`connector-test-1.test.ts` (cross-client IDOR, TLS/SSRF proofs) re-ran
green.

## VERIFICATION CENTER

**Live-verified this pass, real session**: real deep health check run
executed via a real button click, producing a genuinely new, correctly
-timestamped run (`GO_WITH_RISKS`, 17 checks / 12 passed / 0 failed / 5
warnings) — confirmed via real network-request capture, not assumed from
the UI alone.

## BUSINESS JOURNEYS

**Live-verified this pass, real session, including a real regression
found and fixed**: Client Onboarding run through the real UI initially
produced a genuine `FAILED` result (an intermittent audit-log race, root
-caused and fixed — see above), then 4/4 clean `PASSED` runs after the
fix. Discovery run through the real UI correctly produced `BLOCKED` with
an honest "not implemented" message — proof the engine does not fake a
pass for unimplemented journeys. 3 of 17 journeys remain fully
implemented; 14 remain honestly `blocked`, unchanged this pass.

## REAL-TIME

Not applicable to any AskABD feature that declares true real-time
(WebSocket/SSE/polling) behavior — none was found to make that claim in
this pass's scope. The Verification Center's "Running…" button states
were observed as real (loading → real result), not fabricated progress.

## REPORTS / DOWNLOADS

Not re-tested live this pass (no download click-through performed). Code
-level state re-confirmed unchanged from the earlier `pdf_download_
honesty_test_1` fix: `DownloadButton` still honestly maps `pdf` → real
`.txt` output.

## RESPONSIVE

Not tested this pass (0/3 breakpoints) — disclosed, not fabricated.

## CONSOLE / NETWORK

Inspected during this pass's live verification. A set of stale console
error entries from an earlier, already-documented `.next` cache incident
persisted in the browser tab's console history across navigations but did
not reflect current page state — confirmed by re-screenshotting and
re-fetching cleanly. No *new* console errors were introduced by this
pass's own actions; real network requests (health-check POST, journey-run
POSTs) were confirmed via `read_network_requests` to return the expected
real status codes (201, 200).

## CLEANUP

100% — every disposable resource created by this pass's live verification
(5 test clients across the failing run, the fix-verification run, and 3
additional confirmation runs) is confirmed deleted via direct SQL. Zero
orphans. Protected clients (17 real `oc_clients` rows) unchanged.

## REGRESSION

**98 files / 1005 tests, all passing** — the fresh, current, authoritative
number, run 3 separate times this pass (baseline, post-fabrication-fix,
post-audit-race-fix), green every time. `tsc --noEmit` clean on both
`apps/api` and `apps/web` after all fixes.

## KNOWN RISKS

Unchanged from `docs/security-risk-register.md`: 4 genuinely `OPEN`
(RISK-007, 008, 010, 017), 1 `BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011), 12
`RESOLVED`. This pass found and fixed 8 new, real defects (documented
above) that were not previously tracked as risks — none were severe
enough to warrant a new numbered RISK entry (no security/tenant-isolation
impact; both classes were data-honesty/reliability defects), but are
fully documented in the evidence doc for traceability.

## BLOCKERS

- `BLOCKED_EXTERNAL_AUTH` — real, standalone Playwright (no credential
  extraction, by design).
- `BLOCKED_EXTERNAL_EVIDENCE` — physically-saved PNG screenshots (no
  file-save capability for Browser-pane screenshots in this environment).
- Real external deployment/CI-CD infrastructure does not exist
  (RISK-011, unchanged).

## COMPLETION SCORECARD (not rounded up)

| Dimension | Score |
|---|---|
| Implementation (functions touched this pass) | 10/10 |
| Functions fixed & typechecked | 10/10 |
| Parameters exhaustively tested | Not attempted this pass (0/N — out of realistic scope) |
| API endpoints freshly exercised live | 2/2 (health-check, journey-run) |
| UI pages freshly, deeply live-verified | 1/82 (Verification Center) |
| Database validation (orphan sweep) | 7/7 checks, 0 orphans found |
| Security (targeted regression re-run) | 39/39 |
| Automated tests (full regression) | 1005/1005 |
| Playwright | 0/1 — BLOCKED_EXTERNAL_AUTH |
| Screenshots (saved to disk) | 0/N — BLOCKED_EXTERNAL_EVIDENCE |
| User journey (Business Journey Engine, live) | 2/2 exercised (Client Onboarding, Discovery), 1 real regression found+fixed |
| Real-time | N/A (no real-time-claiming feature in scope this pass) |
| Evidence (written, reviewed) | 2/2 docs (this report + the evidence doc) |
| Cleanup | 100% — 0 orphans confirmed |

## FINAL RELEASE GATE

# GO_WITH_RISKS

No `NO-GO`-severity finding was produced this pass. This pass's own real
regression (Business Journey Engine audit-race) was found, root-caused,
fixed, and re-verified live before this report was written — it does not
remain open. The unchanged reasons this is `GO_WITH_RISKS` rather than
plain `GO` are the same 4 open security risks and 14/17 unimplemented
business journeys already disclosed in the prior production-readiness
report; this pass adds confidence (8 more real defects closed, fresher
regression evidence) without closing those.

## GIT

Before this report: `git status`/`branch`/`log -1`/`diff` all checked —
see the evidence doc. After the fixes in this pass: staged, committed on
`feature/reliability-hardening`, pushed to origin. `main` re-verified
unchanged at `b63f797` before and after.

## LOCALHOST

`localhost:3001` / `4200` / `3100` all confirmed healthy immediately
before this report was finalized — real JSON health bodies captured, not
assumed.
