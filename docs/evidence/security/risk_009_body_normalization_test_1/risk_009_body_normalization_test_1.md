# risk_009_body_normalization_test_1 — RISK-009 resolved platform-wide via a single shared hook

**Feature under test**: `middleware/body-normalization.ts` (new) — the real, platform-wide fix for RISK-009, exactly as that risk's own disclosed "suggested fix" described.
**Test Suite**: `risk_009_body_normalization_test_1` (2026-08-25, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE" directive, Phase 1)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## The real fix

A single `preHandler` hook, registered once in `server.ts` after auth/RBAC/tenant-access and before every route, that sets `request.body = {}` whenever a POST/PUT/PATCH request's body is genuinely `undefined` (Fastify's real behavior for a bodyless request — not `{}`). This closes the entire ~90-occurrence class of `const body = req.body as {...}` call sites across `operations-center-routes.ts` (and every other route file) in one place. No route handler code was touched — every existing `if (!body.x) return 400` check now simply runs against a real `{}` object instead of throwing on `undefined` first.

## The bug proven real before claiming the fix works

A dedicated test builds the app deliberately WITHOUT the new hook and confirms `POST /oc/jira/config` with no body throws a genuine, unhandled `TypeError` (a raw 500) — establishing RISK-009 as a real, reproducible bug, not a hypothetical one, before proving the fix closes it.

## Verified against 3 routes never individually touched by any RISK-009 pass

Chosen specifically because none of them received the earlier per-route `?? {}` guard (applied only to `uat-routes.ts`/`release-readiness-routes.ts` in the prior pass) — proving the middleware itself closes the gap, not a per-route patch:

| Route | Before | After |
|---|---|---|
| `POST /oc/gaps/:gapId/evidence` | raw 500 (`Cannot read properties of undefined (reading 'text')`) | clean `400 text is required` |
| `POST /oc/clients/:clientId/engagements` | raw 500 (reading `'name'`) | clean `400 name is required` |
| `POST /oc/jira/config` | raw 500 (reading `'baseUrl'`) | clean `400 baseUrl and projectKey are required` |

Also verified: a real, non-empty body is completely unaffected (the hook never overwrites an actual parsed body), and a genuinely empty `{}` JSON body behaves identically to no body at all — both correctly reach the same clean validation path.

## Security — regression proof

`apps/api/tests/risk-009-body-normalization-test-1.test.ts`, 6/6 passing (including the "without the fix" real-bug reproduction).

## Regression and DB integrity

Full suite: **901/901 passing** (895 baseline + 6 new). No multipart/file-upload or other content-type handling affected — the hook is scoped to POST/PUT/PATCH and only acts when `request.body` is genuinely `undefined`. `tsc --noEmit` clean. No migration this pass. Both protected clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged.

## FINAL STATUS: RESOLVED

RISK-009 closed platform-wide with a single, small, well-tested hook — exactly the fix that risk's own disclosure specified, implemented as described rather than a different approach, and proven against real routes that never received any individual attention.
