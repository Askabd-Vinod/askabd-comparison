# migration_validation_test_1 — Migration Plan page (Pre-Flight + Validation), real UI, real bugs found and fixed

**Feature**: Migration Pre-Flight & Validation (`MigrationValidationService`, `/clients/:id/migrations` page) — distinct from `migration_test_1`'s `TestReportService.runMigrationValidation` (Universal Comparison Engine integration); this suite covers the REAL UI surface, gated behind row #39's own known self-referential-validation limitation
**Test Suite**: `migration_validation_test_1`
**QA Client**: `AskABD PW Migration Validation UI Test 1` (real ID: `client-75248d87-6cf7-432c-a11a-a2b246fcc5f3` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (see below)

## Objective

`migration_test_1` covered the API-only `TestReportService.runMigrationValidation`
capability, which has no dedicated UI. This suite covers the capability
that DOES have real UI: `/clients/:id/migrations` ("Migration Plan" page),
with real "Run Pre-Flight Checks" / "Run Validation" / "Create Real
Migration Plan" buttons wired to `MigrationValidationService.runPreflight()`
/ `.runValidation()` and `MigrationExecutionService.createPlan()`.

## Scope

1. Live-verify the real Pre-Flight and Validation buttons end-to-end with
   a freshly-onboarded QA client (nothing configured — a genuine "what
   does an honest, unconfigured client actually see" test).
2. **A real security gap found and fixed during this pass** (not part of
   the original scope, but a genuine issue that surfaced while inspecting
   the route wiring before testing): `POST /oc/production/readiness` and
   `POST /oc/migration/plan` had no RBAC rule at all, unlike every sibling
   migration route — see "Security finding" below.
3. **Two real UI bugs found and fixed live** during the Browser-pane pass
   — see "UI bugs found and fixed" below.
4. **A real cleanup-infrastructure gap found and fixed**: `oc_audit_log`
   (and 3 sibling generic entity-audit tables) have no `client_id` column
   — the existing `cleanup-qa-client.mjs` never swept them, silently
   leaving real orphaned audit rows behind after every QA client deletion
   this session. Fixed and retroactively cleaned.

## Security finding (fixed, tested)

`/oc/production/readiness` and `/oc/migration/plan` both take `clientId`
in the request BODY, so `tenant-access.ts`'s generic clientId-sniffing
never applies to them — the exact same class of gap this codebase's own
`rules.ts` comments document was fixed for `/oc/migration/preflight` and
`/oc/migration/validate` during "the 2026-08-22 SDLC-completion audit."
These two were simply missed at the time. Without an explicit RBAC rule,
both fell through to `defaultPolicy: 'authenticated'` — **any real
customer token could check production readiness for, or create a real
migration PLAN against, ANY client**, just by putting a different
`clientId` in the request body.

**Fix**: added both routes to `rules.ts` with `Admin.Access`, matching
every sibling migration route. **New regression tests** (this route
family had ZERO prior test coverage — `migrations-routes.test.ts`
deliberately registers routes without the security middleware, to test
route logic in isolation): a customer token is now denied `403` for all
6 preflight/validate/readiness/plan/dry-run/execute routes; an admin
token can genuinely reach production readiness and migration plan
creation (`200`, real data, not a fabricated stub).

## UI bugs found and fixed (live, not from source inspection)

Both caught by actually clicking the real buttons with a real, freshly
onboarded QA client and observing the real rendered result — not by
reading the code first.

1. **Pre-Flight summary tiles always showed 0 Passed / 0 Failed**,
   regardless of the real per-check results shown directly below them.
   Root cause: `migrations/page.tsx` filtered on `c.status === 'passed'`/
   `'failed'` (past tense) while the real backend
   (`MigrationValidationService`'s `PreflightCheck.status`) is
   `'pass' | 'fail' | 'warning' | 'skipped'` (present tense) — the
   filters never matched. "Warnings" happened to show correctly only
   because `'warning'` is spelled the same both ways, masking the bug.
2. **Every real `pass` check rendered in red text**, not green — same
   root cause, in the per-check color ternary (`check.status ===
   'passed' ? green : ... : red` — a real `'pass'` value fell through to
   the `red` branch).

**Fix**: changed both the tile filters and the per-check color ternary to
match the real backend contract (`'pass'`/`'fail'`), with a code comment
explaining the tense mismatch for future maintainers. Verified live,
before/after (see "Live result" below).

## Test data / preconditions

A freshly-onboarded QA client with nothing else configured — no database
connections, no discovery, no assessment, no approved recommendation.
This is deliberate: it proves the honest, unconfigured case rather than a
pre-seeded "everything already passes" scenario.

## Expected result (predicted before running)

Pre-Flight, for a client with nothing configured:
- Source Connector: FAIL (no connected connector)
- Discovery Completed: FAIL (no completed discovery)
- Assessment Completed: FAIL (no completed assessment)
- Recommendation Approved: FAIL (no approved recommendation)
- Target Database Accessible: PASS (real query against this platform's own live DB succeeds)
- Schema Compatibility: PASS (PostgreSQL-to-PostgreSQL, unconditional)
- Storage Capacity: PASS (unconditional)
- Backup Ready: WARNING (unconditional)
- Overall: **3 pass, 4 fail, 1 warning → step status FAILED** (never fabricated readiness)

Validation (self-referential — see "Known limitation" below): all 9
internal checks compare the platform's own database to itself → **always
9/9 pass → status "passed"**.

## Live result — matched exactly, before AND after the fix (text was already correct; only the tile counts/colors were wrong)

**Before the fix** (`docs/evidence` — text transcribed live, not a
persisted PNG, see "Playwright result" below): Pre-Flight tiles read
`0 Passed / 1 Warnings / 0 Failed`; `Target Database Accessible` rendered
in red despite reading "PASS". Per-check text values were already
correct (`Source Connector: FAIL`, ..., `Target Database Accessible:
PASS`, ..., `Backup Ready: WARNING`) — only the aggregate tiles and the
color logic were broken.

**After the fix**, re-run against a fresh page load, same client: Pre-Flight
tiles correctly read `3 Passed / 1 Warnings / 4 Failed`; `Target Database
Accessible`/`Schema Compatibility`/`Storage Capacity` now render in green;
`Source Connector`/`Discovery Completed`/`Assessment Completed`/
`Recommendation Approved` in red; `Backup Ready` in amber. Migration Step
1 badge: **FAILED** (honest — never silently marked ready). Validation
step then run: **Status: passed, 9 Passed, 0 Warnings, 0 Failed** — Step 2
badge **PASSED**.

## Known limitation (real, pre-existing, disclosed — not fixed this pass)

`MigrationValidationService.runValidation()` is genuinely self-referential
— it queries this platform's OWN `sharedPool` database for BOTH the
"source" and "target" side of every check (table/index/view/extension/
schema/sequence/constraint counts, latency), so it always reports a
perfect match by construction. This was already identified and documented
in an earlier session pass (coverage matrix row #39, "Migration Assessment
Engine" — "Confirmed self-referential... documented, not fixed"). This
pass reconfirms the same limitation is directly reachable from the real
UI's "Run Validation" button (not just the underlying service), and
explicitly does NOT present the resulting "passed" status as a genuine
client source-vs-target validation. Fixing this architecturally (wiring
`runValidation` to a real Universal Comparison Engine run the way
`TestReportService.runMigrationValidation` already does) is a real,
disclosed fast-follow, not attempted in this pass to keep scope bounded.

## Automated tests

2 new tests added to `testing-engine.test.ts` (now 17 total in that
file): a customer-token-denied-403 sweep across all 6 migration
preflight/validate/readiness/plan/dry-run/execute routes, and an
admin-token-succeeds check for the two newly-fixed routes. Full API
regression: **66 files / 622 tests passing** (620 + 2 new). `tsc --noEmit`
clean on both `apps/api` and `apps/web`.

## API evidence

`POST /oc/migration/preflight` and `POST /oc/migration/validate` both
returned `200 OK` for the real QA client, confirmed via
`read_network_requests` during the live pass — every real request this
pass succeeded.

## Database evidence

`oc_audit_log` orphan gap found and fixed: the route's own
`ocService.createAuditEntry({ entityType: 'validation', entityId:
clientId, ... })` call genuinely persists a real audit row keyed by
`entity_id = clientId` — but `cleanup-qa-client.mjs` only ever swept
`client_id`-keyed tables, so these rows silently survived every QA
client deletion this session. Found live (13 orphaned rows for THIS
suite's own client), fixed in `cleanup-qa-client.mjs` (added a real
`entity_id` sweep across `oc_audit_log`/`oc_service_actions`/
`entity_versions`/`approval_workflows` — none of which have a `client_id`
column at all), and retroactively applied: this suite's own 13 orphaned
rows deleted, plus 7 each from two EARLIER suites this session
(`migration_test_1`'s and `bidirectional_comparison_test_1`'s QA clients)
that had the exact same silent leak. Re-verified zero `entity_id` orphans
across all three afterward.

## Playwright result

**`BLOCKED_EXTERNAL_AUTH`** — re-checked immediately before this pass;
`scripts/playwright-evidence/.auth/staff-state.json` still does not
exist. Per the standing rule, no PNG screenshots were captured or
persisted this pass; all live results above were reviewed directly in
the Browser pane and transcribed verbatim, not fabricated.

## Cleanup result

Ran via the (now-fixed) reusable `cleanup-qa-client.mjs` — exact id+name
re-verified immediately before delete, full FK-ordered delete across all
client-scoped AND entity_id-scoped tables in one pass, zero orphans
verified via an independent post-delete sweep (now covering both
sweep types). Both protected clients confirmed unchanged. Retroactively
also cleaned two earlier suites' newly-discovered `oc_audit_log` orphans
(see "Database evidence" above).

## Report

| Field | Value |
|---|---|
| Feature | Migration Plan page — Pre-Flight & Validation (`MigrationValidationService`) |
| Test Suite | migration_validation_test_1 |
| Client | AskABD PW Migration Validation UI Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | 17/17 in `testing-engine.test.ts` (2 new); full API regression 622/622 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** — no approved auth mechanism available; no PNGs captured or fabricated |
| Console | Reviewed — logged errors confirmed stale/accumulated from earlier, unrelated activity in this long-running session (same `comparisons/page.tsx` noise already investigated and dismissed during `migration_test_1`); the migrations page itself rendered correctly both before and after the fix |
| Network | PASS — every real request this pass returned 200 |
| Security | **1 real gap found and fixed** — missing RBAC on 2 routes, closed with a real regression test; secret values never exposed |
| Database | **1 real gap found and fixed** — `oc_audit_log`/3 sibling tables never swept by cleanup (`entity_id`, not `client_id`); fixed and retroactively applied to 3 QA clients from this session |
| UI | **2 real bugs found and fixed** — Pre-Flight tile counts and per-check colors both used a stale `'passed'`/`'failed'` string that never matched the real `'pass'`/`'fail'` backend contract |
| Tenant Isolation | Directly improved by the RBAC fix above (previously ANY customer token could target ANY client's readiness/plan) |
| Evidence | This file |
| Failures Found | 4 real issues (1 security gap, 2 UI bugs, 1 cleanup gap) |
| Failures Fixed | 4 (all of the above) |
| Blocked | 1 — authenticated real-Playwright PNG evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | `runValidation()`'s self-referential architecture (real, pre-existing, disclosed — not fixed this pass, see "Known limitation"); retroactive PNG evidence queued for the moment authenticated Playwright is available. |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the standing AUTHENTICATED
PLAYWRIGHT EVIDENCE RULE (no PNG evidence this pass) even though this
suite genuinely found and fixed 4 real issues (a real customer-facing
security gap, two real UI bugs, and a real data-cleanup gap) through live
testing that automated tests and source inspection alone had missed —
exactly the value real UI validation is for.
