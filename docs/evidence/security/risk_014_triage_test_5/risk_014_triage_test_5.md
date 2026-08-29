# risk_014_triage_test_5 — first-class live verification of the lifecycle/discovery/assessment body-clientId group

**Directive**: master continuation/hardening directive §32 ("never say tests passed without actually running them") / §25 (test tenant isolation with real disposable fixtures / real requests).
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Objective

`risk_014_triage_test_3`'s summary described the 6-route body-clientId
lifecycle/discovery/assessment group as "now confirmed safe" — but no
dedicated test ever actually exercised these specific real routes through
the real, registered handlers. `tenant-access-body-query.test.ts` proves
the generic tenant-access mechanism against dummy inline routes, not
these. Investigated before trusting the earlier characterization at face
value.

## What was verified

Read each of the 6 real handlers directly (`operations-center-routes.ts`)
and confirmed all destructure `clientId` from `req.body` in the standard
shape `tenant-access.ts`'s `extractClientId` already reads generically.
Then proved it live: `apps/api/tests/risk-014-triage-test-5.test.ts`,
7 tests — a real customer token with a foreign `clientId` in the body is
denied (`403`, `reasonCode: 'tenant_not_resolved'`) on all 6 real routes
via `app.inject` against the actual `operationsCenterRoutes` registration;
unauthenticated denied (`401`) on all 6.

**Result: confirmed genuinely safe. Not a gap.**

## A real methodological pitfall found and disclosed — not a security bug

Developing this test, an initial run via `npx vitest run <file> --root
apps/api` (executed from the monorepo root rather than with `cwd` set to
`apps/api`) produced a real `42P01: relation "client_identity_mapping"
does not exist` error on every case — at first glance indistinguishable
from a severe bug in the tenant-isolation enforcement layer itself.

Investigated rather than reported at face value:
- A direct query (`SELECT to_regclass('client_identity_mapping')`)
  against the real `comparison` database confirmed the table genuinely
  exists.
- Re-running the identical test with `cwd` correctly set to `apps/api`
  (matching how `npm run test --workspace=apps/api` actually invokes it)
  passed cleanly, 7/7.

Root cause: this repo's env-loading is `cwd`-sensitive; the wrong
invocation silently connected to a different, schema-less Postgres
instance rather than failing loudly with a clear "wrong database"
message. A real test-tooling fragility worth knowing about, but not a
production or security issue — disclosed here so a future pass
recognizes this specific error signature and checks working directory
before concluding a real vulnerability exists.

## Regression

- `apps/api/tests/risk-014-triage-test-5.test.ts`: 7/7 passing.
- `tsc --noEmit` clean on `apps/api`.
- Full API regression (correct invocation, `npm run test --workspace=apps/api`
  from the repo root): **94 files / 943 tests, all passing** (936 baseline
  + 7 new).
- `localhost:3001` → 307, `localhost:4200/health` → 200 `database:
  connected`, `localhost:3100/v1/health` → 200 throughout.

## FINAL STATUS: RESOLVED (verified safe, not a gap)

The 6-route lifecycle/discovery/assessment group is now backed by a real,
first-class live test proving cross-tenant denial through the actual
registered routes, closing the gap between an earlier pass's
characterization and actual dedicated evidence.
