# AskABD EOC — Security Risk Register

**This is the living, honest tracker for every real security finding surfaced
during this program's testing** — required by the "CONNECTOR SECURITY
FAST-FOLLOW" directive (2026-08-24) so that a real finding is never quietly
lost between passes. Cross-referenced with `docs/eoc-feature-coverage-
matrix.md` (the row-by-row engine status tracker) and each finding's own
`docs/evidence/<feature>/<feature>_test_N/` write-up.

**Status vocabulary** (matches the program-wide convention — never invented
per-register):
- `OPEN` — real, confirmed, not yet fixed.
- `RESOLVED` — real, confirmed fix, proven with real evidence (tests and/or
  a live attack attempt).
- `MITIGATED` — a real, partial reduction in risk; the underlying issue is
  not fully closed and is tracked as still `OPEN` in spirit.
- `BLOCKED_EXTERNAL_DEPENDENCY` — cannot be tested/resolved further without
  real infrastructure this sandbox cannot provide.

Never mark `RESOLVED` without real evidence (a passing test AND, where
practical, a real live proof) — matching the platform's own "no false
completion" principle.

---

## RISK-001 — Real cross-client IDOR on the live database connector

- **Status**: `RESOLVED`
- **Severity**: Critical
- **Found in**: `connector_test_1` (2026-08-24)
- **Real impact**: `PATCH/DELETE /oc/database-connections/:id` and `POST
  .../:id/test` carried no `:clientId` scoping at all; the service looked
  up a connection by opaque `id` alone. Any caller who knew a connection's
  id could read its real host/port/username, silently repoint `host` to an
  attacker-controlled server, delete it, or trigger a live test — for ANY
  client, not just their own.
- **Fix**: `DatabaseConnectionOwnershipError` — real ownership check at the
  service layer, independent of RBAC. Routes require a real `clientId`
  (body/query) and return the same `404` for "not found" and "not yours".
- **Evidence**: `docs/evidence/connector/connector_test_1/
  connector_test_1.md` — 9 automated tests with real 2-client fixtures, PLUS
  a real live attack attempt from the browser against a real connection
  (blocked, target's real `host` confirmed unchanged afterward).

## RISK-002 — TLS never negotiated on the real database connector

- **Status**: `RESOLVED`
- **Severity**: High
- **Found in**: `connector_test_1` (2026-08-24); fixed as its own fast-follow (2026-08-24, same day)
- **Real impact**: `ClientDatabaseConnectionService.testPostgres()`
  hardcoded `ssl: false` unconditionally — no TLS was ever negotiated
  between AskABD and a client's real database, regardless of the
  connection's declared VPN/security-profile status. Credentials and all
  discovered/compared data would travel in cleartext over any network path
  not independently secured out-of-band. The live Connector Configuration
  UI also made a **fabricated** claim ("All connections use encrypted
  channels... AES-256-GCM") that was false as configured.
- **Fix**: real `ssl_mode` column (`disable`/`require`/`verify-full`,
  migration 056) wired into `create`/`update`/`test`. `require` encrypts
  opportunistically and **genuinely fails closed** if the server doesn't
  support SSL (proven live — does not silently fall back to plaintext).
  `verify-full` additionally validates the certificate chain AND hostname
  — `servername` is set explicitly because node-postgres's own
  `rejectUnauthorized: true` was proven live to NOT reliably verify
  hostname on its own without it (a real, confirmed driver gotcha).
  `scripts/dev-tls/init-ssl.sh` + a `docker-compose.yml` change now
  provision a real, reproducible TLS-capable local Postgres automatically
  on a fresh volume (verified against a genuinely fresh container, not just
  the already-running one). The fabricated UI claim was corrected to an
  honest statement.
- **Evidence**: `docs/evidence/connector/connector_test_1_tls_ssrf_fastfollow/
  connector_test_1_tls_ssrf_fastfollow.md` — 6 real tests: `require` PASS
  against a real TLS-negotiating server (real cipher/TLSv1.3 confirmed via
  `pg_stat_ssl`), `require` genuinely FAILS CLOSED against a real
  non-TLS server, `verify-full` genuinely REJECTS an untrusted self-signed
  cert, `verify-full` genuinely PASSES with a trusted CA + matching
  hostname, and an SSL-mode change correctly invalidates a stale
  "Connected" status.
- **Real, disclosed residual limitation**: no UI for uploading/rotating the
  CA certificate beyond a raw PEM textarea; no certificate-expiry warning.
  Low severity — real, functional TLS validation is what matters most and
  is genuinely proven; these are UX polish, not security gaps.

## RISK-003 — No SSRF protection on any outbound connector/test operation

- **Status**: `RESOLVED` (core protection); `MITIGATED` for one disclosed residual gap (see below)
- **Severity**: High
- **Found in**: `connector_test_1` (2026-08-24); fixed as its own fast-follow (2026-08-24, same day)
- **Real impact**: every connector "test connection" operation
  (`ClientDatabaseConnectionService`, `ConnectorService` — Postgres, AWS,
  Azure, GitHub, Kubernetes, generic) accepted an arbitrary caller-supplied
  `host`/`port` (or URL, for GitHub) and made a real outbound TCP/HTTP
  request to it with zero validation — a textbook unrestricted
  server-side-request-forgery primitive. A caller could point it at
  AskABD's own internal network or a cloud metadata endpoint
  (`169.254.169.254`) and use real timing/error differences to map internal
  infrastructure or exfiltrate IAM credentials.
- **Fix**: new `network-security-policy.ts` — `assertSafeOutboundDestination`
  resolves via the real OS resolver (honors `/etc/hosts`, matching the
  actual connection Node will make) and validates **every** resolved
  address against private/loopback/link-local/CGNAT/reserved ranges
  (IPv4 + IPv6, including the cloud-metadata-covering `169.254.0.0/16`
  range) — closing DNS-rebinding, since the same resolution used for
  validation is what gets connected to. Loopback is allowed only outside
  `NODE_ENV==='production'` (matches the existing JWT dev-bypass shape) —
  this platform's own disposable local dev/test Postgres genuinely runs on
  loopback, so blocking it unconditionally would make local development and
  this repo's own test suite impossible; a real client's database is never
  legitimately "AskABD's own server," so production has no such exception.
  Wired into the shared `checkPort()` (covers Postgres, AWS, Azure,
  Kubernetes, generic reachability checks uniformly) and a new `safeFetch()`
  wrapper (covers the GitHub connector's real HTTP calls, including
  validating **every redirect hop** — closing the classic redirect-based
  SSRF bypass a compromised/malicious endpoint could otherwise exploit).
- **Evidence**: `docs/evidence/connector/connector_test_1_tls_ssrf_fastfollow/
  connector_test_1_tls_ssrf_fastfollow.md` — 9 unit tests on the policy
  module itself (malformed destination, cloud metadata literal, private
  ranges, IPv6 loopback/link-local/ULA, a genuinely approved public
  hostname, a real mocked DNS-rebinding proof, and 2 real HTTP-server-backed
  redirect tests — one proving a malicious redirect is blocked, one proving
  a legitimate non-redirecting request still succeeds) + 4 end-to-end tests
  through the real `ClientDatabaseConnectionService.test()` path (metadata
  address blocked, private address blocked, approved destination allowed,
  malformed host fails safely).
- **Real, disclosed residual gap** (kept `MITIGATED`, not claimed fully
  `RESOLVED` for this one specific edge): the TCP-only paths
  (`checkPort()`) validate the destination and then make a **separate**
  `net.Socket.connect()` call to the original hostname a few milliseconds
  later — a sufficiently well-timed DNS-rebinding attack could theoretically
  still slip through that specific gap for the raw-TCP checks (the
  redirect-following HTTP path via `safeFetch` does not have this gap,
  since every hop is independently re-validated). Fully closing it requires
  connecting to the already-validated IP literal directly rather than
  re-resolving the hostname, which interacts with TLS hostname verification
  (which must keep using the original hostname for certificate matching) —
  a real, disclosed fast-follow, not attempted under this pass's time
  pressure. Practical exploitability is low (requires winning a real race
  condition against a fast local check-then-connect sequence) but not zero.

## RISK-004 — CORS `credentials:true` + wildcard-reflecting origin

- **Status**: `OPEN` (disclosed, not fixed)
- **Severity**: Low-Medium
- **Found in**: `security_test_1` (2026-08-23)
- **Real impact**: `apps/api/src/server.ts` combines `credentials: true`
  with `origin: true` (reflect-any-Origin) when `CORS_ORIGIN` is unset — the
  textbook risky CORS combination. Confirmed low exploitability today: this
  API's auth is 100% `Authorization: Bearer` header-based (confirmed by
  reading `middleware/auth.ts` — no cookie is ever read for auth), so a
  malicious cross-origin page cannot automatically ride a victim's session
  the way it could with cookie-based auth.
- **Why not fixed yet**: deliberately not touched live during `security_test_1`
  to avoid risking the actively-running dev server that pass's own live
  verification depended on.
- **Suggested fix** (documented, not yet applied): fail closed to
  same-origin in a production-shaped config when `CORS_ORIGIN` is unset,
  mirroring the existing JWT dev-bypass `NODE_ENV !== 'production'` pattern.

## RISK-005 — Document-upload MIME validation is client-supplied only

- **Status**: `OPEN` (disclosed, not fixed)
- **Severity**: Low-Medium
- **Found in**: `security_test_1` (2026-08-23)
- **Real impact**: the Security Validation document-upload route trusts the
  multipart part's own client-supplied `Content-Type` header for its
  allowlist check — trivially spoofable, no magic-byte/content-sniffing.
  The allowlist gives a false sense of enforcement. Real path-traversal
  protection on the same route WAS positively verified (2 real attack
  attempts, both safely contained — see `security_test_1`'s evidence).
- **Suggested fix**: real magic-byte sniffing for at least the declared
  types (PDF/PNG/JPEG/DOCX/TXT) before persisting.

## RISK-006 — `cleanup-qa-client.mjs` does not sweep physical uploaded files

- **Status**: `OPEN` (disclosed, minor)
- **Severity**: Low (data hygiene, not a security/data-integrity issue)
- **Found in**: `security_test_1`, `connector_test_1` (2026-08-23/24)
- **Real impact**: the reusable QA-client cleanup script deletes DB rows but
  never the corresponding physical files under `apps/api/uploads/<clientId>/`
  — every QA pass that uploads a real document has had to manually `rm -rf`
  the client's upload directory as a separate step. Local dev artifact only;
  never a real client's data.
- **Suggested fix**: add a real `fs.rmSync(uploads/<clientId>, {recursive:true})`
  step to the script.

## RISK-007 — Migration Validation Engine is self-referential

- **Status**: `OPEN` (disclosed, architectural, not fixed)
- **Severity**: Medium (integrity of a specific feature, not a security breach)
- **Found in**: `migration_validation_test_1` (earlier pass), reconfirmed live
- **Real impact**: `MigrationValidationService.runValidation()` compares the
  platform's own database to itself for both "source" and "target" sides —
  it always reports a perfect match by construction, not a genuine
  cross-environment validation. Not presented to users as a genuine
  client-vs-client validation as a result of this disclosure.
- **Suggested fix**: wire it to the real Universal Comparison Engine the way
  `TestReportService.runMigrationValidation` already does.

## RISK-008 — VPN/security-profile enforcement does not cross-check the connection's real TLS mode

- **Status**: `OPEN` (disclosed, architectural, not fixed)
- **Severity**: Low-Medium
- **Found in**: re-evaluation triggered by the connector TLS/SSRF fast
  -follow (2026-08-24), per the standing "re-evaluate every risk whenever
  related infrastructure changes" rule
- **Real impact**: `ConnectionSecurityService.assertReadyForConnection()` —
  the real, enforced guard the Universal Comparison Engine calls before
  every real connection attempt — only inspects `vpnStatus` (via
  `VPN_BLOCK_REASONS`). It has no awareness of the connection's own real
  `ssl_mode` (added this session in the TLS fast-follow). A connection
  could be marked `vpnStatus: 'not_required'` (passes the guard cleanly,
  implying a direct/already-secured network path) while its real `ssl_mode`
  is `'disable'` — meaning credentials and data would genuinely transit an
  unencrypted connection with no guard catching the combination. Confirmed
  by reading the real code, not assumed: `assertReadyForConnection` takes
  only `sourceType`/`sourceId` and never queries
  `oc_client_database_connections.ssl_mode` at all.
- **Why not fixed yet**: closing this cleanly requires
  `ConnectionSecurityService` (a generic, polymorphic service also used for
  `oc_connectors`) to reach into `ClientDatabaseConnectionService`'s own
  table for one specific source type, or for the reverse dependency
  direction — a real cross-service coupling decision that deserves
  deliberate design, not a rushed fix layered on at the end of an already
  -large session. Re-confirmed via a full re-run of
  `secure-connectivity-engine.test.ts` (19/19 still passing) that the
  EXISTING VPN guard itself remains genuinely enforced and unaffected by
  this gap — this is a real omission, not a regression.
- **Suggested fix**: either (a) `assertReadyForConnection` accepts an
  optional real `sslMode` parameter that callers already have available
  (the comparison engine already looks up the connection immediately
  before calling this guard) and adds a new `VPN_BLOCK_REASONS`-shaped rule
  for the risky `not_required` + `disable` combination on
  `dataClassification`-sensitive connections, or (b) a dedicated
  cross-cutting "Connection Readiness" check that composes both
  `ConnectionSecurityService` and the TLS mode explicitly, rather than
  extending either service's own narrow responsibility.

---

## Mechanical cross-reference

Every `RESOLVED`/`MITIGATED` entry above has a matching row correction in
`docs/eoc-feature-coverage-matrix.md` (rows #9, #17, #18, #19, #25, #55,
#80 across this session's passes) and a full evidence write-up under
`docs/evidence/<feature>/`. Every `OPEN` entry is a real, live, currently
-true gap — not resolved by any later pass unless this register is updated
alongside the fix, matching the same evidence discipline.
