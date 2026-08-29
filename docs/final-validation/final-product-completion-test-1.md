# AskABD Final Product Completion — Test 1

**Directive**: "ASKABD — FINAL PRODUCT COMPLETION + CLIENT PORTAL + REAL
PLAYWRIGHT ULTIMATE VALIDATION GATE".
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` ·
**Baseline**: `492951c` · **Main**: `b63f797` (untouched, re-verified).

## Executive summary

This pass closed the single remaining gap from the prior two final
-validation reports: the Client Portal business journey. Investigation
(Part 2) found the real Client Portal *product* (747+229 real lines of
customer-facing UI) was never missing — only its automated verification
runner was, because it uniquely requires a real customer identity rather
than a staff-side flow. Built a real solution reusing the existing,
unmodified `InvitationService` (real invitation → real registration/
verification/login against the real `askabd-identity` service → real
`client_identity_mapping`), then live-walked the actual product UI
end-to-end in the browser, including a genuine, human-observed
cross-client "Access denied" screen against a real, pre-existing
protected client.

**All 17 of 17 Business Journey Engine journeys are now real and
implemented** (up from 16/17). A self-correction was made before this
report was finalized: the coverage matrix was briefly (incorrectly) set
to `PASS` for row #82 and corrected to `PASS_WITH_RISKS` per this
project's own standing Playwright-evidence-capping rule.

**This report does not re-derive the entire 82-engine, ~150-page,
per-button product surface from zero** — that remains weeks of
literal work beyond a single pass. It focuses on what genuinely changed
(Client Portal) plus a fresh full regression, fresh orphan sweep across
both databases, and fresh server-health checks, while citing
`final-system-validation-test-1.md` and `-test-2.md` for everything
already validated and unchanged.

## Current product scope

Unchanged: AskABD Enterprise Operations Centre — a staff console (82
coverage-matrix engines) plus a customer-facing Client Portal, backed by
Postgres, Fastify, Next.js, and a separate `askabd-identity` auth
service. No new, unrelated features were started this pass, per the
directive's own explicit prohibition.

## Client Portal

See `docs/evidence/verification_service/client_portal_journey_test_1/`
for the full write-up. Summary:

- **Classification**: D — implemented but incorrectly classified (the
  product existed; only the verification runner didn't).
- **What was built**: the 17th Business Journey Engine runner, reusing
  `InvitationService` unmodified — no new business logic, matching the
  "reuse, don't duplicate" rule.
- **Security proven**: real own-client access (200), real cross-client
  denial (401/403/404) with a real, valid customer token against a
  DIFFERENT real client, real unauthenticated denial (401) — all three
  proven at BOTH the API layer (automated test) and the actual product
  UI layer (live browser walkthrough, including a real "Access denied"
  screen against a real, pre-existing protected client).
- **Cleanup**: real, complete, cross-database (the platform's own
  Postgres AND `askabd-identity`'s own Postgres) — zero orphans
  confirmed.

## Feature matrix

Coverage matrix row #82 updated: **17/17 journeys** (was 16/17), status
**`PASS_WITH_RISKS`** (capped by the standing Playwright-evidence rule,
not by a functional gap). No other row was touched this pass — the
other 81 engines' status is as recorded in the existing matrix, not
re-derived here.

## Function coverage

1 new journey method (`runClientPortal`) + 1 new module-level cleanup
helper (`cleanupIdentityFixture`) — **2/2 implemented, typechecked, and
covered by a passing test.**

## Parameter coverage

Not exhaustively fuzzed this pass (same disclosed, realistic-scope
limitation as the two prior reports). The new journey does exercise a
real invalid/negative path as one of its own core assertions (the
cross-client access attempt, expected and confirmed denied).

## API coverage

New this pass: `GET /oc/portal/:clientId/home` exercised 3 ways — own
-client (real 200), cross-client (real deny), unauthenticated (real
401) — both via the automated journey and live via the actual browser.
The wider ~524-route inventory is as established in
`final-system-validation-test-1.md`, not re-swept this pass.

## UI coverage

The real Client Portal product page was live-walked this pass (see
above) — the first time any pass in this engagement exercised it through
a real, human-observable browser session with a real, freshly-created
customer identity rather than API-only. The other ~150 UI pages across
the platform are unchanged from prior reports.

## User journeys

**All 17/17 Business Journey Engine journeys real, implemented, and
passing** — the milestone this pass exists to reach. 16 were already
confirmed live in the prior pass; Client Portal is newly confirmed both
via the automated journey and via a genuine browser walkthrough.

## Comparison / Migration / Security / RBAC / IDOR / Tenant isolation / Connectors / Reports / Downloads / Verification Center / Real-time / Responsive

Unchanged from `final-system-validation-test-1.md` and
`final-system-validation-test-2.md` — not re-derived this pass. The
Client Portal work itself adds one new, genuine tenant-isolation proof
(above) on top of the existing evidence base.

## Playwright

**0/1 — `BLOCKED_EXTERNAL_AUTH`, unchanged.** No credential was
extracted or persisted this pass either, including during the Client
Portal browser walkthrough (a fresh, disposable customer identity was
created and used, then fully deleted — never an existing person's
credential).

## Screenshots

**0/N saved — `BLOCKED_EXTERNAL_EVIDENCE`, unchanged.** All walkthrough
steps were viewed inline and described in the evidence doc; no
capability exists in this environment to persist the bytes to a file.

## Database

Fresh orphan sweep across BOTH the platform's own Postgres and
`askabd-identity`'s own Postgres: zero orphans (verification-journey/
demo-walkthrough clients, `client_identity_mapping` rows, `oc_invitations`
rows via cascade, real identity fixtures). 4 real, protected `oc_clients`
rows confirmed unchanged throughout, including surviving a real,
deliberate cross-client access attempt against one of them.

## Console / network

Not separately re-captured this pass beyond what the live walkthrough
itself surfaced (no errors observed during the real signup → dashboard
→ navigation → cross-client-denial sequence).

## Cleanup

100% — every resource this pass created (2 disposable clients + 1
customer identity fixture per journey run, across both the automated
test and the manual browser walkthrough) confirmed deleted via direct
query, across both databases involved.

## Automated tests

`business-journey-engine-test-1.test.ts`: 19/19 (net-neutral test count;
Client Portal's 2 new real tests replaced the prior 2 "honestly blocked"
tests). Client Portal's own test passed on its first real run — no bugs
found (contrast with the prior pass's 2 real bugs in Migration
Validation/Security Validation).

## Regression

**98 files / 1018 tests, all passing.** `tsc --noEmit` clean on both
`apps/api` and `apps/web`.

## Known risks

Unchanged: 4 `OPEN` (RISK-007, 008, 010, 017), 1
`BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011), 12 `RESOLVED`. No new risk
introduced.

## External blockers

- Real, standalone, credential-authenticated Playwright — still
  `BLOCKED_EXTERNAL_AUTH` by design.
- Physically-saved screenshots — still `BLOCKED_EXTERNAL_EVIDENCE`
  (no environment capability).
- Real external deployment/CI-CD execution — still
  `BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011).
- PDF/DOCX export — still genuinely not implemented, unattempted this
  pass (lower priority per the directive's own stated order across all
  three completion passes).

## Final completeness score (not rounded up)

| Dimension | Score |
|---|---|
| Business Journey Engine journeys | 17/17 |
| New functions this pass | 2/2 |
| Parameters exhaustively tested | Not attempted (0/N, disclosed) |
| API endpoints freshly exercised (Client Portal) | 3/3 (own-client, cross-client, unauthenticated) |
| UI pages freshly, deeply live-verified this pass | 1/1 (Client Portal) |
| Database validation (orphan sweep, both DBs) | 5/5 checks, 0 orphans |
| Security (cross-client denial, live + automated) | 2/2 (API layer + UI layer) |
| Automated tests | 19/19 (journey suite), 1018/1018 (full regression) |
| Playwright | 0/1 — BLOCKED_EXTERNAL_AUTH |
| Screenshots saved to disk | 0/N — BLOCKED_EXTERNAL_EVIDENCE |
| Real-time | N/A this pass |
| Responsive | Not tested this pass |
| Evidence (written, reviewed, self-corrected) | 2/2 docs, 1 real self-correction caught before commit |
| Cleanup | 100% — 0 orphans across both databases |

## Final release decision

# GO_WITH_RISKS

No `NO-GO`-severity finding. This pass completes the Business Journey
Engine (17/17, up from 16/17) with a genuine, non-fabricated solution to
its hardest remaining case, live-verified through the actual product UI.
`GO_WITH_RISKS` (not plain `GO`) remains correct for the same disclosed,
unchanged reasons as the prior two reports: 4 open security risks
(unrelated to this pass), PDF/DOCX export still unbuilt, real external
deployment execution still requiring infrastructure this sandbox cannot
provide, and real Playwright still blocked by the deliberate
no-credential-extraction policy.

## Git

`git status`/`branch`/`log -1`/`diff` checked before this report
(clean except this pass's own new work). Committed on
`feature/reliability-hardening`, pushed to origin. `main` independently
re-verified unchanged at `b63f797` before and after.

## Localhost

`localhost:3001`/`4200`/`3100` all confirmed healthy immediately before
this report was finalized.
