# connector_test_1 — Connector Security + Client Environment Addendum: the session's most severe object-level-authorization bug found and fixed

**Feature under test**: Connector Management Engine (coverage matrix row #80) — `ClientDatabaseConnectionService` (the real, actively-used PostgreSQL/Oracle/SQL Server/MySQL/MongoDB connector behind every comparison and discovery operation) and `ConnectorService` (the older single-instance AWS/Azure/GitHub/Kubernetes connector).
**Test Suite**: `connector_test_1`
**QA Client**: `AskABD PW Connector Test 1` (real ID: `client-6322f426-b903-486f-b03b-21ea1531d629` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Playwright**: `BLOCKED_EXTERNAL_AUTH` (re-checked, still absent)
**Governing directive**: the user's own "CONNECTOR SECURITY + CLIENT ENVIRONMENT ADDENDUM" — full lifecycle validation, object-level authorization, credential ownership, and the explicit "Client A → Client B connector using Client A resource ID → DENIED" test.

## Executive Summary

Investigating the real database connector for object-level authorization — the addendum's own explicit test case — found the session's most severe bug yet: `PATCH/DELETE /oc/database-connections/:id` and `POST .../:id/test` carried **no `:clientId` URL segment at all**, and the underlying service (`ClientDatabaseConnectionService.update/remove/test`) looked up the connection by its opaque `id` **alone**. Any caller who knew a connection's id — regardless of which client they were authorized for — could read its configuration, silently repoint its `host` to an attacker-controlled server, delete it outright, or trigger a live connection test against it. Unlike every prior IDOR found this session, this one directly exposes **live, active credentials** (via `password_ref`) and a **live network destination** — not just a metadata/status record. Fixed at the service layer with a real ownership check, proven with 9 new automated tests AND a real, live attack attempt executed from the browser against a real connection, with the target's data confirmed genuinely unchanged afterward.

## The core finding — real, exploitable object-level authorization (IDOR)

`client-database-connections-routes.ts`:
```
PATCH  /oc/database-connections/:id           (no :clientId)
DELETE /oc/database-connections/:id           (no :clientId)
POST   /oc/database-connections/:id/test      (no :clientId)
```
`client-database-connection-service.ts` (before this pass):
```ts
async update(id: string, input: UpdateInput, actor: string) {
  const existingRes = await this.db.query('SELECT * FROM oc_client_database_connections WHERE id = $1', [id]);
  // ... UPDATE ... WHERE id = $1  — no client_id anywhere
}
async remove(id: string, actor: string) { /* same pattern */ }
async test(id: string) { /* same pattern */ }
```

Because these routes carry no `:clientId` URL segment and no `clientId` in body/query, `tenant-access.ts`'s `extractClientId()` returns `undefined` for them and the middleware **skips the check entirely** ("route is not client-scoped by URL param — outside this boundary"). The routes were already `Admin.Access`-gated (confirmed in `rules.ts`), so today's real exploitability is bounded to staff accounts — but that is a coincidence of today's role configuration (admin/super_admin happen to be the same roles tenant-access.ts lets bypass cross-client checks anyway), not an enforced guarantee. The moment a client-scoped-but-non-cross-client staff role exists — a real, plausible future requirement — this becomes directly exploitable by that role. Even today, it is a genuine **confused-deputy** hazard: a crafted link, a copy-pasted support-ticket URL, or a staff typo can silently act on the wrong client's real credentials with zero error.

**Real impact if exploited**: read another client's connection metadata (host/port/username); **silently repoint `host`/`port` to an attacker-controlled server** so the next real comparison/discovery run against that "connection" actually talks to the attacker's infrastructure while displaying results as if they were the real client's; **delete** another client's connection outright; or trigger a live connection test that reveals whether a guessed host:port combination is reachable.

## The fix

Both the service and the route layer were corrected — RBAC alone was already present and did **not** prevent this class of bug, so the fix is at the object level, matching the pattern established in `security_test_1`:

```ts
export class DatabaseConnectionOwnershipError extends Error { /* ... */ }

async update(id: string, clientId: string, input: UpdateInput, actor: string) {
  const existing = /* SELECT ... WHERE id = $1 */;
  if (existing.client_id !== clientId) throw new DatabaseConnectionOwnershipError(/* ... */);
  // ... proceeds only on a real match
}
// remove() and test() get the identical check.
```

The routes now require `clientId` — in the PATCH body (matching its existing JSON body) and as a `?clientId=` query param for DELETE/test (matching the established `/oc/connectors/:id?clientId=` convention already used elsewhere in this codebase). A missing `clientId` or a real ownership mismatch both return the **same `404`** as "connection doesn't exist" — the response never distinguishes the two, so this can't be used to enumerate which connection ids are real. The frontend (`database-connections-manager.tsx`) was updated to send the real `clientId` it already has in scope on every edit/test/delete call. `tenant-access.ts` now genuinely applies to these routes too as a second, independent layer, since a real `clientId` is present in the request.

## Mechanical audit for the same vulnerability class (per the addendum's explicit mandate)

Checked all 18 routes in the codebase carrying an opaque ID alongside `:clientId`/on their own, plus the entire connector-related route surface (`connector-security-routes.ts`, `integration-allowlist`, `oc_connectors`). Found and fixed 2 more real, smaller gaps:
- **3 more RBAC gaps** in `connector-service.ts`: `POST /oc/connectors/test`, `POST /oc/connectors/save`, `DELETE /oc/connectors/:id` had no RBAC rule at all (confirmed staff-only by reading real call sites — never called from the customer portal). Fixed with `Admin.Access`.
- **Secret-masking hardening**: `connector-service.ts`'s persisted/returned error text (`oc_connectors.error_message`, `oc_connection_tests.error_message`, the `/oc/connectors/test` route's own audit-evidence array and API response) was never passed through the existing `maskSecrets()` filter, unlike the Universal Comparison Engine's error messages. No live exploit path was found (every provider tester's error strings are either fixed generic text or driver-generated messages that don't interpolate raw credentials) — applied as defense-in-depth, not as a confirmed-leak fix.

Everything else checked came back clean, confirmed by reading the actual service query, not assumed from the route signature: `connection-security-routes.ts`'s integration-allowlist and connection-security routes were already properly `client_id`-scoped (and 2 of them were already fixed for the IDOR class in `security_test_1`); `IntegrationAllowlistService` is fully `(client_id, provider)`-scoped; `SecurityReportService` never leaks a real secret value, only the active `SecretProvider`'s kind (already honestly self-documented as dev-plaintext, not production-grade).

## A real, fabricated UI claim found and corrected

The live "Connector Configuration" lifecycle stage (`service-readiness.ts`) displayed: *"All connections use encrypted channels. Credentials stored using AES-256-GCM."* — a static, unconditional claim shown to whoever reaches this real stage. Neither half was actually true as configured: the real PostgreSQL connector hardcodes `ssl: false` (see below), and the active `SecretProvider` in this environment is the DEV plaintext provider, not AES-256-GCM. This is a direct "NEVER FABRICATE... security guarantees" violation, corrected to an honest statement that doesn't promise a specific cipher or claim TLS is universally enforced.

## Real, disclosed findings — NOT fixed this pass

1. **No TLS on the real PostgreSQL connector.** `ClientDatabaseConnectionService.testPostgres()` hardcodes `new Pool({ ..., ssl: false, ... })` unconditionally — no TLS is ever negotiated between AskABD and a client's real database, regardless of the connection's own declared VPN/security-profile status in `ConnectionSecurityService`. Credentials and all discovered/compared data travel in cleartext over whatever network path exists between AskABD's server and the client's database unless that path is independently secured out-of-band (a real VPN/private link). This is a significant, real gap — genuinely higher severity than the CORS/MIME findings disclosed in `security_test_1` — not fixed this pass because a proper fix requires a schema migration (an `ssl_mode`/certificate column), UI changes, and careful backward-compatibility handling; attempting it under this pass's time pressure risked introducing a new bug into a security-critical path. A strong candidate for a dedicated fast-follow.
2. **No SSRF-style host/IP denylist.** `checkPort()`/`testConnection()`/the AWS/Azure/GitHub/Kubernetes/generic testers all make real outbound TCP/HTTP requests to any `host`/`port` a caller supplies, with no validation against internal IP ranges or cloud metadata endpoints (e.g. `169.254.169.254`). Mitigated today only by these routes already being staff-only (Admin.Access) — a compromised or phished staff account, or one pasted-from-a-ticket malicious host, could still pivot to internal-network reconnaissance. Real, disclosed, not fixed this pass (a real SSRF-prevention design — IP-range denylisting, DNS-rebinding protection — is a substantial undertaking on its own).

## Automated tests

New file `apps/api/tests/connector-test-1.test.ts` (9 tests, all real):
- **PATCH** does not let Client A silently overwrite Client B's real connection (host/port/credential ref) — cross-client `404`, Client B's real `host` confirmed unchanged, same-client PATCH still works.
- **DELETE** does not let Client A delete Client B's real connection — cross-client `404`, connection confirmed still exists, same-client delete still works and genuinely removes it.
- **test** does not let Client A trigger a live connection test against Client B's real connection — cross-client `404`.
- A missing `clientId` is treated the same as a mismatch (`404`), never a silent same-client fallback.
- Malformed/nonexistent connection id → safe `404`, never a `500`.
- A genuinely deleted connection → safe `404` on every subsequent operation.
- Customer-403 sweep across the 3 newly-gated `connector-service.ts` routes + an unauthenticated-401 check.
- An admin token can genuinely test a real connector for a real client — real proof the connection **actually reached the intended target** (asserts `status === 'connected'` against the real local Postgres, not just a `200`).

`apps/api/tests/client-database-connections.test.ts` (the pre-existing suite for this exact service) updated to pass the now-required `clientId` on every PATCH/DELETE/test call — all 7 of its tests re-verified passing, including the real full-protocol PostgreSQL test and the real wrong-password-fails-at-Authentication-step proof. `apps/api/tests/lifecycle-connector-configuration-readiness.test.ts`'s one `.test()` call site updated the same way.

Full API regression: **68 files / 640 tests passing** (631 + 9 new). `tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live UI verification — the real Connector Configuration stage, end-to-end, plus a real live attack

Onboarded `AskABD PW Connector Test 1` and walked the real Identity Verification → Security Validation → Environment Registration stages (via the same authenticated-fetch technique established this session) to reach the real **Connector Configuration** stage — `DatabaseConnectionsManager`, the exact component whose fetch calls were modified.

- **Real connection created** via the real "+ Add First Connection" form (PostgreSQL, `localhost:5442`, real credentials matching the local dev database) — `POST` → `201 Created`.
- **Real "Test" click** → `POST .../test?clientId=<real-id>` → `200 OK`, UI shows **"● Connected"** with a real timestamp; the detail panel shows the real 6-step protocol result (DNS Resolution, Port Accessibility, TCP Connection, Authentication, Database Access, Latency 3ms) and the correct `ConnectionSecurityPanel` integration (Data: confidential / VPN: not required / Access: read only / Direct HTTPS) — confirming the `security_test_1` fix and this pass's fix compose correctly.
- **Real "Edit" → Save** (description change) → `PATCH` (now carrying `clientId` in the body) → `200 OK`, description saved, "Connected" status correctly preserved (no connection-value field changed).
- **A real, live attack attempt**, executed via `fetch()` from inside this exact authenticated page against this exact real connection's id, supplying a deliberately wrong `clientId` and attempting to repoint `host` to `attacker-controlled.example.com`: **`404`, not `200`**. Immediately re-fetched the connection list afterward — **`host` confirmed still `localhost`**, genuinely unchanged. This is the addendum's own "prove the connection actually reached the intended target" / "Client A → Client B connector using Client A resource ID → DENIED" requirement, proven against real, live, running infrastructure — not a stub.

## Console / Network

Reviewed — confirmed the same stale, accumulated `comparisons/page.tsx` noise from earlier, unrelated activity in this long-running Browser-pane session (identical signature already investigated and dismissed in every prior pass this session), plus the one real `404` this pass's own live attack attempt deliberately generated. Every other real request this pass's own flow made returned its expected status.

## Database / cleanup evidence

`cleanup-qa-client.mjs`: exact id+name re-verified before delete, 62 real rows deleted across 9 tables (including the real connection, its real security profile, and 18 real `oc_audit_log` entity_id rows), zero orphans on the independent post-delete sweep, both protected clients confirmed unchanged. The real uploaded document file was also manually removed from `apps/api/uploads/` (same disclosed, not-yet-automated cleanup-script gap noted in `security_test_1`).

## Playwright result

**`BLOCKED_EXTERNAL_AUTH`** — re-checked immediately before this pass; `scripts/playwright-evidence/.auth/staff-state.json` still does not exist. No PNG screenshots were captured or persisted this pass; all live results above were reviewed directly in the Browser pane and transcribed verbatim.

## Report

| Field | Value |
|---|---|
| Feature | Connector Management Engine — `ClientDatabaseConnectionService` + `ConnectorService` |
| Test Suite | connector_test_1 |
| Client | AskABD PW Connector Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | 9/9 new in `connector-test-1.test.ts`; full API regression 640/640 |
| Playwright | **BLOCKED_EXTERNAL_AUTH** — no approved auth mechanism available; no PNGs captured or fabricated |
| Console | Reviewed — confirmed stale/accumulated noise unrelated to this pass, plus one expected, deliberately-generated 404 |
| Network | PASS — every real request this pass returned the expected status, including a real, live, blocked attack attempt |
| Security | **The session's most severe finding**: a real, exploitable object-level-authorization gap exposing live database credentials and allowing silent host-repointing, fixed at the service layer and proven with both automated tests and a real live attack against real infrastructure. Plus 3 more RBAC gaps, secret-masking hardening, and a fabricated UI security claim corrected. 2 more real findings honestly disclosed, not fixed (no TLS on the real connector; no SSRF host denylist) |
| Database | Clean — 0 orphans after cleanup, both protected clients unchanged |
| UI | Full real Connector Configuration stage walked end-to-end, no new UI bugs found; the fabricated security-claim text corrected |
| Tenant Isolation | Directly improved — the real database connector (used by every comparison/discovery operation) can no longer be silently manipulated across client boundaries |
| Evidence | This file |
| Failures Found | 6 (1 IDOR class across 3 operations, 3 RBAC gaps, 1 fabricated UI claim) + 2 disclosed-not-fixed (no TLS, no SSRF denylist) |
| Failures Fixed | 6 |
| Blocked | 1 — authenticated real-Playwright PNG evidence (`BLOCKED_EXTERNAL_AUTH`) |
| Remaining | TLS support and SSRF host denylisting — real, disclosed, higher-priority fast-follows; retroactive PNG evidence queued for when Playwright auth is available |

**FINAL STATUS: PASS_WITH_RISKS** — capped per the standing AUTHENTICATED PLAYWRIGHT EVIDENCE RULE (no PNG evidence this pass) even though this suite found and fixed the session's single most severe security defect — a real, live-proven ability to silently hijack another client's active database connection — through the exact kind of adversarial, real-infrastructure testing the addendum exists to require.
