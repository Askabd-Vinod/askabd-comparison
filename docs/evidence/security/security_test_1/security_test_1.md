# security_test_1 — Security Testing Addendum: RBAC sweep + 2 real IDOR fixes + the real Security Validation stage, live

**Feature under test**: Security Assessment Engine / Secure Connectivity Engine (coverage matrix rows #54/#55) — the real "Security Validation" lifecycle stage (`RequirementWorkspace` + `client-services` routes), never reached live before this pass.
**Test Suite**: `security_test_1`
**QA Client**: `AskABD PW Security Test 1` (real ID: `client-34961bb1-37df-42e4-a9c7-23da58615894` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (re-checked, still absent)
**Governing directive**: the user's own "SECURITY TESTING ADDENDUM" — system-wide security impact review, the 7-scenario route matrix, and mandatory mechanical audit for the same vulnerability class once one instance is found.

## Executive Summary

Investigating the Security Validation stage's own RBAC coverage (per the addendum's mandate to check authorization for the feature under test) surfaced 17 more real RBAC gaps, then a mechanical audit of every route carrying a SECOND opaque ID alongside `:clientId` found a genuinely different, more serious vulnerability class: **object-level authorization (IDOR/BOLA)** — two routes where `clientId` was present in the URL and validated by tenant-access.ts, but the actual database query never checked that the returned/mutated resource belonged to that client. Both are now fixed at the query layer, not just the RBAC layer, and proven with real two-client fixtures. The real Security Validation stage was then walked end-to-end live for the first time this program, including two real path-traversal attack attempts against the document upload route (both safely contained).

## Part 1 — RBAC sweep (17 more real gaps)

Extended `transformation_test_1`'s mechanical route-vs-rules diff from `/oc/clients/:clientId/...` to **every** route carrying a `:clientId` param, any prefix (143 routes across all route files). Found 17 more staff-only routes with no RBAC rule at all:

- `GET /oc/lifecycle/:clientId`, `/oc/lifecycle/:clientId/history`
- `GET /oc/connectors/:clientId`
- `GET /oc/discovery/:clientId/:runId` (detail route — the sibling list route IS genuinely portal-called and correctly left open)
- `GET /oc/assessment/:clientId/domain/:domain` (same pattern)
- `GET /oc/recommendations/:clientId`
- `GET /oc/migration/runs/:clientId`
- The entire `client-services`/`RequirementWorkspace` family (8 routes) — the real UI this suite set out to test: requirements list/update/history, readiness, document list/upload/validate
- `GET /oc/events/stream/:clientId`, `/oc/events/:clientId`
- `GET /oc/jira/links/:clientId`

Verified staff-only (not customer-portal) by reading real call sites across `apps/web/src/app/(app)` **plus its shared `components`/`lib` directories** — this mattered concretely: `RequirementWorkspace.tsx` (the component that calls all 8 `client-services` routes) lives in `apps/web/src/app/components/`, a sibling of `(app)`/`(portal)`, not inside either — a naive scan limited to `(app)` alone would have missed it and produced a false "no caller found" result. Confirmed its only real mounters are `(app)/lifecycle/page.tsx` and `(app)/dynamic-overview.tsx` (via `client-command-center.tsx`) — never the portal.

All 17 gated with `Admin.Access`. Re-ran the sweep afterward — 0 unexpected gaps remain (only the 26 genuinely `/oc/portal/:clientId/*` and 4 portal-called `services*`/`engagements` GET routes, matching the established, already-documented pattern).

## Part 2 — Real object-level authorization (IDOR/BOLA) — the addendum's item #4/#9, found and fixed

Per the addendum's explicit "same class of vulnerability elsewhere" requirement, audited every route carrying **two** ID params (`:clientId` + a second opaque ID) — 18 such routes. 16 were already correctly scoped by `client_id` at the query layer (confirmed by reading each service method's real SQL, not assumed from the route signature). **2 were not**:

### 2a. `GET /oc/discovery/:clientId/:runId`

`discoveryService.getDiscoveryRun(runId)` queried `WHERE id = $1` with **no `client_id` filter at all** — the route handler didn't even destructure `clientId` from params. tenant-access.ts validates that the caller is authorized for the `clientId` URL segment, but never checks that the *returned resource* actually belongs to that client. Real, exploitable impact: an identity legitimately tenant-mapped to Client A could put Client A's own id in the URL (passing tenant-access) together with **any other client's real `runId`**, and receive that client's full discovery run — real hostnames, applications, databases, evidence quotes.

**Fix**: `getDiscoveryRun(clientId, runId)` now requires and enforces `client_id = $2`. The route returns a clean `404` for both "doesn't exist" and "belongs to someone else" — the same shape, so the route can't be used to probe which run IDs are real.

### 2b. `GET/PATCH /oc/clients/:clientId/connection-security/:sourceType/:sourceId`

`ConnectionSecurityService.getOrCreate`/`updateProfile` looked up/updated rows by `(connector_source_type, connector_source_id)` alone — the real DB unique constraint is correctly on that pair (since `sourceId` is already a globally-unique connection UUID), but the service never cross-checked the row's real `client_id` against the URL's `clientId`. Real impact: a caller could GET (read) or PATCH (silently overwrite) another client's real security profile — VPN status, permission scope, network path, data residency classification — just by pairing a mismatched `clientId` with a real `sourceId` belonging to someone else. Lower real-world exploitability today (already `Admin.Access`-gated, and admin/super_admin have platform-designed cross-client access) than 2a, but a genuine confused-deputy defect: a wrong `clientId` in a URL (typo, stale link, crafted request) silently succeeds against the wrong client's data with no error.

**Fix**: both methods now throw a new `ConnectionSecurityOwnershipError` when an existing row's real `client_id` doesn't match the caller-supplied `clientId`; the routes catch it and return `404` (same non-distinguishing shape as above). Internal callers that pre-validate ownership themselves (the comparison engine's pre-connection guard — confirmed by reading `runDatabaseSchemaComparison`, which validates both connections belong to `clientId` via `lookupConnection` before ever calling `assertReadyForConnection`) never pass a `clientId` and are unaffected.

## Part 3 — Real attack-attempt evidence, not just code review

Per "never claim a security control is working without real evidence," two real path-traversal attempts were made against the document-upload route (`POST /oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents`) with a real, live-authenticated request (executed via `fetch()` from inside the authenticated Browser-pane page, inheriting the app's own `window.fetch` auth interceptor — the session token itself was never read, printed, or handled by this agent):

1. `File` object filename `../../../../evil-traversal-test.pdf` via `FormData` — the browser itself reduced this to the basename before sending.
2. A raw, hand-crafted multipart body with `Content-Disposition: filename="../../../../../../tmp/askabd-traversal-poc.pdf"` — bypassing the browser's own `File`-object sanitization.

**Both real uploads succeeded (201) but landed exactly where they should** — verified directly on disk: `apps/api/uploads/<clientId>/security-validation/compliance_certification/v2/evil-traversal-test.pdf` and `.../v3/askabd-traversal-poc.pdf`, both correctly inside the client's own version-numbered directory, never outside `uploads/`. This is real, positive evidence that path traversal via the upload filename is not exploitable in this system today — confirmed by attack attempt and filesystem inspection, not just by reading `LocalStorageProvider.validateReference()`'s source (which also independently confirms the same protection at the storage layer, as defense-in-depth).

## Real, disclosed findings — NOT fixed this pass (honestly flagged, not silently ignored)

1. **CORS: `credentials: true` combined with `origin: true`** (reflect-any-Origin) in `apps/api/src/server.ts`, when `CORS_ORIGIN` is unset. Real, if currently low-exploitability, misconfiguration: confirmed by reading `middleware/auth.ts` that this API's auth is **entirely** `Authorization: Bearer` header-based (no cookie ever read for auth), so a malicious cross-origin page cannot automatically ride a victim's session the way it could with cookie-based auth. Not fixed live this pass — deliberately, to avoid risking the currently-running dev server this suite's own live verification depends on; the safe fix (fail closed to same-origin in production when `CORS_ORIGIN` is unset, mirroring the existing JWT dev-bypass `NODE_ENV !== 'production'` pattern) is documented here as a real, actionable fast-follow, not fabricated as done.
2. **Document upload MIME-type validation is client-supplied only** (`data.mimetype` from the multipart part's own `Content-Type` header) — trivially spoofable; the allowlist gives a false sense of content-type enforcement. No magic-byte/content-sniffing exists. Real, disclosed, moderate-severity gap (not exploited for RCE-class impact here since the file is never executed, only stored and later possibly downloaded — but worth a real fast-follow). The 20MB size cap is genuinely enforced twice (fastify's own `@fastify/multipart` `limits.fileSize`, confirmed in `server.ts`, plus a redundant post-write check) — not a gap.

## Automated tests

New file `apps/api/tests/security-test-1.test.ts` (7 tests, all real, none stubbed):
- Customer-403 sweep across all 17 newly-gated routes
- Unauthenticated-401 spot check (3 routes) — confirms they're wired into the real auth pipeline
- Admin-success check hitting the real Security Validation requirement routes for a real client, asserting the real requirement catalog (`security_contact`, `compliance_certification`) is returned, not a stub
- **Real 2-client IDOR proof for the discovery-run fix**: a real discovery run created for Client B, confirmed NOT retrievable via Client A's clientId + Client B's real runId (404, no leaked data), confirmed still retrievable via the correct clientId, confirmed a malformed runId is a safe 404 not a 500
- **Real 2-client IDOR proof for the connection-security fix** (2 tests): GET cross-client blocked (404), PATCH cross-client blocked (404) with the target client's real profile confirmed unchanged afterward, malformed sourceId is a safe 200 (a genuinely new resource, not a crash)

Full API regression: **67 files / 631 tests passing** (624 + 7 new). `tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live UI verification — the real Security Validation stage, end-to-end, for the first time

Onboarded `AskABD PW Security Test 1` through the real 6-step wizard (dev-mode OTP `123456`, disclosed on-screen). The client auto-progressed from `otp-verified` straight to the real **Security Validation** stage (Identity Verification's 3 fields were auto-populated from the onboarding data and auto-transitioned, per existing, unmodified logic) — confirming this session's first-ever live reach of rows #54/#55.

Live-verified, all via `read_network_requests` against the real running dev server (every call `200`/`201`, none `403`, confirming the RBAC fix doesn't break real staff access):
- `GET .../security-validation/requirements` — returned the real 5-requirement catalog
- `PUT .../requirements/:key` — saved real values for Authentication Configuration (SSO/SAML + IdP URL + MFA), Compliance Certification (ISO 27001, Certified, cert number, certifying org), Security Contact (name/email/phone/designation) — each save immediately reflected in the UI's live progress counters (0/5 → 3/5 complete)
- `POST .../documents` — a real, valid PDF uploaded for the required Compliance Certificate; response correctly omits the internal storage path, includes a real SHA-256 checksum
- Final state: **"✓ All requirements satisfied — Ready for service validation"**, 0 blockers
- **"Complete Security Validation →" clicked — real stage transition proven**: lifecycle stepper advanced from Step 5/20 (22%) to Step 6/20 (28%), "Now working on" changed from Security Validation to Environment Registration, matching the pre-existing `serviceMap` exactly

## Console / Network

Console errors reviewed and confirmed (again) to be the same stale, accumulated `comparisons/page.tsx` noise from earlier, unrelated activity in this long-running Browser-pane session (identical signature already investigated and dismissed in `migration_test_1`, `migration_validation_test_1`, and `transformation_test_1`) — none reference Security Validation, discovery, or connection-security. Every real request this pass's own flow made returned its expected status.

## Database / cleanup evidence

`cleanup-qa-client.mjs`: exact id+name re-verified before delete, 54 real rows deleted across 8 tables (including the 3 real uploaded documents' DB rows and 15 real `oc_audit_log` entity_id rows), zero orphans on the independent post-delete sweep, both protected clients confirmed unchanged. The 3 real physical files written during the upload/traversal tests were also manually removed from `apps/api/uploads/` (the cleanup script only ever swept DB rows, not disk files — a real, minor, disclosed gap in the script itself, not urgent enough to fix this pass since it's a local dev artifact, not a security or data-integrity issue).

## Playwright result

**`BLOCKED_EXTERNAL_AUTH`** — re-checked immediately before this pass; `scripts/playwright-evidence/.auth/staff-state.json` still does not exist. No PNG screenshots were captured or persisted this pass; all live results above were reviewed directly in the Browser pane and transcribed verbatim.

## Report

| Field | Value |
|---|---|
| Feature | Security Assessment / Secure Connectivity Engine — the real Security Validation lifecycle stage |
| Test Suite | security_test_1 |
| Client | AskABD PW Security Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | 7/7 new in `security-test-1.test.ts`; full API regression 631/631 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** — no approved auth mechanism available; no PNGs captured or fabricated |
| Console | Reviewed — confirmed stale/accumulated noise unrelated to this pass |
| Network | PASS — every real request this pass returned the expected status |
| Security | **19 real issues found and fixed**: 17 RBAC gaps + 2 object-level-authorization (IDOR) bugs, the latter a genuinely more serious class than pure RBAC gaps since they bypass tenant-access.ts's own clientId check by construction. 2 more real findings honestly disclosed, not fixed (CORS config, client-supplied-only MIME validation). Path-traversal protection positively verified via 2 real attack attempts, not just code review. |
| Database | Clean — 0 orphans after cleanup, both protected clients unchanged |
| UI | Full real Security Validation stage walked end-to-end for the first time this program — real stage transition proven, no new UI bugs found |
| Tenant Isolation | Directly improved — 17 more staff-only routes gated; 2 real cross-client data leaks/overwrites closed at the query layer (not just RBAC) |
| Evidence | This file |
| Failures Found | 19 fixed (17 RBAC + 2 IDOR) + 2 disclosed-not-fixed (CORS, MIME validation) |
| Failures Fixed | 19 |
| Blocked | 1 — authenticated real-Playwright PNG evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | CORS hardening and content-sniffing MIME validation — real, disclosed fast-follows (see "Real, disclosed findings" above); retroactive PNG evidence queued for when Playwright auth is available |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the standing AUTHENTICATED PLAYWRIGHT EVIDENCE RULE (no PNG evidence this pass) even though this suite found and fixed the session's first confirmed object-level-authorization (IDOR) vulnerabilities — a materially more serious class than the RBAC-only gaps found in prior passes — and completed the first-ever live, end-to-end walkthrough of the real Security Validation stage, exactly the kind of proof real UI + real attack-attempt testing is for.
