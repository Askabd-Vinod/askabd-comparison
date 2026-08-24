# risk_014_triage_test_2 — OTP cross-tenant requirement-overwrite gap closed; jira-webhook doc/implementation gap disclosed as RISK-015

**Feature under test**: `platform/rbac/rules.ts` (extended) + `routes/operations-center-routes.ts` (HTML-escaping fix) — continuing RISK-014's individual triage into the `/oc/me/*`, OTP, and jira-webhook group.
**Test Suite**: `risk_014_triage_test_2` (2026-08-24, continuation of `risk_014_triage_test_1`)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## `/oc/me/*` — investigated, confirmed genuinely safe, no fix needed

`GET /oc/me`, `GET /oc/me/pending-invitations`, `POST /oc/me/pending-invitations/:id/accept` each read every identity-scoping field (`orgContext`, `userId`) from the caller's own verified JWT claims — never from a request-supplied value. Reading all 3 handlers in full confirms the original register's "very likely legitimate" assessment.

## OTP routes — a real, more severe gap than a plain RBAC hole, fixed

`POST /oc/otp/verify`'s success path calls `RequirementsService.updateRequirement(clientId, 'identity-verification', ...)`, **writing** to the target client's real `business_owner_email`/`business_owner_name`/`organization_legal_name` fields — with no ownership check on `clientId` at all. `POST /oc/otp/send` accepts any `clientId` plus an attacker-chosen recipient `email`, also with no ownership check. Combined: any authenticated identity (a real customer token included) could target an arbitrary existing client, receive that client's real OTP at an address of its own choosing, and use it to overwrite that client's identity-verification fields — a genuine cross-tenant integrity/spoofing vulnerability.

**Fix**: real `Admin.Access` RBAC rules added to all 3 OTP routes. Confirmed via grep that only staff `(app)/clients/onboard` and `(app)/verify` pages call these — never the customer `(portal)` — so no legitimate capability is removed.

**A second, independent fix in the same handler**: `/oc/otp/send`'s HTML email template interpolated `businessOwner`, `clientName`, and `onboardingData.*` directly into an email body sent, via AskABD's real sending domain (`noreply@askabd.com` via nodemailer), to a fully caller-chosen recipient — unescaped. A real HTML-injection/phishing-content vector, independent of the RBAC fix (relevant even to a legitimate staff caller pasting untrusted client-supplied text, e.g. copy-pasted from a client's own website). Fixed with a real `escapeHtml()` helper applied to every caller-supplied field; only the server-generated `otp` code and `expiry` timestamp remain unescaped, since neither is ever caller-supplied.

Two sibling `sendEmail` call sites were checked for the same pattern (mechanical-audit discipline) and found lower-risk, disclosed but not fixed: `workflow-automation-service.ts`'s recipient is server-derived from `clientId`, not caller-supplied; `invitation-service.ts`'s interpolated `clientName` can only be set via an already Admin.Access-gated staff action.

## Jira webhook — a real documentation-vs-implementation gap, disclosed as RISK-015

`docs/production-connection-readiness.md` documented this webhook's production auth as "Shared secret header validation." The real handler performs only structural JSON validation (`!body.webhookEvent`) — no secret/signature check exists, and a grep across `apps/api/src` confirms no `webhookSecret`-equivalent field exists anywhere. The documented control was never built. Corrected the doc to state the true status and tracked the real fix as `docs/security-risk-register.md` RISK-015 (new config plumbing required — a genuinely separate body of work, not a `rules.ts` one-liner, and not fixed this pass).

## Security — live proof (Security Testing Addendum)

`apps/api/tests/risk-014-triage-test-2.test.ts`, 3/3 passing:

| Scenario | Result |
|---|---|
| Customer token, every OTP route (attacker-chosen clientId + recipient email) | **403** |
| Unauthenticated, every OTP route | **401** |
| Staff (admin) token, every OTP route | not blocked by RBAC |

## Regression

Full suite re-run after this pass: `otp-security.test.ts` (9/9, unaffected — that file bypasses the RBAC/auth middleware entirely by design, confirmed by reading its own `buildApp()`), `risk-014-triage-test-1.test.ts` (5/5), `risk-014-triage-test-2.test.ts` (3/3). `tsc --noEmit` clean. No migration this pass.

## FINAL STATUS: PASS

Real, live-verified fix for a genuine cross-tenant requirement-overwrite vulnerability (worse in kind than a pure read-exposure RBAC gap), plus a real defense-in-depth injection fix for the same handler. A distinct, real documentation-accuracy gap found and corrected, with its own fix tracked honestly as RISK-015 rather than silently left standing or blindly patched. `/oc/me/*` investigated and confirmed safe rather than assumed. 28 of the original 46 RISK-014 candidates remain fully untriaged (the 6-route body-clientId-scoped lifecycle/discovery/assessment group and the 22-route catalog/reference group), plus the `POST /oc/service-actions` opaque-entityId question from the prior pass — RISK-014 stays open for that remainder.
