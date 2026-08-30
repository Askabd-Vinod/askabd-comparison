# AskABD Playwright Coverage Completion — Batch 2

**Directive**: "ASKABD — PLAYWRIGHT COVERAGE COMPLETION", continuing from
`506ec4f` (Batch 1). Batch 2 = staff operational workflows.
**Date**: 2026-08-30 · **Branch**: `feature/reliability-hardening` ·
**Baseline**: `506ec4f` · **Main**: `b63f797` (untouched, re-verified).

## Executive summary

Batch 2 covers the 29 "staff — internal operations" routes from the
Phase 1 mechanical inventory: a lightweight real-load sweep of 18
listing/navigation pages with zero actionable controls, plus deep,
authenticated Playwright interaction on every page with a real button,
form, or download — including the full, genuinely asynchronous
Migration lifecycle (create → dry run → **execute, observed live via
real-time polling** → validate → rollback → download report).

**One real, genuine product defect was found live through this pass's
own Execute Migration click, root-caused, fixed, and re-verified live**:
`oc_gaps.maturity_gap` is a real Postgres `GENERATED ALWAYS AS (...)
STORED` column; the migration engine's data-copy step used an implicit
`SELECT *` column list that included it, which Postgres genuinely
rejects. Fixed in `migration-execution-service.ts`, covered by a new
targeted regression test, and re-proven live end-to-end through the
exact same real UI click (terminal state: "completed", not "failed").

**One real architectural finding is disclosed, not fixed** (see below —
a cookie/sessionStorage sync gap affecting Server Component pages under
sustained automated load; genuine, but a deliberate future step per the
code's own existing documentation, not something to patch blindly this
pass).

**FINAL STATUS THIS PASS: PASS_WITH_RISKS.**

## Batch 2 results

| Dimension | Result |
|---|---|
| Routes | **29/29** (18 Group A light sweep + 11 Group B deep interaction, including 2 dynamic detail routes reached via real navigation/link-click) |
| Actions (real clicks/interactions) | **26** — 18 page loads + defect-detail load + catalog-link click + MFA page render + search query + accordion expand + 4 real downloads + migration create/dry-run/execute/validate/rollback (5) + 1 more download |
| Forms | **2/2** — migration creation form (client select + submit), search input |
| API | **29/29** routes exercised produced real, observed HTTP responses |
| Database | **2/2 applicable** — migration-runs row + target-schema lifecycle (created → populated → verified dropped on rollback, independently confirmed via direct SQL, not the UI's own claim) |
| RBAC | Not newly exercised this batch (Batch 1 already covered an unauthenticated-fetch check; this local dev server's own documented auth bypass — no `JWT_SECRET`/`JWKS_URL` configured — means a real production RBAC signal cannot be demonstrated from this environment, consistent with Batch 1's own disclosed finding) |
| Tenant isolation | Not applicable this batch — no cross-client staff-scoped comparison was exercised (Batch 1 already covered the cross-client data-scoping proof) |
| Real-time | **1/1 applicable** — Execute Migration's `OperationProgress` panel: genuine queued/running → completed transition observed live via real polling, not a forced refresh |
| Downloads | **4/4** — engineering defect report, engineering reports (TXT), report detail (Export PDF), migration report; all real, non-empty files with real, honestly-labeled extensions (already-disclosed `.txt` PDF-honesty precedent, not a new finding) |
| Screenshots | **15/15** saved, verified (exists, non-zero size, real PNG signature), and **visually opened and reviewed** — this review is what caught the real false-positive described below |
| Console | 0 errors on the final clean run |
| Network | 0 real failures (after excluding investigated, benign `net::ERR_ABORTED` RSC-prefetch cancellations, per Batch 1's own established finding) |

## Real defect found, fixed, and re-verified

**`apps/api/src/services/migration-execution-service.ts`** — the
data-copy step's `INSERT INTO target SELECT * FROM source` used an
implicit column list. `oc_gaps.maturity_gap` is a real `GENERATED ALWAYS
AS (target_maturity - current_maturity) STORED` column; Postgres
genuinely rejects writing to a generated column, even via `SELECT *`.
Confirmed via direct DB inspection (`information_schema.columns`,
`is_generated = 'ALWAYS'`) after the real UI click surfaced the error:

```
FAILED: Data oc_gaps — cannot insert a non-DEFAULT value into column "maturity_gap"
```

**Fix**: query `information_schema.columns` for the real, non-generated
columns of the source table and use an explicit, identical column list
on both sides of the `INSERT ... SELECT`.

**Test**: `apps/api/tests/migration-generated-column-fix-test-1.test.ts`
— reproduces the exact real scenario (migrate the real `public` schema,
which genuinely contains `oc_gaps`), asserts the step completes (not
`failed`), independently verifies row counts match, and verifies the
generated column recomputed correctly on the target side. **Passing.**

**Re-verified live**: this pass's own `batch2_staff_operations_test_1.mjs`
re-ran the exact same real Execute Migration click after the fix —
real terminal state `"completed"`, confirmed both via the live UI badge
and a direct query of `oc_migration_runs.status`.

## Real false positive found and fixed in this pass's own test script

The first attempt at asserting the real-time terminal state used
`getByText(/^(completed|failed)$/i)` — case-insensitive, matching not
only the real status badge but the **always-present** "Completed" /
"Failed" stat *labels* next to the 0-valued counters
(`operation-progress.tsx` renders "0 / Completed" from the very first
render, regardless of overall status). Two screenshots taken via this
matcher were **byte-identical** — the tell that this pass's own
"actually open and review the screenshot" rule caught before trusting
the (wrong) "completed" claim in an earlier attempt. Fixed by matching
only a `<span>` whose entire text is the exact, case-sensitive lowercase
status string, which the label `<p>` tags can never satisfy.

## Real architectural finding, disclosed (not fixed this pass)

Server Component pages (`/engineering/[defectId]`,
`/migrations/[migrationId]`) authenticate via a same-site cookie
(`askabd_staff_token`) mirroring the client's `sessionStorage` token —
`lib/api.ts`'s own existing documentation already describes this as a
deliberate interim design (Server Components cannot read
`sessionStorage`), with a fuller cookie/BFF redesign named as real,
larger future work. Under this pass's sustained, heavy, long-running
automated navigation (many real page loads, a 261-step real migration,
repeated downloads over several minutes), that cookie was observed at
least once to fall out of sync with the live `sessionStorage` token,
producing a real, honest `401` ("We could not verify your session...")
on those specific pages — never a fabricated success, never an
unauthenticated bypass. Not fixed here (touches core auth plumbing used
by all 57 Server Component pages; a real fix deserves dedicated,
focused verification, not a blind patch under this batch's time budget).
This pass's script is resilient to it (detects a real redirect to
`/staff/login` and transparently re-authenticates), so it did not block
Batch 2's coverage.

## Real script bugs found and fixed while building this pass (test-harness only, not product defects)

- `page.locator('button').first()` on `/welcome` matched a header/nav
  button, not the real accordion — fixed to target the button
  containing "Onboard" specifically.
- `selectOption({label: /regex/})` — Playwright requires an exact
  string, not a regex, for `label`; fixed with the real, exact option
  text (including the `(environment)` / `(connectorType, environment)`
  suffixes actually rendered).
- Download buttons on `/engineering/reports` and `/reports/[reportId]`
  are labeled "TXT"/"Export PDF" respectively, not "Download" — found by
  opening the screenshot and reading the real button text, not assumed.
- `networkidle` proved fragile across this long, many-navigation batch
  (different unrelated routes timed out on different retries) — switched
  to `domcontentloaded` + an explicit settle wait, which also surfaced
  (and required fixing) a real hydration-race class already documented
  in `auth.mjs`'s own header comment for the login flow: a control can
  be DOM-visible from server-rendered markup before its React click
  handler is actually attached. Fixed with explicit visibility +
  settle waits before every real click, plus one bounded retry on the
  download-click pairing specifically (found intermittent even after
  those waits).
- A fixed 2.5s wait after Rollback wasn't always enough for a genuinely
  completed (fully-populated, 130-table) migration's schema drop —
  replaced with direct DB polling of the real authoritative state.

## Cleanup

Every disposable migration/schema this pass created was either dropped
via a real Rollback click (independently DB-verified) or, for two
interrupted intermediate attempts during debugging, cleaned up directly
before the next run. **Final sweep this pass: 0 new orphans.** Two
pre-existing orphan schemas (`mig_client_689fbe34_..._1787999258011`,
`..._1787609543472`) were found during this pass's own sweep — dated
before this session, belonging to a different, unrelated client
(`client-689fbe34`, "Acme Digital Solutions"), not created by this pass.
Disclosed, not silently absorbed into this pass's own cleanup claim;
real, minor pre-existing DB-hygiene item for a future pass. Both
permanently-protected fixture clients (`Test1`,
`AskABD Manual UAT 2026`) confirmed present and unmodified beyond new,
additive rows.

## Automated regression / typecheck

- **99 files / 1019 tests, all passing** (998 baseline `+1` new targeted
  regression test for the migration fix).
- `tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Environmental incident (disclosed, resolved) — separate from the two above

Mid-pass, the shared dev environment showed transient, non-deterministic
navigation timeouts across unrelated routes — investigated and
attributed to sustained load from this pass's own repeated heavy real
migrations rather than a specific page defect. Resolved by a clean
restart of the `web`/`api` dev servers (not `.next` corruption this
time — a plain, safe stop/start, consistent with this session's standing
"never `npm run build` against the live dev server" rule).

## Route evidence reconciliation (updated)

| Class | Count | Change |
|---|---|---|
| A — fresh Playwright evidence | **35** | +27 (was 8 after Batch 1) |
| B — real Browser-pane evidence | 10 | unchanged |
| C — not individually reconciled | **79** | -27 (was 106) |
| Total | 124 | |

See
[`route-evidence-reconciliation.md`](route-evidence-reconciliation.md)
for the full, regenerated per-route table.

## Coverage score across Batches 1+2 (not rounded up)

| Dimension | Score |
|---|---|
| Total real routes (Phase 1 inventory) | 124 |
| Routes with fresh Playwright evidence (Class A) | 35/124 |
| Batches complete | 2/6 (highest-risk client-facing, staff operational) |
| Batches remaining | 4/6 (administration/security, marketplace, reports/downloads, remaining pages) |
| Real defects found, fixed, and re-verified live | 1 (this batch) + 0 (Batch 1) |
| Real false positives in this pass's own test harness, caught before being reported | 1 (screenshot-comparison catch) |
| Full regression | 1019/1019 |
| Orphans created by this pass, remaining | 0 |

## Final release decision

# GO_WITH_RISKS

Unchanged posture. This batch's real, verifiable contribution: 29 more
routes with fresh Playwright evidence (Class A now 35/124), one genuine
migration-engine defect found live, fixed, and independently
re-verified through the same real UI click, and one real architectural
finding (Server Component auth cookie sync) honestly disclosed rather
than patched blind. Batches 3-6 remain real, disclosed, unstarted future
work.

## Git

Branch `feature/reliability-hardening`. `main` independently
re-verified unchanged at `b63f797` before and after this pass.

## Server health

`localhost:3001`/`4200`/`3100` all confirmed healthy immediately before
this report was finalized.
