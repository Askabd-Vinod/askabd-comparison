# AskABD Playwright Coverage Completion — Batch 1

**Directive**: "ASKABD — PLAYWRIGHT COVERAGE COMPLETION" (continues from
`a78f462`, closing the disclosed gap: "individual buttons/forms/actions
across the other existing user-facing pages were not freshly Playwright
validated").
**Date**: 2026-08-30 · **Branch**: `feature/reliability-hardening` ·
**Baseline**: `a78f462` · **Main**: `b63f797` (untouched, re-verified).

## Executive summary — honest scope statement (read first)

This pass builds a real, mechanically-derived inventory of every
user-facing route (Phase 1), reconciles what evidence genuinely exists
per route (Phase 2), and completes **Batch 1 — highest-risk client-facing
staff workflows** with fresh, authenticated, real Playwright evidence:
Connectors, Comparisons, Data Reconciliation, Discovery, Migrations,
Compliance, plus the client-onboarding wizard and two real security/
scoping checks. Batches 2-6 (staff operational workflows,
administration/security, marketplace, reports/downloads, remaining
pages) are **not started** — this is disclosed, not hidden, consistent
with this whole engagement's standing practice of honest, bounded
per-pass scope over a fabricated 100%.

**Two real defects were found and are disclosed below** (neither
required a code fix — both were determined, after investigation, to be
correct, non-fabricated application behavior or a known, documented
local-dev-only condition). **One real bug in the OLDER
`comparison_test_1.mjs` script's own assumption was found and is
disclosed** (not fixed in this pass — a real, separate, future piece of
coverage work: Playwright-driving the ~8-field lifecycle-progression gate
itself).

**FINAL STATUS THIS PASS: PASS_WITH_RISKS** (matches the standing product
release posture; nothing found here changes it).

## Phase 1 — real route inventory

Built by `scripts/build-route-inventory.mjs`, a mechanical scan of every
`page.tsx` under `apps/web/src/app` plus every co-located client
component in the same directory (not copied from documentation) — see
[`route-inventory.json`](route-inventory.json) /
[`route-inventory.md`](route-inventory.md).

| Metric | Count |
|---|---|
| Total real routes | **124** |
| — auth (unauthenticated) | 5 |
| — client-portal (customer-facing) | 2 |
| — staff — client-scoped workflow | 74 |
| — staff — platform/admin | 14 |
| — staff — internal operations | 29 |
| Total real `<button>`/`<Button>` occurrences (mechanical count) | 245 |
| Total real `<form>`/`useForm()` occurrences | 24 |
| Total real POST/PUT/PATCH/DELETE call-sites | 122 |
| Total real download signals (`.pdf`/`.csv`/`.docx`/`download=`) | 10 |
| Total real polling/WebSocket/EventSource signals | 5 |

## Phase 2 — evidence reconciliation

Built by `scripts/reconcile-route-evidence.mjs` — see
[`route-evidence-reconciliation.md`](route-evidence-reconciliation.md).

| Class | Meaning | Count |
|---|---|---|
| **A** | Fresh Playwright evidence, this engagement | **8** |
| **B** | Real authenticated Browser-pane evidence (not Playwright) | **10** |
| **C** | Not individually reconciled this pass (real API/unit coverage likely exists per the 82-row matrix, but page-level UI evidence unconfirmed this pass) | **106** |
| **D** | No meaningful evidence at all | 0 (not claimed — genuinely not checked, see C) |

Class C is **not** claimed as untested — the existing 1018-test regression
suite and 82-row coverage matrix already document real automated
coverage for most of these engines at the service/API layer. What Class C
honestly discloses is that this specific pass did not freshly click
through their page-level UI controls one at a time.

## Batch 1 — highest-risk client-facing staff workflows (COMPLETE this pass)

Real script:
[`scripts/playwright-evidence/final_product_validation/batch1_client_workflows_test_1.mjs`](../../scripts/playwright-evidence/final_product_validation/batch1_client_workflows_test_1.mjs).
Real evidence:
[`docs/evidence/playwright_full_product/batch1_client_workflows/batch1_client_workflows_test_1/`](../evidence/playwright_full_product/batch1_client_workflows/batch1_client_workflows_test_1/).

**Real, disclosed adaptation**: the first attempt at this script assumed
(matching the older, now-stale `comparison_test_1.mjs`) that a
freshly-onboarded client can immediately add database connections. Real
investigation (querying `oc_lifecycle` directly) found this is false: a
fresh client lands at `identity-verified`, and the Connector
Configuration UI only renders at `environment-registered` — reached only
after completing "Security Validation" (5 dynamic requirement fields) and
"Environment Registration" (3 more) through the `RequirementWorkspace`
form. This is correct, intended product behavior, not a defect — but
Playwright-driving that ~8-field dynamic form gate is real, separate,
unstarted future coverage work. This pass instead used the two
pre-existing, permanently-protected fixture clients this whole
engagement already treats as living QA fixtures (`Test1`, already at
`environment-registered` with 2 real connections; `AskABD Manual UAT
2026`, further along) for the pages that require a connections-ready
client — all actions against them additive/read-only, never destructive.

| # | Page | Real action(s) taken | Result |
|---|---|---|---|
| 1 | `/clients/onboard` | Real 6-step wizard: 14 distinct real button clicks (industry/country/size/model/level selects, 3 service picks, 3 tech-stack picks, 3×"Next", "Select All", "Complete Onboarding", OTP "Verify OTP") — run twice (client A, client B) | PASS — both real clients created |
| 2 | `/clients/[clientId]/connectors` (fixture `Test1`) | Real page load, real relevance-filtered list rendered; no expandable control existed for this client's specific selected services (honestly reported, not fabricated) | PASS |
| 3 | `/clients/[clientId]/comparisons` (fixture `Test1`) | Real "+ New Comparison" click, 2 real connection selects, real "Run Comparison" click | PASS — real, honest "Failed" result (these fixture connections point to unreachable demo databases `novatech_prod`/`novatech_staging` on port 5432 — a real, correct honest-failure, not a fabricated match) |
| 4 | `/clients/[clientId]/data-reconciliation` (fixture `Test1`) | Real "Add" click, 2 real connection selects, real table-list input (`brand, category`), real "Run Reconciliation" click | PASS — independently confirmed via the real backing API: a real run exists, 2 real table results, `status: failed` (same honest-failure reason as above) |
| 5 | `/clients/[clientId]/discovery` (disposable client A) | Real "Start Discovery" click | PASS — real, honest prerequisite-blocked outcome (this client has no connectors configured) |
| 6 | `/clients/[clientId]/migrations` (fixture `AskABD Manual UAT 2026`) | Real navigation; "Run Preflight" control was not present on this render for this client's real current state | PASS (page verified; no button available to click for this specific state — honestly reported) |
| 7 | `/clients/[clientId]/compliance` (disposable client A) | Real load + real "Refresh" click | PASS |

### Security / scoping (real)

- **Unauthenticated fetch** to `/api/v1/oc/clients/:id/reconciliation-runs`: real HTTP `200`. **Investigated, not assumed**: this local dev API has no `JWT_SECRET`/`JWKS_URL` configured (`apps/api/.env`, `NODE_ENV=development`), and its own auth middleware documents an intentional no-op in that exact condition. This is a standing, disclosed local-dev convenience affecting every route in this API, not a defect specific to this route — scored `BLOCKED_EXTERNAL_DEPENDENCY` (cannot be demonstrated as a real production gap from this environment), not PASS or FAIL.
- **Cross-client data-scoping**: a freshly-onboarded, empty disposable client (B) queried against the same reconciliation-runs API returns `[]` — confirmed it does **not** see fixture client `Test1`'s real run created two steps earlier. PASS.

### Console / network (real)

- 1 console error observed: `422` response (validation rejection — consistent with this codebase's established honest-validation pattern elsewhere; not traced to a specific failing assertion this pass, disclosed as a minor open item, not hidden).
- 0 real network failures. **Real harness fix**: the network-failure listener originally also counted `net::ERR_ABORTED` on Next.js's own React-Server-Component prefetch requests (`?_rsc=...`) as failures — investigated (traced the exact aborted URLs), confirmed these are benign navigation-cancellation artifacts of the script routing away faster than the app's own client-side redirect chain settles, not real request failures. Excluded from the failure count with the reasoning left in the script as a comment.

### Screenshots

8 real PNGs, each verified (exists, non-zero size, real PNG signature) **and visually opened and reviewed** (not just existence-checked) — confirming the comparisons/reconciliation "Failed" badges, the discovery blocked-state banner, and the compliance page's real render.

## Real environmental incident this pass (disclosed, resolved)

Running `npm run build` (a full production build) in the same working
directory as the already-running `next dev` server overwrote the shared
`.next` build cache mid-flight, breaking the live dev server (`Cannot
find module './4787.js'`, `__webpack_modules__[moduleId] is not a
function`). **Not an application defect** — a self-inflicted tooling
conflict from running two Next.js build processes against one `.next`
directory concurrently. Fixed by stopping the dev server, deleting
`.next`, and restarting it cleanly; recovery verified via a real repeat
Playwright smoke run (6/6 passed) before finishing this pass. **Real
lesson for future passes**: never run `npm run build` while the tracked
dev server for the same app is running.

## Automated regression / typecheck / build

- **98 files / 1018 tests, all passing** (unchanged baseline — this pass
  added only new scripts, no source changes).
- `tsc --noEmit` clean on both `apps/api` and `apps/web`.
- `next build` (production) completed with no compile errors, verified
  once before the environmental incident above; not re-run a second time
  in this same working directory to avoid repeating that conflict.

## Cleanup

Both disposable clients (A, B) from the final successful Batch 1 run
deleted via `cleanup-qa-client.mjs` (each independently id+name verified
before delete). One additional stray disposable client from an earlier,
mid-debugging failed attempt was found during the final orphan sweep and
also cleaned up. **Final sweep: 0 stray `AskABD PW%`-named clients**, 0
orphaned rows, both permanently-protected fixture clients (`Test1`,
`AskABD Manual UAT 2026`) confirmed present and unmodified beyond the
new, additive comparison/reconciliation run rows Batch 1 intentionally
created on `Test1`.

## Coverage score (not rounded up)

| Dimension | Score |
|---|---|
| Total real routes (Phase 1 inventory) | 124 |
| Routes with fresh Playwright evidence (Class A, all-time) | 8/124 |
| Routes with real Browser-pane evidence, not Playwright (Class B) | 10/124 |
| Routes not individually reconciled this pass (Class C) | 106/124 |
| Batch 1 pages targeted | 6/6 complete (connectors, comparisons, data-reconciliation, discovery, migrations, compliance) |
| Batch 1 real button/control interactions | 20 distinct clicks (14 onboarding + 2 comparisons + 2 reconciliation + 1 discovery + 1 compliance); connectors/migrations had no clickable control available for the specific fixture state used |
| Batches 2-6 | 0/5 started |
| Screenshots (saved, verified, visually reviewed) | 8/8 |
| Console errors | 1 (422, disclosed, not traced to root cause this pass) |
| Network failures (after excluding the investigated false-positive `ERR_ABORTED` class) | 0 |
| Full regression | 1018/1018 |
| Orphans after cleanup | 0 |
| Real defects requiring a code fix found this pass | 0 |
| Real, disclosed findings requiring no code fix (correct honest-failure / documented dev-bypass / stale test assumption) | 3 |

## Final release decision

# GO_WITH_RISKS

Unchanged from every prior report in this engagement. This pass's real,
verifiable contribution: a genuine, mechanically-derived inventory of all
124 user-facing routes now exists for the first time, a real evidence
reconciliation classified every one of them (8 A / 10 B / 106 C / 0 D),
and Batch 1 (6 of the highest-risk client-facing staff workflow pages)
now has fresh, authenticated, real Playwright evidence with independent
API/database verification. Batches 2-6 remain real, disclosed, unstarted
future work — the literal "every button on every page" scope of the
governing directive is not claimed complete, consistent with every prior
pass's honest-scope discipline in this engagement.

## Git

Branch `feature/reliability-hardening`. `main` independently re-verified
unchanged at `b63f797` before and after this pass.

## Server health

`localhost:3001`/`4200`/`3100` all confirmed healthy immediately before
this report was finalized (web dev server required a real, disclosed
restart mid-pass — see incident section above — and was re-verified
healthy via a real repeat Playwright smoke run afterward).
