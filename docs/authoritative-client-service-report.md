# Authoritative Client Service Assignment + Service-Aware Onboarding — Final Report

**Branch:** `feature/reliability-hardening`
**HEAD at report time:** `a9082ca478b94a4dabf35dbe5a5076a1499b6226` (all work below is uncommitted)
**Report date:** 2026-08-17
**Ultimate principle applied:** AskABD must know *what it is doing for this client* before it asks *what access it needs*. Verified this reasoning chain works end-to-end: Confirmed Service → Dependency → Relevant Connector → Verification → Readiness — never the reverse (catalog → guess a client needs it).

---

## A. Baseline

Re-verified before any change (previous number explicitly not trusted, per instruction):
- Branch/HEAD: `feature/reliability-hardening` @ `a9082ca`, working tree consistent with prior milestones (60 dirty files, nothing lost).
- Tests: **168/168 passing** (re-run fresh — matched the previously reported number exactly).
- API build: PASS. Web build: PASS. `/health`/`/ready`: both `database: connected`.

## B. Final Test Count

**173/173 passing** (26 test files). 168 baseline + 5 new in `apps/api/tests/client-service-not-confirmed.test.ts`.

## C. API Build

Clean, 0 errors, both before and after this milestone's changes.

## D. Web Build

Clean, 0 errors, all routes including the modified `/clients/[clientId]/services`.

## E. Existing Client Regression

Live-verified: the same real client used across the last two milestones (`client-c9683df9-...`) retained its 1 explicitly-confirmed service (Discovery Engine) and its real "Connected — Verified" PostgreSQL connector status — nothing was reset or lost by this milestone's fallback fix.

## F. Fresh E2E

Not newly created — used an existing real "UAT Fresh Client" (from a prior milestone's E2E) to verify the zero-confirmed-services state, per the explicit instruction to prefer a real existing client and only create a fresh one if genuinely necessary.

## G. Existing Service Architecture

Unchanged from the prior milestone's findings — `oc_capabilities` (70 real platform capabilities) + `oc_client_services` (real per-client enablement, with working `enable`/`disable` endpoints, dependency-conflict checking, and audit logging already in place) + `oc_service_bundles` (5 bundles). This milestone did not add a second service catalog or a second enablement mechanism — it corrected how the *existing* mechanism's absence is reported.

## H. Current Fallback Behavior — Investigated and Fixed

**The exact defect:** in `GET /oc/clients/:clientId/services`, `clientStatus` was computed as:
```
enablementMap[c.id]?.status || (c.status === 'operational' ? 'enabled' : 'not_applicable')
```
Any of the 29 platform-*operational* capabilities, for a client with **no explicit `oc_client_services` row**, was reported as `clientStatus: 'enabled'` — indistinguishable from a genuine confirmation. This is "platform capability available" masquerading as "client service confirmed," exactly the conflation this milestone's absolute rule forbids.

**Verified real-world impact:** for the test client, this previously showed **"29 Enabled"** in the summary card while the independently-calculated coverage stat (which already correctly used only explicit rows) showed **"3% Coverage"** (1/29) — a visible, self-contradicting inconsistency on the same page, now resolved.

**The fix:** one-line change — the fallback for operational capabilities is now `'not_confirmed'`, a new explicit status, instead of `'enabled'`. Non-operational capabilities (foundation/planned/concept) remain `'not_applicable'` — a materially different fact ("the platform doesn't offer this to anyone yet") from `'not_confirmed'` ("the platform offers this, but this specific client hasn't been confirmed to receive it").

Two downstream endpoints were checked and found to **already be correct** (not touched): `GET /oc/clients/:clientId/services/coverage` and `GET /oc/clients/:clientId/service-bundles/recommended` both already query `oc_client_services` directly with no fallback — this is why the coverage percentage was already trustworthy while the enabled-count badge was not.

## I. Service Assignment Evidence — Investigated Per Client

Every plausible authoritative source was checked directly against the database, not assumed:

| Source | Real rows for real (non-demo) clients | Usable as service-assignment evidence? |
|---|---|---|
| `oc_client_services` (explicit enablement) | **0** | N/A — this *is* the target table |
| `oc_engagement_services` (commercial engagement → service link) | **0** (all 15 real rows belong exclusively to the fictional `demo-meridian-financial`) | No real evidence exists |
| `oc_commercial_engagements` | **0** (zero commercial engagements of any status exist for any real client) | No real evidence exists |
| `oc_client_service_requirements` | Present, but `service_id` values are the 5 onboarding-*stage* pseudo-IDs (identity-verification, security-validation, environment-registration, connector-configuration, discovery) — not real capability IDs | Not usable — different concept (onboarding progress, not purchased service) |
| `oc_lifecycle` | Present, but carries only onboarding pipeline status, no service reference | Not usable |
| `oc_proposals` | **0** for real clients | No real evidence exists |

## J. Existing Clients WITH Confirmed Services

**1 of 20** real clients has an explicit service confirmation — `client-c9683df9-1a9d-4424-9eb8-bba6dbf6ca79` ("E2E Lifecycle 1786899458076"), which had "Discovery Engine" (`cap-discovery-engine`) explicitly enabled during the *previous* milestone's live verification (a real action through the real `POST .../enable` endpoint, not a database edit). This is the only client with any real, evidence-backed service assignment anywhere in the system.

## K. Existing Clients WITHOUT Confirmed Services

**19 of 20** real clients have zero explicit `oc_client_services` rows and, per section I, zero recoverable evidence from any other source. Per Phase 3's explicit instruction, **no service assignment was fabricated or inferred for any of them.** They correctly show "Services have not yet been confirmed for this client" with 0 confirmed / 29 not-confirmed (operational capabilities) each.

## L. Service Assignment Changes Made

**None to client data.** No mass-population occurred — the milestone's evidence audit (section I) found no basis for any, and Phase 3/24 explicitly forbid inferring assignments without real evidence. The only change was to the *reporting logic* (section H) — how an absence of assignment is honestly represented — not to the underlying data.

## M. Service Dependency Matrix

Unchanged and reused as-is from the prior milestone (`service-requirement-matrix-service.ts`) — already correctly used only explicit `oc_client_services` rows (never the fallback), so it required no change to comply with this milestone's mandate. Verified this remains true: `getClientOnboardingRequirements` queries `WHERE cs.status = 'enabled'` directly against `oc_client_services`, joined to real `oc_capabilities.external_dependencies`.

## N. Required Information

Unchanged — reused directly from `RequirementsService` (onboarding-stage requirements) and the connector-relevance `required` classification (PostgreSQL, when Discovery Engine/Connector Framework/Migration Execution are confirmed) from the prior milestone.

## O. Optional Information

Unchanged — connectors mapped from non-database `external_dependencies` phrases (GitHub Actions, Prometheus, AWS, etc.) remain classified `optional`.

## P. Connector Filtering

Verified still correct after this milestone's fallback fix: the Connectors page continues to show only connectors backed by real, explicit service confirmation — completely unaffected by the `oc_client_services` fallback change, because it was never reading that fallback path to begin with (confirmed by live re-test, section E).

## Q. Connection Verification

Unchanged — same real `ConnectorService.testConnection`/`saveConfiguration` flow from two milestones ago. `Configured ≠ Verified` continues to hold.

## R. Service Readiness

Not newly calculated this milestone (no new readiness formula was introduced). Existing readiness signals (`RequirementsService.getReadiness`, `ConnectorService` real status) continue to be surfaced through the prior milestone's `onboarding/requirements` endpoint, now backed by an honestly-reported (rather than fallback-inflated) service list.

## S. Audit Trail

**Already fully implemented, not modified.** Both `POST /oc/clients/:clientId/services/:serviceId/enable` and `.../disable` already write a real `oc_audit_log` entry (`entityType: 'client_service'`, real `actor`, `reason`, before/after implicit in the action name) on every call — verified with a new test that confirms the actor and reason are recorded exactly as submitted. This satisfied Phase 16 without any new code.

## T. Client Isolation

Verified with a new dedicated test: confirming a service for Client A leaves Client B's status as `not_confirmed` — never inherited, never leaked.

## U. UI Changes

`/clients/[clientId]/services`:
- New warning banner when a client has zero confirmed services: **"Services have not yet been confirmed for this client... AskABD will not ask for connections or requirements until you confirm which services this client is actually receiving."**
- Summary cards relabeled: "Enabled" → **"Confirmed"**, with a new **"Not Confirmed"** count card (previously invisible — the 29 not-confirmed capabilities were silently counted as "enabled").
- Per-card and detail-panel status text now shows human labels ("not yet confirmed" / "confirmed" / "not applicable") instead of raw enum values.

## V. API Changes

`GET /oc/clients/:clientId/services`: `clientStatus` fallback for operational capabilities changed from `'enabled'` to `'not_confirmed'`; `summary` response gained a `notConfirmed` count. No breaking change for any caller — verified the only other consumers (`services/coverage`, `service-bundles/recommended`, the prior milestone's `onboarding/requirements`, and `client-portal/[clientId]/journey`'s narrow `=== 'disabled'` check) either already ignored this fallback or are unaffected by the value changing from `'enabled'` to `'not_confirmed'` (both are equally "not truly enabled" for every consumer's actual logic).

## W. Database Changes

**None.** No migrations. No schema changes. No data changes to any client's `oc_client_services` rows.

## X. Migrations

None.

## Y. Remaining P0

None newly introduced. The pre-existing `CapabilityPlaceholder` fabricated-metrics P0 (flagged in the two prior reports) remains open and out of scope for a service-assignment milestone.

## Z. Remaining P1

- **No formal confirmation *workflow* beyond Enable/Disable buttons.** Phase 4 asked for a "confirmation workflow" — the existing Enable/Disable mechanism (already real, already audited) technically satisfies "an authorized user can assign/remove a service," but there is no dedicated "propose → confirm" two-step flow, no bulk "confirm these 3 services from the signed engagement" action, and no visible link from a commercial engagement (`oc_commercial_engagements`) to the service-confirmation screen even though `oc_engagement_services` exists as the natural bridge. Building that bridge was judged out of the smallest-safe-change scope for this pass (0 real engagements exist to wire it against today) — flagged for the milestone that introduces real commercial engagements for real clients.
- **No RBAC gating on service assignment.** The existing RBAC engine (`platform/rbac/`) is real and functional but models e-commerce/comparison-platform permissions (`Product.Read`, `Merchant.Approve`, etc.) — it has never been extended to operations-center concepts, and `operations-center-routes.ts` (including the service-enable endpoints) is not gated by it at all. The entire console currently operates as a single implicit "Super Admin" persona (matches `nav.tsx`'s hardcoded "SA" badge). Inventing a new `Account Manager`/`Service Manager` role that doesn't exist in the real RBAC engine was explicitly avoided per Phase 6's instruction not to invent authorization rules — the honest state is recorded here instead.

## AA. Remaining P2

- **19 of 20 real clients show "not yet confirmed."** This is correct, honest behavior given the evidence (section I) — but it means the Fortune-500 "3 things we need from you" experience currently activates for only 1 client. A follow-up milestone integrating service confirmation into the client-creation/onboarding wizard itself (so every new client leaves onboarding with real, explicit service confirmation rather than requiring a separate manual step) was out of this milestone's scope.
- No explicit "No longer required by current services" annotation is shown for a connector that *was* relevant to a now-disabled service — the credential is correctly preserved (verified by test) and the connector correctly drops out of the "required" list, but there's no distinct visual state explaining *why* it disappeared versus never having been relevant.

## AB. Remaining P3

- Service assignment states are currently binary (`enabled`/`disabled`) rather than the full vocabulary Phase 5 suggested (`PROPOSED`/`ACTIVE`/`SUSPENDED`/`COMPLETED`/`CANCELLED`). Reusing the existing binary states (per the explicit instruction to "reuse existing terminology where possible" and avoid unnecessary new code) was judged sufficient for this pass; a genuine multi-stage lifecycle would need real business processes (e.g. a "proposed" state implies someone needs to review and confirm it, which circles back to the RBAC gap in section Z) to be meaningful rather than decorative.

## Files Modified

- `apps/api/src/routes/operations-center-routes.ts` — the one-line fallback fix (`'enabled'` → `'not_confirmed'`) plus `notConfirmed` added to the summary response.
- `apps/web/src/app/clients/[clientId]/services/page.tsx` — confirmation banner, relabeled summary cards, human-readable status labels.

## Files Added

- `apps/api/tests/client-service-not-confirmed.test.ts` (5 tests)
- `docs/authoritative-client-service-report.md` (this file)

## Files Deleted

None.

## Migrations

None.

## Git Safety

`git status`, `git diff --cached --name-only` reviewed. Nothing staged. HEAD unchanged at `a9082ca`. No `.env`, credentials, tokens, or database dumps among the changes. No secret patterns found in new files. **No commit. No push. No PR.**
