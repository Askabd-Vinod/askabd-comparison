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

- **Status**: `RESOLVED` (2026-08-25, `risk_004_cors_production_fail_fast
  _test_1`) — exactly the fix this entry's own "suggested fix" named.
- **Severity**: Low-Medium
- **Found in**: `security_test_1` (2026-08-23)
- **Real impact**: `apps/api/src/server.ts` combines `credentials: true`
  with `origin: true` (reflect-any-Origin) when `CORS_ORIGIN` is unset — the
  textbook risky CORS combination. Confirmed low exploitability today: this
  API's auth is 100% `Authorization: Bearer` header-based (confirmed by
  reading `middleware/auth.ts` — no cookie is ever read for auth), so a
  malicious cross-origin page cannot automatically ride a victim's session
  the way it could with cookie-based auth.
- **The real fix**: `config/env.ts`'s `validateProductionCorsOrigin` (new,
  pure, exported for direct testing) — the app now refuses to start
  (`process.exit(1)`, the same fail-fast shape already used for other
  invalid config in this exact file) when `NODE_ENV === 'production'` and
  `CORS_ORIGIN` is `'*'` (either explicit or via the schema's own default
  when unset). Matches `deploy/PRODUCTION.md`'s own go-live checklist,
  which already required "CORS_ORIGIN restricted to actual frontend
  domain" — this makes that requirement impossible to silently skip
  rather than merely documented. Development/test environments are
  completely unaffected (the wildcard default remains fine outside
  production — this repo's own test suite runs with `NODE_ENV=test`).
- **Regression evidence**: `apps/api/tests/risk-004-cors-production-fail
  -fast.test.ts`, 7/7 passing — production + wildcard/unset refused,
  production + a real restricted origin (single or comma-separated list)
  allowed, development/test + wildcard allowed unchanged, an unset
  `NODE_ENV` never treated as production.

## RISK-005 — Document-upload MIME validation is client-supplied only

- **Status**: `RESOLVED` (2026-08-25, `risk_005_mime_sniffing_test_1`)
- **Severity**: Low-Medium
- **Found in**: `security_test_1` (2026-08-23)
- **Real impact**: BOTH real document-upload routes (not just the one
  originally found) trust the multipart part's own client-supplied
  `Content-Type` header for their allowlist check — trivially spoofable,
  no magic-byte/content-sniffing. The allowlist gave a false sense of
  enforcement. Real path-traversal protection on the originally-found
  route WAS already positively verified (2 real attack attempts, both
  safely contained — see `security_test_1`'s evidence) and remains
  unchanged by this fix.
- **The real fix**: `services/mime-sniff.ts` (new, shared by both real
  upload routes) — real magic-byte checks for PDF, PNG, JPEG, and DOCX
  (ZIP magic bytes; a real, disclosed limit — this cannot by itself
  distinguish DOCX from another ZIP-based format without parsing the
  archive's internal entries, which this pass deliberately did not
  attempt), plus a real heuristic for TXT/CSV (no NUL byte in a real
  sample, and no match against any of the other binary signatures — the
  strongest check possible for formats with no defined magic bytes at
  all, a real and disclosed inherent limitation, not specific to this
  implementation).
  - `operations-center-routes.ts`'s onboarding-requirement document
    upload: now buffers the upload (bounded by the same 20MB multipart
    limit already registered in `server.ts`) to sniff its real content
    before persisting, rejecting a mismatch with a clean 400 before any
    row is written.
  - `discovery-intake-routes.ts`'s discovery-source document upload:
    already buffered the file — added the same sniff check as an
    additional, independent layer before `service.submitDocument`'s own
    (unchanged) allowlist check.
- **Regression evidence**: `apps/api/tests/risk-005-mime-sniffing-test
  -1.test.ts`, 14/14 passing — unit-level real magic-byte correctness
  for every covered type (including the documented DOCX/text
  limitations), plus a REAL, live, end-to-end spoofing attempt against
  BOTH routes (genuine PNG magic bytes uploaded claiming `Content-Type:
  text/plain`) confirmed rejected with a clean 400 and zero orphaned
  rows, and a genuine, correctly-labeled text upload confirmed still
  accepted end-to-end (the fix does not break real uploads).

## RISK-006 — `cleanup-qa-client.mjs` does not sweep physical uploaded files

- **Status**: `RESOLVED` (2026-08-25) — exactly the fix this entry's own
  "suggested fix" named.
- **Severity**: Low (data hygiene, not a security/data-integrity issue)
- **Found in**: `security_test_1`, `connector_test_1` (2026-08-23/24)
- **Real impact**: the reusable QA-client cleanup script deleted DB rows
  but never the corresponding physical files under
  `apps/api/uploads/<clientId>/` (or the separate discovery-document
  tree, `apps/api/uploads/discovery/<clientId>/` — see
  `document-storage-service.ts`'s two real `storageReference` shapes,
  both handled by the fix) — every QA pass that uploaded a real document
  had to manually `rm -rf` the client's upload directory as a separate
  step. Local dev artifact only; never a real client's data.
- **The real fix**: `scripts/playwright-evidence/cleanup-qa-client.mjs`'s
  new `removeClientUploads()` — resolved relative to the script's own
  file location (not `process.cwd()`, which depends on where the script
  happens to be invoked from), removes both real upload-directory shapes
  with `fs.rmSync(..., {recursive:true, force:true})`, and only runs
  AFTER the DB transaction genuinely commits (never deletes real files
  ahead of a rollback). Live-verified end-to-end: a real disposable test
  client created, real files written to both real directory shapes,
  script run, both directories confirmed physically gone
  (`ls`/`existsSync` after) and both real protected clients confirmed
  unaffected.
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

- **Status**: `RESOLVED` platform-wide (2026-08-25,
  `risk_009_body_normalization_test_1`) — the single shared hook this
  entry's own "suggested fix" named, implemented exactly as described.
  Closes the entire class in one place; every one of the 100+
  individual call sites (~90 in `operations-center-routes.ts` alone) is
  now covered without having been touched individually.
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
- **Update (2026-08-25, `risk_009_body_normalization_test_1`) — the
  platform-wide fix**: `middleware/body-normalization.ts` (new) — a
  `preHandler` hook registered once in `server.ts`, after auth/RBAC/
  tenant-access and before every route, that sets `request.body = {}`
  whenever a POST/PUT/PATCH request's body is genuinely `undefined`.
  Exactly the fix this entry's own "suggested fix" section named,
  implemented as described, not a different approach. No route handler
  code was touched — every existing `if (!body.x) return 400` check
  across the platform now simply runs against a real `{}` instead of
  throwing on `undefined` first.
- **Real bug proven, not assumed, before claiming the fix works**: a
  dedicated test builds the app WITHOUT the new hook and confirms
  `POST /oc/jira/config` with no body genuinely throws an unhandled
  `TypeError` (a raw 500) — proving RISK-009 was a real, reproducible
  bug, not a hypothetical one, before proving the fix closes it.
- **Verified against 3 representative routes never individually touched
  by any RISK-009 pass** (confirming the middleware itself closes the
  gap, not a per-route patch): `POST /oc/gaps/:gapId/evidence`,
  `POST /oc/clients/:clientId/engagements`, `POST /oc/jira/config` — all
  3 now return their own existing, correct `400` validation message
  instead of a raw `500` on an empty body. A real, non-empty body is
  confirmed completely unaffected (the hook never overwrites an actual
  parsed body), and a genuinely empty `{}` JSON body is confirmed to
  behave identically to no body at all (both correctly reach the same
  clean validation path).
- **Regression evidence**: `apps/api/tests/risk-009-body-normalization
  -test-1.test.ts`, 6/6 passing. Full platform regression run
  unaffected (no multipart/file-upload or other content-type handling
  changed — the hook is scoped to POST/PUT/PATCH and only acts when
  `request.body` is genuinely `undefined`, never overwriting a real
  parsed body of any kind).

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

## RISK-012 — Many client-scoped tables have `client_id` with NO foreign key to `oc_clients` — now RESOLVED platform-wide

- **Status**: `RESOLVED` platform-wide (2026-08-25,
  `risk_012_platform_fk_integrity_test_1`). The 4 tables in the
  Gap/Decision/Transformation domain were fixed first (migration 059,
  2026-08-24); this pass completed the remaining 39 tables across 18
  migration files (migration 067), closing every occurrence the earlier
  mechanical audit found. **43 of 43 known occurrences are now fixed —
  zero remain open.**
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
- **Update (2026-08-25, `risk_012_platform_fk_integrity_test_1`) — the
  remaining 39 occurrences, now fixed**: migration 067, following the
  exact three-step pattern migration 059 already proved (mapped every
  grep hit to its real table name via script rather than by hand,
  queried real per-table orphan counts before writing any SQL, then
  deleted + constrained).
  - **The real scale, confirmed by direct query before writing the
    migration**: over 40,000 real orphaned rows across the 39 tables —
    `oc_client_service_requirements` alone had 21,681 orphaned rows out
    of 21,761 total (99.6%); `oc_events` had 16,439 of 16,462 (99.9%).
    Both real protected clients (`AskABD Manual UAT 2026`, `Test1`)
    independently verified to have real, non-orphaned rows in every
    affected table, both before AND after the migration, with identical
    row counts (20 `oc_client_service_requirements` each; 4/0 `oc_events`
    respectively) — their data was never at risk by construction (their
    `client_id` genuinely exists in `oc_clients`, so the `NOT EXISTS`
    orphan condition can never match it).
  - **Two real ordering bugs found and fixed before the migration ran
    cleanly** — both caught by the migration failing loudly and rolling
    back atomically (verified: no row in `_migrations`, no partial
    constraint, orphan counts unchanged after each failed attempt — the
    exact safety this session relies on for every schema change):
    (1) several of the 39 tables have real foreign keys to EACH OTHER
    (e.g. `oc_baselines.metric_id → oc_metric_definitions.id`,
    `oc_workflow_executions.event_id → oc_events.id`,
    `oc_reconciliation_items.run_id → oc_reconciliation_runs.id`) —
    deleting a still-referenced parent before its child failed with a
    real FK violation on the first attempt; fixed by re-deriving the
    delete order topologically (children strictly before parents) from
    a direct `information_schema` query, not by guessing. (2) a second,
    same-class bug: `oc_engagement_pricing` — a table OUTSIDE the 39,
    not itself client-scoped — has its own un-cascaded FK to
    `oc_commercial_engagements`; 3 real orphaned pricing rows needed
    cleanup before their parent engagements could be deleted, found via
    a second, broader query for every real FK anywhere in the database
    that references INTO the 39-table set (not just among the 39
    themselves), confirming no other external child table had the same
    issue.
  - **A real, expected downstream break, found and fixed properly (not
    weakened around)**: the new constraints correctly rejected 4
    pre-existing test files that created rows against bare, non-existent
    client ids (`reliability-hardening.test.ts`,
    `commercial-engagement.test.ts`, `payment-reconciliation.test.ts`,
    `connection-tests-history.test.ts` — 46 tests total, all failing
    with real `insert or update ... violates foreign key constraint`
    errors on the first full-regression run after the migration). Per
    the standing "stop, find root cause, fix, repeat all affected tests"
    discipline: each fixed to create a real `oc_clients` row first (the
    same `minimalClient()` helper pattern already established elsewhere
    this session), never by loosening the constraint. All 4 files, 62
    tests, now passing; the constraint itself was never touched.
  - **Result**: all 43 known occurrences (4 from migration 059 + 39 from
    this pass) now carry a real `client_id → oc_clients(id) ON DELETE
    CASCADE` foreign key. Zero orphans remain across all 43 tables,
    verified by direct query.
- **Regression evidence**: full suite stays at 895 (no new test files
  added this pass — a repair, not new coverage): the migration's first
  full-regression run showed 46 real failures across the 4 affected
  files; after fixing those 4 files to create real clients, the same
  895-test suite passes 895/895 again. `tsc --noEmit` clean. Both
  protected clients reconfirmed unchanged.

## RISK-013 — `MigrationExecutionService.rollback()` had no object-level ownership check for a destructive `DROP SCHEMA CASCADE` — fixed; sibling methods still lack it

- **Status**: `RESOLVED` for all 5 methods (`rollback()` first, then
  `getRun()`/`validate()`/`dryRun()`/`execute()` — see the 2026-08-25
  update below) plus the real `execute-async` route beyond the
  originally-named list.
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
  Originally not fixed in this pass, tracked as a suggested fix — now
  **RESOLVED** (2026-08-25, `migration_execute_validate_ownership_test_1`).
- **Evidence**: `apps/api/tests/migration-rollback-test-1.test.ts` (7 new
  tests) — real schema creation, real execute, real rollback with
  independent `information_schema` re-verification (never trusting the
  return value alone), real cross-client ownership block with the target
  schema confirmed still present, backward-compatibility preserved, real
  HTTP-layer proof. Full regression re-run for both pre-existing migration
  test files (`operation-framework.test.ts`, `migrations-routes.test.ts`)
  confirmed zero regression from the signature change.
- **Update (2026-08-25, `migration_execute_validate_ownership_test_1`) —
  the sibling fix, completed**: applied the exact same optional-`clientId`
  pattern to `getRun`/`validate`/`dryRun`/`execute`, plus one route
  beyond the originally-named list: `POST /oc/migration/:migrationId
  /execute-async` — the REAL route the web app's migration detail view
  actually calls for execution (the synchronous `/execute` above is
  registered but not used by any real UI). Extending `execute-async` too
  was a deliberate scope decision, not scope creep: leaving the route
  real callers actually use unprotected would have made the `execute`
  fix real in name only. `getRun`'s fix required care —
  `MigrationOwnershipError` is thrown OUTSIDE its own DB-query
  try/catch, deliberately, so a real ownership mismatch is never
  silently swallowed as "not found" (that catch exists only for genuine
  DB errors). The real web UI (`migrations/[migrationId]/detail-view.tsx`)
  updated to send `clientId` on all 3 newly-protected calls
  (`dry-run`, `execute-async`, `validate`), matching the precedent
  already set for `rollback`.
  - **A real bug caught by this pass's own edit, before it ever ran**:
    wiring `clientId` through the `execute-async` route's fire-and-forget
    async callback left a stray duplicate `});` from the original code —
    a real syntax error, caught immediately by `tsc --noEmit` before any
    test ran, not discovered live.
  - **A real, much larger, pre-existing discovery made while writing this
    fix's own tests**: verifying the new `execute-async` test's cleanup
    surfaced **137 orphaned Postgres schemas** (`mig_<clientId>_
    <timestamp>`, `MigrationExecutionService.createPlan`'s real target
    -schema naming) — real schemas left behind by `execute()` calls
    across many prior sessions' migration test runs whose owning test
    client was later deleted, with nothing ever tracking or cleaning
    them up (schemas aren't rows in a table with a `client_id` foreign
    key — RISK-012's fix does not and cannot reach them). Every one of
    the 137 confirmed to have NO corresponding live `oc_clients` row
    (cross-checked programmatically against every real client id, zero
    false positives) before any were dropped. All 137 real, verified
    -safe orphans cleaned up directly (`DROP SCHEMA ... CASCADE`);
    confirmed zero `mig_*` schemas remain, and both real protected
    clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unchanged
    before and after. Not re-opened as a new numbered risk — the same
    root cause and remediation as RISK-012 (accumulated test/QA
    artifacts, no security exposure since no live client's data was
    ever at risk), just a different physical mechanism (Postgres
    schemas, not table rows) that RISK-012's own table-scoped fix
    couldn't have caught.
  - **Confirmed NOT a one-time cleanup — genuinely fixed at the source
    too**: a full-suite regression run immediately after the 137-schema
    cleanup found exactly ONE new orphan, proving the pattern was still
    actively recurring, not just historical. Traced to a real,
    pre-existing bug in `operation-framework.test.ts` (unrelated to this
    pass's own changes) — its one real end-to-end migration-execution
    test dropped its SOURCE schema in `afterAll` but never
    `plan.targetSchema`, the real schema `execute()` actually creates —
    the exact same class of mistake this session's own investigation
    had just found and fixed in its own new test file. Fixed the same
    way (drop both real schemas, not just the source one); re-ran that
    file alone (9/9 passing) and confirmed zero `mig_*` schemas remain
    afterward.
  - **Regression evidence**: `apps/api/tests/migration-execute-validate
    -ownership-test-1.test.ts`, 10/10 passing — real cross-client
    ownership blocks for `getRun`/`validate`/`dryRun`/`execute` at the
    service layer (each with independent `information_schema`
    re-verification that the blocked operation genuinely did nothing),
    backward-compatibility preserved, a genuinely nonexistent migration
    id returning `null` rather than an ownership error, and real
    HTTP-layer proof for all 4 routes (`dry-run`, `validate`, `GET
    /oc/migrations/:id`, `execute-async`) including a real wait for the
    fire-and-forget async execution to genuinely complete before
    asserting cleanup correctness (never a fabricated "it probably
    finished" assumption).

## RISK-014 — `PortfolioIntelligenceService`'s real cross-client routes had no RBAC (fixed); individual triage in progress on the remaining candidates found by the same mechanical audit

- **Status**: `RESOLVED` for 14 routes total across two passes — the
  original 7 (`PortfolioIntelligenceService`) plus 7 more found in the
  2026-08-24 triage pass (`GET/POST /oc/clients` family, `/oc/audit`,
  `/oc/notifications` — see that pass's update below for the full list).
  `VERIFIED NOT A GAP` for 3 more (`/oc/operations`, `POST /oc/defects`,
  `POST /oc/incidents` WITH a clientId — already correctly denied by
  the pre-existing `tenant-access.ts` body/query-clientId check,
  confirmed live, not by reading alone). `OPEN, low severity, disclosed`
  for 1 (`POST /oc/incidents` with clientId omitted — creates an
  unattributed `client_id: NULL` record, a data-hygiene issue, not a
  tenant leak). `RESOLVED` (2026-08-29, `risk_014_triage_test_4`) for the
  1 item of a different shape that was `OPEN, untriaged` here
  (`POST /oc/service-actions` — opaque `entityId` ownership, no
  `clientId` concept exists on this route at all; see that update below).
  **This summary paragraph is the ORIGINAL 2026-08-24 count and has not
  been kept in sync with every later individual-triage update below it —
  read the dated updates below (test_2/test_3/test_4) for the current,
  accurate remaining-untriaged count rather than the "35" figure here.**
- **Severity**: High for the 14 resolved routes (real financial
  investment/savings/ROI data, real cross-client problem/gap/technology
  patterns, real resource allocation, real full client directory/audit
  log/notification stream — genuine AskABD or cross-client business
  data, never meant for a customer token); Low for the 1 disclosed
  data-hygiene item; Unknown for the 1 opaque-entityId item and the 35
  fully untriaged candidates
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
- **Update (2026-08-24, `risk_014_triage_test_1` — individual triage pass
  on the "most likely place a genuine further finding exists" group)**:
  read all 11 handlers in that group in full (`GET/POST /oc/clients`,
  `GET /oc/clients/:id`, `GET /oc/clients/health-summary`, `GET/POST
  /oc/audit`, `GET /oc/operations`, `POST /oc/service-actions`,
  `GET/POST /oc/notifications`, `POST /oc/defects`, `POST /oc/incidents`)
  and independently confirmed (grep across `apps/web/src/app/(portal)`)
  that the customer-facing portal frontend never calls any of them —
  only staff `(app)` pages/components do.
  - **7 confirmed real gaps, FIXED this pass** (real Admin.Access rules
    added to `rules.ts`, proven live with `risk_014_triage_test_1.test.ts`,
    5/5): `GET /oc/clients` (lists every client on the platform),
    `GET /oc/clients/:id` (fetches ANY client by id — unlike `PUT :id`,
    this had no `tenant-access.ts` backstop either), `GET /oc/clients
    /health-summary` (every client's real health score in one response),
    `GET /oc/audit` (the full platform audit log across every client and
    entity), `POST /oc/audit` (write access to inject fabricated audit
    entries for any actor/entity), `GET /oc/notifications` (every
    client's notifications when no `clientId` query param is supplied),
    `POST /oc/notifications` (create a notification for an arbitrary
    `clientId`, no ownership check).
  - **4 investigated with a real live test (`app.inject`, not just
    reading the handler) before assuming a gap** — this correction
    matters: `tenant-access.ts`'s `extractClientId` already inspects
    BOTH `request.body.clientId` AND `request.query.clientId` for every
    `/api/v1/oc/**` route generically (see that file's own doc comment
    and the pre-existing `tenant-access-body-query.test.ts`), so a
    naive "this route has a clientId in the body/query with no rule in
    `rules.ts`" read is NOT sufficient to conclude a gap — it must be
    checked against the live middleware chain, not `rules.ts` alone.
    Doing so found:
    `GET /oc/operations?clientId=<foreign>` → **already correctly
    denied**, `403 tenant_not_resolved` (live-verified); with no
    `clientId` at all it returns `{operations:[]}` before any query
    ever runs — not a leak either way. **Not a gap — closed by
    verification, no fix needed.**
    `POST /oc/defects` / `POST /oc/incidents` with a foreign `clientId`
    in the body → **already correctly denied**, `403
    tenant_not_resolved` (live-verified). **Not a gap — closed by
    verification, no fix needed.**
    `POST /oc/incidents` with `clientId` OMITTED entirely → tenant
    -access.ts has nothing to check (by design — "route is not
    client-scoped by URL param" applies equally to an absent body
    field) and the route itself accepts `body.clientId || null`,
    creating a real, successfully-persisted incident with
    `client_id: NULL` — an unattributed record any authenticated
    identity (including a customer token) can create at will. Real,
    but a data-hygiene/potential-noise issue, not a cross-tenant data
    leak — no client's existing data is exposed or altered. **Left
    OPEN, low severity, disclosed** (a rate-limit or "must supply a
    real, mapping-authorized clientId" constraint would close it; not
    fixed this pass).
    `POST /oc/service-actions` — **the original claim was wrong**:
    `ServiceActionInput`/`oc_service_actions` has no `client_id`
    concept at all (verified by reading the real interface and INSERT
    in `operations-center-service.ts` directly) — it is keyed by an
    opaque `entityId`/`entityType`, the exact class of route
    `tenant-access.ts`'s own doc comment already discloses as
    out-of-scope ("routes that reference a client only indirectly
    through an opaque resource ID ... requiring a DB lookup to resolve
    ownership remain NOT covered here"). Whether that `entityId`
    legitimately allows a customer to record an action against another
    client's entity is a real, genuinely open question this pass did
    NOT resolve — **left OPEN, untriaged, disclosed** as its own item
    (not merged with the clientId-shaped findings above, since it isn't
    one).
- **Update (2026-08-24, `risk_014_triage_test_2` — the `/oc/me/*`, OTP,
  and jira-webhook group)**:
  - `GET /oc/me`, `GET /oc/me/pending-invitations`,
    `POST /oc/me/pending-invitations/:id/accept` — read each handler in
    full and **confirmed genuinely legitimate**: every field used
    (`orgContext`, `userId`) is read from the caller's own verified JWT
    claims, never from a request-supplied value. **Not a gap — closed
    by verification, no fix needed.**
  - `POST /oc/otp/send` / `/verify` / `/resend` — **a real, more severe
    gap than the plain RBAC-shaped findings above**: `POST
    /oc/otp/verify`'s success path WRITES to the target `clientId`'s
    real `business_owner_email`/`business_owner_name`/`organization
    _legal_name` requirement fields via `RequirementsService
    .updateRequirement`, with NO ownership check on `clientId` at all.
    Combined with `POST /oc/otp/send` accepting any `clientId` plus an
    attacker-chosen recipient `email` with no ownership check either,
    any authenticated identity (a real customer token included) could
    target an arbitrary EXISTING client, receive that client's real OTP
    at an address of its own choosing, and use it to overwrite that
    client's identity-verification fields — a real cross-tenant
    integrity/spoofing vulnerability, not merely a read-exposure one.
    **FIXED**: real `Admin.Access` rules added to all 3 routes in
    `rules.ts` (confirmed via grep: only staff `(app)/clients/onboard`
    and `(app)/verify` pages call these, never the customer `(portal)`);
    live-proven with `risk_014_triage_test_2.test.ts`, 3/3 passing
    (customer 403, unauthenticated 401, staff not blocked by RBAC).
    A second, independent, related-but-distinct finding in the same
    handler: `/oc/otp/send`'s HTML email template interpolated several
    caller-supplied fields (`businessOwner`, `clientName`, `onboarding
    Data.*`) unescaped into an email body sent, via AskABD's real
    sending domain, to a fully caller-chosen recipient — a genuine
    HTML-injection/phishing-content vector, independent of the RBAC fix
    (relevant even to a legitimate staff caller pasting untrusted
    client-supplied text). **FIXED**: a real `escapeHtml()` helper
    added in `operations-center-routes.ts`, applied to every
    caller-supplied field in that template (only the server-generated
    `otp` code and `expiry` timestamp remain unescaped, since neither
    is ever caller-supplied). Two sibling `sendEmail` call sites
    (`workflow-automation-service.ts`, `invitation-service.ts`) were
    checked and found lower-risk — `workflow-automation-service.ts`'s
    recipient is server-derived from `clientId`, not caller-supplied,
    and `invitation-service.ts`'s interpolated `clientName` can only
    be set by an already Admin.Access-gated staff action — both
    disclosed here, neither fixed this pass (a genuinely separate,
    lower-priority body of work, not blindly batched in).
  - `POST /oc/jira/webhook` — **a real, confirmed documentation
    -vs-implementation gap**, distinct in kind from every finding above
    (not a missing `rules.ts` entry — an entirely missing security
    control the platform's own docs claim exists).
    `docs/production-connection-readiness.md` documents this webhook's
    real production authentication as "Shared secret header validation"
    — but the actual route handler (read in full) performs ONLY
    structural JSON validation (`!body.webhookEvent`), with no shared
    -secret, HMAC, or signature check of any kind, and a grep across
    `apps/api/src` confirms no `webhookSecret`/equivalent config field
    exists anywhere in the codebase to check against — the documented
    control was never actually built. Practical impact: (a) a real
    external Jira instance calling this in production, presenting
    whatever "shared secret header" its own webhook config sends, gets
    no verification at all — the header is accepted or ignored, not
    checked; (b) more relevantly to this triage pass's RBAC lens, since
    the route is NOT in `server.ts`'s `publicRoutes`, it currently
    requires `defaultPolicy:'authenticated'` — meaning the real Jira
    server (which cannot present an askabd-identity JWT at all) cannot
    successfully call it today regardless, but any authenticated AskABD
    identity (including a customer token) that knows or guesses a real
    `issueKey` already linked to ANY client's defect COULD POST a
    fabricated webhook payload and falsely mark that defect
    `verified`/`resolved` in `oc_jira_issue_links` — a real integrity
    /spoofing risk, not a read-exposure one. **NOT fixed this pass** —
    implementing real signature verification requires new config
    plumbing (a `webhookSecret` field, secret storage/masking following
    the existing connector `maskSecrets` pattern, and the actual
    comparison logic against whatever header format the real Jira
    webhook/Automation configuration would send) — a genuinely separate
    feature, not a `rules.ts` one-liner, and Admin.Access is not the
    right fix either (it would only block the already-nonfunctional
    real Jira integration further, not add real verification). Tracked
    as **RISK-015** below rather than folded into this entry, since the
    root cause and fix shape are both different in kind.
  - **Remaining fully untriaged from the original 46**: 28 — the
    6-route body-clientId-scoped lifecycle/discovery/assessment group
    (`/oc/lifecycle/init`, `/oc/lifecycle/transition`,
    `/oc/discovery/start`, `/oc/assessment/start`,
    `/oc/assessment/domain/start`, `/oc/recommendations/generate`) and
    the 22-route catalog/reference group (`capabilities` family,
    `optimization/rules`, `workflow/rules`, `workflow/executions`,
    `scheduler/jobs`, `compliance` family, `service-bundles` family,
    `platform/commercial/summary`, `jira/config`, `jira/issues`) from
    the original update. (`/oc/me/*`, OTP, and jira-webhook — 7 routes —
    are now resolved/triaged as of this update, on top of the 11 from
    the prior update, accounting for 18 of the original 46.) **Plus**
    the newly-identified `POST /oc/service-actions` opaque-entityId
    question from the prior update.
- **Update (2026-08-24, `risk_014_triage_test_3` — a corrected, more
  complete mechanical sweep, plus 3 more real gaps it found)**: **an
  honest correction to this session's own earlier audit claim.**
  `dependency_analysis_test_1`'s "final mechanical audit pass" (see this
  file's own earlier update above) claimed "re-ran the same mechanical
  script across ALL route files ... covering all 451 real registered
  routes in the platform" and found only 2 more candidates. That script
  is now known to have had incomplete method coverage — re-deriving it
  from scratch to actually parse every `server.<method>()` registration
  (GET/POST/PUT/PATCH/DELETE, not evidently GET/POST alone) across every
  route file finds **512 real registered routes, not 451**, and a
  materially larger real candidate set (69, vs. the 2 claimed). This is
  disclosed plainly rather than left standing: the earlier "only 2 more"
  claim was **wrong**, not merely incomplete-by-design — it should have
  said "2 more found by a script that does not parse PATCH/PUT/DELETE
  registrations," not "2 more, full stop." The corrected script and its
  full 69-candidate output are preserved in this update for anyone
  re-running this triage.
  - Of the 69, most are already-triaged `/oc/**` routes now confirmed
    safe by the updates above (`/oc/me/*`, lifecycle/discovery/
    assessment body-clientId group, capabilities/compliance/service
    -bundles catalog group, `jira/issues`, `jira/config` GET, staff
    -roles bootstrap, invitations lookup/accept), OR routes belonging to
    a **different product surface entirely** — the original
    merchant/brand/review/pricing comparison-marketplace routes
    (`/api/v1/admin/brands/*`, `/api/v1/merchants/*`,
    `/api/v1/admin/merchants/*`, `/api/v1/admin/verifications/*`,
    `/api/v1/admin/reviews/*`, `/api/v1/prices`, `/api/v1/offers`,
    `/api/v1/platform/services/*`, etc.) — which RISK-014's own scope has
    never been (it has always been specifically about the Enterprise
    Operations Centre's `/oc/**` surface). These are **disclosed here as
    a real, separate, out-of-scope-for-RISK-014 finding**, not silently
    dropped: that whole surface has never had an equivalent mechanical
    RBAC-gap audit performed against it this session, and should get one
    as its own dedicated pass, not folded into this entry.
  - **3 real, confirmed, previously-undisclosed `/oc/**` gaps — FIXED**
    this pass, each verified via grep to be called only by staff
    `(app)/platform/*` pages, never the customer `(portal)`:
    `GET /oc/platform/commercial/summary` (real, cross-client AskABD
    commercial/financial data — same shape and severity as the
    already-fixed Portfolio Intelligence gap); `GET /oc/workflow
    /executions` (every client's real automation-execution history when
    no `?clientId=` filter is supplied — same unscoped-aggregate-leak
    shape as the already-fixed `GET /oc/notifications`); `POST /oc
    /workflow/rules` and `PATCH /oc/workflow/rules/:ruleId/toggle`
    (unprotected writes to the platform's own automation-rule
    definitions — an integrity risk: any authenticated identity could
    create arbitrary rules or disable real escalation/notification
    automation). All 3 (4 routes) gated `Admin.Access`, live-proven with
    `risk-014-triage-test-3.test.ts`, 7/7 passing. `GET /oc/workflow
    /rules` (read-only rule definitions, no client data) investigated
    and left deliberately ungated — genuinely global config, the same
    reasoning already applied to `GET /oc/capabilities`.
- **Update (2026-08-29, `risk_014_triage_test_4`)**: closed the
  deliberately-left-OPEN `POST /oc/service-actions` item from
  `risk_014_triage_test_1`. **RESOLVED**: real `Admin.Access` rule added
  (matching its already-gated `GET /oc/service-actions/:entityId`
  sibling), live-proven with `risk-014-triage-test-4.test.ts`, 4/4 passing
  (customer 403, unauthenticated 401, staff unaffected, GET sibling
  re-confirmed still gated). `recordServiceAction()` has zero
  entity-existence/ownership check on its caller-supplied
  `entityType`/`entityId` (no FK exists) — confirmed via grep this route's
  only real callers are staff `(app)` pages, never the customer
  `(portal)`, so gating it breaks no live capability. See
  `docs/evidence/security/risk_014_triage_test_4/`.
  - **A second, broader, real finding from the same investigation**:
    tracing this route's actual frontend caller (`service-controls.tsx` →
    `recordServiceAction` in `apps/web/src/app/lib/operations-api.ts`)
    found `ocFetch` — the shared fetch wrapper for **17 exported
    functions**, imported by **11 real staff files** (client onboarding,
    edit, lifecycle, contracts, dynamic client overview, verify,
    remediation, file upload/download) — sent **no Authorization header
    at all**. The API's real auth middleware only reads
    `request.headers.authorization`, no cookie fallback. Invisible in
    local dev only because of `devBypass` (no `JWKS_URL` configured); in
    production (real JWT verification active, this platform's own
    documented posture) every one of these 17 functions would 401 for
    every staff user — a real reliability break across 11 real
    pages/components, not merely a security-shaped gap. Same root cause
    `lib/staff-session.ts`'s own doc comment already documents for Server
    Components' `apiSafe()` — this is that bug class's previously
    -unfound client-side sibling, in a different file. **FIXED**:
    `ocFetch` now attaches the real staff session's bearer token via
    `getStaffSession()`, with the same retry-once-on-401-after-renewal
    policy `staffFetch` already uses — matching the established pattern,
    not a new one.

---

## RISK-015 — `POST /oc/jira/webhook` has no real signature/shared-secret verification despite documentation claiming it does

- **Status**: `RESOLVED` (2026-08-24, `risk_015_jira_webhook_signature
  _test_1`) — real, cryptographic HMAC-SHA256 verification implemented
  and live-proven; see below for the full fix.
- **Severity (as found)**: Medium — not a read-exposure leak; a real
  integrity/spoofing risk (an authenticated identity that knows/guesses
  a real linked `issueKey` can falsely mark another client's defect
  `verified`/`resolved`) plus a real documentation-accuracy gap (a
  security control is described as implemented and is not)
- **Found in**: `risk_014_triage_test_2` (2026-08-24), continuing the
  RISK-014 individual-triage pass into the `/oc/me/*`/OTP/jira-webhook
  group
- **Root cause**: `docs/production-connection-readiness.md` documented
  "Shared secret header validation" as this webhook's production auth
  mechanism; the real handler in `operations-center-routes.ts` performed
  only structural payload validation, no secret/signature check existed,
  and no `webhookSecret`-equivalent config field existed anywhere in the
  codebase — the documented control was never actually implemented.
- **The real fix** (2026-08-24, `risk_015_jira_webhook_signature_test_1`):
  - **Real raw-body capture** (`middleware/raw-body.ts`, new): a custom
    Fastify JSON content-type parser, behaviorally identical to the
    default one for every other route, additionally stashes the exact
    raw request bytes. Required because an HMAC computed by a real
    sender covers the exact bytes it sent — `JSON.stringify(parsedBody)`
    is NOT guaranteed to reproduce them (key order, whitespace, unicode
    escaping can all differ) — proven by a real test that signs one byte
    -ordering and sends a semantically-identical-but-differently-ordered
    one, and confirms it is correctly rejected.
  - **Real secret generation** (`POST /oc/jira/webhook-secret`,
    Admin.Access-gated): generates a genuine 256-bit random secret
    (`crypto.randomBytes(32)`), stores it through the same
    `SecretProvider` seam already used for the Jira API token, and
    returns it in PLAINTEXT exactly once (never retrievable again).
    Regenerating immediately invalidates the previous secret — live
    -proven.
  - **Real cryptographic verification** (`verifyWebhookRequest` in
    `jira-integration-service.ts`), Stripe/GitHub-style: the client
    signs `${unixTimestampSeconds}.${rawBody}` with HMAC-SHA256, sent as
    `X-AskABD-Webhook-Signature` + `X-AskABD-Webhook-Timestamp`. Verifies,
    in order: (1) a secret exists for this environment at all — **fails
    CLOSED** if not (a real change from the pre-fix behavior, which
    accepted everything); (2) signature header present; (3) timestamp
    header present, numeric, and within a real 5-minute tolerance window
    (rejects both a stale captured request and a future-dated one); (4)
    the HMAC matches, compared via `crypto.timingSafeEqual` (constant
    -time, avoiding a timing side-channel), with a length-mismatch guard
    so a malformed header cannot throw instead of failing cleanly; (5)
    real, DB-backed anti-replay — `oc_jira_webhook_deliveries`,
    `UNIQUE(environment, signature_hash)` — a byte-identical replayed
    request is rejected via a real unique-constraint violation, not an
    in-memory set that would reset on every process restart.
  - **A real bug this pass's own middleware-chain testing caught before
    it shipped**: adding `/api/v1/oc/jira/webhook` to `server.ts`'s
    `publicRoutes` (required — a real Jira webhook can never present a
    bearer token) uses prefix matching
    (`path === r || path.startsWith(r + '/')`). The secret-generation
    route was originally named `POST /oc/jira/webhook/secret` — nested
    under the now-public path — which the prefix match silently made
    PUBLIC TOO (any unauthenticated caller could have generated/rotated
    the signing secret). Caught by this pass's own test suite (`a
    customer token is denied` / `unauthenticated is denied` both failed
    with 201 instead of 403/401) before being committed. Fixed by
    renaming to the sibling path `POST /oc/jira/webhook-secret` (not
    nested under `/oc/jira/webhook`), re-verified clean. Mechanically
    checked the two pre-existing `publicRoutes` entries
    (`/oc/invitations/lookup`, `/oc/invitations/accept`) for the same
    class of bug — neither has any nested sibling route, so neither was
    ever actually exposed to it.
  - **Honest, disclosed production-configuration requirement** (not a
    fabricated "fully automatic" claim): native Jira Cloud "classic"
    webhooks cannot compute this signature themselves. A real production
    deployment needs either a Jira Automation rule with a custom-header
    expression that computes the HMAC, or a small relay holding the same
    secret in front of this endpoint. `docs/production-connection
    -readiness.md`'s DEP-014 section corrected with the full real setup
    procedure.
- **Regression test evidence**: `apps/api/tests/risk-015-jira-webhook
  -signature.test.ts`, 14/14 passing — valid signature accepted; missing
  signature/timestamp rejected; malformed timestamp rejected; stale
  timestamp rejected; wrong secret rejected; tampered body rejected;
  exact replay rejected; secret rotation invalidates the old secret;
  raw-byte-exactness proven; secret-generation route RBAC (customer 403,
  unauthenticated 401, staff 201) proven.

---

## RISK-016 — the comparison-marketplace surface had never had a complete RBAC + tenant-isolation audit run against it

- **Status**: `RESOLVED` (2026-08-25, `risk_016_marketplace_rbac_test_1`)
  for the confirmed real gaps below. The `/api/v1/platform/services/**`
  family from the original disclosure was investigated separately and
  found to already be internal, non-tenant, staff-observability data
  (health/registry/preflight status) with no client or user data exposed
  — left ungated deliberately, not a gap (see that section's own routes
  for the real shape: no client_id, no user-owned records, platform
  -operational status only).
- **Severity (as found)**: High for the merchant/brand/review admin
  gaps below — real, confirmed, any-authenticated-identity write access
  to business-critical state (approve/suspend a merchant, moderate
  content, create/archive a brand).
- **Found in**: `risk_014_triage_test_3` (2026-08-24) disclosed this
  surface as untriaged; `risk_016_marketplace_rbac_test_1` (2026-08-25,
  per the "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION
  PHASE" directive's Phase 1) performed the complete audit — every real
  route in `api-routes.ts`, `merchant-brand-routes.ts`,
  `price-routes.ts`, `review-routes.ts` read in full and checked against
  `rules.ts`, not pattern-matched.
- **Confirmed via grep**: this entire surface has **zero frontend
  consumers anywhere in `apps/web`** — a live, reachable, but wholly
  unused product surface today. This does NOT excuse leaving real
  vulnerabilities open (a live API is a live API regardless of whether a
  UI calls it), so every confirmed gap below was still fixed.
- **The real fixes**:
  1. `GET /admin/templates/:id/attributes` had no rule at all (every
     sibling `/admin/templates/*` route requires a real `Template.*`
     permission) — added `Template.Read`.
  2. **A methodology finding, not just a missing rule**: THREE
     pre-existing `rules.ts` entries (`POST /api/v1/merchants`,
     `PUT /api/v1/merchants/:id`, `POST /api/v1/merchants/:id/verify`)
     matched **no real registered route at all** — the actual routes are
     `/merchants/register` (no plain `POST /merchants` handler exists),
     no `PUT /merchants/:id` handler exists anywhere, and verification
     review is `/admin/verifications/:id/review`, never
     `/merchants/:id/verify`. These dead rules gave a false impression
     that merchant approval/verification was protected while the REAL
     routes handling that exact logic
     (`/admin/merchants/:id/approve|suspend|reactivate`,
     `/admin/verifications/:id/review`) had zero RBAC coverage — any
     authenticated identity of any role could approve, suspend,
     reactivate, or verify ANY merchant. Corrected to target the real
     paths with the pre-existing `Merchant.Approve` permission (already
     correctly scoped to `admin`/`super_admin` in `roles.ts` — reused,
     not invented).
  3. All 4 `/admin/brands*` write routes (create/update/archive/restore)
     had no rule at all — the one brand-related rule that did exist,
     `POST /api/v1/brands`, also targeted a non-existent path (the real
     routes are all under `/admin/brands*`). Gated `Admin.Access` (no
     dedicated `Brand.*` permission exists in `roles.ts` — a real,
     disclosed gap in the permission model itself, not fabricated here).
  4. `GET /admin/reviews/pending` (the full moderation queue) and
     `POST /admin/reviews/:id/moderate` had no rule at all — any
     authenticated identity could read every pending review platform
     -wide or approve/reject ANY review, including bypassing moderation
     on its own spam/fake reviews. Gated `Admin.Access`.
  - `POST /merchants/register` deliberately left `authenticatedOnly`
    (not gated to `Merchant.Create`) — confirmed as the correct,
    intentional design: `Merchant.Create` is held only by the
    `merchant` role in `roles.ts`, so requiring it here would make
    registration impossible for the very identities registering to
    BECOME a merchant (a real chicken-and-egg case the code's own
    `status:'pending'` on registration already assumes).
  - `POST /merchants/:id/verification`, `POST /merchants/:id/branches`,
    `POST /prices`, `POST /offers` given explicit `authenticatedOnly`
    rules (matching their actual pre-fix behavior exactly — no
    functional change, added for auditability) rather than left as
    silently-implicit default-policy behavior — each is disclosed as
    having a real, deeper ownership gap tracked separately as RISK-017
    (a shallow permission gate cannot fix an ownership check that has no
    schema to check against).
- **Regression test evidence**: `apps/api/tests/risk-016-marketplace
  -rbac-test-1.test.ts`, 16/16 passing — customer 403 / unauthenticated
  401 / staff not-blocked on every fixed route, plus an explicit proof
  that a `business_user` role (not `admin`/`super_admin`) is correctly
  ALSO denied `Merchant.Approve`-gated actions, and that merchant
  self-registration remains correctly reachable to any authenticated
  identity.

---

## RISK-017 — the comparison-marketplace's `user_id`/`reviewerId` fields trust the client, with no real identity-mapping bridge to fix it against

- **Status**: `OPEN` — a real, confirmed IDOR, deliberately NOT
  shallow-patched (see below for why a naive fix would itself be wrong)
- **Severity**: High for the read path (`GET /comparisons?userId=`);
  Medium for the write paths (`POST /comparisons`, `POST /reviews`,
  `POST /admin/verifications/:id/review`'s `reviewerId`) — attribution
  spoofing rather than direct data exposure.
- **Found in**: `risk_016_marketplace_rbac_test_1` (2026-08-25), reading
  `comparison-service.ts`, `review-service-prisma.ts`, and
  `merchant-brand-prisma.ts` in full while auditing the marketplace
  surface for RISK-016.
- **The real gap**: `POST /comparisons` and `POST /reviews` accept a
  `userId` directly from the request body with zero verification it
  matches the caller's real identity — any authenticated identity can
  create a comparison or post a review ATTRIBUTED to an arbitrary other
  `userId`. Worse: `GET /comparisons?userId=<anything>` (`Comparison
  Service.listByUser`) returns that user's full saved-comparison list —
  including private ones; `isPublic` is never checked in that query at
  all — to ANY authenticated identity that supplies the right (or
  merely guessed/enumerated) `userId`, a real information-disclosure
  path, not merely a write-spoofing one. `POST /admin/verifications
  /:id/review` has the equivalent gap for `reviewerId`.
- **Why `auth.userId` cannot simply be substituted in — this is not a
  shallow oversight, it is a real architectural gap**: `comparison.
  user_id` and `review.user_id` are `@db.Uuid` columns with **no `User`
  model anywhere in `prisma/schema.prisma`** — confirmed by grep. There
  is no foreign key, no real users table, nothing to bind them to. Real
  askabd-identity's `auth.userId` (the JWT `sub` claim — literally the
  string `'dev-user-000'` in this environment's dev-auth-bypass mode,
  and not guaranteed UUID-shaped in production either) is a DIFFERENT
  identity system that this marketplace module was never actually wired
  to. Force-substituting `auth.userId` into these UUID-validated fields
  would immediately break every dev/test caller (a non-UUID string
  fails the existing `z.string().uuid()` schema) and would silently
  conflate two identity systems that have no real, verified mapping
  between them today — a technically wrong fix dressed up as a real
  one, exactly the kind of shortcut this session's own discipline exists
  to catch.
- **Why not fixed this pass**: the real fix is a genuine, separate
  feature — a `marketplace_identity_mapping` table (or equivalent),
  analogous to the Operations Centre's own real
  `client_identity_mapping` (see `tenant-access.ts`'s doc comment for
  that precedent), resolving a verified `auth.userId`/org context to a
  stable marketplace-internal user UUID server-side, never trusting a
  client-supplied value. Given this ENTIRE marketplace surface has zero
  real frontend consumers (confirmed by grep across `apps/web` — see
  RISK-016), building that bridge now would be speculative engineering
  for a product surface nobody currently uses, not the highest-value
  security work available. Disclosed plainly rather than either ignored
  or patched with something that would not actually be correct.
- **Suggested fix**: when (if) this marketplace surface gets a real
  frontend, build the identity-mapping bridge as part of that work — a
  real, verified `auth.userId` → marketplace `user_id` resolution,
  exactly as `client_identity_mapping` already does for the Operations
  Centre. Until then, the safest mitigation available without that
  bridge would be to gate `GET /comparisons` and `POST /comparisons`/
  `POST /reviews` behind `Admin.Access` (removing the ability for any
  ordinary authenticated identity to exploit this at all) — not applied
  this pass because it would break the intended self-service shape of
  those actions for the same "no real consumer to break" reasoning that
  applies throughout this entry; worth a dedicated decision, not a
  silent default.
- **Regression test evidence**: `risk-016-marketplace-rbac-test-1.test.ts`
  includes a real, live proof of the `GET /comparisons?userId=` gap
  (not a 401/403 — RBAC correctly requires authentication but cannot
  express the missing ownership check) — a documentation test, not a
  fix, so its presence in the passing suite must not be read as "this
  is resolved."

---

## Mechanical cross-reference

Every `RESOLVED`/`MITIGATED` entry above has a matching row correction in
`docs/eoc-feature-coverage-matrix.md` (rows #9, #17, #18, #19, #25, #55,
#80 across this session's passes) and a full evidence write-up under
`docs/evidence/<feature>/`. Every `OPEN` entry is a real, live, currently
-true gap — not resolved by any later pass unless this register is updated
alongside the fix, matching the same evidence discipline.
