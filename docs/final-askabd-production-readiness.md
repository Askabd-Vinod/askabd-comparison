# AskABD Production Readiness Report

**Directive**: "ASKABD — FINAL MASTER COMPLETION, VERIFICATION & PRODUCTION
READINESS DIRECTIVE".
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening` · **Base**:
`main` at `b63f797` (untouched throughout, independently re-verified after
every commit).

## How to read this report

This report is a **synthesis**, not a from-scratch re-execution of every
one of the directive's 45 phases in a single pass — that would require
weeks of real engineering time this session does not have. It draws on:

1. **This session's own extensive, dated evidence base** — 19 commits and
   ~79 evidence folders created today (2026-08-29) alone, on top of many
   more from the preceding days of this same engagement (RISK-001 through
   RISK-017 closures, the 10-engine Phase 3 UI integration sweep, the
   full marketplace audit, the Verification & Validation Automation
   Service, the Business Journey Engine) — every claim below that cites a
   specific test file, evidence folder, or risk ID is checkable against a
   real, existing artifact in this repository, not restated from memory.
2. **New, targeted work performed in this final pass**: a repository-wide
   mechanical sweep for fabricated/mock data and hardcoded secrets, a
   full production `next build` (the first this session — previously only
   `tsc --noEmit` had been run), a final full API regression, an
   orphaned-test-data database check, and a mechanical recount of the
   feature coverage matrix's own status column (finding and correcting
   stale summary figures).

Per the directive's own Phase 43 ("Final Status Language"), this report
does **not** say "100% complete." It states exact counts, cites exact
evidence, and discloses exactly what remains.

## Executive summary

**FINAL DECISION: GO_WITH_RISKS**

AskABD's Enterprise Operations Centre is a real, working, extensively
tested internal platform: 82 named engines/capabilities in the coverage
matrix (19 `PASS`, 33 `PASS_WITH_RISKS`, 28 `IMPLEMENTED`, 2
`BLOCKED_EXTERNAL_DEPENDENCY`, 0 `NOT_STARTED`), a **98-file / 1005-test
green API regression suite**, a clean `tsc --noEmit` on both workspaces, a
clean production `next build`, zero hardcoded secrets found in a
repository-wide sweep, zero orphaned QA test data, and 17 tracked
security risks of which 12 are `RESOLVED`, 1 is `BLOCKED_EXTERNAL_DEPENDENCY`
by design, and 4 remain genuinely `OPEN` and disclosed (never hidden).
`localhost:3001`/`4200`/`3100` are all healthy at the time of this report.

It is not a finished, fully-hardened commercial product: real gaps exist
(4 open security risks, 14 of 17 business journeys not yet implemented,
no PDF/DOCX export, no CI/CD deployment execution, Playwright orchestration
blocked by a deliberate no-credential-extraction policy, and — as this
session has repeatedly found and fixed — RBAC gaps get discovered by
audit, not by design review, meaning more likely exist undiscovered).
`GO_WITH_RISKS` is the honest release posture: safe for continued internal
staff use and further hardening, not yet a claim of external-facing
production hardening completeness.

## FUNCTIONAL — feature coverage

Source of truth: `docs/eoc-feature-coverage-matrix.md`, mechanically
recounted this pass (a Node one-liner parsing every `| N |`-prefixed
row's own Status column, not hand-carried):

| Status | Count |
|---|---|
| Total rows | 82 |
| PASS | 19 |
| PASS_WITH_RISKS | 33 |
| IMPLEMENTED | 28 |
| BLOCKED_EXTERNAL_DEPENDENCY | 2 (VPS Connectivity, Bastion/Private Network — real client infrastructure this sandbox cannot provide) |
| NOT_STARTED | 0 |

Every `PASS`/`PASS_WITH_RISKS` row carries a named test file and/or
evidence folder; every row's "Known Gaps" column is populated with real,
specific limitations (never left blank to imply none exist). Two new rows
were added this pass that existed as real, tested capabilities but had
never been added to the matrix: **#81 Comparison Marketplace Engine**
and **#82 Verification & Validation Automation Service**.

## SECURITY

`docs/security-risk-register.md`, 17 tracked risks:

| Status | Count | IDs |
|---|---|---|
| RESOLVED | 12 | RISK-001, 002, 004, 005, 006, 009, 012, 013, 014, 015, 016, and 003 (core; one narrow residual `MITIGATED`) |
| OPEN (disclosed) | 4 | RISK-007 (Migration Validation Engine self-referential), RISK-008 (VPN/security-profile doesn't cross-check real TLS mode), RISK-010 (flaky test infra under load, not a security defect), RISK-017 (marketplace tenant-trust gap, zero real frontend consumers today) |
| BLOCKED_EXTERNAL_DEPENDENCY | 1 | RISK-011 (no real external deployment/rollback infrastructure exists) |

**This final pass's own security-relevant work**: a repository-wide grep
sweep for hardcoded secrets (`password|secret|apiKey` literal
assignments) found **zero** matches outside legitimate `process.env`
reads and masked/placeholder text; a sweep for `devBypass` confirmed it
is correctly gated (`NODE_ENV !== 'production' && !JWT_SECRET &&
!JWKS_URL`) everywhere it appears, never reachable in a real production
configuration; a sweep for TODO/FIXME in `src/` found zero.

**Marketplace** (`docs/evidence/security/marketplace_rbac_audit_test_1/`,
28 real HTTP-layer tests): full 12-dimension audit against
unauthenticated/customer/staff/cross-client actors. 4 confirmed gaps
documented (RISK-016 resolved, RISK-017 open) — `merchant.tenant_id` and
verification/branch ownership remain caller-trusted with no real
identity-mapping bridge, capped in practical severity by zero real
frontend consumers today, but a real, unfixed architectural gap.

**RISK-014** (the largest single finding this session — a mechanical
route/RBAC sweep across all 451 registered API routes): fully closed
across `risk_014_triage_test_1` through `_6`. Every one of the ~47
originally-flagged candidate routes was individually investigated against
real schema, not assumed safe by naming — including one self-correction
where an earlier pass's own "genuinely global, safe" conclusion about
`GET /oc/workflow/rules` was found wrong on re-inspection of the real
schema and fixed.

## TENANT ISOLATION / IDOR

Proven with real cross-client HTTP-layer tests, not assumed from route
naming, across: database connections (`connector-test-1.test.ts`, 6 real
cross-client IDOR proofs), discovery runs (`security-test-1.test.ts`),
connection-security profiles, migration rollback ownership
(`migration-rollback-test-1.test.ts`), risk/change/deployment/data-mapping/
API-spec/dependency-analysis ownership (each engine's own test suite),
and the marketplace surface (`marketplace-rbac-audit-test-1.test.ts`).
Every fix follows the same pattern: an explicit object-level ownership
check raising a typed `*OwnershipError` mapped to `404` (never leaking
existence via a `403`).

## DATABASE INTEGRITY

RISK-012 (39 client-scoped tables missing a real FK to `oc_clients`) —
`RESOLVED` platform-wide. This final pass's own orphan check (direct SQL
against the real database): **zero** orphaned test clients, **zero**
suspicious leftover test merchants, **zero** orphaned
`oc_verification_journey_runs` rows (dangling `client_id`). Every
migration through 069 applied cleanly; `tsc --noEmit` clean on the
service layer reading them.

## COMPARISON / CONFIGURATION ENGINES

Universal Comparison Engine (row #33, `PASS`) and Configuration
Comparison Engine (row #35, `PASS_WITH_RISKS`) both proven — this session
found and fixed a real defect where severity had been left/right-position
dependent rather than a pure function of classification
(`bidirectional_comparison_test_1`), with a regression covering all 8
real statuses in both directions. Bidirectional correctness (swapping
environments does not change meaning/severity) is proven, not assumed.

## MIGRATION

Migration Assessment/Planning/Execution/Validation/Rollback Engines: real,
working, RBAC-enforced, with real object-level ownership. Migration
Validation Engine is honestly disclosed as self-referential (RISK-007,
`OPEN`) — it validates the platform's own migration-run data, not yet
wired to a real cross-environment migration assessment via the Universal
Comparison Engine. Real external deployment execution does not exist
(RISK-011, `BLOCKED_EXTERNAL_DEPENDENCY` by design) — never simulated.

## VERIFICATION & VALIDATION SERVICE

Built this session as a real, reusable platform capability (not a script,
not a duplicate testing architecture) — see row #82. Live-verified this
pass: a real deep health check run (17 checks, 12 passed, 0 failed, 5
honest warnings, `GO_WITH_RISKS`) and a real Business Journey run (Client
Onboarding, `PASSED`, full real result detail rendered) were both executed
against the live, authenticated staff UI. 3 of 17 named business journeys
are fully real end-to-end; the other 14 are honestly registered as
`blocked`, never simulated.

## BUSINESS JOURNEYS

| Journey | Status |
|---|---|
| Client Onboarding | Real, implemented, live-verified `PASSED` |
| Report Generation | Real, implemented |
| Workflow Execution | Real, implemented |
| Assessment, Discovery, Database Comparison, Configuration Comparison, Migration, Migration Validation, Security Validation, Release Readiness, Deployment, Post-Deployment Validation, Incident Resolution, Commercial Engagement, Client Portal, Marketplace | Registered, honestly `blocked` — no real journey-runner exists yet for these 14 |

This is the single largest remaining scope item if the directive's own
Priority 1 ("complete business-journey validation for all 17") is to be
literally finished — each of the 14 needs its own real runner reusing the
underlying engine (most of which already exist and are individually
tested), following the exact pattern the 3 implemented journeys establish.

## REPORTING / DOWNLOADS

Real defect found and fixed this session: `DownloadButton` labeled a
plain-text export `.pdf` — no PDF library exists anywhere in the
repository (confirmed via `package.json` grep in both workspaces). Fixed
to honestly download `.txt`. PDF/HTML export for Executive Reports and
Document Generation remains genuinely not implemented, disclosed in the
matrix (rows #29, #62), not silently claimed.

## UI/UX

10 Phase-3 engine pages live-verified end-to-end with a real, active
staff session this session (`live_authenticated_verification_test_1`).
This final pass: a repository-wide `mockClients` sweep, and an
**investigated-and-corrected self-check** — an initial belief that 24
client-scoped demo pages lacked disclosure of their sample data was
found wrong (the shared `layout.tsx` already discloses it on every page)
and reverted before it could ship as a duplicate-banner regression. See
`docs/evidence/final_readiness/demo_data_disclosure_test_1/` for the full
record of that self-correction.

## BROWSER COMPATIBILITY

Real, standalone, credential-authenticated Playwright remains
`BLOCKED_EXTERNAL_AUTH` platform-wide, by deliberate design — this session
found a real, live staff session active in the Browser pane at one point
and explicitly declined to extract or persist its token for Playwright
use, per the standing safety rule against credential extraction. Browser
-pane interactive verification (real clicks against the real running
app, through a human-initiated session) has supplemented this throughout
and is clearly distinguished from Playwright evidence in every doc that
uses it — never conflated.

## EXTERNAL DEPENDENCIES

| Dependency | Status |
|---|---|
| PostgreSQL (primary DB) | CONNECTED, VERIFIED |
| AskABD Identity Platform | CONNECTED, VERIFIED |
| Jira | CONFIGURED, not CONNECTED (RISK-015 resolved: signature verification now real; live push requires real per-environment config not present here) |
| TestRail / ADO | Architecture only (`TestManagementAdapter`), `BLOCKED_EXTERNAL_DEPENDENCY` — no real credentials exist in this sandbox |
| Real CI/CD / deployment infrastructure | `BLOCKED_EXTERNAL_DEPENDENCY` (RISK-011) |
| VPS / Bastion / real client networks | `BLOCKED_EXTERNAL_DEPENDENCY` (rows #57, #58) |

## OBSERVABILITY / AUDIT

Real, platform-wide audit engine (`registerAuditEngine`); correlation IDs
present in every logged request (`reqId` in the real Fastify/pino logs
observed live this pass). Not independently re-confirmed this pass that
every one of the ~30 newest routes emits an audit entry (tracked as a
real, open candidate for a future `audit_test_1`, not silently assumed).

## PERFORMANCE

No dedicated load-testing pass exists. Real, incidental measurements
observed this pass: API health check ~50ms cold, deep verification
health check completing in seconds against real running services, full
API regression suite (98 files / 1005 tests) completing in ~230-400s
wall-clock depending on system load. No SLA claims are made beyond these
real, incidental figures.

## FINAL AUTOMATED TESTING GATE (this pass)

| Check | Result |
|---|---|
| Targeted new tests (Business Journey Engine) | 6/6 passing |
| Full API regression | **98 files / 1005 tests, all passing** |
| `tsc --noEmit` (apps/api) | Clean |
| `tsc --noEmit` (apps/web) | Clean |
| `next build` (apps/web) | **Succeeded — 45 routes, first full production build this session** |
| `localhost:4200` (API) health | `{"status":"ok",...,"database":"connected"}` |
| `localhost:3100` (Identity) health | `{"status":"ok",...}` |
| `localhost:3001` (web) | Healthy, rendering (self-inflicted incident during this pass — see note below) |
| Orphaned QA data | Zero (test clients, merchants, journey runs all checked directly against the database) |
| Hardcoded secrets sweep | Zero found |
| `main` branch | Unchanged at `b63f797`, re-verified after every commit |

**Note on a self-inflicted incident during this pass**: running `next
build` (production build) earlier in this pass while the `next dev`
server was live corrupted the shared `.next/server` webpack cache (`next
dev` and `next build` both write to the same `.next` directory), leaving
`localhost:3001` returning `500 Internal Server Error` ("Cannot find
module './4787.js'") for a period during this pass. Caught before this
report was finalized: `.next` was removed and the dev server restarted
cleanly, re-verified rendering the real staff login page correctly with
zero console errors on the fresh load. Recorded here per the standing
"never leave localhost:3001 broken, document if something was disrupted"
rule — future passes should run `next build` against a separate output
directory or stop the dev server first if a production-build check is
needed while a dev server is also running.

## RISKS

See `docs/security-risk-register.md` for the full, canonical list. The 4
genuinely `OPEN` items, in priority order: **RISK-017** (marketplace
tenant-trust gap — highest priority if/when the marketplace gets a real
frontend consumer), **RISK-007** (Migration Validation Engine
self-referential), **RISK-008** (VPN/TLS cross-check gap), **RISK-010**
(flaky test infra, not security-relevant).

## BLOCKERS

- Real external deployment/CI-CD infrastructure does not exist (RISK-011).
- Real VPS/Bastion/client-network infrastructure does not exist (rows
  #57, #58).
- Authenticated Playwright is blocked by design (no credential extraction).
- 14 of 17 business journeys have no real runner yet.

## KNOWN LIMITATIONS

- PDF/DOCX export not implemented anywhere in the platform (Markdown/
  HTML/TXT only, honestly labeled after this session's own fix).
- Only PostgreSQL has a real comparison/connectivity adapter; Oracle/
  SQL Server/MySQL/MongoDB are honestly `adapter_required`.
- ~24 legacy top-level "shell" pages (governance, intelligence,
  monitoring, etc.) remain backed by illustrative demo data with explicit
  on-page disclosure — real per-page rewiring to live aggregation APIs is
  a large, separate, tracked body of work (`enterprise-feature-gap-register.md`).
- Audit-emission coverage for the newest ~30 routes is not independently
  re-confirmed.

## EVIDENCE

~79 dated evidence folders under `docs/evidence/`, each following the
`<feature>_test_N` naming convention with a markdown write-up citing real
test files, real request/response data, and (where a live authenticated
browser session was available) real rendered UI state. No fabricated
screenshots exist anywhere in this evidence base — every doc that could
not obtain live UI evidence says so explicitly (`BLOCKED_EXTERNAL_AUTH`)
rather than substituting a description for a real image.

## FINAL RELEASE DECISION

# GO_WITH_RISKS

AskABD's Operations Centre is safe to continue operating and building on
internally. It is not yet a hardened, externally-facing commercial
product — 4 open security risks, a marketplace surface with a real
unfixed tenant-trust gap (currently low-blast-radius due to zero real
consumers), and 14 of 17 business journeys still unimplemented are the
concrete, disclosed reasons this is not a plain `GO`. Nothing found this
pass rises to a `NO-GO`-level finding (no critical, currently-exploitable
security defect with a real consumer was left unfixed).
