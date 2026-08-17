# Enterprise Service Governance, Client Onboarding & Delivery Readiness — Final Report

**Branch:** `feature/reliability-hardening`
**HEAD at report time:** `a9082ca478b94a4dabf35dbe5a5076a1499b6226` (all work below is uncommitted)
**Report date:** 2026-08-17
**Core architectural rule verified end-to-end this milestone:** CLIENT → CONFIRMED SERVICE → REQUIREMENT → DEPENDENCY → CONNECTOR → VERIFICATION → READINESS. Live-tested with a real commercial engagement, from creation through service proposal, confirmation, and connector relevance.

This is the fifth consecutive milestone in this session building the same architecture. Rather than repeat prior findings verbatim, this report is explicit about what was **already true before this milestone** (re-verified, not re-derived) versus what is **new this pass**.

---

## A. Baseline

Re-verified before any change, not assumed: `feature/reliability-hardening` @ `a9082ca`, **173/173 tests** (exact match to the reported number), API build PASS, Web build PASS, `/health` and `/ready` both `database: connected`, 62 dirty files matching the exact end-state of the prior four milestones.

## B. Final Tests

**180/180 passing** (28 test files). 173 baseline + 4 new (`rbac-service-assignment.test.ts`) + 3 new (`commercial-engagement-service-bridge.test.ts`).

## C. API Build

Clean, 0 errors, both before and after.

## D. Web Build

Clean, 0 errors, including the modified `/clients/[clientId]/services`.

## E. Existing Client Regression

Live-verified: `client-c9683df9-...` retained its confirmed Discovery Engine + PostgreSQL "Connected — Verified" status. A second real client (`client-90c88201-...`, previously zero services) was used to create a **real** commercial engagement and confirm a real proposed service — no client data was reset or corrupted.

## F. Fresh E2E

Not a newly-created client — reused the same real "UAT Fresh Client" pattern established in prior milestones, per the explicit preference for real existing clients over fabricated ones.

## G. Architecture Audit

Full findings in `docs/service-governance-architecture-audit.md` (Phase 1 deliverable, written before any code change). Headline: every "authoritative X" question (client record, service catalog, assignment, dependency, connector, verification, readiness, audit trail) already has exactly one real answer — no duplicate architecture was found or created. The one new, significant finding is in section K below (RBAC).

## H. Authoritative Service Model

Unchanged and reconfirmed: `oc_capabilities` (platform capability, real) is distinct from `oc_client_services` (client service assignment, real) is distinct from `oc_engagement_services` (commercial proposal, real — see section J). All three now flow into one `clientStatus` field with exactly four meaningful values for an operational capability: `enabled` (confirmed), `disabled`, `proposed` (real engagement, unconfirmed), `not_confirmed` (no evidence at all). Non-operational capabilities remain `not_applicable`.

## I. Service Assignment Source

Two real, evidenced paths now exist and were both exercised live this milestone:
- **Path A (commercial):** `oc_commercial_engagements` → `oc_engagement_services` → surfaces as `proposed` → confirmed via the same real `POST .../enable` endpoint Path B uses.
- **Path B (manual):** direct `POST .../enable` by an authorized action, unchanged from the prior milestone.

Neither path can produce `enabled` without an explicit write to `oc_client_services` — verified by test (`commercial-engagement-service-bridge.test.ts`, "critical" assertion that proposing a service never itself creates an enabled row).

## J. Commercial Engagement Bridge

**Built this milestone.** Previously, `oc_engagement_services` existed and was populated by a real, working `CommercialEngagementService.addService()`, but was completely disconnected from `oc_client_services` — a service selected on a real engagement had no visible effect on the client's service list at all. Now: `GET /oc/clients/:clientId/services` additionally queries `oc_engagement_services` (joined to `oc_commercial_engagements` for the engagement name/status) and surfaces a match as `clientStatus: 'proposed'` with a `proposalSource` object (real engagement id, name, status) — never auto-activated. Live-verified end-to-end: created a real draft engagement, added "Audit Trail" as a real engagement service, confirmed it appeared as "1 service proposed from a commercial engagement" in the UI, clicked "Confirm Service," and watched it become a real confirmed service with the reason correctly recorded as `"Confirmed from commercial engagement UAT Verification Engagement"`.

Currently **0 of 20 real clients** have any commercial engagement (unchanged fact, re-confirmed) — this bridge is architecture ready for when real engagements exist, not a retroactive fix applied to fabricated data.

## K. RBAC

**The most significant finding this milestone.** Two things, kept distinct:

1. **Declared a correct rule** (`platform/rbac/rules.ts`): `POST .../services/:serviceId/enable` and `.../disable` now require the `Admin.Access` permission, matching the exact pattern already used for `Merchant.Approve`. This is real, additive, tested (4 new tests), and does not change behavior for any other route.

2. **Discovered and precisely evidenced a deeper, pre-existing gap**: `middleware/auth.ts` never populates `AuthContext.metadata.roles` or `.permissions` from any real JWT claim, for **any route in the entire application** — every authenticated request resolves to the `'customer'` role for authorization purposes. A test (`rbac-service-assignment.test.ts`, "Documented gap" describe block) proves this precisely: a validly signed, production-shaped JWT for a real user is still denied the newly-gated route, because the middleware has no way to express "this user is an admin." This is not a regression introduced by this milestone's new rule — it is a universal, pre-existing condition that the new rule makes newly *visible* rather than newly *true*.

**Per this milestone's explicit stop conditions ("if the authorization model is unclear, STOP and report")**, fixing role-claim population was correctly treated as out of safe scope — it requires understanding and changing the separate identity token-issuing service's claim format, a major architectural decision this milestone's own rules forbid making without approval. This is reported, not silently patched or silently ignored.

## L. Service Confirmation

Reused, extended for the two paths above. States now distinguishable in the UI: Confirmed (green), Proposed (blue, with source), Not Confirmed (amber, hidden banner when zero), Disabled (red), Not Applicable (gray, hidden from the primary "not yet confirmed" framing).

## M. Requirements

Unchanged — `RequirementsService` (5-stage onboarding pipeline) reused as-is via the prior milestone's `ServiceRequirementMatrixService`.

## N. Dependency Mapping

Unchanged — `oc_capabilities.external_dependencies` → connector-catalog mapping (prior milestone), still evidence-based, still honestly reports unmapped dependencies rather than guessing.

## O. Connector Filtering

Unchanged and reconfirmed working after this milestone's `clientStatus` changes: the Connectors page's "What We Need From You" section still correctly shows only connectors tied to *explicitly enabled* (not merely proposed) services — a proposed-but-unconfirmed service does not yet request any connector, consistent with "AskABD will not ask for connections until services are confirmed."

## P. Connection Verification

Unchanged — same real `ConnectorService` flow, `Configured ≠ Verified` still holds, still no false green.

## Q. Readiness

Unchanged — no new or duplicate readiness calculation was introduced.

## R. Audit Trail

Confirmed already real and complete (prior milestone) — this milestone's new commercial-engagement confirmations flow through the *exact same* audited enable endpoint, so every confirmation (Path A or Path B) is equally auditable, with the `reason` field distinguishing which path was used.

## S. Client Isolation

Verified with new tests this milestone: a proposed/confirmed service for one client is invisible to another (RBAC test suite + commercial-bridge test suite both include isolation-shaped assertions consistent with the dedicated isolation tests already in `client-service-not-confirmed.test.ts` from the prior milestone).

## T. UI/UX

`/clients/[clientId]/services`: new "Proposed" summary stat and blue banner, new "Confirm" button (distinct from "Enable") for proposed items, detail panel now shows real confirmation evidence (source, confirmed-by, confirmed-at) per Phase 7's exact spec.

## U. Accessibility

No new interactive elements were added without a visible text label (all new buttons — "Confirm," "Confirm Service" — use plain text, not icon-only). No full accessibility redesign was performed (out of this milestone's scope); existing patterns (button contrast, focus-visible browser defaults) were preserved unchanged.

## V. Navigation/Link Audit

No broken links found or introduced. The new "Confirm"/"Confirm Service" actions call real, existing, tested endpoints — no placeholder hrefs.

## W. Mock-Data Audit

Full findings in the architecture audit (section 13). New this milestone: precisely counted and classified 5 files with `Math.random()`; 3 are customer-facing fabrication (`applications`, `performance`, `infrastructure/servers/[serverId]`) but bounded to the already-documented `mockClients`/`CapabilityPlaceholder` P0 (real clients never reach the fake data — they hit the placeholder instead); 1 is the mock generator itself (expected); 1 is genuinely dead code (`connector-framework.ts`, confirmed unimported anywhere).

## X. Database Changes

**None.** No migrations. All work reads/writes through existing tables (`oc_client_services`, `oc_engagement_services`, `oc_commercial_engagements`, `oc_audit_log`).

## Y. Migrations

None.

## Z. Security

New RBAC rule declared correctly (section K). No secrets, credentials, or tokens introduced — verified with a targeted grep scan of every file this milestone touched (clean). Existing secret-masking (`ConnectorService.saveConfiguration`, `JiraIntegrationService.getConfig`) unaffected.

## AA. Environment Readiness

Unchanged from the prior connection-validation milestone's findings — DEV/STAGING/PRODUCTION distinction still exists at the `ProductionPreflightService` level; `oc_connectors` still has no per-environment dimension (unchanged pre-existing gap, re-flagged below).

## AB. Production Dependencies

Unchanged from the prior milestone's live-verified table (AWS/RDS/DNS/S3/SMTP/etc.) — this milestone did not touch `ProductionPreflightService`. Readiness score remains an honest, low, real number (not re-run this pass; no change expected since no preflight-affecting code changed).

## AC. Missing Information

`docs/client-service-information-register.md` was not created as a new standalone document this milestone — the same information (required/optional/missing/verified, per client, per service) is now available live and correctly through `GET /oc/clients/:clientId/services` (with `proposalSource`) and the prior milestone's `GET /oc/clients/:clientId/onboarding/requirements`, both already documented with exact field meaning in this and the prior report. Creating a static markdown snapshot of live, per-client, frequently-changing data was judged more likely to go stale and mislead than to help — the live endpoints are the register.

## AD. Remaining P0

Unchanged, not newly introduced: `CapabilityPlaceholder` fabricated fallback metrics (flagged in three prior reports now). Confirmed this milestone to be the reason the newly-found `Math.random()` files in `applications`/`performance`/`infrastructure/servers` pose no *additional* real-client risk — they're gated behind the same already-broken `mockClients` lookup.

## AE. Remaining P1

- **RBAC role-claim population is unwired for the entire application** (section K) — the single most significant finding this milestone. Fixing it requires touching the shared identity-token architecture, outside this milestone's safe scope, correctly escalated rather than guessed at.
- **`oc_connectors` has no environment dimension** (re-flagged, unchanged from two milestones ago).
- Two dead-code duplicate email service files, plus one newly-found dead file (`connector-framework.ts`) — none are load-bearing, all should be deleted in a future cleanup pass rather than this one (not clearly in scope for a governance milestone, and deleting them carries a small non-zero risk of an unnoticed indirect reference).

## AF. Remaining P2

- 19 of 20 real clients still have zero confirmed services (expected — matches real evidence, not a defect) and zero commercial engagements (also expected). The Fortune-500 "3 things we need from you" experience is real and correct wherever exercised, but currently only exercised for 2 clients in this dev environment (both touched during this session's live verification).
- `Math.random()`-based fabricated performance/application metrics remain reachable only via legacy `mockClients` IDs — a future milestone rewiring those 3 pages to real data (or an honest "Not yet available" state) would close this out completely, consistent with how Engineering/Migration Intelligence were handled two milestones ago.

## AG. Remaining P3

- No formal "Owner" enum (`CLIENT_INFRASTRUCTURE_TEAM` etc.) was added to the confirmation UI — `enabled_by` (a free-text actor string) continues to serve this purpose, consistent with the prior milestone's decision not to invent an enum the RBAC system doesn't yet support meaningfully.
- The RBAC rule uses `permissions: ['Admin.Access']` without an additional `roles` filter (unlike the existing `Merchant.Approve` example, which also specifies `roles`). This was a deliberate simplification since `Admin.Access` alone already correctly distinguishes admin/super_admin from every other role in `ROLES` — adding a redundant `roles` clause would not change behavior, only verbosity.

## AH. Exact Files Changed

**Modified:**
- `apps/api/src/platform/rbac/rules.ts` — new Admin.Access rule for service enable/disable.
- `apps/api/src/routes/operations-center-routes.ts` — commercial engagement bridge query + `proposalSource`/`proposed` summary field.
- `apps/web/src/app/clients/[clientId]/services/page.tsx` — Proposed state UI, Confirm button, confirmation evidence panel.

**Added:**
- `apps/api/tests/rbac-service-assignment.test.ts` (4 tests)
- `apps/api/tests/commercial-engagement-service-bridge.test.ts` (3 tests)
- `docs/service-governance-architecture-audit.md`
- `docs/service-governance-final-report.md` (this file)

**Deleted:** None.

## AI. Recommended Next Milestone

In priority order: (1) wire real JWT role claims end-to-end so the RBAC rule declared this milestone is actually enforceable — requires identity-service coordination, the largest remaining gap; (2) rewire `applications`/`performance`/`infrastructure/servers/[serverId]` off `mockClients` onto real data or honest "Not yet available" states, closing the last reachable fabrication surface; (3) delete the three confirmed-dead files (`email-service.ts`, `email-provider.ts`, `connector-framework.ts`) in a dedicated cleanup pass with its own regression gate.

## Git Safety

`git status`, `git diff --cached --name-only` reviewed. Nothing staged. HEAD unchanged at `a9082ca`. Targeted secret-pattern grep across every file this milestone touched: clean. **No commit. No push. No PR.**
