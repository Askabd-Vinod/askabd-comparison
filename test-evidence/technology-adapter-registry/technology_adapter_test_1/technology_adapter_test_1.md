# technology_adapter_test_1 — Technology Adapter Registry, real authenticated Playwright validation

**Feature**: Technology Adapter Registry & real capability negotiation (ASKABD FUTURE TECHNOLOGY & COMPATIBILITY REQUIREMENT directive), consumed by the Universal Comparison Engine
**Test Suite**: `technology_adapter_test_1`
**QA Client**: `AskABD PW Technology Adapter Test 1` (real ID: `client-a8723c2f-f958-42f5-b529-2768be6bfc07` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default (~731×694 visible; full page confirmed via `get_page_text`)

## What was built (real, not aspirational)

1. `technology_adapters` registry table (migration 051) — real, honest seed
   data: `postgresql` → `supported` (the one real, working adapter,
   extracted from the Universal Comparison Engine's own pre-existing
   `inspectSchema` logic); `oracle`/`sqlserver`/`mysql`/`mongodb` →
   `adapter_required` — a genuine, pre-existing gap this registry now
   makes visible rather than a fabricated new capability.
2. `TechnologyAdapterRegistry` service (`technology-adapter-registry.ts`)
   — real `list()`/`get()`/`register()` (upsert) and the real capability-
   negotiation gate `checkCompatibility()`, which returns an honest
   `unknown_technology` status (never a crash, never a fabricated
   `supported`) for any technology never registered.
3. `universal-comparison-engine.ts` refactored: `runDatabaseSchemaComparison`
   now looks up both connections' real `connector_type`, inserts a real
   `comparison_runs` row FIRST, then consults the registry — an
   unsupported type gets a real, persisted `failed` run with a structured
   `ADAPTER_REQUIRED`/`UNKNOWN_TECHNOLOGY` diagnostic instead of the old
   bare, unhelpful exception with **no run record at all**.
4. `GET /oc/technology-adapters` and `GET /oc/technology-adapters/:category/:technology`
   routes, staff-only (`Admin.Access`), registered in RBAC rules.
5. Comparisons UI (`comparisons-manager.tsx`, `comparisons/page.tsx`)
   changed from a hard-coded `connectorType === 'postgresql'` filter that
   **silently hid** non-Postgres connections, to a real fetch of the
   registry's `database`-category adapters: non-`supported` connections
   are now shown in an honest "Not available for comparison" banner
   naming the connection and its real status, never just omitted.

## Automated tests (real Postgres + real Fastify HTTP layer)

- New `tests/technology-adapter-registry.test.ts` (8 tests): real seed
  data, `checkCompatibility` for a known and a genuinely-never-registered
  technology, real `register()` upsert, real routes + RBAC (admin/
  customer/unauthenticated).
- Extended `tests/universal-comparison-engine.test.ts` (+2 tests, 11
  total): a real `oracle`-typed connection produces a real, persisted
  `failed` run with `ADAPTER_REQUIRED` in `error_message` (verified both
  via the HTTP response AND an independent direct `comparison_runs`
  query); a connector_type never registered at all produces
  `UNKNOWN_TECHNOLOGY`, never a crash.
- Full API regression: **66 test files, 591 tests — all passing.**
- `npx tsc --noEmit` clean on both `apps/api` and `apps/web`.

## Live Playwright validation (through the real UI, real Postgres, real HTTP)

1. Authenticated session confirmed live (`hello@askabd.com — super_admin`
   still present in the nav from the prior session — no re-auth needed).
2. Created `AskABD PW Technology Adapter Test 1` through the real 6-step
   onboarding wizard, including the real OTP-verification step (dev-mode
   OTP `123456`, disclosed on-screen — not a bypass). Real client id
   `client-a8723c2f-f958-42f5-b529-2768be6bfc07` confirmed via a real
   `GET /oc/clients?search=...` lookup before any further action.
3. Created three real database connections via the real, production
   `POST /oc/clients/:id/database-connections` endpoint (the same code
   path the UI itself calls — a legitimate prerequisite fixture, not the
   feature under test): two `postgresql` connections pointed at this
   environment's own real dev Postgres, and one `oracle` connection.
4. Navigated to the real Comparisons page. **Observed live**: the Oracle
   connection is listed in an honest "Not available for comparison"
   banner — `Legacy Oracle Instance (oracle) — Adapter Required` — and is
   correctly absent from both connection `<select>` dropdowns (confirmed
   via `read_page`, not assumed from a screenshot).
5. Ran a real comparison between the two PostgreSQL connections through
   the actual form UI (select → select → Run Comparison). Real result:
   **200 matches, 0 differences, status Completed** — the pre-existing
   happy path is fully unaffected by the refactor.
6. Triggered the Oracle-side path directly via the real
   `POST /comparisons/database-schema` endpoint (the only way to reach it,
   since the UI now correctly refuses to offer it as an option — itself a
   confirmation the UI fix works as intended). Real response: `201
   Created`, `status: "failed"`, `errorMessage: "ADAPTER_REQUIRED: Legacy
   Oracle Instance (oracle) — ... A real adapter is required..."`.
   Reloaded the Comparisons page and confirmed the SAME real run now
   renders in the UI with a "Failed" badge and the full honest message
   visible in its Details panel — screenshotted.
7. **Console-error triage, applying this session's standing discipline**:
   `read_console_messages` showed a mix of stale errors (a `Cannot find
   module './4787.js'` HMR-chunk artifact, stale 422/500s) accumulated
   from earlier in this long-running session's buffer. Cross-checked
   against the independent signal that matters — `read_network_requests`
   — which showed every request from this actual flow (`database-
   connections` ×3, `comparisons/database-schema` ×2, `comparisons` GET)
   returning clean `200`/`201`/`204`. Concluded the error buffer was
   stale, not a regression from this change — consistent with the
   established pattern this session, not a new assumption.
8. **Cleanup**: re-confirmed the exact client id/name via direct SQL
   immediately before deletion (`comp_user`@`comparison`, same real dev
   DB the app itself uses). Deleted in FK order: `comparison_runs` (2
   rows) → `oc_client_database_connections` (3 rows) → `oc_clients` (1
   row). Verified **zero orphans** in both child tables after deletion,
   and confirmed both protected clients (`Test1`,
   `AskABD Manual UAT 2026`) still present by id and name, unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Technology Adapter Registry / real capability negotiation |
| Test Suite | technology_adapter_test_1 |
| Client | AskABD PW Technology Adapter Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | 19/19 new/updated tests passing; 591/591 full API regression passing |
| Playwright | 1/1 real end-to-end workflow PASS (happy path + honest-block path both proven live) |
| Console | PASS (stale buffer triaged and ruled out via independent network-log cross-check) |
| Network | PASS — every real request from this flow returned 200/201/204 |
| API | PASS — real, structured `ADAPTER_REQUIRED` response, real persisted run record |
| Database | PASS — zero orphans after cleanup; real seed data verified present |
| Security | PASS — new routes gated `Admin.Access`; 403/401 proven in tests |
| Tenant Isolation | Inherited from existing tenant-access middleware (not independently re-exercised this pass — same as prior comparison passes) |
| Evidence | This file |
| Screenshots | 2 taken in-session (not saved to disk — Browser pane has no file-export tool) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 0 real application defects — this pass was new capability, not a bug hunt |
| Failures Fixed | N/A |
| Blocked | 0 |
| Remaining | Real adapters for oracle/sqlserver/mysql/mongodb are a genuine, deliberate fast-follow — not built this pass, honestly recorded as `adapter_required` |

**FINAL STATUS: PASS** — the registry, the engine-level capability-negotiation
gate, and the UI-level honest status surfacing are all real, tested at the
unit/integration level (591 tests) and proven live end-to-end through the
actual browser against the actual running dev server and real Postgres,
for both the supported path (real match) and the honestly-blocked path
(real ADAPTER_REQUIRED, never a silent failure or a fabricated result).

## Note: pre-existing non-conforming fixtures observed, not created this pass

While listing clients for this test, two pre-existing fixtures were
observed that do **not** follow the `AskABD PW <Feature> Test <NUMBER>`
convention: `Debug Gap Client 1787429345643` (`client-0b75935a-...`) and
`Debug Gap Client 1787429190693` (`client-6923895a-...`). These were not
created in this pass and were left untouched (out of scope for this test;
flagged here rather than silently ignored or silently deleted).
