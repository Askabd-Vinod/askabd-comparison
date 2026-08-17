# Enterprise Connection Validation + Navigation + Operational UX Hardening — Final Report

**Branch:** `feature/reliability-hardening`
**HEAD at report time:** `a9082ca478b94a4dabf35dbe5a5076a1499b6226` (all work below is uncommitted)
**Report date:** 2026-08-17
**Ultimate rule applied throughout:** AskABD never says "Connected" when it only means "we saved the settings." A connection is CONNECTED/VERIFIED only after a real test actually passed; otherwise it says CONFIGURED — NOT YET VERIFIED, or the precise reason it failed.

---

## A. Baseline

Re-verified before any change (not assumed):
- Branch/HEAD: `feature/reliability-hardening` @ `a9082ca`, working tree identical to what the prior milestone reported (same uncommitted files, nothing lost or reset).
- Tests: **157/157 passing** (confirmed, not assumed).
- API build: PASS. Web build: PASS.
- `/health` and `/ready`: both `database: connected`.
- Client count: 20 (unchanged from prior milestone's end state).

## B. Final Test Count

**163/163 passing** (24 test files, 0 failures). 157 baseline + 6 new this milestone:
- `connector-honesty.test.ts` (4) — ConnectorService never fakes success, save ≠ connected, client isolation.
- `production-preflight-connections.test.ts` (2) — real DNS resolution, real SMTP handshake.

## C. API Build

`apps/api`: `npm run build` (`tsc`) — clean, 0 errors, both before and after this milestone's changes.

## D. Web Build

`apps/web`: `npm run build` — clean, 0 errors, all routes compiled including the rewritten `/clients/[clientId]/connectors`.

## E. Existing Client Regression

Live-verified in-browser after changes: `/`, `/clients`, `/clients/[clientId]`, `/clients/[clientId]/scorecard`, `/clients/[clientId]/connectors` (both empty and populated states), `/engineering`, `/engineering/[defectId]`, `/migrations`, `/platform`, `/platform/defects`, `/platform/integrations/jira`, `/platform/production-readiness`. No 404s, no crashes, all real data.

## F. Fresh E2E

Not re-run this milestone (no new client-creation code paths were touched). The connector Test Connection flow was exercised live end-to-end against a real client (see section H).

## G. Connection Inventory

| Connection | UI | Backend Service | Real Test? | Status Before This Milestone | Status After |
|---|---|---|---|---|---|
| Client DB/AWS/Azure/GitHub/Kubernetes/generic connectors | `/clients/:id/connectors` | `ConnectorService` (pre-existing, real) | Yes — DNS+TCP+auth per provider | **Frontend never called it — hardcoded fake "Connected" for 5 providers + fake 68%/82% stats** | **Fixed — real per-provider status, real Configure/Test/Save UI** |
| AskABD's own production dependencies (23 items) | `/platform/production-readiness` | `ProductionPreflightService` (pre-existing, real) | Mostly yes | 21/23 real; DNS and Email were env-var-presence checks only | **DNS now does real `dns.resolve()`; Email now does real SMTP `verify()` handshake** |
| Jira | `/platform/integrations/jira` | `JiraIntegrationService.checkHealth` (pre-existing, real) | Yes — auth + project access | Already real (hardened in a prior milestone) | Unchanged, re-verified |
| Client DB (AskABD's own PostgreSQL) | env-only (`DATABASE_URL`) | `db-pool.ts` + `ProductionPreflightService` DEP-004/005 | Yes | Already real | Unchanged |
| SMTP/Email | none (env-only) — now surfaced on `/platform/production-readiness` | `email-transport.ts` `checkEmailHealth()` (pre-existing, real, previously unreachable from any route) | Yes — `nodemailer.verify()` | Existed but was never called from anywhere | **Now wired into the preflight report** |
| S3/Storage | none | `ProductionPreflightService` DEP-015 | No (AWS SDK not installed) | Honestly `ready_to_connect`/`missing`, never fabricated | Unchanged — no SDK to test against, correctly not claimed verified |
| Redis | none | `ProductionPreflightService` DEP-023 | N/A | Explicitly `not_required` | Unchanged |
| DNS/domain | `/platform/production-readiness` | `ProductionPreflightService` DEP-012 | Now yes | String-check only (`!includes('localhost')`) — **could report `ready_to_connect` for a domain that doesn't actually resolve** | **Fixed — real `dns.resolve()`, honest `failed` if it doesn't resolve** |
| GitHub (client connector) | `/clients/:id/connectors` | `ConnectorService.testGitHub` | Yes — real `api.github.com` call | Unreachable from UI | Now reachable and live-tested (see section H) |

## H. Database Verification (client-facing connector)

`ConnectorService.testPostgreSQL` (pre-existing, real, unmodified) performs DNS resolution → port check → real `pg` connection → auth → `SELECT current_database()` → read permission → query execution → latency, returning the actual failing step. Previously unreachable from the client Connectors page; now wired in with an adaptive host/port/database/username/password/SSL form. One test client in this environment already shows `Connected — Verified` with a real `last_tested_at` timestamp from a genuine prior test run.

## I. Jira Verification

Already real before this milestone (hardened in a prior pass): `saveConfig` sets `status='configured'` (never `'connected'`), `checkHealth` performs a real `myself` auth call then a real project-access call, setting `healthy` only if both succeed, `degraded` if authenticated but the project isn't accessible, `failed` on network error. Live-verified this milestone: page correctly shows `NOT CONFIGURED` with no Jira credentials saved (real state, not a placeholder).

## J. SMTP Verification

**Genuine gap found and fixed.** `email-transport.ts` already contained a real `checkEmailHealth()` — a live `nodemailer.createTransport(...).verify()` SMTP handshake — but it was never imported by any route or page anywhere in the codebase. Wired it into `ProductionPreflightService.checkEmail()`. Live-verified: the production readiness page now shows **SMTP/SES Provider — 🟢 VERIFIED — "mailpit — SMTP handshake succeeded"**, with a real timestamp, the only genuinely `verified` (not just `ready_to_connect`) item in the current report. Also discovered two additional, unused, apparently-duplicate email service files (`email-service.ts`, `email-provider.ts`) that are dead code — flagged in section AB, not deleted (out of this milestone's strict scope).

## K. Storage Verification

Unchanged. `ProductionPreflightService.checkStorage` honestly reports based on `STORAGE_PROVIDER`/`S3_BUCKET` env presence only — no AWS SDK is installed in this project to perform a real S3 call against. Correctly never claims `verified`; reports `ready_to_connect` (dev, local filesystem in use) or `missing` (prod, no S3 configured). No false green.

## L. Redis Verification

Unchanged — explicitly `not_required`: "Not used in architecture." Honest, not blocking.

## M. Cloud Verification (AWS/Azure)

`ConnectorService.testAWS`/`testAzure` (pre-existing, real, unmodified) perform real endpoint connectivity checks (`sts.<region>.amazonaws.com:443`, `login.microsoftonline.com:443`) but honestly report credential validation as `EXTERNAL DEPENDENCY: requires @aws-sdk/client-sts` / `@azure/identity` — those SDKs are not installed, so full IAM/credential verification is correctly not claimed. `ProductionPreflightService` separately tracks AskABD's own AWS account/IAM/Secrets-Manager readiness (DEP-001–003) — distinct from a client's AWS environment (DEP-017), correctly never conflated.

## N. DNS Verification

**Genuine gap found and fixed.** `checkDns` previously only checked that `API_PUBLIC_URL` didn't contain the string "localhost" — a domain that was set but didn't actually resolve would have been reported `ready_to_connect`. Now performs a real `dns.resolve()` against the parsed hostname: resolves → `verified` with the resolved addresses as evidence; doesn't resolve → `failed` with the real DNS error; invalid URL → `failed`. Sanity-verified directly: `github.com` resolves, a nonexistent domain fails with `ENOTFOUND` — both paths behave correctly.

## O. URL / Link Audit

Audited: main nav (`nav.tsx`, 10 items — all resolve to real, existing routes, confirmed against build output), client tabs (`client-tabs.tsx`, 33 tabs — all 33 map to real existing directories, zero broken links), `platform/page.tsx`'s 10 quick-link cards (all real), Jira issue-key links on `/platform/defects` (already correctly conditional: only rendered when a real `jira_issue_key` exists — no broken/placeholder links). No `href="#"` dead anchors found anywhere in the app.

## P. Broken Links Fixed

None found to be genuinely broken (404-producing). One **honesty gap** fixed instead: `/engineering/[defectId]` (Engineering Intelligence defect detail, built in the prior milestone) did not surface `oc_defects.jira_issue_key`/`jira_issue_url` even though the column exists and `/platform/defects` already correctly links to it — added the same "link if present, otherwise say so" pattern for consistency.

## Q. Missing Fields Detected

The rebuilt Connectors page identifies missing required fields per-provider before allowing a useful test: e.g. GitHub's Test Connection with an empty token returns the real backend error "Personal Access Token is required" instead of attempting a call — live-verified.

## R. Connection States

Implemented/confirmed states in use across the two systems touched this milestone: `connected` (real success), `configured` (saved, not tested — GitHub/Jira `saveConfig`), `partial` (some real steps passed, some failed — e.g. GitHub with an invalid token: connectivity ✓, token validation ✕), `failed` (real failure with reason), `not_configured` (nothing saved yet). The frontend renders these as "Connected — Verified" / "Configured, Not Verified" / "Verification Failed" / "Not Configured" — never a bare "Connected" for an unverified state.

## S. Evidence Model

`oc_connectors`: `last_tested_at`, `last_test_duration_ms`, `last_test_mode` (`real`/`demo`), `validation_steps` (JSON array of `{step, pass, durationMs, error}`), `error_message`. `oc_connection_tests`: full history of every test run. `ProductionPreflightService`: `evidence` string + `verifiedAt` timestamp per item, only populated when a real check actually ran and passed. Nothing invented.

## T. Last-Verified Behavior

Connectors page shows "Last tested: <real timestamp>" per connector, sourced from `last_tested_at`. Production readiness shows `verifiedAt` per item. Neither claims a connection is healthy "right now" without a recent, real test — a stale test result is still shown with its actual timestamp, not silently treated as current.

## U. Security

No new secrets, tokens, or credential-handling code introduced. New UI form fields (password/token inputs on the Connectors page) use `type="password"`, are held in local component state, and are sent only to the existing, already-audited `ConnectorService.testConnection`/`saveConfiguration` endpoints — which already strip/mask sensitive fields before persisting (`saveConfiguration` masks `password`/`secret`/`token`/`clientSecret`/`externalId` to `••••••••` before writing to `oc_connectors.configuration`).

## V. Secret Handling

Verified: `ConnectorService.saveConfiguration` never persists raw secret values (see `safeFields` masking, unchanged, pre-existing). `JiraIntegrationService.getConfig` never returns the token (unchanged, pre-existing, `••••••••` mask). No secret was added to any log statement, error message, or audit-trail entry by this milestone's changes.

## W. Client / Tenant Isolation

Verified with a new dedicated test (`connector-honesty.test.ts`): a connector test run for client A never appears when querying client B's connector list. Existing `GET /oc/connectors/:clientId` was already correctly scoped by `client_id` — confirmed with evidence, not assumed.

## X. Error Handling

`ConnectorService.testConnection` never throws to the caller — every provider path catches its own errors and returns a structured `failed`/`partial` result. Verified live: an unreachable PostgreSQL host, an invalid GitHub token, and a missing required field all produced clean, informative failures with zero application crashes, zero raw stack traces surfaced to the user, and zero secret leakage in the error text.

## Y. Performance

Connector testing is entirely explicit (click "Test Connection") — no polling, no automatic re-testing, no N+1 (each test is a single provider-specific check sequence). `GET /oc/connectors/:clientId` is a single query. `ProductionPreflightService.runPreflight()` runs its ~23 checks in sequence within one request; the two now-real checks added (DNS, SMTP) each have their own short timeout behavior inherited from Node's `dns.resolve` and `nodemailer`'s connection timeout — bounded, not indefinite.

## Z. Remaining Production Dependencies

Unchanged by this milestone, correctly represented as not-yet-available rather than falsely "production ready": AWS account/IAM/Secrets Manager (DEP-001–003), production RDS (DEP-004), DB SSL (DEP-005), backups (DEP-006/007), JWT_SECRET (DEP-008), CORS allowlist (DEP-009), TLS/ALB (DEP-010/013), production DNS records (DEP-012), ECR (DEP-014), production S3 (DEP-015), alerting (DEP-021). Overall status: **APPLICATION_READY**, readiness score **6%** (1/18 mandatory items verified — the SMTP fix added this milestone's one new genuine verification) — an honest score, not inflated.

## AA. Remaining P0

- **`CapabilityPlaceholder` fabricated fallback metrics** (flagged in the prior milestone's report, still present, still out of this milestone's scope) — shows invented green "Active" stats (CPU 32%, Uptime 99.9%, etc.) for any client sub-page not yet wired to real data.

## AB. Remaining P1

- **Duplicate, unused email service files**: `apps/api/src/services/email-service.ts` and `email-provider.ts` both define a full email-sending abstraction, but neither is imported by any route — only `email-transport.ts` is actually wired into the real OTP send path and the SMTP health check added this milestone. These two are dead code that could confuse a future maintainer into extending the wrong file. Not deleted this milestone (removing them was not clearly in scope for a connection-validation milestone and risks an untested regression if something references them indirectly) — flagged for a future cleanup pass.
- **`clients/[clientId]/layout.tsx`** (flagged previously, still present): falls back to a header-less minimal layout for every real (DB-backed) client because it matches against the legacy `mockClients` array.

## AC. Remaining P2

- 12 real client sub-pages (`assessment`, `compliance`, `discovery`, `engagements`, `financial`, `gaps`, `optimization`, `payments`, `problems`, `proposals`, `recommendations`, `reconciliation`) exist as working routes but have no entry in `client-tabs.tsx`, so they're unreachable through normal navigation. Not a broken link (nothing points at them incorrectly) — the inverse: real pages with no path to reach them. Out of this milestone's "fix only broken links, don't redesign navigation" scope.
- Dashboard's "Last refreshed: just now" label is static, not tied to actual fetch time.

## AD. Remaining P3

- `ConnectorService.testConnection`'s generic fallback (used for ~25 of the 33 catalog connector types — Confluence, SharePoint, Slack, Datadog, etc.) only performs a TCP host/port reachability check, not provider-specific authentication. This is honestly reflected in the UI (status never exceeds what was actually tested), but a Fortune 500 buyer may expect deeper per-provider checks for widely-used tools (Slack, Datadog) specifically — a reasonable follow-up, not a correctness bug.

## Files Modified

**API:**
- `apps/api/src/routes/operations-center-routes.ts` (from prior milestone, unchanged this pass except carried forward)
- `apps/api/src/services/production-preflight-service.ts` — real DNS resolution (DEP-012), real SMTP handshake verification (DEP-011)

**Web:**
- `apps/web/src/app/clients/[clientId]/connectors/page.tsx` — real `ConnectorService` data instead of hardcoded fake "Connected" array
- `apps/web/src/app/engineering/[defectId]/detail-view.tsx` — added conditional Jira issue link

## Files Added

- `apps/web/src/app/clients/[clientId]/connectors/connector-grid.tsx` — adaptive per-provider Configure/Test/Save UI
- `apps/api/tests/connector-honesty.test.ts`, `apps/api/tests/production-preflight-connections.test.ts`
- `docs/enterprise-connection-validation-report.md` (this file)

## Files Deleted

None this milestone (the two prior migration/engineering mock-data files were deleted in the previous milestone, not this one).

## Database Changes

**None.** `oc_connectors`, `oc_connection_tests`, and `oc_jira_integrations` all pre-existed; no migrations added.

## API Changes

No new routes. `POST /oc/connectors/test`, `GET /oc/connectors/:clientId`, `POST /oc/connectors/save` (all pre-existing) are now actually reachable from the client Connectors UI for the first time. `GET /platform/production/preflight`'s DEP-011 and DEP-012 items now carry real evidence instead of env-var-presence guesses.

## UI Changes

`/clients/[clientId]/connectors` rebuilt from a fully fabricated static page into a real, per-provider Configure → Test → Save flow across all 33 catalog connector types, with real evidence-backed status badges and real "Last tested" timestamps. `/engineering/[defectId]` gained a conditional Jira issue link. `/platform/production-readiness` (unchanged code, but now receives genuinely better data) shows one real `VERIFIED` item where previously it could only ever show `ready_to_connect`/`missing`.

## New Tests

6 new tests, all passing: 4 in `connector-honesty.test.ts` (never-fakes-success, configured≠connected, client isolation ×2), 2 in `production-preflight-connections.test.ts` (DNS never fabricates verified, SMTP verified only with real evidence).

## Git Safety

`git status`, `git diff --stat`, `git diff --name-only`, `git diff --cached --name-only` all reviewed. Nothing staged. No `.env` files, credentials, tokens, or database dumps among the changes. One password-related grep hit (`connector-service.ts` line 140) inspected and confirmed a false positive — it's `fields.password || ''`, reading a submitted form field, not a hardcoded secret. **No commit. No push. No PR.**
