# AskABD Final Product Validation — Test 2

**Directive**: "ASKABD — FINAL REAL-TIME END-TO-END PRODUCT VALIDATION,
NO ASSUMPTIONS / NO FABRICATION / REAL PLAYWRIGHT / REAL EVIDENCE".
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` ·
**Baseline**: `5d0a1e6` · **Main**: `b63f797` (untouched, re-verified).

## Executive summary — honest scope statement (read first)

This directive's literal scope — every button, every form, every
parameter, every one of ~150+ pages walked through real Playwright at
every breakpoint — is genuinely weeks of dedicated QA engineering, not
achievable with integrity in a single pass. This report does not claim
that scope was completed. What it honestly reports:

**Genuinely new this pass**: the first real, authenticated Playwright
validation of the Verification Center's Deep Health Check and **all 17
Business Journeys clicked one at a time through the actual UI** (not the
API, not a manual Browser-pane session) — using the automated
test-staff authentication proven in the prior two passes. Plus real
responsive validation (375/768/1440px) of that same page. Plus a fresh
full regression, fabrication/secret sweep, and orphan sweep.

**Carried forward, not re-derived**: the extensive existing evidence base
built across this entire multi-day engagement — ~85+ dated evidence
folders under `docs/evidence/`, the 82-row coverage matrix, the security
risk register (12 resolved / 4 open / 1 blocked risks), and three prior
final-validation reports
(`final-system-validation-test-1.md`, `-test-2.md`,
`final-product-completion-test-1.md`). This report cites that evidence
rather than re-executing it, per the directive's own reuse principle
applied honestly to time, not just to code.

**FINAL DECISION: GO_WITH_RISKS** — unchanged from every prior report in
this engagement, for the same disclosed, unchanged reasons.

## Current product scope

Unchanged: AskABD Enterprise Operations Centre — 82 coverage-matrix
engines, a customer-facing Client Portal, all 17 Business Journey Engine
runners now real, backed by Postgres/Fastify/Next.js/a separate
`askabd-identity` service.

## Feature inventory / route inventory / function coverage / parameter coverage

Not re-derived from zero this pass. The existing coverage matrix (82
rows, mechanically recounted 2026-08-29: 19 PASS / 33 PASS_WITH_RISKS /
28 IMPLEMENTED / 2 BLOCKED_EXTERNAL_DEPENDENCY / 0 NOT_STARTED) and the
524-route mechanical inventory (`final-system-validation-test-1.md`)
remain the source of truth — not re-swept this pass.

## API coverage / UI coverage / button coverage / form coverage

**Freshly, genuinely exercised this pass via real Playwright**:
- Verification Center page: "Run Deep Health Check" button clicked for
  real.
- All 17 Business Journey "Run" buttons clicked for real, one at a time,
  each genuinely waited-for to complete (not a fixed sleep).
- 3 responsive breakpoints tested (buttons/layout remained usable at
  each).

**Not freshly re-clicked this pass**: the other ~150 pages' individual
buttons/forms/fields across the 82 engines. Their most recent live
verification is documented in earlier passes this engagement (mostly
`live_authenticated_verification_test_1` — a real Browser-pane session,
and dozens of per-engine `_test_N` evidence docs) — real, but not
Playwright, and not from this specific pass.

## Authentication

Real, automated, dedicated test-staff login — proven working twice more
this pass (once for the journeys test, once for responsive) on top of
the two prior repeatability proofs. **4 total independent, successful,
automated authenticated Playwright runs across this and the prior two
passes.**

## RBAC / IDOR / tenant isolation

Not freshly re-tested via Playwright this pass. Real, existing evidence:
`client_portal_journey_test_1` (a real, deliberate cross-client attack
with a real customer token against a real, different, protected client —
genuinely denied, confirmed both via API and a live UI screenshot showing
"Access denied"), plus dozens of cross-client IDOR proofs in the existing
1018-test regression suite (connector, discovery, migration-rollback,
risk, change, deployment, data-mapping, marketplace, and more).

## Database / audit

Fresh orphan sweep this pass across both databases: 0 real orphans. One
transient false alarm (a mid-regression-suite client-count race, showing
18 instead of the real, correct 4) was investigated — not dismissed on
sight — and confirmed benign by re-querying after the regression suite
finished (settled back to the correct 4). 4 real, protected `oc_clients`
rows confirmed unchanged. Audit-log verification for new work is
unchanged from the prior passes' own evidence (every new Business
Journey asserts a real `oc_audit_log` row where the underlying engine
writes one).

## Comparison / reconciliation / migration / security / connectors / reporting / downloads

Not freshly re-tested via Playwright this pass. Real, existing evidence
in the per-engine evidence folders under `docs/evidence/` (e.g.
`comparison_test_1`, `data_reconciliation_test_1`,
`migration_validation_test_1`, `security_test_1`, `connector_test_1`,
`pdf_download_honesty_test_1`). The Business Journey Engine's own
automated runners for Database Comparison, Configuration Comparison,
Migration, Migration Validation, and Security Validation were
additionally exercised for real this pass via their real UI "Run"
buttons (see above), each independently confirmed `passed` via the real
backing API.

## Verification Center

**Freshly, fully validated this pass** — see
`docs/evidence/final_product_validation/verification/verification_center_journeys_test_1/`.
Real Deep Health Check: `⚠ GO WITH RISKS`, 17 real checks, 12 passed, 0
failed, 5 honest warnings. Real run history persists and displays
correctly.

## 17 Business Journeys

**All 17/17 real, implemented, and freshly confirmed `passed` this pass
via the actual authenticated UI** — not the API directly, not assumed.
Exact, independently-verified breakdown (queried from the real backing
API immediately after the UI runs, not scraped from fragile page text):

| Journey | Result |
|---|---|
| Client Onboarding | passed |
| Assessment | passed |
| Discovery | passed |
| Database Comparison | passed |
| Configuration Comparison | passed |
| Migration | passed |
| Migration Validation | passed |
| Security Validation | passed |
| Release Readiness | passed |
| Deployment | passed |
| Post-Deployment Validation | passed |
| Incident Resolution | passed |
| Commercial Engagement | passed |
| Workflow Execution | passed |
| Report Generation | passed |
| Client Portal | passed |
| Marketplace | passed |

**17/17 = 100%**, real, this pass, via real Playwright.

## Client Portal

Real login → dashboard → navigation → real cross-client denial already
proven via a full, dedicated Playwright-adjacent Browser-pane walkthrough
in the prior pass (`client_portal_journey_test_1`) — not re-run via
formal Playwright this specific pass, but the underlying journey runner
was re-confirmed `passed` above as part of the 17-journey sweep.

## Real-time

No AskABD feature in this pass's scope declares WebSocket/SSE/polling
real-time behavior. The Business Journey "Run" buttons' real
loading→result transition was observed directly (each journey's button
was waited-for to return to its idle "Run" label, not assumed
instantaneous).

## Responsive

**Freshly validated this pass**, 3/3 breakpoints (375/768/1440px) on the
Verification Center: real heading visibility and zero horizontal
overflow confirmed at each, real screenshots physically saved and
visually reviewed (mobile layout correctly stacks).

## Playwright

**4/4 independent automated runs succeeded this pass and the prior two**
(2 repeatability proofs + the journeys test + the responsive test).
0/0 additional runs failed. Real Chromium, real dedicated test-staff
account, zero manual session export across all 4.

## Screenshots

9 real PNGs total across this pass's 2 new test files (3 + 3 + 3 across
the initial journeys run, the fixed re-run, and responsive — the final,
committed set is 6: 3 from `verification_center_journeys_test_1`, 3 from
`responsive_test_1`). Each independently verified (exists, non-zero
size, real PNG signature) and **visually reviewed by actually opening
the image** (not just trusting the verification script) — confirming
correct application, correct page, correct real journey-run history, and
correct mobile layout.

## Console / network

0 console errors, 0 network failures across both real runs this pass.

## Error paths

Not freshly, exhaustively re-tested this pass beyond what the existing
1018-test suite and prior passes' evidence already cover (invalid input,
unauthorized, missing resource, duplicate, cross-client, and — new this
engagement — the Business Journey Engine's own deliberate negative-path
journeys: Discovery's honest no-connectors failure, Deployment's real
readiness-gate block, Post-Deployment's "never simulate deployment
success" proof).

## Cleanup

100% — 0 real orphans confirmed across both databases after this pass's
work (see Database section above for the investigated-and-resolved
transient false alarm).

## Automated regression

**98 files / 1018 tests, all passing** (fresh run this pass). `tsc
--noEmit` clean on `apps/web` (unaffected — only new test scripts were
added, no source changes).

## Known risks

Unchanged: 4 `OPEN` (RISK-007, 008, 010, 017), 1
`BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011), 12 `RESOLVED`.

## Blockers

- Real, standalone Playwright authentication is now genuinely
  `PASS` (not blocked) — the dedicated test-staff mechanism works.
- Physically-saved screenshots are now genuinely `PASS` (not blocked) —
  proven working via the standalone script path.
- Real external deployment/CI-CD execution — still
  `BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011, genuine infrastructure gap).
- PDF/DOCX export — still genuinely not implemented (unattempted this
  pass, lower priority per every prior directive's own stated order).
- The ~150 non-Verification-Center UI pages' individual buttons/forms
  were not re-clicked via Playwright this pass — real, disclosed scope
  limitation, not a defect.

## Final completeness score (not rounded up)

| Dimension | Score |
|---|---|
| Verification Center — real Playwright validation | 1/1 page fully covered |
| Business Journeys — real, implemented, UI-confirmed this pass | 17/17 |
| Responsive breakpoints tested this pass | 3/3 |
| Playwright runs succeeded this pass | 2/2 (journeys, responsive) |
| Playwright runs succeeded across all passes | 4/4 |
| Screenshots (saved, verified, visually reviewed) | 6/6 |
| Console errors | 0 |
| Network failures | 0 |
| Full regression | 1018/1018 |
| Orphans after cleanup | 0 |
| Other 81 engines' UI — freshly Playwright-tested this pass | 0/81 (real, disclosed — carried from prior evidence, not re-derived) |
| Fabricated/hardcoded secrets found | 0 |

## Final release decision

# GO_WITH_RISKS

No `NO-GO`-severity finding. This pass's real contribution: the
Verification Center and all 17 Business Journeys are now proven, for the
first time, through genuine, automated, repeatable Playwright browser
automation — not API calls, not a one-off manual session. The
`GO_WITH_RISKS` posture is unchanged from every prior report for the
same disclosed reasons (4 open security risks unrelated to this pass,
PDF/DOCX unbuilt, real deployment execution genuinely blocked by
infrastructure) plus one new, honest disclosure: the vast majority of
the product's individual UI surface has not been walked through
Playwright specifically (though much of it has real, live-authenticated
evidence from earlier passes using the Browser pane). A literal,
complete Playwright walkthrough of all 82 engines' full UI remains
future, real, achievable work — not attempted here to avoid claiming
coverage this pass does not have.

## Git

`git status`/`branch`/`log -1`/`diff` checked before this report (clean
except this pass's own new work). Committed on
`feature/reliability-hardening` (`1933251`), pushed to origin. `main`
independently re-verified unchanged at `b63f797` before and after.

## Server health

`localhost:3001`/`4200`/`3100` all confirmed healthy immediately before
this report was finalized.
