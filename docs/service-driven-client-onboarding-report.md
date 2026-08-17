# Service-Driven Client Onboarding & Minimum Required Information Engine — Final Report

**Branch:** `feature/reliability-hardening`
**HEAD at report time:** `a9082ca478b94a4dabf35dbe5a5076a1499b6226` (all work below is uncommitted)
**Report date:** 2026-08-17
**Ultimate goal applied:** A client should see "here are the 3 things we need from you," never "here are 33 connectors, configure everything." Confirmed working end-to-end this milestone.

---

## A. Baseline

Re-verified before any change (previous reported number was explicitly not trusted, per instruction):
- Branch/HEAD: `feature/reliability-hardening` @ `a9082ca`, working tree identical to the prior milestone's end state (56 dirty files, nothing lost).
- Tests: **163/163 passing** (re-run fresh, matched the previously reported number exactly).
- API build: PASS. Web build: PASS. `/health` and `/ready`: both `database: connected`.

## B. Service Catalog Discovered

AskABD's real service model is **not** organized around client-deliverable categories like "Website Development" or "Mobile App Development" (the milestone's own examples, explicitly flagged as illustrative only). It is organized around **70 platform capabilities** (`oc_capabilities`: id, name, category, domain, description, business_value, maturity, status, dependencies, **external_dependencies**, roadmap_phase), grouped into 5 **service bundles** (`oc_service_bundles`: Assessment, Transformation, Optimization, Compliance, Enterprise Transformation) — a managed-services transformation-platform model (discovery → assessment → gap analysis → decision → migration → optimization → compliance), not a software-delivery-type model. Per the milestone's own instruction ("if the existing platform has different terminology, preserve it"), this report uses AskABD's real terminology throughout.

**Critical finding:** `oc_client_services` (real per-client capability enablement) had **zero rows for any real client** — only the fictional `demo-meridian-financial` had any explicit selections (9 rows). The existing `GET /oc/clients/:clientId/services` route's `clientStatus` field falls back to `'enabled'` for every platform-*operational* capability (29 of 70) when no explicit row exists for a client — a reasonable default for *listing what the platform can do*, but **not genuine evidence that a specific client needs a specific connector**. This confirms the milestone's core premise: AskABD currently has no real mechanism recording which services a given client actually receives — every real client was implicitly treated as receiving all 29 operational capabilities.

## C. Existing Service Architecture (reused, not duplicated)

- **`RequirementsService`** (`requirements-service.ts`) — already a complete, real, transactional, idempotent, evidence-based onboarding-information engine covering 5 stages (identity-verification → security-validation → environment-registration → connector-configuration → discovery), each with typed fields, `whyRequired` explanations, security classification, document requirements, and a `getReadiness()` calculation with exact blockers and next actions. **Reused as-is.**
- **`ConnectorService`** (`connector-service.ts`) — already a real, evidence-based connection-testing engine (postgresql/aws/azure/github/kubernetes + generic host/port fallback), persisting to `oc_connectors`/`oc_connection_tests`. **Reused as-is** (already wired to the client Connectors page in the prior milestone).
- **`oc_capabilities.external_dependencies`** — real, human-curated per-capability external dependency text (e.g. "Database connectivity", "GitHub Actions", "Prometheus"), already seeded in the database, **never previously exposed by any route**.
- **`oc_client_services`** — real per-client enablement table with a working `POST /oc/clients/:clientId/services/:serviceId/enable` endpoint and an existing admin UI (`/clients/[clientId]/services`) with dependency-aware Enable/Disable buttons.
- **`ClientPortalService.getActionCenter`** — already surfaces unconnected connectors and missing requirements *reactively* (only for connectors already attempted) — does not proactively derive requirements from services. Complementary to, not overlapping with, this milestone's work.

## D. Service → Dependency Matrix (new, evidence-based)

New file: `apps/api/src/services/service-requirement-matrix-service.ts`. A small, documented `DEPENDENCY_TO_CONNECTOR` table maps the **exact, verified** `external_dependencies` phrases found in the seeded data (queried directly, not guessed) to real connector-catalog entries:

| Real `external_dependencies` phrase | Capability example | → Connector | Classification |
|---|---|---|---|
| "Database connectivity" | Discovery Engine | postgresql | **Required** |
| "Target database access" | Connector Framework | postgresql | **Required** |
| "Target database write access" | Migration Execution | postgresql | **Required** |
| "Cloud storage (S3)" / "Cloud provider SDKs" / "ML infrastructure" | Disaster Recovery, Integration Marketplace, AI Advisory | aws | Optional |
| "Docker socket access" | One-Click Service Recovery | docker | Optional |
| "Prometheus" / "Grafana" | Full Observability Stack | prometheus, grafana | Optional |
| "GitHub Actions" | CI/CD Pipeline | github-actions | Optional |
| "Metrics provider (CloudWatch/Datadog)" | Continuous Optimization Engine | datadog | Optional |

**PostgreSQL is the only classification derived as REQUIRED**, because it's the only connector whose justifying capabilities (Discovery Engine, Connector Framework, Migration Execution) genuinely cannot function at all without it — this is a specific, defensible claim, not a blanket "everything relevant is required."

6 real dependency phrases have **no connector-catalog equivalent** and are deliberately left unmapped rather than forced onto an unrelated connector: payment provider (3 commercial capabilities), Stripe billing, SMTP (handled at the platform level, not per-client, per the prior milestone), and message brokers. These surface honestly in the API response as `unmappedDependencies`, verified with a dedicated test.

## E. Required Information Matrix

Reused directly from `RequirementsService.serviceDefinitions` — 5 stages, ~20 requirement fields total, each with `whyRequired`. Not modified; aggregated across all 5 stages in the new endpoint's `requiredInformation` array rather than re-implemented.

## F. Optional Information Matrix

Every connector mapped from a non-postgresql `external_dependencies` phrase is classified `optional` — shown because it's genuinely relevant to an explicitly-enabled service, but not blocking (see table in section D).

## G. Not-Required Dependencies (hidden)

Any of the 33 catalog connectors not linked to any of the client's explicitly enabled capabilities is **omitted from `relevantConnectors` entirely** and counted in `hiddenConnectorCount` — verified live: a client with Discovery Engine enabled shows 1 relevant connector and `hiddenConnectorCount: 32`; a client with nothing enabled shows `hiddenConnectorCount: 33`.

## H. Conditional Requirements

Handled naturally by the enablement-driven design: connector relevance is a direct function of which capabilities are actually enabled (`oc_client_services` status='enabled') — enabling a different capability changes which connectors appear, with no separate branching logic needed. Live-verified: enabling `cap-discovery-engine` → PostgreSQL appears required; enabling `cap-ci-cd` → GitHub Actions appears optional; a client with neither enabled sees neither.

## I. Connection Validation

Unmodified — reuses the exact `ConnectorService.testConnection`/`saveConfiguration` flow from the prior milestone (real DNS/TCP/auth checks, `Configured → Not Verified` until a real test passes). The new "What We Need From You" section on the Connectors page renders the *same* real Configure → Test → Save component for each relevant connector; nothing new was invented for connection testing itself.

## J. Configuration Reuse

Real connector status (`ConnectorService.getConnectors`) is joined into the relevance list — if a connector was already tested for another reason, its real status/timestamp is shown immediately rather than asking the client to re-test. Verified live: PostgreSQL already had a real prior test (`Connected — Verified`, timestamp from an earlier milestone's verification) and it appeared instantly in the new "required" section without any new test being run.

## K. Environment Handling

Not modified this milestone. `ConnectorService`/`oc_connectors` do not currently carry a per-environment (dev/staging/production) dimension — this is a pre-existing scope limit, not something this milestone introduced or masked. Flagged in section W (P1).

## L. Client Isolation

Verified with a dedicated test: enabling a service for client A never appears in client B's `onboarding/requirements` response (`services`, `relevantConnectors` both empty for the unaffected client).

## M. Owner Assignment

Not implemented this milestone as a first-class field (Phase 19's `CLIENT_INFRASTRUCTURE_TEAM`/`ASKABD_DEVOPS`-style enum). `RequirementsService` already has a lighter-weight equivalent (implicit: the client provides requirement values; AskABD's `ProductionPreflightService` already tracks `owner: 'DevOps'/'Security'/'Platform'` for AskABD's *own* dependencies, from the prior milestone). Adding a formal per-requirement owner enum to the new connector matrix was judged out of the smallest-safe-change scope for this pass — flagged as P2.

## N. UI/UX Changes

- `/clients/[clientId]/connectors`: now opens with a **"What We Need From You"** section listing only real, evidence-linked, relevant connectors (with plain "Required for: <capability name>" / "Optional for: <capability name>" text, never internal jargon), followed by a real KPI summary, then a collapsed **"Show all 33 connectors (advanced / admin view)"** toggle — satisfying the client-vs-admin distinction (Phase 18) without a second page. A client with zero services selected sees an honest explanatory empty state pointing to the Services page, not a wall of connectors.
- `/clients/[clientId]/services`: detail panel now shows **"What we'll need from you if enabled"** — the real `external_dependencies` text — before an admin enables a capability, so the connector impact is visible up front.

## O. API Changes

| Method | Path | Purpose |
|---|---|---|
| GET | `/oc/clients/:clientId/onboarding/requirements` | **New.** The single authoritative "what do we need from this client?" answer — real enabled services, real relevant/required/optional connectors with real status, real unmapped dependencies, real outstanding onboarding-stage requirements, real next actions. |
| GET | `/oc/clients/:clientId/services` | Response now additionally includes `externalDependencies` per capability (previously selected but never exposed). |

No existing endpoint's behavior changed for existing callers (purely additive field).

## P. Database Changes

**None.** No migrations added. `oc_capabilities.external_dependencies`, `oc_client_services`, `oc_connectors` all pre-existed; the new service only reads them.

## Q. Tests

**5 new tests**, all passing, in `apps/api/tests/service-requirement-matrix.test.ts`:
1. No explicit service selection → honest empty relevance list (not the operational fallback).
2. Discovery Engine enabled → PostgreSQL required, evidence-linked, real (not fabricated) `not_configured` status for a fresh client.
3. CI/CD Pipeline enabled → GitHub Actions optional; "Container registry" honestly reported as unmapped rather than guessed.
4. Reuses `RequirementsService` for outstanding onboarding-stage requirements (not a second calculation).
5. Client isolation.

## R. Browser Verification

Live-verified in the real running application (not claimed without doing it):
- `/clients/client-c9683df9.../connectors` (a client with Discovery Engine explicitly enabled during this verification): showed **"Based on 1 selected service (Discovery Engine), 1 connector is relevant. 32 others are hidden below as not required"** and the PostgreSQL row showing its real prior "Connected — Verified" status and timestamp.
- The "Show all 33 connectors" toggle still opens the full admin catalog (including a real "Partially Verified" GitHub result persisted from a prior milestone's live test) — the admin capability was preserved, not removed.
- `/clients/client-90c88201.../connectors` (a real "UAT Fresh Client" with no services ever enabled): showed the honest empty state — "No services selected for this client yet... Select services on the Services page first" — with all 33 connectors correctly hidden.
- `/clients/client-c9683df9.../services`: clicked the "CI/CD Pipeline" capability card, confirmed the detail panel shows "What we'll need from you if enabled → GitHub Actions, Container registry."

## S. Existing-Client Regression

The same real client used throughout the prior two milestones (`client-c9683df9-...`, "E2E Lifecycle 1786899458076") was used for this verification and remains intact — no client data was reset or corrupted. Its real `Connected — Verified` PostgreSQL connector status (from a prior milestone) was correctly picked up by the new relevance logic without re-testing.

## T. Fresh E2E

A real "UAT Fresh Client" (already existing from a prior milestone's E2E, not newly created) was used to verify the zero-services empty state, satisfying "use a real existing client... create a fresh test client only if safe and necessary" without adding new client rows.

## U. Remaining Gaps

Honestly scoped out of this milestone, not silently ignored:

## V. P0

None identified as newly introduced by this milestone's work. The pre-existing P0 (`CapabilityPlaceholder` fabricated fallback metrics, flagged in both prior reports) remains unaddressed — still out of scope for a service-onboarding milestone specifically.

## W. P1

- **No environment dimension on connectors.** `oc_connectors` has no dev/staging/production column — a connection tested in one environment cannot be distinguished from another for the same client. Phase 14's "Do not let a DEV connection appear to satisfy a PRODUCTION requirement" is not currently enforceable. Real, pre-existing limitation, not masked.
- **`oc_client_services` has zero explicit rows for every real client except the demo one** — meaning the new relevance-driven Connectors page will show an honest empty state for nearly every real client until an admin explicitly visits the Services page and enables capabilities for them. This is *correct, honest behavior* given the current data, but it means the "3 things we need from you" experience only activates once services have actually been selected — there is currently no forced onboarding step requiring an admin to make that selection during client creation. A follow-up (out of this milestone's scope) would integrate service selection into the client onboarding wizard itself.

## X. P2

- **No formal owner-assignment enum** (`CLIENT_INFRASTRUCTURE_TEAM` / `ASKABD_DEVOPS` etc.) on the new connector-relevance data — Phase 19's exact vocabulary was not implemented; `RequirementsService`'s existing lighter-weight model was reused instead.
- Only 18 of 70 capabilities have any `external_dependencies` data at all; the rest (mostly `advisory`/`business`/`core` category capabilities) have no connector implications by design, correctly excluded rather than guessed at.

## Y. P3

- The `DEPENDENCY_TO_CONNECTOR` mapping table is a manually curated, exact-phrase match against the *current* seeded `external_dependencies` text. If a future capability seed adds a differently-worded external dependency (e.g. "PostgreSQL access" instead of "Database connectivity"), it will correctly surface as `unmappedDependencies` rather than silently fail — but the mapping table itself will need a small addition to classify it. This is an intentional, honest trade-off (explicit unmapped-dependency reporting over fuzzy matching that could misclassify).

## Files Modified

- `apps/api/src/routes/operations-center-routes.ts` — new import, new route, `externalDependencies` added to the existing services response.
- `apps/web/src/app/clients/[clientId]/connectors/page.tsx` — fetches and displays service-driven relevance.
- `apps/web/src/app/clients/[clientId]/services/page.tsx` — detail panel shows real external dependencies.

## Files Added

- `apps/api/src/services/service-requirement-matrix-service.ts`
- `apps/api/tests/service-requirement-matrix.test.ts`
- `apps/web/src/app/clients/[clientId]/connectors/connector-grid.tsx` (rewritten; same filename, effectively a new implementation)
- `docs/service-driven-client-onboarding-report.md` (this file)

## Files Deleted

None.

## Migrations

None — no schema changes.

## API Endpoints

`GET /oc/clients/:clientId/onboarding/requirements` (new). `GET /oc/clients/:clientId/services` (additive field only, no breaking change).

## UI Routes

No new routes. `/clients/[clientId]/connectors` and `/clients/[clientId]/services` both modified in place.

## Git Safety

`git status`, `git diff --cached --name-only` reviewed. Nothing staged. HEAD unchanged at `a9082ca`. No `.env`, credentials, tokens, or database dumps among the changes. Grep for hardcoded secret patterns in the new files returned no matches. **No commit. No push. No PR.**
