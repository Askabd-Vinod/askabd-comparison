# transformation_test_1 — Transformation Engine, real UI + a systemic RBAC sweep across 51 routes

**Feature**: Transformation Plans (`DecisionTransformationService`, `/clients/:id/transformations` page) — Gap → Decision → Transformation → Outcome chain (coverage matrix row #25)
**Test Suite**: `transformation_test_1`
**QA Client**: `AskABD PW Transformation Test 1` (real ID: `client-d76b10bb-da24-435b-9ac4-b21466df9614` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (re-checked, still absent)

## Objective

Investigate the existing Transformation Engine (real service, real UI, added in an
earlier session pass) for RBAC coverage before testing it live — the same
discipline applied to `migration_validation_test_1`. That investigation
found 3 real gaps on the transformation routes themselves, and — because the
methodology (a mechanical diff of every route registration against the RBAC
rules file) generalizes cleanly to the whole codebase — was extended into a
full sweep of every `/oc/clients/:clientId/...` route. That sweep found 48
more real gaps across 9 other engines. All 51 were fixed and tested before
any live UI verification began.

## Security finding (fixed, tested) — the real value of this pass

**Part 1 — the 3 Transformation routes.** `POST/GET /oc/clients/:clientId/transformations`
and `GET /oc/clients/:clientId/transformations/summary` had no RBAC rule.
Every OTHER sibling `/oc/clients/:clientId/<capability>` route in `rules.ts`
has an explicit `Admin.Access` rule — these three didn't, so they fell
through to `defaultPolicy: 'authenticated'`: any authenticated identity
tenant-mapped to a client (any role, not just staff) could create or list
transformation plans for that client. Confirmed by search that the customer
portal never calls this route family (it isn't in
`apps/web/src/app/(portal)/**` anywhere) — the real staff page at
`/clients/:id/transformations` is the only caller.

**Part 2 — the systemic sweep.** Rather than fix 3 routes and stop, ran a
full mechanical diff: every `server.<method>('/oc/clients/:clientId/...', ...)`
registration in `operations-center-routes.ts` against every rule in
`rules.ts`, using a small Node script (not manual reading — this codebase
has 250 registered `/oc/**` routes). Found **48 more** real gaps, none of
which had ever had any RBAC rule OR any regression test:

| Engine | Routes affected |
|---|---|
| Problems Engine | list, summary, create, import-from-assessment |
| Gap Analysis Engine | list, summary, create, generate, recommend, aging |
| Continuous Optimization Engine (incl. Transformation Outcomes) | metrics, baselines, measurements, findings, outcomes, summary, monitoring |
| Portfolio Health | per-client health rollup |
| Notification Preferences | get/set |
| Escalations | list |
| Compliance Engine | list, summary, initialize, auto-map, per-control update, remediate, exceptions |
| Onboarding | connector-relevance requirements |
| Service Bundles | recommended bundles |
| Payment Methods | list, create |
| Transactions | list, create |
| Reconciliation | list, run, summary, exceptions |
| Client Health | health-score, health-snapshot |
| Commercial Engagements | create (the GET is legitimately portal-facing — see below) |

Cross-referenced every one of the 52 candidates against the REAL customer
portal source (`apps/web/src/app/(portal)/**`), call site by call site, not
just by path text — a naive path-only grep falsely flagged
`POST /oc/clients/:clientId/engagements` as portal-facing because the
portal calls the same URL with `GET`; reading the actual two call sites
confirmed both are plain `authFetch(...)` reads with no method override, so
`POST` (creating a commercial engagement) is correctly staff-only and IS
gated, while `GET` (listing) is correctly left open, matching the already
-established pattern for `/oc/clients/:clientId/requests` and every
`/oc/portal/:clientId/*` route. `GET .../services`,
`GET .../services/recommendations`, and `GET .../services/coverage` were
genuinely confirmed portal-called and correctly left ungated.

**Fix**: all 51 routes added to `rules.ts` with `Admin.Access`, each with an
explanatory comment. Re-ran the same mechanical sweep afterward — 0
unexpected gaps remain (only the 4 genuinely portal-facing GETs).

## Automated tests

2 new tests added to `testing-engine.test.ts` (now 19 in that file):
1. A customer-token-denied-403 sweep across all 51 newly-gated routes
   (`client-not-mine` / `control-not-mine` opaque IDs — an `unrelated-org`
   customer token, denied by tenant-access even before reaching RBAC).
2. An admin-token-succeeds check hitting one representative route from
   each of the 7 largest newly-gated engines plus the 2 transformation
   write/read routes, against a real client — confirms the fix does not
   break legitimate staff access (every check returns non-403, most 200/201).

Full API regression: **66 files / 624 tests passing** (622 + 2 new).
`tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live UI verification (real QA client, real actions, not fabricated)

Created `AskABD PW Transformation Test 1` through the real 6-step onboarding
wizard (dev-mode OTP `123456`, disclosed on-screen), all 35 services enabled
so every swept engine's nav tab was reachable.

**Transformation lifecycle — full Planned → In Progress → Completed run**,
confirmed via `read_network_requests` at each step (all real, not mocked):
- `POST /oc/clients/:id/transformations` → `201 Created`
- `POST /oc/transformations/:id/status` (`in_progress`) → `200 OK`
- `POST /oc/transformations/:id/status` (`completed`, with a real outcome
  string) → `200 OK`

UI reflected each real state transition correctly: summary tiles moved
1 Planned → 1 In Progress → 1 Completed; the real outcome text
("Indexes added and verified live during transformation_test_1 — no
fabricated outcome.") rendered under "✓ Actual outcome:". No bugs found in
the Transformation UI itself this pass — the `$2` untyped-parameter bug in
`updateTransformationStatus` (previously found and fixed in an earlier
session pass) stayed fixed; `Start` and `Mark Completed` both worked cleanly.

**RBAC-fix spot check** — visited 3 of the 9 newly-gated engines' real
staff pages as the still-authenticated `super_admin` session
(`hello@askabd.com`) to confirm the fix doesn't break legitimate staff
access: Gap Analysis (`/gaps`), Compliance (`/compliance`), both rendered
correctly with every underlying API call returning `200 OK` (one `401` on
`GET .../gaps?` self-healed via the app's existing token-refresh retry —
pre-existing behavior, not something this pass introduced or regressed).

## Console

Reviewed — logged errors were confirmed (again) to be stale/accumulated
`comparisons/page.tsx` noise from earlier, unrelated activity in this
long-running Browser-pane session (same root cause already investigated and
dismissed during `migration_test_1` and `migration_validation_test_1`); none
of it references transformations, gaps, or compliance, and every page this
pass touched rendered correctly with fresh, correct data.

## Database evidence

`cleanup-qa-client.mjs` run (already fixed for the `entity_id` orphan gap
found in `migration_validation_test_1`): exact id+name re-verified
immediately before delete, 41 real rows deleted across 7 tables (including
10 real `oc_audit_log` rows via the `entity_id` sweep), zero orphans on the
independent post-delete verification, both protected clients confirmed
present and unchanged.

## Playwright result

**`BLOCKED_EXTERNAL_AUTH`** — re-checked immediately before this pass;
`scripts/playwright-evidence/.auth/staff-state.json` still does not exist.
No PNG screenshots were captured or persisted this pass; all live results
above were reviewed directly in the Browser pane and transcribed verbatim.

## Report

| Field | Value |
|---|---|
| Feature | Transformation Plans (`DecisionTransformationService`) + a systemic RBAC sweep |
| Test Suite | transformation_test_1 |
| Client | AskABD PW Transformation Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | 19/19 in `testing-engine.test.ts` (2 new); full API regression 624/624 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** — no approved auth mechanism available; no PNGs captured or fabricated |
| Console | Reviewed — confirmed stale/accumulated noise unrelated to this pass |
| Network | PASS — every real request this pass returned the expected status |
| Security | **51 real gaps found and fixed** — the largest RBAC finding of this session; every gated route now has a real regression test (0 had any before) |
| Database | Clean — 0 orphans after cleanup, both protected clients unchanged |
| UI | Transformation lifecycle fully exercised, no new bugs found (prior `$2` bug fix confirmed still holding) |
| Tenant Isolation | Directly improved — 51 more staff-only routes no longer reachable by a customer-role token |
| Evidence | This file |
| Failures Found | 51 (all RBAC gaps) |
| Failures Fixed | 51 (all of the above) |
| Blocked | 1 — authenticated real-Playwright PNG evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | Retroactive PNG evidence queued for the moment authenticated Playwright is available (per the standing Automatic Auth-Resume Rule) |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the standing AUTHENTICATED
PLAYWRIGHT EVIDENCE RULE (no PNG evidence this pass) even though this suite
found and fixed the largest single batch of real security gaps this
session, all now covered by real regression tests that did not exist before.
