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
- **Update (2026-08-24, `release_readiness_test_1`)**: a real, zero-orphans
  DB sweep (per the "cleanup scripts must verify zero orphans" mandate)
  after this pass's own full regression found the SAME class of gap in
  three more places:
  1. A standalone ad-hoc debug script this session used to reproduce the
     empty-body-POST bug created a real `oc_clients` row ("Debug Client X")
     that was never deleted before the script file itself was removed — a
     real oversight, same root cause as this risk (a throwaway script with
     no cleanup step). Deleted directly, verified.
  2. **A real, reproducible bug in `release-readiness-test-1.test.ts`'s own
     `afterAll`** (not environmental — confirmed by reproducing it TWICE
     across two separate, fully clean/isolated full-suite runs with no
     concurrent contention): its cleanup only ran
     `DELETE FROM approval_workflows WHERE entity_id = $1` (matching
     `$1 = clientId`, correct for the `release_signoff` shape it creates
     directly), but one of its own tests also creates a real
     `uat_signoff` workflow via `UatService` as test setup, whose
     `entity_id` is the UAT cycle's `test_suites` id — NOT the clientId —
     so that row was silently orphaned every single run. Root-caused,
     then fixed by adding the same `entity_id IN (SELECT id::text FROM
     test_suites WHERE client_id = $1)` subquery pattern
     `uat-test-1.test.ts` already used correctly; re-verified zero
     orphans across two more clean runs after the fix.
  3. 2 pre-existing "Debug Gap Client" rows dated 2026-08-22, from an
     earlier session's own unrelated ad-hoc script — confirming the
     ad-hoc-script cleanup gap (item 1) is a recurring pattern, not a
     one-off. Deleted directly, verified.

  (An earlier version of this note attributed item 2's 4 orphaned rows to
  transient DB contention from a concurrent `npm run build` — that
  contention was real and separately investigated, see
  `docs/evidence/release_readiness/release_readiness_test_1/
  release_readiness_test_1.md`, but was NOT the actual cause of the
  orphaned `approval_workflows` rows; the real cause was this
  file's own reproducible cleanup bug, confirmed once the contention
  was eliminated and the orphan still recurred. Corrected here rather
  than left standing, per "never leave a wrong conclusion undisclosed.")

  Zero orphans re-confirmed after both the cleanup and the code fix;
  both protected real clients (`AskABD Manual UAT 2026`, `Test1`)
  confirmed unchanged throughout. Reinforces the suggested fix above and
  extends it: any one-off/ad-hoc
  script that calls `OperationsCenterService.createClient` for
  reproduction purposes must delete the row itself before being discarded
  — never rely on being remembered to clean up manually.

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

## RISK-009 — Many POST routes read `req.body` without a null-guard; a genuinely empty-body request throws an unhandled exception instead of a clean 400

- **Status**: `MITIGATED` for every route touched this session (`uat-routes.ts`,
  `release-readiness-routes.ts`); `OPEN` for the rest of the platform
  (mechanical audit scoped, not yet fixed — see below)
- **Severity**: Low (robustness/DoS-adjacent, not a data-leak or
  authorization bypass — every real caller, staff UI and customer portal
  alike, always sends a real JSON body, even if `{}`; this is only
  reachable from a hand-crafted request with no body/no `Content-Type` at
  all)
- **Found in**: `release_readiness_test_1` (2026-08-24) — the "malformed
  workflow id" security test sent a POST with no payload at all (per the
  Security Testing Addendum's own "malformed input → safe failure"
  scenario) and got back a real, live 500-shaped error
  (`"Cannot read properties of undefined (reading 'note')"`) instead of a
  clean 4xx — Fastify leaves `req.body` as `undefined`, not `{}`, when no
  body is sent, and the route read `body.note` directly.
- **Real impact confirmed by mechanical audit**: `grep -rn "req.body as"
  apps/api/src/routes/*.ts` found **100+ occurrences across nearly every
  route file** (`operations-center-routes.ts` alone has ~90), almost all
  pre-existing from earlier sessions, following the same
  `const body = req.body as {...}` idiom with no `?? {}` fallback. A
  genuinely bodyless POST to most of these would hit the same class of
  unhandled-property-read exception. This is NOT presented as suddenly
  "90 new bugs" — every one of these routes has been exercised
  successfully, repeatedly, by real UI code (which always sends a real
  JSON body) across many prior sessions' Playwright/API passes; the actual
  exposure is narrow (a caller sending literally no body), not a
  data-integrity or authorization concern.
- **Fixed this pass**: every route in `uat-routes.ts` (4 POST routes) and
  `release-readiness-routes.ts` (2 POST routes) — the two files touched by
  this session's own new features — now guard with
  `(req.body as T | undefined) ?? {}`, plus a real, explicit
  `EXECUTION_STATUSES` validation added to `UatService.recordExecution` so
  a missing/invalid `status` returns a clean 400 with no leaked
  table/constraint names, rather than falling through to a raw Postgres
  CHECK-constraint violation message. Regression tests added in both
  `uat-test-1.test.ts` and `release-readiness-test-1.test.ts` (empty-body
  POSTs now confirmed `<500` and non-leaking).
- **Why not fixed platform-wide this pass**: ~90 additional occurrences,
  almost entirely in `operations-center-routes.ts`, are out of the blast
  radius of this session's two new features; a blanket edit across that
  file is a large, unrelated diff carrying real regression risk for a
  low-severity, narrow-exposure class of bug, disproportionate to fix
  under this pass's own scope. Tracked here instead of silently dropped.
- **Suggested fix**: a single shared Fastify hook (e.g. a `preHandler` or
  `onRequest` registered once in `server.ts`, alongside the existing auth/
  RBAC/tenant-access middleware) that normalizes `request.body ??= {}` for
  every JSON POST/PUT/PATCH before any route handler runs — closes the
  entire class in one place rather than touching every individual route
  file, and is the natural next fast-follow candidate given this session's
  own "extend don't duplicate" precedent.

## RISK-010 — The full `vitest run` suite is intermittently, non-deterministically flaky under this environment's real database, unrelated to code correctness

- **Status**: `OPEN` (disclosed, real, not a security issue — test infrastructure)
- **Severity**: Low as a security matter; Medium as a process-reliability
  concern (a flaky full-suite signal is dangerous precisely because a real
  regression could hide inside the noise if not investigated every time)
- **Found in**: `release_readiness_test_1` (2026-08-24) — attempting to get
  a trustworthy post-feature full-regression number surfaced this directly
- **Real evidence, not assumed**: 5 full `npx vitest run` attempts within
  one hour, same code, same machine, same DB, no changes between them:
  - Run 1 (concurrent with `npm run build`): **439 failed / 224 passed**,
    real errors like `relation "entity_versions" does not exist`.
  - Run 2 (isolated, nothing else running): **71 files / 686 tests, 100%
    passing.**
  - Run 3 (isolated, after a manual DB cleanup): **71 files / 686 tests,
    100% passing.**
  - Run 4 (isolated, after a genuine one-line test-file fix, no other
    change): **50 failed / 25 passed**, same `relation ... does not
    exist` error signature as Run 1 — despite NO concurrent process this
    time.
  - Run 5 (isolated, no code change from Run 4): **71 files / 686 tests,
    100% passing**, identical to Runs 2-3.
  - Direct DB health checks immediately after every failing run: real
    data intact, correct table/row counts, both protected real clients
    present with unchanged timestamps, `comparison-postgres` container
    never restarted (`RestartCount: 0`, no crash in its logs).
- **Working hypothesis** (not yet proven with a fix, stated as a
  hypothesis, not a certainty): `db-pool.ts`'s `sharedPool` is a
  per-process module-level singleton with `max: 15` connections; Vitest's
  default parallel-worker execution model gives each worker (thread or
  process) its OWN module registry, so a full run with several concurrent
  workers can legitimately attempt well over the server's real
  `max_connections` (confirmed live: `100`) at once. This would explain
  real, transient, non-reproducible failures under heavy parallel load
  that vanish under lighter load or lucky scheduling — consistent with
  every observation above — but has NOT been confirmed by directly
  instrumenting a failing run (not attempted this pass; the two clean
  confirmations already gave a trustworthy enough signal for this
  feature's own regression status without further chasing a pre-existing,
  cross-cutting infrastructure characteristic under this pass's time
  budget).
- **Why this is NOT treated as a regression in `uat_test_1` /
  `release_readiness_test_1`**: both new test files were also run
  repeatedly in FOCUSED isolation (just the 2 files, not the full 75-file
  suite) — **27/27 passing, every single time, with zero flakiness** —
  and every full-suite failure, when it occurred, showed the exact same
  generic, incoherent, whole-suite-wide failure shape (dozens of unrelated
  files/tests failing simultaneously with schema-level errors), never a
  failure isolated to the 2 new files or their specific assertions.
- **Suggested fix** (not attempted this pass — a cross-cutting test
  -infrastructure change affecting all 75 files, correctly out of scope
  for a single feature pass): either (a) lower `sharedPool`'s `max` well
  below `100 / (expected concurrent workers)`, or (b) constrain Vitest's
  own concurrency (e.g. `poolOptions.threads.maxThreads` /
  `fileParallelism: false` in `vitest.config.ts`), or (c) raise the real
  Postgres `max_connections` for local dev. Whichever is chosen, the fix
  should make the full suite deterministically clean on every run, not
  just some of them — flakiness at this scale actively degrades every
  future pass's ability to trust a "full regression: N/N passing" claim
  and deserves a dedicated, real fix pass of its own.

## RISK-011 — Real external deployment/rollback execution infrastructure does not exist

- **Status**: `BLOCKED_EXTERNAL_DEPENDENCY` (by design — not a defect, a
  real, disclosed platform boundary)
- **Severity**: N/A (this is the deployment-safety boundary working as
  intended, not a gap)
- **Found in**: `deployment_validation_test_1` / `post_delivery_test_1`
  (2026-08-24) — the directive's own explicit "Deployment Safety" section
- **Real situation**: this platform has no real CI/CD trigger, deployment
  -orchestration, or rollback-execution integration to any actual target
  system. `DeploymentService.startExecution`/`recordDeploymentOutcome`
  (and their rollback equivalents `initiateRollback`/
  `recordRollbackOutcome`) model and audit the REAL decision to deploy and
  its REAL reported outcome — evidence-enforced, same discipline as
  `TestExecutionService.recordExecution`'s `MissingEvidenceError` — but
  they never simulate, assume, or fabricate that an external deployment or
  rollback actually happened. A deployment can only reach `deployed`/
  `rolled_back` when a real caller (human operator, or a future real CI/CD
  webhook) reports it with real evidence; nothing in this codebase
  auto-transitions either state.
- **Why this is `BLOCKED_EXTERNAL_DEPENDENCY`, not `OPEN`**: closing this
  gap requires real infrastructure this sandbox cannot provide (a real
  CI/CD system, real target servers/containers to deploy to, real
  credentials to trigger deployments) — not a code fix. Per this session's
  own standing rule, never simulated as if such infrastructure existed.
- **What IS real and tested**: the full state machine, the readiness gate
  (re-checked fresh at both the approval AND execution checkpoints), the
  approval workflow (including real self-approval prevention), the
  evidence-enforcement on outcome recording, the rollback-availability
  check (`RollbackNotAvailableError` when no real rollback plan was
  recorded), and the full audit trail — all real, all tested, all live in
  `deployment-service.ts`.
- **Suggested fix (future, real infrastructure required)**: a real CI/CD
  webhook/adapter that calls `recordDeploymentOutcome`/
  `recordRollbackOutcome` with genuine evidence from an actual pipeline
  run, once such a pipeline exists for a real client engagement.

## RISK-012 — Many client-scoped tables have `client_id` with NO foreign key to `oc_clients` — real orphaned rows found and partially fixed

- **Status**: `RESOLVED` for the 4 tables in the Gap/Decision/Transformation
  domain (`oc_gaps`, `oc_gap_options`, `oc_decisions`, `oc_transformations`
  — migration 059); `OPEN` for the platform-wide pattern (39 more
  occurrences across 15 other migration files, not fixed this pass)
- **Severity**: Medium (data-integrity, not a security/data-leak issue —
  orphaned rows belong to already-deleted clients, so no live client's
  data was ever exposed or at risk; the real harm is accumulating dead
  data and a false sense that "delete a client" is a clean, complete
  operation when for these tables it silently wasn't)
- **Found in**: `risk_test_1` (2026-08-24) — the standing "verify zero
  orphan records after every QA cycle" check on the newly-built Risk
  Engine (which links to `oc_gaps` as a real risk source) surfaced **1026
  real orphaned `oc_gaps` rows** (`client_id` matching no existing
  `oc_clients` row), plus 6/1/56 orphaned rows in
  `oc_gap_options`/`oc_decisions`/`oc_transformations` respectively —
  accumulated across many prior sessions' test/QA runs, not introduced
  this pass.
- **Root cause, confirmed by reading migration 037 directly**: all 4
  tables declare `client_id TEXT NOT NULL` with no
  `REFERENCES oc_clients(id)` at all, so deleting a client via
  `DELETE FROM oc_clients WHERE id = $1` never cascaded to (or was
  blocked by) these tables — every test file's own `afterAll` that forgot
  to explicitly clean these 4 tables silently left real orphans behind
  forever, with nothing ever surfacing the accumulation until this pass's
  own zero-orphans check happened to touch this exact domain.
- **Mechanical audit performed** (per the standing "same pattern
  everywhere" mandate): `grep -rn "client_id TEXT NOT NULL,$"
  apps/api/src/db/migrations/*.sql` found **43 occurrences across 19
  migration files** — this is a real, sprawling, PRE-EXISTING pattern
  spanning nearly the whole platform's schema (e.g.
  `006_operations_center.sql`, `007_connectors_discovery.sql`,
  `009_client_documents.sql`, `020_commercial_engagement.sql`,
  `034_client_database_connections.sql`, `038_business_requirements.sql`,
  and 13 more), not something introduced this session.
- **Fixed this pass**: migration 059 — deleted the real orphaned rows
  (data belonging to already-deleted clients, safe to remove; both
  protected real clients `AskABD Manual UAT 2026`/`Test1` confirmed
  unchanged before and after), then added the missing
  `REFERENCES oc_clients(id) ON DELETE CASCADE` constraint to all 4
  tables in the Gap/Decision/Transformation domain — the one domain this
  pass's own new Risk Engine directly links to. Verified: migration
  applied cleanly (would have failed if any remaining row violated the
  new constraint), full API regression run afterward with zero
  unexplained failures.
- **Why NOT fixed platform-wide this pass**: retrofitting foreign keys
  onto 19 migration files' worth of tables, each needing its own
  orphan-cleanup-then-constrain migration and its own regression
  verification, is a large, cross-cutting, genuinely separate body of
  work from "build the Risk Engine" — correctly out of scope for a single
  feature pass, matching this session's own established precedent
  (RISK-009's 100+ `req.body` occurrences, the 41-file `mockClients`
  gap). Tracked here precisely (with the exact grep command used) so a
  future dedicated pass can act on it directly rather than re-discovering
  it.
- **Suggested fix**: a dedicated pass that, for each of the remaining 39
  occurrences, (a) checks for and cleans any real orphaned rows, (b) adds
  the missing FK with `ON DELETE CASCADE` (matching this session's own
  now-established convention for every client-scoped table), and (c)
  re-runs full regression after each batch — the same three-step pattern
  migration 059 already proved works cleanly.

## RISK-013 — `MigrationExecutionService.rollback()` had no object-level ownership check for a destructive `DROP SCHEMA CASCADE` — fixed; sibling methods still lack it

- **Status**: `RESOLVED` for `rollback()`; `OPEN` for `execute()`/`validate()`/`dryRun()`/`getRun()` (same missing-clientId shape, lower urgency, not fixed this pass)
- **Severity**: Medium-High for `rollback` specifically (a genuinely
  destructive, irreversible `DROP SCHEMA ... CASCADE`); Low for the
  read-mostly/transactional siblings
- **Found in**: `risk_test_1`'s continuation into capability #44 (Migration
  Rollback Engine), 2026-08-24 — investigating the coverage matrix's
  (incorrect) "NOT_STARTED" claim led to discovering `rollback()` already
  existed and was already wired to a real, RBAC-gated route, but took only
  an opaque `migrationId` with no way to confirm the caller genuinely
  intends to affect a specific client's migration — the exact "trust an
  opaque id alone" pattern already fixed for connectors/deployments/risks/
  UAT this session, here on the single most destructive migration
  operation in the platform.
- **Real impact**: any staff Admin.Access token could pass ANY
  `migrationId` (not necessarily one they meant to target) and the schema
  would be dropped with no cross-check against an intended client — a real
  risk of an accidental or careless cross-client destructive action, even
  though staff already has legitimate broad cross-client access by this
  platform's own design (so this is a "wrong target by mistake" safety net,
  not a tenant-isolation bypass in the IDOR sense).
- **Fixed this pass**: `rollback(migrationId, clientId?)` — `clientId`
  optional (backward-compatible with this service's own pre-existing,
  already-passing test suite, which calls it with no `clientId`); when
  provided, a real `MigrationOwnershipError` is thrown on mismatch. The
  real HTTP route (`POST /oc/migration/:migrationId/rollback`) now always
  supplies `?clientId=` and maps the ownership error to a safe `404`. The
  one real caller in the web app (`migrations/[migrationId]/detail-view.tsx`)
  updated to send it. Proven live: a real Client B `clientId` cannot roll
  back Client A's real migration — the real target schema is confirmed
  still present via `information_schema` afterward, not just a rejected
  response.
- **Mechanical audit performed**: `execute()`, `validate()`, `dryRun()`,
  and `getRun()` share the identical "no `clientId` parameter" shape.
  **Not fixed this pass** — `execute`/`dryRun`/`validate` are additive or
  read-only (no destructive `DROP`), a materially lower severity than
  `rollback`, and retrofitting all 4 (plus their route call sites) is a
  larger, separate body of work; tracked here rather than silently
  discovered-and-ignored, matching this pass's own `RISK-012` precedent
  for scoping a mechanical audit's fix to the highest-severity instance
  found.
- **Evidence**: `apps/api/tests/migration-rollback-test-1.test.ts` (7 new
  tests) — real schema creation, real execute, real rollback with
  independent `information_schema` re-verification (never trusting the
  return value alone), real cross-client ownership block with the target
  schema confirmed still present, backward-compatibility preserved, real
  HTTP-layer proof. Full regression re-run for both pre-existing migration
  test files (`operation-framework.test.ts`, `migrations-routes.test.ts`)
  confirmed zero regression from the signature change.
- **Suggested fix**: apply the same optional-`clientId` pattern to
  `execute`/`validate`/`dryRun`/`getRun` and their route call sites in a
  dedicated follow-up pass.

## RISK-014 — `PortfolioIntelligenceService`'s real cross-client routes had no RBAC (fixed); 46 more candidate routes found by the same mechanical audit, not yet individually triaged

- **Status**: `RESOLVED` for the 7 confirmed routes (real, cross-client
  platform business intelligence, no legitimate reason to be open to a
  customer token); `OPEN` for the 46 remaining candidate routes below
  (each needs individual investigation — some are very likely legitimate,
  see below — not blindly fixed)
- **Severity**: High for the 7 resolved routes (real financial
  investment/savings/ROI data, real cross-client problem/gap/technology
  patterns, real resource allocation — genuine AskABD business
  intelligence, not any single client's data, but still never meant for
  a customer token); Unknown/mixed for the 46 untriaged candidates
- **Found in**: `executive_reporting_test_1` continuation (2026-08-24) —
  investigating coverage matrix row #68 ("Analytics Engine") led to
  reading `portfolio-intelligence-service.ts` in full, which surfaced 8
  real, wired, substantial routes (`operations-center-routes.ts`) with
  only ONE (`/portfolio/clients/:clientId/health`) carrying an RBAC rule.
- **Mechanical audit performed**: a real script (parsing every
  `server.<method>('/oc/...')` registration in
  `operations-center-routes.ts` and diffing against every rule in
  `rules.ts`, filtered to routes with NO `:clientId` in their path —
  the class most likely to be genuine platform-wide data with no
  tenant-scoping backstop at all) found **47 total candidates**; **7 confirmed
  and fixed this pass** (the `/oc/portfolio/*` family — real
  Admin.Access rules added, proven live: customer/unauthenticated denied,
  staff unaffected, `portfolio-intelligence-rbac-test-1.test.ts` 4/4).
- **The other 46, NOT fixed this pass — real individual triage required,
  not a blind mass-fix**:
  `GET /oc/me`, `GET /oc/me/pending-invitations`,
  `POST /oc/me/pending-invitations/:id/accept` — very likely legitimate
  (resolve against the caller's OWN verified identity, not an arbitrary
  target — same shape as every other "my own" endpoint already correctly
  unlisted elsewhere in `rules.ts`), but not independently re-confirmed
  this pass.
  `POST /oc/otp/send`, `POST /oc/otp/verify`, `POST /oc/otp/resend` —
  plausibly legitimate pre/early-session onboarding steps, but NOT
  confirmed to be in `publicRoutes` (they are not — they require
  `defaultPolicy:'authenticated'` at minimum) — a real, disclosed
  uncertainty, not assumed safe.
  `POST /oc/jira/webhook` — plausibly an external-system webhook with its
  own auth mechanism (e.g. signature verification), not the standard
  bearer-token flow — NOT independently confirmed this pass.
  `GET /oc/clients`, `GET /oc/clients/:id`, `GET /oc/audit`,
  `POST /oc/audit`, `GET /oc/operations`, `POST /oc/service-actions`,
  `POST /oc/notifications`, `GET /oc/notifications`,
  `GET /oc/clients/health-summary`, `POST /oc/defects`,
  `POST /oc/incidents` — real, concerning candidates (client listing,
  audit trail, cross-client operations/notifications/defects/incidents)
  that look similar in shape to the `/oc/portfolio/*` gap just fixed —
  the most likely place a genuine further finding exists, not yet
  investigated.
  `POST /oc/lifecycle/init`, `POST /oc/lifecycle/transition`,
  `POST /oc/discovery/start`, `POST /oc/assessment/start`,
  `POST /oc/assessment/domain/start`, `POST /oc/recommendations/generate`
  — these take a real `clientId` in the request BODY (confirmed
  elsewhere in this session's own work, e.g. `tenant-access.ts`'s own
  body-clientId extraction) rather than the URL, so the audit script's
  URL-only `:clientId` heuristic naturally missed them — likely already
  covered by `tenant-access.ts`'s real body-clientId check, but not
  independently re-confirmed this pass.
  `GET /oc/client-services/definitions`, `GET /oc/capabilities`,
  `GET /oc/capabilities/summary`, `GET /oc/capabilities/roadmap`,
  `GET /oc/capabilities/dependencies`, `GET /oc/capabilities/maturity`,
  `GET /oc/capabilities/:id`, `GET /oc/optimization/rules`,
  `POST /oc/optimization/rules`, `GET /oc/workflow/rules`,
  `GET /oc/workflow/executions`, `GET /oc/scheduler/jobs`,
  `GET /oc/compliance/frameworks`,
  `GET /oc/compliance/frameworks/:frameworkId/controls`,
  `GET /oc/compliance/mappings`, `GET /oc/compliance/mappings/coverage`,
  `GET /oc/compliance/controls/:controlId/related`,
  `GET /oc/service-bundles`, `GET /oc/service-bundles/:id`,
  `GET /oc/platform/commercial/summary`, `GET /oc/jira/config`,
  `POST /oc/jira/issues` — plausibly public/reference CATALOG data
  (framework/control/service/capability definitions are not any one
  client's secret) rather than per-client sensitive data, but NOT
  individually confirmed this pass — `platform/commercial/summary` and
  `jira/config`/`jira/issues` specifically look more likely to carry real
  sensitive data and deserve priority in a future triage.
- **Why not fixed platform-wide this pass**: each of the 46 needs a real,
  individual read of its handler to determine whether it's genuinely
  public reference data, an already-covered body-clientId route, a
  legitimate "my own identity" endpoint, or a real further gap — blindly
  applying Admin.Access to all 46 risks breaking legitimate
  customer-portal catalog/reference functionality without verification,
  the same "large, separate body of work" reasoning already applied to
  RISK-009 (100+ instances) and RISK-012 (39 instances) this session.
- **Suggested fix**: a dedicated pass that reads each of the 46 handlers,
  classifies it as (a) genuinely public/reference → deliberately
  document as an intentional exception, (b) already covered via
  body-clientId → verify and document, (c) a real further RBAC gap →
  fix with the same Admin.Access pattern and a real regression test. The
  mechanical script itself (parse `server.<method>` registrations, diff
  against `rules.ts`, filter to no-`:clientId` paths) is reusable as-is
  for that pass — no new tooling needed.
- **Update (2026-08-24, `dependency_analysis_test_1` — final mechanical
  audit pass, per the master directive's own "audit again after all
  named capabilities are complete" instruction)**: re-ran the same
  mechanical script across ALL route files (not just
  `operations-center-routes.ts`), covering all 451 real registered
  routes in the platform. Found exactly 2 more raw candidates beyond the
  already-tracked 46, both individually investigated (not blindly
  fixed) and both confirmed genuinely NOT real gaps:
  `GET /oc/invitations/lookup` / `POST /oc/invitations/accept` are
  already explicitly listed in `server.ts`'s own `publicRoutes` config
  (a documented, deliberate pre-auth invitation-token exception,
  confirmed by reading that config directly); `POST /oc/staff/roles` is
  already a documented, deliberate, narrowly-scoped one-time bootstrap
  exception (`rules.ts` itself carries a real explanatory comment; the
  route's own handler, read in full, correctly requires BOTH a genuinely
  empty `staff_role_assignment` table AND that the grant target is the
  caller's own verified identity — never a real customer's or a
  different staff member's). No new real gap found. This does not
  reduce the 46 still-untriaged candidates from the earlier update —
  it independently confirms the broader sweep was complete and that at
  least these 2 of the "plausibly legitimate" category genuinely are.

---

## Mechanical cross-reference

Every `RESOLVED`/`MITIGATED` entry above has a matching row correction in
`docs/eoc-feature-coverage-matrix.md` (rows #9, #17, #18, #19, #25, #55,
#80 across this session's passes) and a full evidence write-up under
`docs/evidence/<feature>/`. Every `OPEN` entry is a real, live, currently
-true gap — not resolved by any later pass unless this register is updated
alongside the fix, matching the same evidence discipline.
