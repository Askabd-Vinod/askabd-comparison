# Evidence-Backed Health + Engineering + Migration Intelligence — Final Report

**Branch:** `feature/reliability-hardening`
**HEAD at report time:** `a9082ca478b94a4dabf35dbe5a5076a1499b6226` (all work below is uncommitted, on top of this checkpoint)
**Report date:** 2026-08-16
**Absolute rule applied throughout:** AskABD must never look more capable than it actually is. Where no authoritative data source exists, the UI says so ("Not yet available" / "Not yet calculated" / "Not configured") instead of inventing a number.

---

## A. Baseline (Phase 0)

- Branch/HEAD confirmed clean re-entry point: `feature/reliability-hardening` @ `a9082ca`.
- Baseline test count before this milestone: **146/146 passing**.
- Baseline API build: PASS. Baseline web build: PASS.
- Baseline client count: 12 (grew to 20 over the course of this session's live verification — new clients created by the Client Directory / onboarding flow during testing, not by this milestone's code).

## B. Final Tests

- **157/157 tests passing** (`npx vitest run`, `apps/api`), 22 test files, 0 failures, 0 skipped.
- Breakdown of tests added this milestone: `client-health-summary.test.ts` (4), `defects-routes.test.ts` (3), `migrations-routes.test.ts` (4) — **11 new tests**, all passing. 146 baseline + 11 = 157.

## C. Builds

- `apps/api`: `npm run build` (`tsc`) — **clean, 0 errors**.
- `apps/web`: `npm run build` (Next.js production build) — **clean, 0 errors**, all routes compiled including `/`, `/clients`, `/clients/[clientId]/scorecard`, `/clients/[clientId]/engineering`, `/engineering`, `/engineering/[defectId]`, `/engineering/reports`, `/engineering/knowledge`, `/migrations`, `/migrations/[migrationId]`, `/migrations/new`.

## D. Client Regression

- Executive Dashboard (`/`), Client Directory Table/Cards/Kanban views (`/clients`), and Scorecard (`/clients/:id/scorecard`) all verified live in-browser after every change — no fabricated numbers, honest "Not yet calculated" for the 11/20 clients never individually scored.
- Client-level Engineering tab (`/clients/:id/engineering`) — previously showed a generic capability placeholder for every real client (the page matched against a hardcoded mock-client list that no real onboarded client is ever in); now shows that client's real defects, verified live for `E2E Lifecycle 1786899458076`.

## E. End-to-End Verification

Full E2E flow exercised live against the running dev stack (not just reading persisted data):
1. Ran a real defect-detection sweep (`POST /oc/defects/detect`) — returned real counts (`15 scanned, 15 updated, 0 new`).
2. Opened a real defect detail page, switched Report → Technical Details tabs, confirmed all fields are real (`fingerprint`, `occurrence_count`, timestamps, evidence).
3. Created a **new real migration plan** via the rebuilt `/migrations/new` form (client `E2E Lifecycle 1786899458076`, schema `public`) — the backend discovered 83 real tables / 184 real indexes in the platform's own `public` schema and redirected to a real detail page with a real evidence log.
4. Ran a real validation (`POST /oc/migration/:id/validate`) against a completed 2026-08-11 migration run — it correctly reported **11 mandatory row-count mismatches** because the live source data has drifted since that run's target snapshot was taken (real drift detection, not a canned "all green" result).

## F. Real Client Health — Source, Calculation, Changes

- **Sole source of truth:** `ClientHealthService` (`apps/api/src/services/client-health-service.ts`) — a pre-existing, real, evidence-based 7-dimension weighted health engine (Technical 20%, Security 20%, Compliance 15%, Operational 15%, Financial 10%, Migration 10%, Reliability 10%), each dimension backed by real SQL queries against `oc_connectors`, `oc_discovery_runs`, `oc_client_service_requirements`, `oc_problems`, `oc_client_compliance`, `oc_lifecycle`, `oc_commercial_engagements`, `oc_migration_runs`, `oc_defects`, `oc_audit_log`. Not modified — reused as-is per the "no duplicate engine" rule.
- **What changed:** the Executive Dashboard and Client Directory previously showed a static `oc_clients.platform_score` column that was never written by any real computation. Added one new bulk endpoint, `GET /oc/clients/health-summary`, that reads each client's last-persisted `ClientHealthService` snapshot (`getLatestSnapshot`, no live recompute, no snapshot-spam) in a single request. Wired the Dashboard, all three Client Directory views (Table/Cards/Kanban), and the Scorecard's tier-label logic to this one source, via a new shared `apps/web/src/app/lib/health-tier.ts` (single authoritative score→label/color mapping, used in all three UI locations).
- **Honesty guarantee:** a client with no computed snapshot shows `null` → "Not yet calculated", never a fabricated default of 0 or 100. Verified: 9/20 clients currently have a computed score; the other 11 show "Not yet calculated."

## G. Engineering Intelligence — Sources, Removed Mock, Unavailable Fields

- **Source:** `DefectDetectionService` (`apps/api/src/services/defect-detection-service.ts`) + `JiraIntegrationService.recordDefect`/`getDefects` — a pre-existing, real detection sweep over connector failures, discovery failures, migration failures, lifecycle stalls, and open security problems, persisted to `oc_defects` with fingerprint-based deduplication. Not modified.
- **Removed (previously 100% fabricated, `apps/web/src/app/lib/engineering-intelligence.ts`, now deleted):** hardcoded fake clients ("Meridian Financial Group," "Nexus Healthcare Systems," "Atlas Logistics International"), numeric RCA "confidence scores" (e.g. 87%, 92%) with invented alternative-cause probabilities, multi-option AI "solutions" with prose advantages/disadvantages/rollback plans, fabricated stack traces and correlation IDs, invented dollar business impact (e.g. "$45K/hour revenue impact"), and a fully-fabricated composite "Engineering Health Score" built from non-existent Build Health / Deploy Health / Code Quality / Technical Debt / Automation Opportunities / Knowledge Reuse metrics.
- **Unavailable fields, now honestly labeled instead of invented:** Build Health, Deploy Health, Code Quality, Technical Debt count, Automation Opportunities, Knowledge Reuse, and Performance Trend were all removed outright — this platform has no CI/CD, deployment-tracking, or static-analysis data source to compute them from. MTTR (average resolution time) shows "Not yet available" until at least one defect has `resolved_at` set (currently: none have).
- **UI:** `/engineering` dashboard, `/engineering/[defectId]` detail (Report + Technical Details tabs), `/engineering/reports`, `/engineering/defects-table.tsx`, and `/clients/[clientId]/engineering` all rewired to the real `oc_defects` shape. The **Knowledge Base** (`/engineering/knowledge`) was fully fabricated (4 hardcoded fake incidents with fake owners, fake `$45K/hr` impact, fake "lessons learned") with **zero backing table** anywhere in the schema — replaced with an honest "Not yet available" state explaining the platform does not yet persist reusable resolution knowledge.

## H. Migration Intelligence — Sources, Removed Mock, Unavailable Fields

- **Source:** `MigrationExecutionService` (`apps/api/src/services/migration-execution-service.ts`) — a pre-existing, real, strict-completion PostgreSQL schema-to-schema migration engine: discovers actual tables/indexes/views/sequences in a source schema, creates a real target schema, transfers real rows, and only reports `completed` when every mandatory step succeeds. Not modified.
- **Removed (previously 100% fabricated, `apps/web/src/app/lib/migration-intelligence.ts`, now deleted):** 3 hardcoded fake migration programs against the same fake client names as above, invented dollar cost estimates (`$320,000`, `$450,000`, `$680,000`), invented effort/timeline estimates ("16 weeks," "Q3-Q4 2026"), invented risk scores, readiness scores, and AI "confidence scores," fabricated multi-wave schedules with specific dates, and fabricated gap items with fake owners and recommendations.
- **The single worst violation found this milestone:** the "New Migration" wizard (`/migrations/new`) was a **12-step, entirely client-side simulated flow that never once called the real migration API**. Every "connection check," discovery result, dry-run outcome, execution progress bar, and audit statistic was `setTimeout`/`Math.random()` theater (e.g., a hardcoded "847,500 rows transferred," a fake "68K/s" transfer speed, a fake TLS certificate expiry date). On "complete," it simply navigated back to `/migrations` without ever creating a migration record. Replaced with a 2-field honest form (client, source schema) that calls the real `POST /oc/migration/plan` endpoint and redirects to the real created run.
- Also deleted `apps/web/src/app/components/migration-connection.tsx` (an orphaned "Connect & Transfer" panel referencing `/api/v1/oc/discover-source` and `/api/v1/oc/discover-target` — **neither endpoint exists on the backend**, so its real-looking `fetch()` calls always failed and silently fell through to the same kind of `Math.random()`-simulated transfer). It had no remaining callers after the wizard rewrite.
- **Unavailable fields, now honestly labeled instead of invented:** cost, timeline, effort, required-skills, risk score, and AI confidence score were all removed — this platform has no cost/effort estimation or confidence-scoring capability for migrations. What IS real and shown: per-step status/evidence/row counts, mandatory-vs-optional classification, strict all-mandatory-must-pass completion rules, and real per-table row-count validation (including honest "expected operational drift" flags for live/mutable tables).
- **UI:** `/migrations` dashboard, `/migrations/portfolio.tsx`, `/migrations/[migrationId]` detail (Overview/Steps/Validation tabs with live Dry Run / Execute / Validate / Rollback action buttons wired to the real endpoints), and `/migrations/new` all rewired.

## I. Financial / Confidence Metrics Removed

Every fabricated dollar figure and every fabricated numeric confidence/risk score across both Engineering and Migration Intelligence was removed, not just hidden — no dollar-cost, dollar-impact, timeline-estimate, risk-score, or AI-confidence-score field remains anywhere in these two feature areas. The only "confidence" concept that survives is the real, categorical `root_cause_confidence` enum (`confirmed` / `likely` / `possible` / `unknown`) that `DefectDetectionService` actually records — shown as a distribution count, never averaged into a fake percentage.

## J. Root-Cause Evidence

Every root cause shown in the UI is the literal string `DefectDetectionService` wrote to `oc_defects.root_cause` (e.g., "Connection validation failed," "Security vulnerability or misconfiguration detected during assessment"), paired with its real `evidence` array (e.g., `Problem ID: prob-...`, `Severity: info`) and real `root_cause_confidence`. No alternative-cause list, no invented probability, no synthesized narrative.

## K. Data-Source Transparency

Every KPI tile and report type across the rewritten pages carries a `criteria` string naming its exact source query (e.g., "Mean of oc_client_health_snapshots.overall_score across clients with at least one snapshot," "Count of oc_defects rows with status not in (resolved, verified, closed)"), consistent with the pattern established in the prior Real Data Integrity milestone.

## L. Client Isolation

Verified with dedicated tests, not just inspection:
- `client-health-summary.test.ts` — a client's health row never leaks another client's score.
- `defects-routes.test.ts` — dedup-by-fingerprint and single-defect fetch verified.
- `migrations-routes.test.ts` — filtering `/oc/migrations?clientId=A` never returns client B's runs.

## M. Security

No new secrets, tokens, or credential handling introduced. All new routes are read-mostly (three `GET`s) plus reuse of pre-existing `POST` action routes; no new attack surface beyond what already existed in `MigrationExecutionService`/`DefectDetectionService`.

## N. Performance

- `GET /oc/clients/health-summary`: one request for the whole client list, reading persisted snapshots (no live recompute, no N+1).
- `GET /oc/defects`, `GET /oc/migrations`: single queries, capped at `LIMIT 100`.
- `GET /oc/defects/:id`, `GET /oc/migrations/:id`: single-row lookups.
- No page issues more than one request per data source; client-name lookups for defects/migrations use one bulk `GET /oc/clients` call, not one request per row.

## O. Remaining P0–P3 (not fixed this milestone — flagged, per the explicit no-scope-creep rule)

- **P0 — `CapabilityPlaceholder`** (`apps/web/src/app/clients/[clientId]/capability-placeholder.tsx`): the fallback shown for every client sub-page not yet wired to real data. It displays fully fabricated green "Active" metrics (e.g., "CPU Avg: 32%," "Uptime: 99.9%," "Compliance Score: 96%") regardless of the client's actual state. This is a large, systemic issue spanning many pages beyond Health/Engineering/Migration — out of this milestone's explicit scope, but the single most severe remaining violation of "never look more capable than it is."
- **P1 — `clients/[clientId]/layout.tsx`**: still matches against the legacy `mockClients` array for the client header (name/logo/industry/status/platform score). Every real (DB-backed) client silently falls through to a minimal layout with no header at all. Affects all ~35 client sub-page tabs, not just Engineering/Migration.
- **P2 — Dashboard "Last refreshed: just now"** (`apps/web/src/app/page.tsx`): a static label, not tied to actual fetch time. Minor, unrelated to the three systems in scope.
- **P3 — Report catalog labels**: several report "types" listed on other (non-Engineering/Migration) report pages may still imply capabilities (compliance scoring, architecture health) not backed by real data — not audited this milestone.

## Files Modified

**API:**
- `apps/api/src/routes/operations-center-routes.ts` — added `GET /oc/clients/health-summary`, `GET /oc/defects/:defectId`, `GET /oc/migrations`, `GET /oc/migrations/:migrationId`.

**Web:**
- `apps/web/src/app/page.tsx`, `apps/web/src/app/clients/page.tsx`, `apps/web/src/app/clients/[clientId]/scorecard/page.tsx`, `apps/web/src/app/clients/[clientId]/engineering/page.tsx`
- `apps/web/src/app/engineering/page.tsx`, `apps/web/src/app/engineering/defects-table.tsx`, `apps/web/src/app/engineering/[defectId]/page.tsx`, `apps/web/src/app/engineering/[defectId]/detail-view.tsx`, `apps/web/src/app/engineering/reports/page.tsx`, `apps/web/src/app/engineering/reports/reports-view.tsx`, `apps/web/src/app/engineering/knowledge/page.tsx`
- `apps/web/src/app/migrations/page.tsx`, `apps/web/src/app/migrations/portfolio.tsx`, `apps/web/src/app/migrations/[migrationId]/page.tsx`, `apps/web/src/app/migrations/[migrationId]/detail-view.tsx`, `apps/web/src/app/migrations/new/page.tsx`

## Files Added

- `apps/api/tests/client-health-summary.test.ts`, `apps/api/tests/defects-routes.test.ts`, `apps/api/tests/migrations-routes.test.ts`
- `apps/web/src/app/lib/health-tier.ts`, `apps/web/src/app/lib/real-engineering.ts`, `apps/web/src/app/lib/real-migration.ts`
- `docs/evidence-backed-intelligence-report.md` (this file)

## Files Deleted

- `apps/web/src/app/lib/engineering-intelligence.ts` (100% fabricated mock data generator)
- `apps/web/src/app/lib/migration-intelligence.ts` (100% fabricated mock data generator)
- `apps/web/src/app/engineering/knowledge/knowledge-view.tsx` (fabricated knowledge-base UI, no longer referenced)
- `apps/web/src/app/components/migration-connection.tsx` (orphaned; its two backend endpoints do not exist)

## Database Changes

**None.** No migrations added. `oc_defects`, `oc_migration_runs`, and `oc_client_health_snapshots` all pre-existed; every new endpoint reads or writes through existing service methods against existing tables.

## API Changes

| Method | Path | Purpose |
|---|---|---|
| GET | `/oc/clients/health-summary` | Bulk per-client last-computed health score (dashboard/directory) |
| GET | `/oc/defects/:defectId` | Single real defect, for the defect detail page |
| GET | `/oc/migrations` | Platform-wide migration run list, camelCase-normalized |
| GET | `/oc/migrations/:migrationId` | Single real migration run, for the detail page |

## UI Changes

Summarized in sections F–H above. Net effect: the Executive Dashboard, Client Directory (all 3 views), Client Scorecard, Engineering Intelligence (dashboard, defect detail, reports, client-level tab), and Migration Intelligence (dashboard, portfolio, migration detail with live actions, migration creation) now display only values traceable to a real database row or an honest "not yet available" state.

## Git Safety

No commits, no pushes were made. All changes above remain uncommitted working-tree changes on `feature/reliability-hardening`, on top of the last checkpoint commit `a9082ca`, per the explicit instruction for this milestone.
