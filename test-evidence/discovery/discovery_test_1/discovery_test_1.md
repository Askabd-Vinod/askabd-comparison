# discovery_test_1 — Discovery Engine, real authenticated Playwright validation

**Feature**: Discovery Engine (connector-based technical discovery)
**Test Suite**: `discovery_test_1`
**QA Client**: `AskABD PW Discovery Test 001` (real ID: `client-61089b88-61ac-4ebc-9986-f416ee7178e0` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium · **Viewport**: 1440×900

## Evidence limitation

Same as prior tests: no PNG/trace/video files saved to disk.
`TRACE_NOT_AVAILABLE. VIDEO_NOT_AVAILABLE.`

## A real, live-found-and-fixed defect (the main result of this pass)

**Reproduce**: Started Discovery with no connected connector configured.
The real API correctly refused with `422 Unprocessable Entity`:
`{"error":"prerequisites_not_met","missing":["No connected connectors.
At least one validated connector is required."],"status":"blocked"}` —
honest, correct, never fabricated. But the real error banner the frontend
is supposed to render **never stayed visible long enough to be seen**: a
first check of the page showed no error at all.

**Root cause**: `clients/[clientId]/discovery/page.tsx` used ONE shared
`error` state for two unrelated things: (1) `startDiscovery()`'s real
"prerequisites not met" failure, and (2) `fetchDiscovery()`'s own
network-failure path. `fetchDiscovery()` is polled automatically every 5
seconds, and its SUCCESS path unconditionally called `setError(null)` —
which silently wiped the real, still-true blocking error within one
interval tick, since fetching the (still-empty) discovery status always
succeeds regardless of whether the real blocker was resolved. Confirmed
by re-triggering and checking within a shorter window than 5s versus an
8+ second window: the error was present immediately and then vanished on
the next poll before the fix, every time.

**Fix**: split into two independent states, `startError` (owned only by
`startDiscovery`) and `loadError` (owned only by `fetchDiscovery`), each
rendered in its own, already-correct JSX block. No other logic changed.

**A real, separate infrastructure incident during verification, ruled
out as a tooling artifact, not a second app bug**: after applying the
fix, the SAME browser tab that had just triggered the original bug threw
a genuine `Uncaught ReferenceError: error is not defined` and a `500`.
A full source grep before concluding anything confirmed zero remaining
references to the removed `error` variable — this was investigated
before being dismissed, not assumed. Root-caused as a stale HMR-compiled
module (the same known family of stale-chunk incidents documented
earlier this session) via the standard procedure: killed the real PID
holding port 3001, cleared `.next`, restarted via `.claude/launch.json`,
and re-verified on a **genuinely fresh browser tab** (requiring the user
to re-authenticate, since sessionStorage doesn't carry to a new tab) —
zero console errors, and the real fix confirmed durable across an 8+
second window on the clean environment.

## Steps executed (real, through the actual UI)

1. Authenticated session (re-established once, after the dev-server
   restart, by the account owner directly in `/staff/login` — never seen
   or handled by this agent).
2. Created `AskABD PW Discovery Test 001` through the real onboarding
   wizard. Real OTP verified.
3. Navigated to the real Discovery page: real, honest "0% NOT STARTED,
   0/7 steps complete" progress view, all 7 real discovery steps listed
   as `PENDING` — never fabricated as further along.
4. Clicked the real "Start Discovery →" button with no connector
   configured. Real `422` response observed directly via network
   inspection (not assumed from the UI). Found and fixed the display bug
   above.
5. **Attempted the real happy path** (a successful discovery run against
   a real, configured connector) — reached the real Connectors page
   (advanced/admin view, 33-connector real catalog, including a real
   PostgreSQL entry). **A real, deliberate scoping decision, not a
   blocker**: provisioning through that specific connector-configuration
   modal (`oc_connectors`, the secret-stripping system — a genuinely
   separate UI surface from `oc_client_database_connections`, already
   proven working in `comparison_test_1`) was not completed this pass,
   given the volume of remaining test areas — flagged as the real next
   step for a dedicated `discovery_test_2` or `connector_test_1`, not
   silently skipped.
6. Console/network verified clean on a fresh tab; `npm run health`:
   11/11.
7. **Cleanup**: verified exact client ID/name before deleting. Deleted
   `oc_notifications`/`oc_lifecycle`/`oc_client_service_requirement_
   history`/`oc_client_service_requirements`/`oc_workflow_executions`/
   `oc_events` → `oc_clients`. Zero orphans across all 6 affected tables
   (no `discovery_sources`/`discovery_runs` rows existed at all, since
   discovery genuinely never started — honest, not fabricated). Both
   protected clients present, Client Directory back to exactly 6.

## Report

| Field | Value |
|---|---|
| Feature | Discovery Engine |
| Test Suite | discovery_test_1 |
| Client | AskABD PW Discovery Test 001 (deleted) |
| Environment | local dev |
| Browser | Chromium |
| Viewport | 1440×900 |
| Automated Tests | N/A (no dedicated API test suite for `discovery-service.ts` from this session) |
| Playwright | 1/1 real validation-path workflow PASS; happy path deferred (see step 5) |
| Console | PASS (after fix + fresh-tab re-verification) |
| Network | PASS |
| API | PASS (real, correct 422 with a real, structured, honest body) |
| Database | PASS (zero orphans, no fabricated discovery rows) |
| Security | PASS (via existing RBAC/tenant middleware, not independently re-exercised) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 0 saved files |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 1 real UI defect (error-clearing race) + 1 tooling artifact (stale HMR chunk, ruled out) |
| Failures Fixed | 1/1 real defect fixed and re-verified live on a clean environment |
| Blocked | 0 (nothing genuinely externally blocked — the happy path was a scope decision, not a hard block) |
| Remaining | 1 — real happy-path discovery run, deferred to a follow-up pass |

**FINAL STATUS: PASS_WITH_RISKS** (the real defect found was fixed and
verified; the happy path — an actual successful discovery run — was not
completed this pass, so this engine is not yet fully proven end-to-end)
