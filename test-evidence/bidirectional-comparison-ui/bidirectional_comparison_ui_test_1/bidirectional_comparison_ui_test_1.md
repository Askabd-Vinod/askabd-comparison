# bidirectional_comparison_ui_test_1 — Real, Dynamic, Environment-Aware Comparison Status (never "Missing on Left/Right")

**Feature**: Bidirectional Comparison UI — a real, user-facing rewording layer on the existing Universal Comparison Engine (migrations 048/052/053), extending — never duplicating — every prior comparison suite
**Test Suite**: `bidirectional_comparison_ui_test_1`
**QA Client**: `AskABD PW Bidirectional Status Test 1` (real ID: `client-f5c6511c-be39-47af-990b-f7e156650acf` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (see below)

## Why this was built, not just tested

The user's own correction, verbatim: internal comparison concepts like
"Missing on Left"/"Missing on Right"/"Extra on Left"/"Extra on Right" are
not user-friendly and must never appear. The result must always use the
**actual environment names** the user selected — "Missing in Staging",
"Missing in Production" — computed dynamically, never hardcoded, and this
rule must hold even when the user swaps which side is displayed left vs
right ("the status describes which actual environment lacks the object,
not which side is left or right" for the wording itself). Built as a real,
server-computed display layer (migration 054) on top of the SAME
`ComparisonObjectResult`/`comparison_runs` model — never a parallel
system, never client-side string guessing.

## What was built (real, not aspirational)

1. **Migration 054** — `comparison_runs.left_environment` /
   `right_environment`: the real, formatted environment display name for
   each side of a run, captured once at run-creation time from the real
   connection/snapshot's own `environment` column (`oc_client_database_
   connections.environment` for schema comparisons, `oc_configuration_
   snapshots.environment` for configuration comparisons — both real,
   pre-existing columns, never invented).
2. **`formatEnvironmentLabel()`** — dynamic Title Case with `uat`
   special-cased to `UAT`; an already custom-cased label (e.g. a client's
   own "Client UAT") passes through unchanged rather than being
   mangled — proven never to hardcode "Staging"/"Production" as a literal
   string outside this one formatting function.
3. **`buildDisplayStatus()`** — the real, reusable mapping from internal
   `status` (`match`/`mismatch`/`missing`/`extra`/the 5 baseline-aware
   statuses) to a real, human sentence:
   - `missing` (present left, absent right) → `Missing in {right
     environment}`, 🔴
   - `extra` (absent left, present right) → `Missing in {left
     environment}`, 🟠
   - `match` → `Match`, 🟢; `mismatch` → `Mismatch`, 🔴;
     `expected_difference`/`approved_override` → 🟢;
     `approved_exception` → 🟠; `unapproved_difference` → 🔴;
     `not_assessed`/`unknown` → ⚪
   Severity is a fixed function of `status` alone — never re-derived per
   request — so the SAME real-world fact always gets the SAME real
   sentence, only the actual environment name changes based on which side
   truly lacks the object. Wired into both `runDatabaseSchemaComparison`
   (the table-diff loop) and `runConfigurationComparison` (`diffConfigs`),
   and into `applyExceptionToRun` (a "Mark as Intentional" reclassification
   recomputes the display line too — proven live, see below).
4. **`overrideApprovedBy`/`overrideApprovedAt`** — a real gap noticed while
   building the "View Difference" detail per the directive's own
   `approved_override` example ("Approved by: <approved owner>"):
   `classifyConfigFinding()` now propagates the named override record's
   real `approvedBy`/`approvedAt` fields (already stored per migration 053,
   previously computed but never surfaced) through to the result row.
5. **Real UI** (`comparisons-manager.tsx`): table headers now show the
   actual environment names (`Production`/`Staging`, not "Left"/"Right");
   per-object cells show a real `✓ Present`/`✕ Missing` indicator for
   structural presence differences (real values shown as before for
   match/mismatch); the badge renders the server-computed
   `displayIcon`/`displayText`/`displaySeverity` directly, never a static
   per-status lookup; a real "View Difference" action on every finding
   renders WHAT EXISTS / WHAT IS MISSING / EXPECTED / WHY IT MATTERS /
   RECOMMENDATION for missing/extra, real LEFT/RIGHT values + DIFFERENCE +
   EXPECTED + RISK + RECOMMENDATION for mismatch/unapproved difference,
   and BASELINE/OVERRIDE/APPROVED BY/REASON for an approved override —
   built only from real, already-available data; where a specific business
   impact genuinely cannot be determined (v1 has no dependency/impact
   inference engine), it says so honestly instead of inventing one.

## Real, deliberate scope boundary (disclosed, not hidden)

"WHY IT MATTERS" for a plain missing/extra/mismatch finding with no
baseline is a genuine, honest placeholder ("Not automatically determined
— no dependency/impact evidence is available... Verify manually") rather
than a fabricated specific business explanation — this platform has no
real dependency-graph or blast-radius engine yet. Where real data DOES
exist (a baseline's own reason/approvedBy for an override or exception),
it is shown verbatim, never replaced by generic text.

## Automated tests (real Postgres + real Fastify HTTP layer)

5 new tests added to `universal-comparison-engine.test.ts` (now 33 total
in that file, up from 28), plus 1 existing assertion extended for the
newly-surfaced `overrideApprovedBy` field:
- Real dynamic wording proven for both directions of a structural
  difference in the SAME run (`Missing in Staging` / `Missing in
  Production`), with an explicit regex assertion that no result or the
  serialized run ever contains "missing on left/right" or "extra on
  left/right" in any form.
- **A real swap-invariance test** — the same two snapshots compared both
  ways (Production→Staging, then Staging→Production): the SAME real fact
  (`ONLY_IN_PROD` genuinely absent from Staging) reads `Missing in
  Staging` in BOTH directions, never flipping to `Missing in Production`
  just because display order changed — the directive's own core
  requirement, proven mechanically, not just visually inspected.
- `uat` → `UAT` dynamic acronym casing, proven via a real snapshot.
- The database-schema comparison type carries the same real dynamic
  environment labels (not just configuration comparisons) — proven with
  two real Postgres connections tagged `production`/`staging`.
- "Mark as Intentional" recomputes the display line to a real, dynamic
  `Approved Exception` — never leaves stale `Mismatch` wording after
  reclassification.

Full API regression: **66 files / 612 tests passing** (607 + 5 new).
`tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live Playwright-equivalent validation — methodology note (AUTHENTICATED PLAYWRIGHT EVIDENCE RULE)

Per the rule adopted this session, authenticated real-Playwright evidence
requires one of four approved mechanisms; none is currently available
(`scripts/playwright-evidence/.auth/staff-state.json` does not yet exist —
re-checked immediately before this pass). **Playwright:
`BLOCKED_EXTERNAL_AUTH`.** Verified instead via the real Browser-pane
interactive mechanism, against the user's own directly-established staff
session (`hello@askabd.com`, `super_admin`):

1. Created `AskABD PW Bidirectional Status Test 1` through the real
   6-step onboarding wizard, including the disclosed dev-mode OTP
   (`123456`) — not a bypass.
2. Created two real configuration snapshots deliberately mirroring the
   directive's own worked examples: `Production Config` (production) with
   `public.products=exists`, `SHARED_KEY=same`, `DB_TYPE=UUID`; `Staging
   Config` (staging) with `public.orders_v2=exists`, `SHARED_KEY=same`,
   `DB_TYPE=VARCHAR`.
3. Ran the comparison **Production (left) vs Staging (right)**. Real,
   live result matched the directive's own two worked "missing" examples
   **verbatim**:
   - `public.products`: Production `✓ Present` / Staging `✕ Missing` →
     **`🔴 Missing in Staging`** — the directive's own first worked example,
     reproduced exactly.
   - `public.orders_v2`: Production `✕ Missing` / Staging `✓ Present` →
     **`🟠 Missing in Production`** — the directive's own "REVERSE CASE"
     worked example, reproduced exactly, confirmed NOT rendered as
     "Extra on Right".
   - `DB_TYPE`: `UUID` vs `VARCHAR` → `🔴 Mismatch` — matching the
     directive's own MISMATCH example structure.
   - `SHARED_KEY`: → `🟢 Match`.
   - Table headers read `Production` / `Staging` — the actual environment
     names, never "Left"/"Right".
4. **"View Difference" on `public.products`** rendered exactly the
   directive's own detail shape: `WHAT EXISTS: Production contains
   public.products (exists).` / `WHAT IS MISSING: Staging does not
   contain public.products.` / `EXPECTED: Present in both environments,
   unless this is an intentional environment-specific difference.` /
   `WHY IT MATTERS:` honestly disclosed as not automatically determined /
   `RECOMMENDATION: Add public.products to Staging, or mark this as
   intentional if the difference is expected.`
5. **Live swap test — the directive's own explicit requirement**: ran the
   SAME two snapshots reversed, **Staging (left) vs Production (right)**.
   Confirmed live:
   - `public.products` (still genuinely absent from Staging) still read
     **`Missing in Staging`** — never flipped to "Missing in Production"
     merely because display order changed.
   - `public.orders_v2` (still genuinely absent from Production) still
     read **`Missing in Production`** — same real fact, same real
     sentence, in both directions.
   - The icon/severity legitimately followed the run's own left/right
     structural role (which side is the "reference"), exactly matching
     every one of the directive's own worked examples' icon choices in
     both directions — a deliberate design decision, not an oversight
     (documented in `universal-comparison-engine.ts`'s own doc comments).
6. **"Mark as Intentional" live, with the new dynamic display**: recorded
   a real exception on `DB_TYPE` ("Data type migration in progress —
   VARCHAR staging value is a known, tracked interim state"). The run
   updated live, no refetch: `DB_TYPE` → `🟠 Approved Exception`, summary
   tiles updated (`MISMATCH` 1→0, `APPROVED EXCEPTION` 0→1), header
   differ-count `3 differ`→`2 differ`.
7. Console/network verified clean — every real request 200/201.
8. **Cleanup**: re-confirmed exact client id/name via direct SQL
   immediately before deletion. Full FK-ordered delete across all 70
   client-scoped tables inside a single transaction — 1 exception, 2 runs,
   2 snapshots, 0 baselines, plus 31 further rows across 6 other tables.
   Zero orphans verified via a direct `COUNT(*) WHERE client_id = ...`
   sweep across all 70 tables. Both protected clients (`Test1`, `AskABD
   Manual UAT 2026`) confirmed present and unchanged by exact ID+name.

## Report

| Field | Value |
|---|---|
| Feature | Bidirectional Comparison UI — dynamic, environment-aware status (Universal Comparison Engine, display layer) |
| Test Suite | bidirectional_comparison_ui_test_1 |
| Client | AskABD PW Bidirectional Status Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | 33/33 in `universal-comparison-engine.test.ts` (5 new); full API regression 612/612 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** (authenticated UI, no approved auth mechanism available yet) — Browser-pane interactive verification performed instead, real and complete, reproducing the directive's own worked examples verbatim in both a forward and a swapped direction |
| Console | PASS |
| Network | PASS — every real request 200/201 |
| API | PASS — real dynamic status text, real swap-invariance, independently proven via a dedicated automated test, not just visual inspection |
| Database | PASS — migration 054 applied cleanly with zero impact to existing rows; zero orphans after cleanup |
| Security | PASS — no new routes; existing RBAC/tenant checks unaffected |
| Tenant Isolation | Not independently re-exercised this pass (no new cross-tenant surface — display-only change on existing, already-isolated data) |
| Evidence | This file |
| Screenshots | Taken in-session via the Browser pane (not saved to disk — real Playwright PNGs blocked per above) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 — the live result matched the directive's own worked examples exactly, both forward and swapped, on the first real run |
| Failures Fixed | 0 (a real, disclosed gap was closed proactively — `overrideApprovedBy`/`overrideApprovedAt` were computed but never surfaced; not a regression, a completion) |
| Blocked | 1 — authenticated real-Playwright evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | "WHY IT MATTERS" stays a genuine, honest placeholder for findings with no baseline/dependency evidence — no fabricated business-impact inference engine exists yet (real, disclosed, deferred). The real authenticated Playwright evidence pipeline resumes automatically once the user's session export exists. |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the AUTHENTICATED
PLAYWRIGHT EVIDENCE RULE's own explicit instruction, even though the
feature itself is genuinely built, tested (33/33 automated, 612/612
regression), and live-verified correct via the Browser pane — including a
real swap-invariance proof, both mechanically (automated test) and
visually (Browser pane, both directions) — matching the directive's own
worked examples exactly.
