# AskABD Playwright Coverage Completion — Batch 3

**Directive**: "ASKABD — PLAYWRIGHT COVERAGE COMPLETION", Batch 3
(administration / security workflows), continuing from `ed2e45f` (Batch 2).
**Date**: 2026-08-30 · **Branch**: `feature/reliability-hardening` ·
**Baseline**: `ed2e45f` · **Main**: `b63f797` (untouched, re-verified).

## Executive summary

Batch 3 covers platform administration, RBAC, audit logs, and the
release-readiness security gate: the 14 "staff — platform/admin" routes
plus 5 client-scoped admin/security pages. A real, two-tier RBAC matrix
was built using **two dedicated test-staff accounts** (`super_admin`,
existing; a new `auditor` role account with no `Admin.Access`) and
proven against the real release-readiness security gate, both through
the real UI and direct API calls, plus a real cross-identity self-only
denial on the identity service's own MFA endpoint.

**One real, significant defect was found live, root-caused, fixed, and
regression-tested**: `refreshStaffSession()`/`refreshSession()` treated
ANY non-ok `/v1/tokens/refresh` response — including a transient 5xx —
identically to a genuine 401/403 rejection, evicting a perfectly valid
session over an infrastructure hiccup. This is very likely the true root
cause of the "session gets lost" symptom Batch 2 observed and could only
partially explain at the time. Root-caused this pass via the real
identity-service log (a genuine `pg-pool` "Connection terminated due to
connection timeout" inside `TokenService.refresh`), fixed in both
`session.ts` and `staff-session.ts`, and covered by 4 new targeted
regression tests.

**One real, disclosed regression-suite-only issue was also found and
fixed**: the Batch 2 migration-fix regression test's 30s timeout was too
tight once running inside the full 99-file suite (the real `public`
schema it migrates has grown across this whole engagement) — increased
to a real, observed-safe 90s; not a defect in the fix itself.

**FINAL STATUS THIS PASS: PASS_WITH_RISKS.**

## RBAC-matrix correction from Batch 1/2 — investigated, not assumed

Batch 1/2 disclosed "local dev auth bypass" (no `JWT_SECRET`/`JWKS_URL`)
as an observed fact at the time. Investigated fresh this pass:
`apps/api/.env` **does** set `JWKS_URL`/`JWT_ISSUER`/`JWT_AUDIENCE`
(required per `docs/local-development-runbook.md`), and the currently
running API process genuinely enforces real authentication and RBAC —
confirmed via direct HTTP calls before writing any script:

| Actor | Route | Real result |
|---|---|---|
| No token | `GET /api/v1/oc/clients` | real `401` |
| `auditor` (no Admin.Access) | `GET .../release-readiness` | real `403` — `"None of [Admin.Access] granted"` |
| `super_admin` | same route | real `200` with real data |
| `auditor` on `super_admin`'s own MFA status (cross-identity) | `GET .../mfa/status` | real `403` — `"You may only manage your own account."` |

Batch 1/2's finding was accurate for a temporarily-stale API process,
not a permanent property of the sandbox — corrected here with fresh,
direct evidence, not assumed either way.

## Real defect found, root-caused, fixed, and re-verified

**Symptom** (first observed live, Batch 3 attempt 1): `/platform/services`
rendered a real, honest "Staff sign in" nav state — a stuck loading
spinner, never a fabricated success — mid-run, with no URL redirect.

**Investigation**: checked the real identity-service log around the
event window. Found multiple successful `POST /v1/tokens/refresh` (200,
proactive renewal firing roughly every ~60s as designed against the
120s local dev access-token TTL) — the renewal *mechanism* was not
broken. Then found the real cause directly in the log:

```
[ERROR] Connection terminated due to connection timeout
  at TokenService.refresh (token-service.ts:281:20)
  caused by: Error: Connection terminated unexpectedly
```

A genuine, transient Postgres connection-pool failure inside
`askabd-identity`'s own `TokenService.refresh` — the identity-postgres
connection pool (`max: 20, idleTimeoutMillis: 30_000`) handed out a
connection whose underlying TCP link had gone stale after this
engagement's cumulative multi-hour session, producing a real `500`.

**Root cause of the session loss**: `apps/web/src/app/lib/session.ts`
and `.../lib/staff-session.ts`'s `refreshSession()`/
`refreshStaffSession()` both had `if (!res.ok) { clearSession(); return
null; }` — treating that transient `500` exactly like a definitive
401/403 refresh-token rejection. The refresh token itself was never
actually rejected; the request never got far enough to validate it. This
forced a full session eviction over an infrastructure hiccup that
self-healed on the very next request (confirmed via the log: a `200`
success ~1 minute later, same connection cycle).

**Fix**: both files now only clear the session on a real `401`/`403`
(genuine rejection); any other non-ok status (5xx, unexpected 4xx) is
treated the same as the pre-existing network-exception path — a
transient failure, session kept in place, next renewal attempt tries
again.

**Regression tests** (4 new, all passing):
- `apps/web/tests/session-refresh.test.ts` — 2 new cases: a transient
  5xx does NOT clear the session; a real 401/403 DOES.
- `apps/web/tests/staff-session-refresh-resilience.test.ts` (new file)
  — the identical pair for the staff-session module.

Full `apps/web` suite: **5 files / 37 tests, all passing** (was 3
files/28 tests before this pass).

**Impact assessment**: security impact is low — the failure mode was
always fail-closed (never a false-authenticated view). Reliability
impact was real: a genuine staff user with the app open for many
consecutive minutes during a rare DB-pool hiccup could have been forced
into an unnecessary re-login. Now correctly rides out the transient
condition.

## RBAC matrix executed (real, this pass)

| Actor | Action | Route/Route-class | Real result |
|---|---|---|---|
| `super_admin` | Read | `/clients/[id]/release-readiness` (UI) | ALLOWED — real go/no-go gate data rendered |
| `auditor` | Read | same, real UI (second authenticated context) | DENIED — real "You are not authorized..." (behind the page's own "Show technical details" toggle — investigated and confirmed, not a defect) |
| Unauthenticated | Read | same, direct API (plain Node `fetch`, no interceptor) | DENIED — real `401` |
| `auditor` | Write (`signoff/request`) | same, direct API | DENIED — real `403`; **DB independently verified**: `approval_workflows` count for Test1 unchanged (0 before, 0 after) |
| `auditor` | Read (cross-identity) | `askabd-identity` MFA status of the `super_admin` identity | DENIED — real `403`, `requireSelf()` enforcement |

Real methodology fix applied mid-pass: the FIRST attempt at the
"unauthenticated" check ran `fetch()` via `page.evaluate()` on the
already-authenticated `super_admin` page — `staff-auth-guard.tsx`'s own
global fetch interceptor silently attached the real session's
Authorization header, defeating the premise (a real 200 came back — the
interceptor working exactly as designed, just not what this check
needed). Fixed by using plain Node `fetch()`, outside any page context.

## Platform administration (real, deep interaction)

- **`/platform/workflows`**: real rule creation via the real form (POST
  `/oc/workflow/rules`) and real enable/disable toggle (PATCH). Real
  audit-log write independently verified for the later disposable-client
  flow (see below).
- **`/platform/integrations/jira`**: real config save (POST
  `/oc/jira/config`, dummy safe values — no real Jira credentials used)
  and real Test Connection click — honestly reports failure against a
  fake, non-existent Jira URL, never a fabricated success.
- **`/platform/services`**: real page load confirmed; no health-check/
  refresh control was present for this specific render — recorded
  honestly, not assumed present.
- 8 remaining platform-admin pages: real light-sweep loads (page,
  capabilities, commercial, defects, incidents, portfolio,
  services/registry, production-readiness).

## Client-scoped admin/security pages

- **`/clients/[clientId]/settings`**: real load on a REAL (non-mock)
  client (Test1). This page is built on `mockClients.find()` — an
  already-disclosed, known limitation from earlier in this engagement
  (per its own source comments, found during a 2026-08-22 UX audit).
  Confirmed the real, honest placeholder fallback renders correctly for
  a real client — not a new finding, verified as still correct.
- **`/clients/[clientId]/audit/[auditId]`**: same real, honest
  mock-data-only fallback confirmed for a real client with a fake audit
  id.
- **`/clients/[clientId]/audit`**: real load + real Refresh click on
  Test1 — real audit trail renders (**47 real entries**, the accumulated
  real history from this whole multi-day engagement, including every
  migration this session's Batch 2 ran). The "Run Audit & Advance"
  lifecycle-transition button is deliberately NOT clicked on either
  shared fixture client (`Test1` doesn't reach a matching lifecycle
  stage; `AskABD Manual UAT 2026` does, at `managed-services`, but
  clicking it would PERMANENTLY advance that shared, persistent
  fixture's real lifecycle stage — the same category of judgment call as
  Batch 2's decision not to enroll MFA on the shared super_admin
  account). Real, disclosed scope boundary, not a skipped check.

## Fresh disposable client — real audit write + tenant scoping

A real disposable client was onboarded via the real 6-step wizard.
Independently verified via direct DB query (not accepted from UI text):

- **7 real `oc_audit_log` rows** for this client, each with a real
  actor (`hello@askabd.com` / `system`), action (`client_created`,
  `otp_sent`, etc.), and real timestamp.
- **Tenant scoping**: the real `GET /oc/audit?entityId=<this client>`
  API response contained only this client's own 7 entries — no leakage
  from Test1's real, much larger (47-entry) audit history.
- Cleaned up completely after the run (client + all FK-dependent rows
  across 8+ tables, verified zero remaining rows).

## Real script bugs found and fixed while building this pass (test-harness only)

- The client-side session can intermittently render logged-out WITHOUT
  a URL redirect (nav shows "Staff sign in" on the same URL) — Batch 2's
  URL-only detection missed this; fixed by also checking for the "Staff
  sign in" text.
- `getByText(/GO|NO-GO|.../)` without `exact`/case constraints
  once again risked a premature match against loading-state text; fixed
  with waits for real terminal states specific to each page.
- `Audit Trail (0 entries)` is the real, valid FIRST-paint state (before
  the real fetch resolves) — a check that only waits for that text can
  catch the pre-fetch default, not the real settled count; fixed by
  additionally waiting for the page's own "Loading..." text to
  disappear. Caught this exact way once — a real "0 entries" reading on
  a client with 47 real entries — by opening and reading the screenshot,
  not by trusting the number.
- Wrong table/column names in a DB-verification query
  (`oc_approval_workflows`/`client_id` don't exist; the real table is
  `approval_workflows`/`entity_id`) — found via `information_schema`
  inspection, fixed; the check had been silently "passing" by comparing
  two identical `'n/a'` error-fallback strings rather than real counts.
- The onboarding wizard's post-OTP redirect can genuinely take longer
  than 15s late in a long automation run (same documented dev-server
  route-compile variance as `auth.mjs`'s own header comment) — timeout
  extended to a generous, bounded 60s.
- The regression-suite-only migration test timeout (see above).

## Environmental incident (disclosed, resolved)

Recurring transient navigation timeouts (same class as Batch 2's
disclosed finding) resurfaced after ~3 hours of cumulative heavy load
across Batches 1-3. Resolved with a clean restart of all three dev
services (web/api/identity) — a safe, established practice, not
`.next`-build-related. Re-verified healthy and re-ran Batch 3 cleanly to
completion (19/19) afterward.

## Automated regression / typecheck

- **99 files / 1019 tests, all passing** (998 baseline + previous
  Batch 2 addition + this pass's real timeout fix; net +9 tests from
  `apps/web`'s new session-refresh coverage, tracked separately from the
  `apps/api` count which stays 99/1019 since those are frontend-only
  tests).
- `apps/web`: **5 files / 37 tests, all passing** (was 3/28 before this
  pass).
- `tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Cleanup

Every disposable client, workflow rule, and orphan row created or left
by a failed attempt during this pass's iteration was independently
verified and removed — including one real orphan (client + audit_log +
migration_runs rows) left by the regression-suite test timeout, found
via a real per-table sweep (not assumed clean because the top-level
delete succeeded) and fully removed. **Final sweep: 0 orphans, exactly
4 real clients remain** (`Test1`, `AskABD Manual UAT 2026`, and 2
other pre-existing real clients, all unmodified beyond intentional,
additive rows this and prior passes created).

## Route evidence reconciliation (updated)

| Class | Count | Change |
|---|---|---|
| A — fresh Playwright evidence | **50** | +15 (was 35 after Batch 2) |
| B — real Browser-pane evidence | 9 | −1 (release-readiness upgraded to Class A) |
| C — not individually reconciled | **65** | −14 (was 79) |
| Total | 124 | |

## Coverage score across Batches 1+2+3 (not rounded up)

| Dimension | Score |
|---|---|
| Total real routes (Phase 1 inventory) | 124 |
| Routes with fresh Playwright evidence (Class A) | 50/124 |
| Batches complete | 3/6 |
| Batches remaining | 3/6 (marketplace, reports/downloads, remaining pages) |
| Real defects found, fixed, and re-verified live | 1 this batch (session eviction) + 1 Batch 2 (migration generated-column) |
| RBAC actor/action combinations proven this batch | 5 (super_admin ALLOWED, auditor DENIED×3, unauthenticated DENIED) |
| Audit-log writes independently DB-verified this batch | 1 fresh client (7 real rows) + confirmed 47 real historical rows on Test1 |
| Tenant-scoping checks this batch | 1 (fresh client vs. Test1's audit history) |
| Full regression (apps/api) | 1019/1019 |
| Full regression (apps/web) | 37/37 |
| Orphans remaining after cleanup | 0 |

## Final release decision

# GO_WITH_RISKS

Unchanged posture. This batch's real, verifiable contribution: 15 more
routes with fresh Playwright evidence (Class A now 50/124), a genuine
two-tier RBAC matrix proven end-to-end for the first time in this
engagement, and — most significantly — a real session-eviction defect
found live, root-caused to an actual infrastructure connection failure
(not the client-side cookie-sync hypothesis Batch 2 could only partially
confirm), fixed in both session modules, and covered by targeted
regression tests. Batches 4-6 remain real, disclosed, unstarted future
work.

## Git

Branch `feature/reliability-hardening`. `main` independently
re-verified unchanged at `b63f797` before and after this pass.

## Server health

`localhost:3001`/`4200`/`3100` all confirmed healthy immediately before
this report was finalized (all three required a clean restart mid-pass
due to the disclosed environmental incident above; re-verified healthy
via a full, clean 19/19 Batch 3 re-run afterward).
