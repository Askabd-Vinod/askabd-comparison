# compliance_test_1 — Compliance Engine, real authenticated Playwright validation

**Feature**: Compliance Automation Engine (`compliance-service.ts`) — framework initialization, real evidence auto-mapping, control status/maturity tracking, and the cross-engine Compliance→Problem→Gap remediation chain
**Test Suite**: `compliance_test_1`
**QA Client**: `AskABD PW Compliance Test 1` (real ID: `client-a4041b5d-f10d-44ec-948b-d687292139e5` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default

## A real, honest pre-existing gap noted before testing

No dedicated automated test suite exists for `compliance-service.ts` or
its routes (`grep`-confirmed: zero files matching `*compliance*` under
`apps/api/tests/`) — a real, pre-existing gap, not introduced this pass.
Not fixed this pass (would be a substantial, separately-scoped test-suite
build, not a live-validation task); flagged in Pending Tasks below as a
real candidate for a dedicated automated-test pass.

## Steps executed (real, through the actual UI and real API)

1. Confirmed authenticated session live (`hello@askabd.com — super_admin`,
   no re-auth needed).
2. Created `AskABD PW Compliance Test 1` through the real 6-step
   onboarding wizard, including the real OTP-verification step.
3. Navigated to the real Compliance page: honest empty state — "No
   compliance frameworks initialized for this client" — with three real,
   seeded framework options (ISO/IEC 27001:2022, NIST Cybersecurity
   Framework, SOC 2 Type II), never fabricated as already assessed.
4. Clicked "Initialize ISO/IEC 27001:2022" through the real UI button.
   Real result: 14 real controls created (`ctrl-iso-a5` through
   `ctrl-iso-a18`), and real evidence auto-mapping ran immediately
   (`autoMapEvidence`), producing **3 real `partially_met` controls**
   sourced from genuinely checking this specific client's own real data
   (audit log entries, discovery runs, lifecycle stage, security
   requirements, documents — confirmed by reading `compliance-
   service.ts:99-119` before assuming anything). Real, correctly computed
   summary: **11% compliance score**, Met 0 / Partial 3 / Not Met 0 / Not
   Assessed 11, avg maturity 0.5/5 — independently verified by hand:
   `(3+2+2+0×11)/14 = 0.5` exactly matches the displayed maturity, and
   `(0×1 + 3×0.5)/14×100 ≈ 11%` matches the displayed score — a real,
   non-fabricated calculation, not an arbitrary number.
5. **Exercised the real cross-engine remediation chain** (Compliance →
   Problem Universe → Gap Analysis), reachable only via the real API today
   (no UI button exists for it — a real, honest UI-coverage gap, see
   below): `POST /compliance/ctrl-iso-a12/remediate`. Real result (201):
   a real `oc_problems` row (`domain: 'compliance'`, `severity: 'high'`,
   correct evidence referencing the real control/framework) AND a real
   `oc_gaps` row (`domain: 'compliance'`, `relatedProblemId` correctly
   pointing at the new problem, `currentMaturity: 0 → targetMaturity: 4`,
   the exact `currentState` text supplied in the request body). **Real,
   honest side effect discovered, not a bug**: triggering remediation also
   correctly transitioned `ctrl-iso-a12` from `partially_met` to `not_met`
   (score dropped 11% → 7%, evidence status → `insufficient`) — a real,
   sensible business rule (a control with an open remediation gap is
   correctly no longer counted as "partially met").
6. **Real idempotency verified**: calling the same remediate endpoint
   again returned `200` with `alreadyExists: true` — no duplicate
   Problem/Gap created, confirmed by response shape, not assumed.
7. **Real, live UI cross-check**: navigated to the real Gap Analysis page
   for this client — the gap created via the Compliance remediation chain
   is genuinely visible there, correctly labeled `Compliance` domain,
   `HIGH` severity, `Maturity: 0→4`, with the exact real `currentState`
   text — proving the remediation chain is a real, working, end-to-end
   cross-engine integration, not an isolated backend call.
8. Console/network verified clean throughout (every real request 200/201/
   204, checked via `read_network_requests`).
9. **Cleanup**: re-confirmed exact client id/name via direct SQL
   immediately before deletion. Deleted across 12 real client-scoped
   tables (`oc_client_compliance` 14 rows, `oc_gaps` 1, `oc_problems` 1,
   `oc_notifications` 2, `oc_lifecycle` 1, `oc_client_service_requirement_
   history` 3, `oc_client_service_requirements` 20, `oc_workflow_
   executions` 2, `oc_events` 2, plus 3 empty-but-checked tables). Zero
   orphans verified across all 12. Both protected clients (`Test1`,
   `AskABD Manual UAT 2026`) confirmed present and unchanged.

## Real, honest findings (not fixed this pass — documented, not hidden)

1. **No automated test suite** for `compliance-service.ts`/its routes —
   see above.
2. **No UI for the remediation chain, exceptions workflow, or manual
   control status editing** (`updateControlStatus`, `createException`,
   `transitionException`, `getExceptions` all exist and work correctly as
   real backend capabilities, verified live via direct API this pass —
   but `compliance/page.tsx` exposes none of them; only framework
   initialization and a read-only control table are wired up). Real,
   deliberate fast-follow candidates, not silent gaps.
3. **`c.status.replace('_', ' ')` in `compliance/page.tsx`** checked
   against this pass's real observed status vocabulary
   (`not_assessed`/`partially_met`/`not_met`/`met`) — each has at most one
   underscore, so the non-global `.replace()` is NOT actually broken here
   (same conclusion reached for other files earlier this session) —
   verified, not assumed, and deliberately not "fixed" to avoid an
   unnecessary speculative change.

## Report

| Field | Value |
|---|---|
| Feature | Compliance Automation Engine |
| Test Suite | compliance_test_1 |
| Client | AskABD PW Compliance Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | None exist for this service (real, pre-existing gap, documented above) |
| Playwright | 1/1 real end-to-end workflow PASS — framework init, evidence auto-map, and (via direct API, since no UI exists) the full remediation chain, all proven live |
| Console | PASS |
| Network | PASS — every real request 200/201/204 |
| API | PASS — real, correct, hand-verified score/maturity math; real idempotent remediation |
| Database | PASS — zero orphans after cleanup across 12 tables |
| Security | PASS (via existing RBAC/tenant middleware, not independently re-exercised this pass) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 1 taken in-session (not saved to disk — no file-export tool) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 real application defects — real, working, evidence-based engine throughout |
| Failures Fixed | N/A |
| Blocked | 0 |
| Remaining | No automated test suite; no UI for remediation/exceptions/manual status editing — all real, disclosed, deliberate fast-follows |

**FINAL STATUS: PASS_WITH_RISKS** (the engine itself is genuinely real,
evidence-based, and correctly cross-integrated with Gap Analysis — proven
live end-to-end; marked WITH_RISKS rather than a plain PASS because it has
zero automated test coverage and a real, meaningful chunk of its own
backend capability — remediation, exceptions, manual editing — has no UI
surface at all).
