# Final UAT Readiness Report

**Status:** IN PROGRESS — this document is updated live during the 2026-08-20
master UAT-readiness pass. Do not treat any section as final until the
"FINAL SIGN-OFF" section at the bottom exists and is dated.

## Baseline (established before any change this pass)

- **askabd-comparison**: branch `feature/reliability-hardening`, HEAD
  `283cfdcd05aa4d0d84e577c4840354a9bea8677f` — unchanged all session, nothing
  committed.
- **askabd-identity**: branch `master`, HEAD
  `77f76f8366c5db3f3bee99bb43a193270e265a2e` — unchanged all session, nothing
  committed.
- Docker: `identity-postgres`, `comparison-postgres`, `identity-redis`,
  `askabd-mailpit` — all healthy, 6h+ uptime, never recreated this session.
- `npm run health` (from `askabd-comparison` root): all 11 checks green
  immediately before this pass began.
- Full regression immediately prior to this pass (previous turn, same session):
  API 358/358, Identity 204/204, Web 33/33; all three `tsc --noEmit` clean; all
  three production builds clean.
- **Real, non-fixture data discovered on the running system at baseline**: a
  second real client, **`Test1`** (`client-9a2a1b23-5872-45d5-8246-2f0ba05bc691`),
  was created via the real `/clients/onboard` flow at 2026-08-19T21:53:45Z —
  moments before this pass started, evidently by the user directly exercising the
  app. This is real data, not a fixture created by any assistant turn, and is
  preserved exactly like `AskABD Manual UAT 2026`.

## Scope note (read before the checklist below)

The governing instruction for this pass is a 35-part, full-platform
release-readiness brief. It is being executed in priority order — correctness
and security first, then UX/consistency, then documentation — with real,
verified, tested changes only. Sections below are filled in as work completes,
not planned in advance and left unchecked. Anything genuinely out of safe reach
in a single pass (a new architecture invented from nothing, a production
credential, an ambiguous product decision) is named explicitly at the end, never
silently dropped.

---

## Work log

### 1. Requirements engine — root-cause fix, live-verified (the headline reported bug)

**Found:** `requirements-service.ts`'s `mapRow()` never copied a simple (non
multi-field) requirement's `options` array into the API response — the
`ClientRequirement` type didn't even declare the field. Every single-field
`select` requirement (Primary Cloud Provider, SSL Mode) reached the UI with
`fieldType: 'select'` and zero options. The frontend then compounded it:
`requirement-workspace.tsx` hardcoded `options: undefined` when building the
synthetic field for a simple select, discarding whatever the backend sent even
after the first bug was fixed.

**Fixed:** both. `options?: string[]` added to `ClientRequirement` and
populated from the real catalog in `mapRow()`; the frontend now passes
`req.options` through. Added a real "Other → please specify" companion input
with its own save-time validation (previously no such affordance existed
anywhere in this component).

**Live-verified end to end** on the real `Test1` client (created by the user
moments before this pass, at the exact `environment-registered` lifecycle
step the screenshot showed): dropdown now shows `AWS / Azure / Google Cloud /
On-Premise / Hybrid / Other`; selected AWS; saved; requirement flipped
`not_provided → provided`; blockers went `1 → 0`; readiness went
`blocked → ready`; a real `requirement_updated` audit row was written; value
persisted across a full page reload.

### 2. Audit attribution — real identity, not fabricated 'admin'

**Found:** 8 frontend files (`requirement-workspace.tsx` and 7 client-detail
pages: audit, engagements, lifecycle, migrations, recommendations, services,
verify) hardcoded `actor: 'admin'` on every state-changing call, regardless of
which real staff member was actually signed in — a real violation of "audit
entries must reference real IDs, never fabricate."

**Fixed:** all 8 now send the real, authenticated staff identity's own id
(`getStaffSession()?.identityId`). Genuinely system-triggered events
(`actor: 'system'` for auto-verification-from-onboarding-data, automated
validation-passed transitions) were left untouched — those are honest, not
fabricated.

### 3. Case-insensitive authentication (askabd-identity), passwords unaffected

**Found:** every identifier/org_context lookup in `identity-manager.ts` and
`auth-service.ts` was an exact-case string match — "HELLO@ASKABD.COM" and
"hello@askabd.com" were two unrelated login attempts.

**Fixed, with the real safety hazard identified and closed:** making the
lookup case-insensitive without care would have let a login typed in the
wrong case issue a session/token carrying that WRONG-case `org_context` —
silently breaking every downstream tenant check in askabd-comparison (which
stores/compares `client_identity_mapping.org_context` as originally cased).
The real fix: `findIdentity()` now matches case-insensitively but returns the
identity's own canonical, as-stored `org_context`; `login()` uses that
canonical value for the session, the token, lockout tracking, and every audit
entry — never the caller-typed string. `identity-manager.ts`'s identifier
uniqueness check and `getByIdentifier()` are likewise case-insensitive; new
identities are stored with a normalized (trimmed, lowercased) identifier.
`org_context` is intentionally NOT normalized at identity-creation time or
anywhere in askabd-comparison this pass — a real, larger, cross-repo decision
flagged below, not touched without full tracing.

**Live-verified**: `HELLO@ASKABD.COM` + `ASKABD-INTERNAL` logged in
successfully and the issued token's `org` claim was the real, canonical
`askabd-internal` — not the typed casing. A wrong-case password was correctly
rejected (passwords remain fully case-sensitive; `verifyCredential` untouched).
9 new regression tests (5 in `auth-service.test.ts`, 4 in
`identity-manager.test.ts`), including one that specifically proves the token
carries the canonical casing.

### 4. Customer portal — real client name, not a raw UUID, as the primary heading

**Found:** `client-portal/[clientId]/page.tsx` rendered `<h1>Client Portal</h1>`
with the literal `client-<uuid>` as its subtitle — a real, reported UX defect.

**Fixed:** fetches the real, tenant-scoped `GET /api/v1/oc/clients/:id` (the
same endpoint the multi-workspace picker on `/login` already used
successfully) and shows the real client name as the heading
("AskABD Client Portal" / "Test1"). The technical id is still available (a
small `ⓘ` with the id in its hover title) but is no longer the primary UX.
**Live-verified** with a real temporary invitation accepted against the real
`Test1` client — header showed "Test1", not the id — fixture then deleted by
exact id.

### 5. Session renewal, invitation lifecycle (carried over from the immediately
prior turn in this same session — see `docs/session-architecture.md` and
`docs/invitation-lifecycle.md` for full detail, unchanged and reconfirmed
still green this pass): proactive+reactive token renewal on both staff and
customer surfaces; persistent-invitation-object model with a real Postgres
unique-partial-index concurrency guard; existing-account "pending invitation"
discovery via plain login (no email link required); multi-client acceptance.

## Regression (this pass, final run)

- API: **358/358** passing, `tsc --noEmit` clean, production build clean.
- Identity: **213/213** passing (204 baseline + 9 new case-normalization
  tests), `tsc --noEmit` clean, production build clean.
- Web: **33/33** passing, `tsc --noEmit` clean, production build clean.
- `npm run health`: 11/11 green, immediately after the final build+restart
  cycle.
- Both repos' git HEAD unchanged from this pass's own baseline
  (`283cfdcd...` / `77f76f83...`); nothing committed, nothing pushed.

## Fabrication audit (Part 2) — findings

- The ~44 client-detail sub-pages still importing `lib/mock-clients.ts`
  (Performance, Applications, Infrastructure servers, Roadmap, Testing,
  Knowledge, Consulting, Contacts, Timeline, Automation, Contracts, Support,
  and more) were traced and confirmed **already safe**: `mockClients.find(c =>
  c.id === clientId)` can never match a real `client-<uuid>` id (mock ids are
  demo brand names like `meridian-financial`), so every real client — both
  `AskABD Manual UAT 2026` and the user's own `Test1` — falls through to
  `CapabilityPlaceholder`, an honest "no dedicated tracking exists yet for
  this client" state with real navigation to real data elsewhere. This was a
  real fix from an EARLIER pass (see the component's own doc comment); this
  pass re-verified it holds, rather than re-doing it.
- `Math.random()` hits were traced to `lib/deterministic-variance.ts`, a
  seeded, deterministic replacement already in place from an earlier pass —
  confirmed genuinely deterministic (same seed → same output), not fabricated
  per-render variance.
- `localStorage` in `onboarding-lifecycle.ts` is a cache with a real,
  independently-fetchable server source of truth (`fetchServerLifecycle`,
  `requestLifecycleTransition`) — not the authoritative store. Not modified
  this pass; flagged below as worth a deeper trace given Part 12's explicit
  concern about stale local state, which was not fully re-audited end-to-end.

## Genuinely NOT done this pass (named explicitly, not silently dropped)

The governing brief for this pass (Parts 1–35) is a full-platform
release-readiness program. What's above is real, tested, and live-verified —
it is not the entirety of that program. Concretely NOT attempted this pass,
each for a stated reason:

- **org_context case-insensitivity beyond login** (client creation, invitation
  matching, `client_identity_mapping` comparisons, tenant-access.ts) — the
  login fix above is deliberately scoped to what could be made safe with full
  tracing in the time available; extending it further touches the tenant
  boundary itself across two repos and needs the same care applied to every
  consumer, not a partial pass.
- **Customer self-service requests** (Part 6/14 — "Request a service",
  "Request a connector") and a formal **Request** entity/status
  machine — a genuine net-new feature requiring a DB migration + service +
  routes + UI; not started, to avoid inventing a half-finished parallel
  workflow next to the platform's real, existing service/requirement
  architecture.
- **A dedicated global-search UI keyboard shortcut (Ctrl/Cmd+K)** and a full
  audit of every search result type against tenant scope beyond what the
  existing, previously-verified `global-search.test.ts` already covers.
- **A systematic responsive audit at 375/390/768/1024/1440px** across every
  listed page — not performed as an exhaustive sweep this pass; the pages
  touched directly (login, portal header, requirements panel) were visually
  confirmed at desktop width only.
- **Login error-message specificity** (Part 3D: distinct "organization not
  found" / "email not found" / "wrong password" messages) — NOT implemented.
  This directly conflicts with `AUTH_ERROR`'s deliberate, already-documented
  R3.2/R3.3 non-disclosure design (uniform error regardless of failure
  reason, to prevent account enumeration) and with this platform's own
  established R5.6 no-enumeration policy used elsewhere (password reset).
  Implementing per-field disclosure — even gated to non-production — would
  mean maintaining two different security postures in the same code path;
  this needs an explicit decision, not a unilateral security-policy change,
  so it was left as-is rather than guessed.
- **A dedicated "Customer Activity" audit UI** aggregating login/OTP/
  session-renewal/invitation events into one client-scoped view — the
  underlying data (`oc_audit_log`, `oc_notifications`) is real and already
  captures much of this; a purpose-built aggregation page was not built.
- Full identity admin-route permission model (roles/audit/webhooks) —
  unchanged from the prior pass's documented blocker
  (`docs/identity-unauthenticated-routes-audit.md`).

## Second pass (same day, continuation) — customer self-service, search, identity admin routes

### 1–2. Customer self-service — service & connector/source requests (NEW, real, tested)

Migration `033_client_requests.sql` (`oc_client_requests`) + `client-request-service.ts`
+ `client-requests-routes.ts`. Reuses, never duplicates, the real existing
service model (`oc_capabilities`/`oc_client_services`) and connector model
(`oc_connectors`) — `transition()`'s real state machine
(`requested → under_review → approved → in_progress/rejected → completed`,
enforced, no illegal jumps) calls the SAME enable logic the staff Services
page already uses when a service request is approved, and creates a real
`not_configured` (never fabricated `connected`) connector row on connector-request
approval. Full customer-portal UI (real service dropdown sourced from the live
catalog, request modal, Requests tab, status badges) and a new staff
`/clients/:id/requests` management page, added to the nav (which also
surfaced a pre-existing bug: `/invitations` had no nav entry either — fixed
alongside). **Live-verified end to end** on the real `AskABD Manual UAT 2026`
client: real customer submitted a real "Business Case Generation" service
request → staff saw it with full requester metadata → approved it → the real
`oc_client_services` row was created (`status: enabled`, `enabled_by`: the
real staff identity) — then reverted and all fixtures deleted by exact ID.
19 new backend tests (tenant isolation, RBAC, real linkage on approval, state
machine enforcement).

### 3. Client-scoped search (NEW, real, tested)

`client-search-service.ts` + two new routes: `/oc/clients/:id/search` (staff)
and `/oc/portal/:id/search` (customer). Distinct from the pre-existing
cross-client `/oc/search` — this searches WITHIN one client's workspace
(requirements, services, connectors, problems/gaps/incidents/recommendations
[staff-only], migrations, CRM contacts/notes/tasks, and the new client
requests), addressing "too many tabs to find one thing." Customer scope is
visibility-filtered identically to CRM's own portal routes (never a broader
set). Wired into the customer portal header as a live search box with
results linking to the real page. 8 new tests proving real results and real
tenant isolation (`customer A → client B` = 403, not silently-empty results).

### 4. Identity admin routes — the last documented blocker, now closed

`askabd-identity`'s `role`/`role_assignment`/`permission` tables (migration
001) existed but were completely empty — the real reason `/roles`,
`/roles/assign`, `/roles/revoke`, `/policy/check`, `/audit/events`, and
`/webhooks` were left unauthenticated in the previous pass. Fixed by seeding
real data into those EXISTING tables (`scripts/seed-admin-role.mjs`,
idempotent) rather than inventing new authorization architecture, and adding
`requireAdmin()` (`api-routes.ts`) — a bearer-token check followed by a real
`AuthorizationService.check()` call, the exact same engine `/policy/check`
itself already exposed. Seeded for this checkout's real known operator
(`hello@askabd.com` / `askabd-internal`). **Live-verified**: no token → 401;
a real but non-privileged identity's token → 403; the seeded operator's token
→ 200 (real audit read succeeded). 6 new tests, full identity suite 219/219.
`docs/identity-unauthenticated-routes-audit.md` updated to reflect closure.

### 11. Organization case-normalization audit (completed)

Traced every `org_context` comparison in askabd-comparison. Confirmed the
prior pass's login-side fix (canonical org_context always used for session/
token issuance) already closes the common case correctly. Found and closed
one real remaining gap: `client_identity_mapping`'s own read-path comparisons
(`resolveAuthorizedClientIds`, `isAuthorized`) were still exact-case —
meaning two staff members typing the same real organization in different
casing across two invitations would silently fail to combine into one
authorized set. Fixed with the same safe pattern (case-insensitive
**comparison** only, never rewriting what's stored). 1 new regression test.

### 7. Login error UX (implemented, without weakening non-disclosure)

Added real, safe FORMAT-only validation on both login pages (invalid email
syntax → "Enter a valid email address.", malformed organization →
"Organization format is invalid.") — these disclose nothing about whether the
value is real, only whether it's well-formed. The actual authentication
failure message (wrong password/unknown account/locked/MFA-failed — still
100% uniform, still zero disclosure of which factor failed) was reworded from
"The credentials provided are invalid" to "Authentication failed. Check your
email address, organization, and password, then try again." — a pure copy
improvement; the existing non-disclosure test suite (`auth-service.test.ts`)
was updated to assert the real invariant (identical message across every
failure reason) rather than a substring-absence check that no longer matched
the intentionally-more-helpful copy. Live-verified in browser for all three
cases (bad email format, bad org format, wrong credentials).

### Regression (this second pass, fresh, final)

- API: **378/378** (358 + 19 client-requests/search + 1 org-case test)
- Identity: **219/219** (213 + 6 admin-route tests)
- Web: **33/33**
- All three `tsc --noEmit` clean, all three production builds clean (web
  rebuilt from a fully-cleared `.next`).
- `npm run health`: 11/11 green, confirmed in a genuinely fresh browser tab
  immediately before this report was finalized — zero console errors.
- Both repos' git HEAD unchanged from baseline; nothing committed, nothing
  pushed; `AskABD Manual UAT 2026` and the user's own `Test1` client both
  confirmed present and untouched.

### Explicitly NOT done this second pass (named, not hidden)

- **Lifecycle UX compact redesign** (Part 8) — the existing lifecycle page
  was NOT rewritten into a compact step-by-step timeline. This is a
  substantial UI rewrite of an already-large, working page; attempting it in
  the remaining time risked a real regression on a page every other fix this
  session depends on rendering correctly. The underlying data this redesign
  would consume (real per-requirement status/blockers) is already correct and
  already live-verified (see the Primary Cloud Provider fix) — only the
  visual density is unaddressed.
- **Systematic 375/390/768/1024/1440px responsive sweep** across every listed
  page — not performed exhaustively; only the pages directly touched this
  pass were visually confirmed, at desktop width.
- **A dedicated staff-side client-scoped search UI widget** — the backend
  route exists and is tested; only the customer-portal search box was wired
  into the UI this pass, for time reasons.
- **A full "Customer Activity" aggregated audit UI** spanning BOTH
  askabd-identity's own login/OTP/session events (a separate database) and
  askabd-comparison's business events — not built; the real data for the
  comparison-side half already exists in `oc_audit_log` (browsable via the
  existing `/clients/:id/audit` page), but a true cross-service aggregation
  is a genuinely separate integration project, not attempted unilaterally.

## Third pass (same day, continuation) — staff search UI, cross-service activity, lifecycle compact view, duplicate prevention

### Phase 1 — Staff-side client-scoped search UI (real, wired in)

`ClientSearchBox` component mounted in the client layout (every client-scoped
page): Ctrl/Cmd+K opens it, real results from the already-built
`/oc/clients/:clientId/search`, click navigates to the real page. Live-verified
at both desktop and 375px mobile width — real result returned ("Platform
Health Monitoring · Services · not_confirmed"), dropdown fits the viewport
with no overflow either direction.

### Phase 2 — Cross-service Customer Activity (real, new)

`customer-activity-service.ts` aggregates real `oc_audit_log` rows with real
askabd-identity audit events fetched over its real HTTP API (the caller's own
bearer token forwarded — identity's own `requireAdmin()` from the prior pass
is the actual gate, no new auth logic invented). Normalized into one shape
(module/result/source), real pagination, real filters (module/status/date/
sort). New `/clients/:id/activity` staff page. **Live-verified via a real
test** using the real seeded admin login — confirmed identity-side events
genuinely returned, not just comparison-side. 6 new tests.

### Phase 3 — Lifecycle compact redesign (additive, real engine unchanged)

The two most space-consuming blocks (the "Why is this step required?"
narrative and the full 20+-row "Complete Lifecycle Timeline") are now real
`<details>`/`<summary>` disclosures, collapsed by default — same real data,
same real lifecycle engine, nothing removed or rewritten, just not
force-expanded on load. Live-verified: both collapsed by default, both expand
correctly on click. (A transient SWC parse-error console message during
verification was chased down and confirmed to be a stale browser-tab
artifact, not a real defect — a completely fresh tab, a real `tsc --noEmit`,
and the final production build all confirm the file is genuinely valid.)

### Phase 8/9 — Duplicate-request prevention (real gaps found and closed)

`ClientRequestService.create()` previously had no duplicate/already-active
checks at all. Fixed: a second request for the same (client, type, target)
while one is still open (`requested`/`under_review`/`approved`/`in_progress`)
now reuses the existing row instead of creating a duplicate; a request for a
service already `enabled` or a connector already `connected`/`configured` is
refused (`409 already_active`) with a clear message, surfaced in the customer
portal UI. 4 new tests.

### Regression (this third pass, fresh, final)

- API: **388/388** (378 + 6 activity + 4 duplicate-prevention)
- Identity: **219/219** (unchanged — not touched this pass)
- Web: **33/33** (unchanged — new UI has no dedicated unit tests this pass,
  covered by live browser verification instead)
- All three `tsc --noEmit` clean, all three production builds clean (web
  rebuilt from a fully-cleared `.next`; the `/clients/[clientId]/requests`
  and `/activity` routes both confirmed present in the build output).
- `npm run health`: 11/11 green in two independently-opened fresh tabs
  (`/staff/login` and `/login`), zero console errors on either.
- Both repos' git HEAD unchanged; nothing committed, nothing pushed.

### Explicitly NOT done this third pass

- The full 375/390/768/1024/1440px sweep across every listed page — only the
  pages touched this pass (search box, requests, activity, lifecycle) were
  spot-checked at 375px and desktop.
- A dedicated accessibility (Phase 17) pass — not performed as a discrete
  audit; the new UI uses real `<button>`/`<input>`/`role="dialog"` semantics
  and native `<details>` (keyboard-operable by construction) but was not
  tested with a screen reader.
- Customer-facing self-activity view — Phase 2 was built for the
  staff/super-user use case as specified; no customer-facing "my own
  activity" page was added.

## Fourth pass (same day) — canonical UI standard rollout

The user designated the Connector Configuration page as the platform's
**approved canonical enterprise UI pattern** (memory:
`askabd-canonical-ui-standard`) — card shell, expandable rows, real
Stat-card summaries, `Action`/`EvidenceBadge` reuse, no fabricated data —
and asked for an audit + retrofit of every page that violated it.

### Finding: 15 pages were an isolated dark-mode design

A codebase-wide grep for the old inline dark theme (`#0f172a`/`#1e293b`)
found **15 pages** — not just the one originally reported — built as a
completely separate visual system (dark background, inline `style={{}}`
props, ad hoc hex colors) with no relation to the rest of the app's
light Tailwind card design:

- **Client-scoped (9):** services, financial, payments, reconciliation,
  proposals, compliance, optimization, engagements (list + detail)
- **Customer-facing (3):** client-portal home, client-portal journey,
  accept-invitation — the highest-value fixes, since these are what real
  customers actually see
- **Staff platform-level (6, only 6 listed since 3 above overlap the count
  differently — see file list):** capabilities, portfolio, workflows,
  welcome, commercial, services/registry

All 15 were rewritten to the canonical pattern — same data-fetching logic,
same state, same real API calls, only the presentation layer changed
(inline styles → Tailwind, dark → light, ad hoc badges → shared
`Action`/`EvidenceBadge`-style pills, Stat-card summaries added, `+Add More`
affordances preserved/added where multi-record creation exists — engagements,
workflows).

### Verification

- All 15 files: clean `tsc --noEmit`, clean production build (fresh
  `.next`, `next build`), then a dev-server restart (build corrupts the dev
  `.next` cache — the known issue from earlier passes) and a fresh
  `npm run health` — **11/11 green**.
- Live-verified every one of the 15 pages in the real browser against real
  client/platform data (Test1, AskABD Manual UAT 2026, and real platform
  aggregates) — zero console errors on any of them in a fresh tab, zero
  horizontal overflow at 375px mobile on any of them.
- The customer-portal retrofit (the highest-risk file, 641 lines, actively
  used this session for real service/connector requests) was verified via a
  full real customer flow: a real invitation created, accepted through the
  real `/accept-invitation` page and a real Mailpit-delivered link, logged
  in as that real new customer, both `/client-portal/:id` and
  `/client-portal/:id/journey` rendered correctly with real data, the
  "+ Request a Service" modal opened with the real service catalog — all
  with zero console errors. The fixture identity, invitation, and
  client_identity_mapping row were then deleted by exact ID immediately
  after, verified zero orphans remaining. Repeated once more for the
  accept-invitation MFA-free happy path in a second fixture, same cleanup
  discipline.
- Confirmed a genuinely dead grep afterward: zero remaining
  `#0f172a`/`#1e293b` references anywhere under `apps/web/src/app`.
- Full regression re-run after all 15 conversions: API **388/388**
  (unchanged — no backend touched), Web **33/33**, both typechecks and both
  production builds clean, health **11/11**.
- Git: both repos unchanged — `askabd-comparison` HEAD `283cfdcd0` on
  `feature/reliability-hardening`, `askabd-identity` HEAD `77f76f83` on
  `master`. Nothing committed, nothing pushed.

### Explicitly NOT done this fourth pass

- No further sweep for other categories of "isolated design" beyond the
  dark-theme signature searched for (e.g., a page using a wildly different
  spacing/typography scale but still light-themed would not have been
  caught by this grep).
- No dedicated accessibility audit of the newly-converted pages.
- The legacy ~30 `mockClients`-gated demo-only pages were confirmed already
  compliant (real clients get the honest `CapabilityPlaceholder`/
  `NotYetAvailable` empty state, built in an earlier pass) and were not
  touched again.

## Fifth pass (2026-08-21) — urgent Connector Configuration fix: real multi-record database connections

The user reported (with a live screenshot) that the Lifecycle page's
"Connector Configuration" step still did not match the canonical pattern.
Investigation found the reported page was NOT the `/connectors` page (already
canonical from the fourth pass) — it was a completely different, previously
un-inspected section embedded directly in `lifecycle/page.tsx`: a flat,
always-rendered "Service Requirements" list duplicating the real interactive
`RequirementWorkspace` component immediately below it, both driven by SIX
independent, fixed, single-instance requirement records (`database_host`,
`database_port`, `database_name`, `database_username`, `database_password`,
`database_ssl` — see `requirements-service.ts`).

### The real, deeper defect this uncovered

`requirements-service.ts`'s `connector-configuration` service definition
models exactly ONE set of database fields per client — there was no way,
architecturally, for a client to record more than one database connection.
This is the same class of gap as the pre-existing `oc_connectors` table
(`UNIQUE(client_id, provider)`), just for a different subsystem. This is a
real product defect, not a styling issue — "the UI must explicitly support
multiple databases" was structurally impossible before this fix.

### The fix (backend + frontend, both real)

- **New table** `oc_client_database_connections` (migration 034) — NOT
  unique on `(client_id, connector_type)`; a client can have any number of
  named connections.
- **New service** `client-database-connection-service.ts` — real CRUD, real
  server-side validation, real connection testing (genuine multi-step
  PostgreSQL protocol test reusing the exact logic `ConnectorService`
  already has; honest TCP-reachability-only test for Oracle/SQL
  Server/MySQL/MongoDB/Other, since no deeper driver is installed in this
  deployment — disclosed explicitly, never faked). Passwords go through the
  existing `SecretProvider` seam and are never returned by any read path.
- **New routes** (`client-database-connections-routes.ts`, Admin.Access-gated)
  and **6 new backend tests** (`client-database-connections.test.ts`),
  including one proving two connections of the identical `connector_type`
  can coexist for one client — the exact gap being closed — and one proving
  a pure rename never resets a real "Connected" status (a real bug found and
  fixed during this same pass: the edit form always resubmits every field, so
  the invalidation check was changed to compare actual stored values, not
  field presence).
- **New component** `database-connections-manager.tsx` — the canonical
  pattern exactly as specified: card header with live count and a single
  "+ Add Connection" toggle, honest empty state with "+ Add First
  Connection", each connection an independently expandable row (Test / Edit
  / Remove + status pill + last-tested timestamp when collapsed; full detail
  when expanded, password always masked), the add/edit form as an inline
  expandable card (never a modal, never permanently open), real client-side
  validation before submit, single column at mobile.
- **Lifecycle page wiring**: the old duplicated flat list + fixed-field
  `RequirementWorkspace` rendering for this one step is replaced by
  `<DatabaseConnectionsManager>`; the step's "ready to advance" gate now
  checks "at least one connection has genuinely passed a real test" instead
  of the old fixed-field-set readiness endpoint.

### Live verification (real client, real data — Test1, per the user's own
guidance to prefer safe real clients over deleting fixtures)

Test1 was, at the time of this fix, genuinely sitting at this exact
lifecycle step — used directly rather than a synthetic fixture. Executed the
user's own 8-step test plan against the real running app:
1. Zero connections → honest empty state, confirmed.
2. Added a real connection (pointed at the actual local `comparison`
   Postgres) → count became (1).
3. Added a second connection of the SAME technology (`oracle`, a different
   host) → count became (2), proving multi-instance support works end to
   end, not just in the unit test.
4/5. Expanded each row independently — each shows its own real data, neither
   forces the other open or closed.
6. Edited the first connection's name only → only that record changed (and,
   after the fix above, its "Connected" status was preserved rather than
   wrongly reset).
7. Removed the Oracle connection → exactly that record gone, the other
   untouched.
8. Full browser refresh → the remaining connection persisted (real
   Postgres-backed, not local state).
Also ran a real **Test Connection** against both: the real local Postgres
genuinely passed all 6 steps (DNS → port → TCP → auth → query → latency,
"Connected"); the deliberately-invalid Oracle host genuinely failed at DNS
resolution with a clear, honest error — never fabricated success. Confirmed
via `read_network_requests` that the raw password is never present in any
API response body, at create or list time. Confirmed zero console errors in
a fresh tab, zero horizontal overflow at 375px and 768px, and the "Validate
Connectors →" action button correctly went from disabled to enabled only
once a connection genuinely tested as Connected.

### Regression (this fifth pass, fresh)

API 394/394 (one parallel-test-run flake in `customer-activity.test.ts`
reproduced once, then passed clean on immediate rerun in isolation and on a
full-suite rerun — pre-existing, unrelated to this change), Identity
219/219, Web 33/33, all three typechecks clean, all three production builds
clean, health 11/11. Git unchanged both repos — nothing committed, nothing
pushed.

## Sixth pass (2026-08-21) — repo-wide multi-record/security/fabrication audit

Full environment reset at the start of this pass (Docker containers and all
three dev servers had stopped — restarted cleanly, 11/11 health confirmed
before and after).

### Real finding, fixed: hardcoded `actor: 'admin'` audit fabrication (backend)

A repo-wide grep found **~40 real occurrences** across 4 backend files
(`operations-center-routes.ts`, `payment-method-service.ts`,
`financial-reconciliation-service.ts`, `commercial-engagement-service.ts`) —
every one either a literal `actor: 'admin'` or a `caller-supplied-actor ||
'admin'` fallback. This is the backend counterpart of the frontend
`actor: 'admin'` fabrication fixed earlier this session (8 files) — that pass
never touched the API layer. Every audit-log entry written by dozens of real
staff actions (OTP verification, connector test/save, gap/problem/
transformation mutations, capability/metric/rule management, payment method
lifecycle, commercial engagement services/pricing, document uploads, and
more) was being attributed to a fake "admin" identity regardless of who was
actually signed in.

**Fixed**: every occurrence now resolves the real authenticated actor via
`getAuth(req)?.userId`, falling back to the honest `'unknown-staff'` (never
a specific fabricated name) only when no session is present. Three service
methods (`PaymentMethodService`, `FinancialReconciliationService.
createTransaction`, `CommercialEngagementService.addService/removeService/
setPricing`) gained a real `actor` parameter threaded from their route call
sites. Live-verified against the real database: audit rows written during
this session's real browser interactions now show the real staff UUID
(`8d320034-e98e-4e11-8e95-26e75befb70b`), not `'admin'`. `askabd-identity`
and the frontend were re-checked and confirmed already clean (no occurrences
found).

### Real finding, fixed: test suites leaking into the real audit log

While verifying the actor fix, found that this repo's test suites
(`client-database-connections.test.ts` included, following an existing
pattern already present in other test files like `connector-honesty.test.ts`)
delete their fixture business rows in `afterAll` but never clean up the
`oc_audit_log` rows those fixtures generated — leaving permanent orphaned
audit rows in the real shared dev database on every test run. Fixed for the
new `database_connection` entity type (added `afterAll` cleanup + purged 59
pre-existing orphaned rows from this session's own repeated test runs,
scoped strictly to `entity_type = 'database_connection'` — no other rows
touched). **Not fixed platform-wide** — the same gap likely exists in most
of the other 50 test files; a full retroactive audit-log purge across every
entity type was judged out of scope for this pass (audit logs are meant to
be a permanent record, and a blind mass-purge is exactly the kind of "broad
cleanup" this session's standing rules warn against). Flagged honestly as a
real, pre-existing, still-open gap.

### Multi-record backend audit (`UNIQUE(client_id, …)` sweep)

Checked every `UNIQUE(client_id, …)` constraint in the schema. Four are
correct single-instance-per-client designs (service enablement, compliance
control status, service requirement values, notification preferences — none
of these are legitimately multi-record). One — `oc_connectors UNIQUE
(client_id, provider)` — is the same class of gap the Connector Configuration
fix (migration 034) already solved for databases; it still applies to the
SaaS-style connectors (AWS/Azure/GitHub/Kubernetes/etc.) on the canonical
`/connectors` page, where a client can only ever have one connection per
provider today. **Not fixed this pass** — flagged as a known, real, deferred
architectural item (a client with two AWS accounts or two GitHub orgs still
cannot represent both), scoped out given the size of the change already made
for the higher-value database case.

### Fabrication/placeholder sweep — confirmed clean, no new findings

Repo-wide search for `Math.random()`, hardcoded records, `TODO`/`FIXME` in
both `apps/api` and `apps/web`: zero real findings. Every `Math.random()`
hit remaining in source is either the deliberately-isolated legacy
`mock-clients.ts`/`deterministic-variance.ts` demo system (already audited
and confirmed gated behind IDs no real client can ever match) or a code
comment explaining why `randomUUID()` was used instead (artifacts of
earlier fabrication-sweep passes this session). Zero `TODO`/`FIXME` markers
in either app's `src/`.

### Security route audit — re-verified, not re-derived from scratch

`docs/final-adversarial-security-audit.md` (2026-08-19) already documents a
thorough, real, live-proven opaque-ID RBAC audit (48 explicit `Admin.Access`
gates on opaque-ID routes, live cross-tenant denial proven with two real
distinct identities). Spot-checked several of the specific routes it and the
superseded `resource-authorization-register.md` named as gaps
(`problems/:problemId`, `gaps/:gapId`, `defects/:defectId`,
`escalations/:escalationId`, connector test/save) directly against the
current `rules.ts`/`tenant-access.ts` — confirmed all are now covered (the
older doc's "~15 remain uncovered" count is stale; superseded by the newer
doc's own header). No new gap found in this spot-check; did not attempt to
re-derive the full 226-route enumeration from scratch given it was already
done exhaustively two sessions ago with live adversarial proof.

### Database integrity check (real, current)

2 real clients (`Test1`, `AskABD Manual UAT 2026` — both preserved, neither
touched destructively), zero duplicate pending invitations, zero duplicate
connectors/services (the real `UNIQUE` constraints hold), zero orphaned
`client_identity_mapping` rows, zero pending invitations outstanding, 1 real
database connection (the genuine fixture from the fifth pass, kept
intentionally as real UAT data per prior instruction).

### Regression (this sixth pass, fresh)

API 394/394, Identity 219/219, Web 33/33, all three typechecks clean, all
three production builds clean, health 11/11 (after a full environment
restart). Git unchanged both repos — nothing committed, nothing pushed.
Connector Configuration re-verified live and unregressed: real client, real
data, real "Connected" status, real staff actor attribution confirmed in the
database.

### Explicitly NOT completed this sixth pass (honest accounting)

Given the enormous scope of the governing 35-point brief, the following were
**not** exhaustively executed this pass and should not be read as verified:
full MFA replay/enroll/disable cycle re-test, full password-recovery
end-to-end re-test, full responsive sweep at all 5 breakpoints across every
listed page, full customer-side UAT walkthrough (portal/requests/search/
team as the customer role), full visual-consistency sweep (purple shades/
border radius/spacing), and the platform-wide `oc_connectors` single-
instance-per-provider architectural gap. These were either already covered
by earlier passes this session (MFA, password recovery, most of the
responsive/visual work) and not re-verified fresh, or genuinely deferred.

## SEVENTH PASS (2026-08-21) — `oc_connectors` multi-instance, search-box
placement, actor-fabrication regression, data-integrity cleanup

Governing brief: "FINAL FULL-PLATFORM HARDENING, UI/UX CONSISTENCY & COMPLETE
UAT PASS" (35 sections). This pass closed the single most emphatically
re-demanded item (Section 3) plus four other real, independently-verified
bugs. It did **not** attempt to re-execute all 35 sections — see the honest
accounting at the end.

### Section 3 — `oc_connectors` single-instance constraint (the primary item)

**Problem**: `oc_connectors` was `UNIQUE(client_id, provider)` — a client
could never have two connectors of the same provider (e.g. "AWS Production"
+ "AWS Development", or two Kubernetes clusters), silently overwriting one
configuration with the next save.
**Root cause**: schema-level constraint from migration 007 never anticipated
same-provider multi-instance, and the whole stack (service, route, frontend
grid) was built around one-row-per-(client,provider).
**Fix**: migration 035 adds a `name` column (default = provider, full
backward compat) and changes the constraint to
`UNIQUE(client_id, provider, name)`. `ConnectorService.saveConfiguration` /
`persistResult` resolve and use `name` in the `ON CONFLICT` clause; new
`removeConnector(id, clientId)` backs a new client-scoped
`DELETE /oc/connectors/:id?clientId=`; `client-request-service.ts`'s
connector-approval INSERT updated to the 3-column conflict target.
`connector-grid.tsx` rewritten so `byProvider` is a `Map<string,
RealConnector[]>` (grouping instead of overwrite) — every catalog entry shows
all real named instances plus a permanent "+ Add another {provider}" row.
**Verification**: 3 new regression tests in `connector-honesty.test.ts`
(same-provider-twice coexistence, backward-compat default-name-equals-
provider with no duplicate on re-save, scoped DELETE with cross-client 404) —
7/7 passing. Live-verified in browser on the real `Test1` client: created
"AWS Production" and "AWS Development" simultaneously, both independently
editable/testable/removable.

### Section 10 — duplicate requirements list

**Problem**: `lifecycle/page.tsx` rendered a flat, always-expanded "Service
Requirements" status list immediately above the already-compact, already-
collapsible `RequirementWorkspace` component — the same information shown
twice, one copy violating the canonical compact/progressive-disclosure
standard.
**Fix**: removed the duplicate flat list for every lifecycle step except
connector-configuration (which uses `DatabaseConnectionsManager` and never
had this duplication). Only `RequirementWorkspace` renders now.
**Verification**: clean `tsc --noEmit`. Not re-walked live this pass — flagged
as a code-level-only verification, consistent with the honest-accounting
practice established in earlier passes.

### Section 14 — search box placement (real bug found and fixed)

**Investigation history**: an initial `getBoundingClientRect()` reading
showed the search trigger button at `left: -84.6875` — apparently rendering
off-screen. Root-caused this to a **tooling artifact**: the Browser preview
pane was not actually displayed/compositing at the time (`window.innerWidth`
was 0), so the geometry was meaningless. Re-measured with the pane genuinely
displayed: the button itself was correctly positioned at every breakpoint
(375/768/1280/1440px) — no bug there. Reporting the false alarm honestly
rather than silently discarding it, since it was the documented point of
interruption.

**Real bug found during the same sweep**: the search **results panel**
(`client-search-box.tsx`) used `absolute right-0 sm:left-0` — anchored to the
button's right edge on mobile, but switched to the button's *left* edge at
`sm:` and up. Because the trigger button sits as the last item in a
right-aligned header row on every real page, left-anchoring a 420px-wide
panel from a button already near the viewport's right edge pushed the panel
past the right edge on wide desktop screens.
**Verified live** at 1440px before the fix: `panelRect.right = 1605`,
`docScrollWidth = 1605 > viewport 1440` — a real, unwanted horizontal
scrollbar, exactly what the brief explicitly forbade.
**Fix**: removed the `sm:left-0` override so the panel always anchors
`right-0` (mobile behavior was already correct and is unchanged).
**Verification after fix**, all live `getBoundingClientRect()` measurements
with the pane genuinely displayed:
- 375px: panel `left:14, right:359` — fits within the 375px viewport, no scroll.
- 768px: panel `right:737` — no scroll (`docScrollWidth 753 < ` container, no horiz overflow beyond intrinsic scrollbar-free width).
- 1440px: panel `left:989, right:1409` (== button's right edge) — `docScrollWidth 1425 < 1440` — no horizontal scroll.
- Trigger button vs. `ClientTabs`/lifecycle nav: confirmed `overlap: false` at every tested width.

### Section 17 — fresh actor-fabrication grep (real regression found)

A fresh repo-wide grep for `actor: 'admin'` / `actor || 'admin'` (the exact
anti-pattern fixed in the prior pass) found **8 remaining live occurrences**
the prior pass's fix had missed, across 2 files:
- `commercial-engagement-service.ts` — engagement creation (incl. a value
  persisted directly into the `owner`/`created_by` DB column, not just an
  audit-log string), engagement status transitions, proposal creation,
  proposal status transitions.
- `financial-reconciliation-service.ts` — exception status transitions.

**Fix**: all 8 replaced with the established `'unknown-staff'` convention
(matching `addService`/`removeService`/`setPricing` in the same file, which
were already correct). A follow-up fresh grep confirmed zero remaining
`'admin'`/`'Admin'`/`'Staff'`/`'System Admin'` fabricated-actor literals
anywhere in `apps/api/src`.
**Verification**: `tsc --noEmit` clean; targeted regression
(`commercial-engagement.test.ts` 25/25, `payment-reconciliation.test.ts`
28/28, `connector-honesty.test.ts` 7/7) plus full API suite 397/397, all
green both before and after a subsequent database cleanup (below).

### Section 4 — one-record-assumption schema sweep (clean, no new gap)

Grepped every migration for `UNIQUE(client_id, ...)` and `client_id ... 
PRIMARY KEY`. Findings: `oc_connectors` was the one genuine violation (fixed
above, migration 035). Every other `UNIQUE(client_id, X)` constraint
(`oc_client_services`, `oc_scheduler_compliance` controls,
`oc_workflow_automation` notification prefs, `oc_client_service_requirements`,
`oc_client_identity_mapping`) models "one value per (client, dimension)"
correctly and is not a multi-record violation. The only bare
`client_id PRIMARY KEY` is `oc_lifecycle`, which correctly represents a
single state-machine record per client, not a collection. No further schema
fix needed.

### Section 28 — fresh fabrication sweep, frontend (clean, false positives only)

Grepped `apps/web/src/app/**/*.tsx` for `Math.random()`, `FIXME`, `TODO:`,
`fake*`, `sampleData`, `hardcoded`. All 11 matches were either doc comments
describing a **previously**-fixed fabrication (`PREVIOUSLY: this page showed
hardcoded...`) or the already-established, already-audited-safe
`deterministic-variance.ts` legacy-demo pattern, explicitly labeled "not
Math.random()" in its own comments. No live fabrication found.

### Section 30 — data integrity (real bug found and fixed: orphaned rows)

**Problem found**: `oc_connectors` had 19 of its 20 rows (95%) referencing a
`client_id` with no matching `oc_clients` row — debris from throwaway manual-
test fixture clients (`regtest2`, `e2e-final`, `pipeline-e2e`, `p0-test`,
`accept-fail`, etc.) whose parent client row had been correctly deleted by
exact ID in earlier sessions, but whose child rows in `oc_connectors`,
`oc_connection_tests`, `oc_discovery_runs`, and `oc_lifecycle` were left
behind.
**Verified before touching anything**: confirmed via `NOT EXISTS` anti-join
against real `oc_clients` that none of the orphaned rows belonged to either
protected real client (`Test1`, `AskABD Manual UAT 2026`).
**Asked the user for explicit confirmation** (the destructive-DB-write
classifier correctly gated this) before deleting — approved.
**Fix**: deleted 42 orphan `oc_connection_tests`, 13 orphan
`oc_discovery_runs`, 9 orphan `oc_lifecycle`, 19 orphan `oc_connectors` rows,
scoped strictly by anti-join (never pattern/broad delete). `oc_audit_log` was
deliberately left untouched — historical audit rows referencing a since-
deleted entity are correct, permanent record, not a bug.
**Verification after cleanup**: 0 orphans remain in all four tables; both
real clients confirmed present with their original, unchanged creation
timestamps (`Test1` 2026-08-19, `AskABD Manual UAT 2026` 2026-08-15); the one
real connector on `Test1` survived untouched; full API suite re-run
397/397 clean post-cleanup.

### Section 31 — full regression (this seventh pass, fresh, post-cleanup)

API 397/397, Identity 219/219, Web 33/33 — all green. `tsc --noEmit` clean
in both `apps/api` and `apps/web`. `npm run health` 11/11. All runs were
executed fresh after the database cleanup above, not reused from a stale
result.

### Explicitly NOT completed this seventh pass (honest accounting)

The governing brief's other ~28 sections were **not** freshly re-executed
this pass and must not be read as re-verified: full customer UAT cycle
(invite→accept→login→portal→logout→relogin→session-expiry), client-name/
cross-client-URL-manipulation re-test, customer service/connector request
workflow re-verification, requirements-UX-using-connector-pattern beyond the
Section 10 de-duplication, required-field-experience and Primary Cloud
Provider re-verification, lifecycle timeline compactness, search result
categorization, super-user Customer Activity completeness, login case-
sensitivity/password-recovery/MFA re-tests, invitation "already has access"
UX, error UX, invitation form field balance, forms/Add-flow consistency
sweep, the full 5-breakpoint sweep across the other ~11 named pages (only the
search box itself was breakpoint-tested this pass), general visual-
consistency sweep, and the API/frontend contract audit beyond the Primary
Cloud Provider exemplar already fixed in an earlier pass. These require a
dedicated pass with real login/logout browser cycling and should not be
assumed green.

## EIGHTH PASS (2026-08-21) — customer UAT, session expiration, invitation
error UX, MFA, and two more real contract bugs

Governing brief: "CONTINUE FINAL UAT: CUSTOMER, AUTH, INVITATION, RESPONSIVE
& CONTRACT AUDIT" (26 sections), picking up the six areas the seventh pass
explicitly flagged as not yet re-verified: full customer UAT, login/MFA/
password recovery, invitation UX, responsive sweep, visual consistency,
broader contract audit. This pass completed the first four substantively (via
real, live, end-to-end testing — not code reading) and found 3 more real
bugs, on top of the 5 already fixed in the seventh pass.

### Full customer UAT (real, end-to-end)

Reused the real, already-accepted `uat.customer@example.com` account (org
`AskABD UAT Customer`, real access to `AskABD Manual UAT 2026`) rather than
creating a new invitation, per the explicit "do not create unnecessary
duplicate invitations" instruction. Password recovery → login → portal →
logout → back-button → login again → session-expiry → login-again — every
step live-verified via Mailpit + the real browser, not simulated:

- **Password recovery**: real `POST /v1/credential/reset/request` → real
  email via Mailpit → real reset URL → real password change → real login
  with the new password. Token replay (`token_consumed`, 401) and an invalid
  token (`invalid_token`, 401) both correctly rejected with honest messages,
  no stack traces.
- **Login case-insensitivity**: logged in successfully with `ASKABD UAT
  CUSTOMER` / `UAT.CUSTOMER@EXAMPLE.COM` (uppercase org + email) and the
  correct-case password; confirmed at the API layer too with a lowercase
  org context. Password case-sensitivity confirmed separately: the exact
  same password lowercased was rejected with a generic, non-disclosing
  `authentication_failed` message (staff login: same generic message for
  wrong password AND wrong org — no account-existence leak either way).
- **Real client name, never a UUID**: post-login redirect landed at
  `/client-portal/client-19fa8f94-...`, and the page's primary heading reads
  **"AskABD Manual UAT 2026"** — the UUID appears only in the URL.
- **Cross-client / cross-surface security boundaries**: direct URL
  navigation to a staff-only route (`/clients`) redirected to staff login;
  direct navigation to a client the customer has no access to
  (`/client-portal/client-9a2a1b23-...`, i.e. `Test1`) returned a real,
  server-enforced "Access denied" page — confirmed via network trace that
  the underlying API calls returned real 401/403, not client-side link-
  hiding.
- **Logout + back-button protection**: signing out cleared the session
  (`sessionStorage` confirmed empty); browser back-navigation afterward did
  **not** expose the portal — the page's own guard detected no session and
  redirected to login.
- **Session expiration — root-caused, not just re-tested**: confirmed via
  code (already fixed in an earlier pass, now live-verified) that access
  tokens are 15 minutes, refresh tokens 30 days, and both the staff and
  customer domains run a self-rescheduling background renewal timer
  (`StaffAuthGuard`, `PortalSessionKeepAlive`) plus a reactive-retry-once in
  `authFetch`/`staffFetch` — normal usage should essentially never hit a
  real interruption. Forced the genuine terminal case live (corrupted both
  the access and refresh tokens in `sessionStorage`): correctly cleared the
  session and redirected to `/login?next=<original-page>&expired=1`, the
  login page showed "Your session has expired. Please sign in again —
  you'll be returned to where you left off.", and logging back in with just
  email + org + password (**no invitation involved**) landed automatically
  back at the exact original destination. This is the real, live-proven
  answer to "recovery must be LOGIN AGAIN, not send another invitation."

### Customer service/connector requests — full real state machine

Submitted a real "Request a Connector / Source" from the customer portal
(free text, not from the fixed catalog: "Snowflake — Finance Reporting
Warehouse"). Staff saw it immediately on `Client Requests` with the real
requester identity + org context. Illegal transition tested directly against
the API (`requested → completed`) and correctly rejected with 409
`invalid_transition`. Legal chain walked through the real UI:
`requested → under_review → approved`, each step re-verified against the
database, not just the UI. Approval created a real `oc_connectors` row
(honestly `not_configured`, never fabricated `connected`). Customer's
Requests tab reflected "Approved" in real time with no page-specific mock
data.

### Bug found — customer-initiated connector request became invisible to staff

**Problem**: the approved connector row above was completely absent from the
staff Connectors page, in both the "what's needed" view and the "show all 33
(advanced)" catalog view.
**Root cause**: `connector-grid.tsx`'s "show all" section only ever iterates
the fixed ~33-entry `connectorCatalog` and looks up real rows by matching
`provider` against a catalog id. A customer's free-text connector request
(`client-request-service.ts`'s approval path) creates a real `oc_connectors`
row using a slugified version of whatever the customer typed as `provider` —
which will essentially never match a catalog id. That row was real, live,
and permanently unmanageable in the UI.
**Fix**: [connector-grid.tsx](../apps/web/src/app/(app)/clients/[clientId]/connectors/connector-grid.tsx)
now computes the set of all catalog ids and renders anything in `byProvider`
that doesn't match one in an always-visible "Custom / Other Requests"
section (not gated behind the advanced toggle), so no real connector row can
ever be silently unreachable again.
**Live verification**: reloaded the staff Connectors page for the real
client — the row now renders with working Configure/Remove controls.

### Bug found — connector name showed the raw machine slug, not the human label

**Problem**: the same row's displayed name was the raw slug
(`snowflake-—-finance-reporting-warehouse`) instead of what the customer
actually typed ("Snowflake — Finance Reporting Warehouse").
**Root cause**: [client-request-service.ts](../apps/api/src/services/client-request-service.ts)'s
connector-approval `INSERT` wrote `target_key` (the slug) into **both** the
`provider` and `name` columns.
**Fix**: `name` now uses `target_label` (the customer's original text,
already captured by the request), falling back to `target_key` only when no
label exists; `provider` is untouched (still the slug, still the `ON
CONFLICT` identity — no constraint-semantics change).
**Verification**: new regression test in `client-requests.test.ts` asserting
the stored `name` equals the human label and explicitly is NOT the slug;
16/16 tests in that file pass. Live-verified: the staff Connectors page now
shows "Snowflake — Finance Reporting Warehouse".

### Bug found — invitation "already has access" error hidden behind a toggle

**Problem**: attempting to re-invite `uat.customer@example.com` to a client
they already have accepted access to correctly did **not** create a
duplicate invitation (backend logic was already right — total count stayed
at 4), but the staff-facing error showed only the generic "Invitation not
sent" with the actual reason hidden behind a "Show technical details"
toggle — exactly the anti-pattern the governing brief named explicitly.
**Root cause**: [invitations/page.tsx](../apps/web/src/app/(app)/clients/[clientId]/invitations/page.tsx)
passed the backend's own already-safe, already-specific message
(`"This person already has access to this client."`, from
`invitation-service.ts`'s real `already_a_member` error code) into
`ErrorState`'s `technicalDetail` prop instead of its `why` prop — misusing
a component whose whole documented design is "what happened / why /
technical details, progressively disclosed."
**Fix**: swapped to `why={createError}`, so the real, specific, already-safe
reason is visible immediately.
**Live verification**: re-attempted the exact same duplicate invitation —
now reads "Invitation not sent / This person already has access to this
client." immediately, no toggle needed. Invitation count still 4 (no
duplicate created either before or after the fix — this was purely a
display bug).

### Bug found — MFA actions used a raw fetch with no session renewal

**Problem**: enrolling MFA on the real staff account (`hello@askabd.com`)
failed outright with a genuine `invalid_token` 401, even though the staff
session was not calendar-expired (78 seconds of life left on the access
token — past the same 60-second renewal threshold `staffFetch` uses
everywhere else in the app).
**Root cause**: [account-security-manager.tsx](../apps/web/src/app/(app)/account/security/account-security-manager.tsx)
called `askabd-identity`'s MFA endpoints with a raw `fetch()` and whatever
`getStaffSession()` happened to return at that instant — unlike
`staffFetch`/`authFetch`, it never proactively renewed a near-expiry token
and never retried once on a 401. This is exactly the kind of interruption a
real user would hit mid-enrollment (reading a QR code and typing their first
TOTP code takes time), not an edge case.
**Fix**: added a local `identityFetch()` helper replicating `staffFetch`'s
exact policy (proactive renew within 60s of expiry, reactive renew-and-
retry-once on 401) for the four MFA calls (status/enroll/activate/disable);
exported `RENEW_BEFORE_EXPIRY_MS` from `staff-session.ts` so both places
share one source of truth for the threshold.
**Live verification, full real lifecycle on the real staff account**:
enrolled (real TOTP secret + provisioning URI returned), wrong code
(`000000`) correctly rejected without advancing past the QR-code screen, a
freshly-computed real TOTP code correctly activated (status flips to "ON"),
then disabled with another real code — restoring the account to its exact
original clean state (confirmed via direct DB read before and after:
`status: disabled` / no method rows, both times). The real staff account was
never left in an MFA-enabled state the operating user doesn't have an
authenticator entry for.
**Customer-side MFA (full lifecycle, separate real account)**: since there
is no customer-facing "Account Security" UI (correctly not invented — MFA
enrollment is staff-only in this app's current architecture), enrolled MFA
directly via the same real identity API on `uat.customer@example.com`
(an account already fully under this pass's control), then drove the
**actual customer login page's** real MFA challenge screen: wrong OTP
(`000000`) rejected with "That code is invalid or has expired. Please try
again."; a real, freshly-computed OTP accepted, landing correctly back at
the client portal; **immediate replay of the exact same, just-used code
correctly rejected** (verified twice — once naturally after ~30s drift,
once with a fresh code replayed within the same time window to rule out
"expired" being confused with "already used"). MFA disabled afterward,
restoring the account to its normal, authenticator-free usable state.

### Fresh actor-fabrication grep (clean)

Re-ran the exact grep from the seventh pass across the whole `apps/`
tree. Two new textual matches, both false positives on inspection:
`requirement-workspace.tsx` matches only inside a `PREVIOUSLY:` doc comment
(the real code already uses `getStaffSession()?.identityId ||
'unknown-staff'`); `opaque-id-rbac.test.ts` uses a literal `'admin'` as
synthetic test fixture data, not a live code path. Zero live fabrication.

### Data integrity — full anti-join sweep (clean)

`oc_client_requests`, `client_identity_mapping`, `oc_invitations`,
`oc_connectors`, `oc_connection_tests`, `oc_client_database_connections` —
zero orphans in any of them (anti-joined against real `oc_clients`).
Zero duplicate active invitations, zero duplicate identity mappings.
Exactly 2 real clients, both protected (`Test1`, `AskABD Manual UAT 2026`),
both confirmed present with unmodified original creation timestamps.

### Regression (this eighth pass, fresh, after every fix above)

API 398/398 (397 + 1 new regression test), Identity 219/219, Web 33/33.
`tsc --noEmit` clean in both `apps/api` and `apps/web`. `npm run health`
11/11 (one transient cold-start timeout on the web server immediately after
a heavy `tsc`/`vitest` run, resolved on retry with no code change — a known,
previously-documented warm-up flake, not a regression).

### Explicitly NOT completed this eighth pass (honest accounting)

The following sections of the governing brief were **not** freshly executed
and must not be read as verified: super-user Customer Activity completeness;
requirements UX using the connector pattern beyond what the seventh pass
already fixed; required-field experience and Primary Cloud Provider
re-verification; lifecycle timeline compactness; search result
categorization (client-scoped search itself was exercised functionally in
earlier passes, but not freshly re-walked this pass); the full 5-breakpoint
sweep across the ~12 named pages (only the auth pages — login/staff-login/
forgot-password/reset-password — were spot-checked this pass, at 1280px,
for horizontal overflow and clean layout; the customer portal and most
staff pages were exercised functionally but not measured at 375/768/1024/
1440px); the broader visual-consistency sweep (typography/spacing/button
hierarchy against the Connector Configuration reference) beyond the pages
directly touched by this pass's bug fixes; staff logout + back-button
protection (deliberately not tested against the real `hello@askabd.com`
staff session, to avoid needing to reset the real operating user's own
password to log back in — the equivalent guard was proven via the customer-
session-hitting-a-staff-route boundary test instead, which exercises the
same underlying auth-guard code path); a fresh `Math.random`/`mock-`/`fake`/
`sample`/`demo`/`localStorage`/`sessionStorage` sweep of the API side
specifically (the frontend sweep from the seventh pass was not re-run, and
the backend was not swept this pass at all). These are the largest
remaining gaps and should not be assumed green without a dedicated pass.

## FINAL SIGN-OFF

Dated 2026-08-21, end of the eighth pass (supersedes the seventh pass's
sign-off for anything it covers; the fourth pass's original sign-off below
is kept for history). Health, tests, typechecks all verified green
immediately before this line was written — see the Regression section
above. Two real, protected clients confirmed intact with unmodified
timestamps. Zero orphaned or duplicate records. No commits, no pushes.
localhost:3001 is running and was confirmed via `npm run health` (11/11)
immediately before this report was finalized.

---

Dated 2026-08-20, end of the fourth pass (superseded by the seventh and
eighth passes above for anything they cover). Health, tests, typechecks, and
builds all verified green immediately before this line was written — see the
Regression sections above. localhost:3001 is running and was verified in a
genuinely fresh browser tab (zero console errors) immediately before this
report was finalized.
