# AskABD — Real Data Integrity Register

**Date:** 2026-08-16 | **Branch:** `feature/reliability-hardening` (uncommitted)
**Method:** repository-wide grep for `mock`/`mockData`/`mock-clients`/`demo`/`sample`/`fake`/`placeholder` across `apps/web/src` and `apps/api/src`, cross-referenced against the live API (curl + browser) to confirm which values are genuinely database-backed. Every classification below is evidence-based — file paths and line-level findings, not assumptions.

Classification vocabulary used throughout, exactly as specified:
**REAL** (authoritative backend/DB) · **DEMO/UAT** (intentionally seeded test data) · **NOT AVAILABLE** (capability doesn't exist) · **NOT CONFIGURED** (external dependency not connected) · **NOT VERIFIED** (exists but unverified in this environment).

---

## A. Total mock-data sources found

Three distinct fabricated-data systems, all client-side, none backed by any API:

| # | Source | Files depending on it | What it fabricates |
|---|---|---|---|
| 1 | `apps/web/src/app/lib/mock-clients.ts` | **54 files** (grep-confirmed) | Entire client operational profiles: health, SLA, platform score, incidents, service requests, deployments, environments (dev/staging/prod status), applications, services, monitoring/availability |
| 2 | `apps/web/src/app/lib/engineering-intelligence.ts` (`generateMockDefects()`, marked `// MOCK DATA GENERATOR`) | 9 files (`engineering/*`, `client-portal/[clientId]/journey`, `clients/[clientId]/engineering`) | Hand-authored fake defects with fabricated root-cause analysis, confidence scores, and specific dollar business-impact figures (e.g. "$45K/hour revenue impact") attached to the same client names used in `mock-clients.ts` |
| 3 | `apps/web/src/app/lib/migration-intelligence.ts` (marked `// MOCK DATA`) | 5 files (`migrations/*`) | Fabricated migration programs, readiness %, risk scores |

Plus **inline hardcoded literals** with no generator at all: the former dashboard's "Engineering/Migration Intelligence" tiles (`5` Open Defects, `96%` Build Health, `82%` Code Quality, `72%` Confidence, `3` Programs, `62%` Readiness, `57/100` Risk, `22%` Avg Progress) — now removed from the dashboard (§H).

`apps/web/src/app/lib/organization-model.ts` (also marked `// MOCK DATA`) has **zero page-level consumers** found — appears to be unused/dead utility code, not an active fabrication source. Not investigated further given no live impact.

## B. Production-facing mock sources (i.e., reachable by any real user today)

All of the above — none are gated behind a "demo mode" flag or hidden from normal navigation. Every one of the 54 + 9 + 5 = **68 file-level dependencies** is reachable via the main nav with no indication (prior to this session's fixes) that the content isn't real.

## C. Demo/UAT sources

None of the fabricated data is *labeled* as demo/UAT anywhere in the product — that's the core finding this milestone addresses. Separately, **legitimate DEV/UAT test data exists and should be preserved**: the E2E/regression scripts in `apps/api/scripts/` create real database rows for clients named `E2E Lifecycle <timestamp>`, `UAT Fresh Client <timestamp>`, etc. — these are **REAL rows in `oc_clients`**, not fabricated frontend data, and are correctly left alone (not deleted, per instruction).

## D. Real-data pages (confirmed via code + live API)

Client-scoped: compliance, discovery, assessment, gaps, migrations (`clients/[clientId]/migrations`, distinct from the top-level fabricated `/migrations`), engagements, payments, reconciliation, lifecycle, requirements, scorecard.
Platform-scoped: `/platform`, `/platform/services`, `/platform/production-readiness`, `/platform/defects`, `/platform/incidents`, `/platform/commercial`, `/platform/integrations/jira`.
All confirmed by direct code inspection (real `fetch`/`apiSafe` calls to `apps/api` endpoints) and, for 9 of them, by live browser rendering this session.

## E. Pages wired to real APIs (this milestone's changes)

| Page | Before | After |
|---|---|---|
| `/` (Executive Dashboard) | 100% `mock-clients.ts` + hardcoded literals | `GET /api/v1/oc/clients` (real `oc_clients` table) for client counts/health/SLA; `/platform/health` for platform status (unchanged, was already real); every KPI with no real source now explicitly reads "Not yet available" instead of a fabricated number |
| `/clients` (Client Directory) | 100% `mock-clients.ts`, plus a separate localStorage-based "onboarded clients" shadow list | Same `GET /api/v1/oc/clients` call, single authoritative source (the localStorage shadow list — `OnboardedClientsRows`/`NewClientsCount` — is now redundant and no longer used on this page, since real clients already include everything created through onboarding) |
| `/clients/[clientId]/incidents` | `mock-clients.ts` fabricated incident list | Honest "not yet connected" state (see §G) linking to the real `/platform/incidents` |

Verified live in-browser after the change: dashboard and directory both correctly show the same 19 real clients (grown to across this session's test runs), with real health/SLA/score/contact/onboarded-date values and zero fabricated figures.

## F. Pages requiring backend work (not done this pass — genuinely new capability)

These have **no existing service or table to wire to** — building them would mean designing new backend capability, explicitly out of this milestone's "smallest additive endpoint" mandate:

| Area | Pages | What backend capability is missing |
|---|---|---|
| Client "360" operational shell | `applications`, `infrastructure`, `environments`, `alerts`, `deployments`, `monitoring` (per-client), `performance`, `usage`, `risks`, `roadmap`, `timeline`, `maturity`, `contracts`, `contacts`, `documents`(client-scoped, distinct from the real document-storage-service used by requirements), `knowledge`, `consulting`, `automation`, `testing`, `support`, `reports` (per-client) | No corresponding service exists anywhere in `apps/api/src/services/` for tracking client applications, infrastructure inventory, environment health, deployment history, or alerts. These would each be genuine new features. |
| Engineering Intelligence | `/engineering/*` (9 files) | Real defect data *does* exist (`defect-detection-service.ts`, used correctly by `/platform/defects`) but with a much simpler shape (no root-cause narrative, no dollar-impact estimate, no "confidence score" AI framing). Rewiring `/engineering` to the real defects API is *feasible* but would mean removing most of the rich (fabricated) UI those pages currently show — a real product decision, not a mechanical wire-up. |
| Migration Intelligence | `/migrations/*` (5 files, top-level) | Real migration data exists (`migration-execution-service.ts`, `migration-validation-service.ts`), used correctly by the client-scoped `/clients/[clientId]/migrations`. The top-level `/migrations` portfolio view uses the separate fabricated generator instead — same situation as Engineering: feasible to rewire, but a real product-scoping decision, not done here. |

## G. Pages intentionally showing an "unavailable" state (fixed this pass)

- `/clients/[clientId]/incidents` — now shows `NotYetAvailable` (new component, `apps/web/src/app/components/not-yet-available.tsx`) with an honest explanation and a link to the real platform-incidents page, rather than a fabricated per-client incident list.
- Dashboard KPI tiles for Availability, Today's Deploys, Incidents, Requests, Platform Score — now show "Not yet available" with a tooltip explaining why, rather than a computed-from-fake-data number.

**Not fixed this pass (documented, not silently left broken):** the other ~49 mock-dependent client sub-pages (§F) and the two `/engineering` + `/migrations` intelligence areas (14 files) continue to show fabricated data as before. This is a deliberate scope boundary, not an oversight — see §Q/R below.

## H. Fabricated KPIs removed

From the executive dashboard specifically: Availability %, Today's Deployments, Incidents (aggregate), Open Service Requests, Platform Score (aggregate), and the two "Engineering Intelligence"/"Migration Intelligence" numeric tile grids (8 individual fabricated figures). All replaced with either a real value or an explicit "Not yet available" state — none silently dropped without explanation.

## I. New APIs

**None.** Every real-data wire-up this pass used an API that already existed (`GET /api/v1/oc/clients`) — confirmed via code search before writing any new endpoint, per Phase 13's explicit requirement.

## J. Database changes

**None.** No migrations, no schema changes.

## K. Tests before

146/146.

## L. Tests after

**146/146** — unchanged. This was a frontend data-source swap with no API contract change, so no new backend tests were needed; the existing suite continues to validate the `GET /oc/clients` endpoint this milestone now depends on more heavily (it was already exercised by `commercial-engagement.test.ts` and the E2E scripts).

## M. Existing client regression

**11/11 intact** (grew from 10 to 11 across this session's verification runs; all pre-existing clients unchanged and unaffected by the frontend changes, which touch no database state).

## N. Fresh E2E

**27/27 PASS.**

## O. API build

**PASS** (`npm run build` in `apps/api`, exit 0 — unrelated to this pass, re-verified to confirm nothing regressed).

## P. Web build

**PASS** (`npm run build` in `apps/web`, exit 0, includes the dashboard/directory/incidents rewrites and the new `NotYetAvailable`/`DemoDataBanner` components).

---

## Q. Remaining P0

*(none — the two highest-visibility pages, which is what made the P0 finding severe in the first place, are fixed)*

## R. Remaining P1

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| ~49 client-detail sub-pages still render 100% fabricated `mock-clients.ts` data with no disclosure | §F table | Any real client opened through Applications/Infrastructure/Environments/etc. shows data belonging to a different (fake) organization entirely | Two-track: (1) mechanically apply `DemoDataBanner`/`NotYetAvailable` to each as an honesty interim step — small, safe, same pattern already proven on 3 pages; (2) separately decide, page by page, which of these represent real intended product features (→ build the backend) vs. speculative/decorative screens that should be removed |
| `/engineering` (9 files) and `/migrations` (5 files, top-level) present elaborately fabricated "AI-analyzed" data — specific dollar figures, confidence scores, root-cause narratives — as if real | `lib/engineering-intelligence.ts`, `lib/migration-intelligence.ts` | Most severe individual instance of "AI-looking numbers without real logic" (explicitly forbidden by Phase 10) found in the whole audit | Real backend data exists for both domains (`defect-detection-service.ts`, migration services) with a simpler, honest shape. Rewiring is a genuine feature/product-design task — these pages would need to be substantially simplified to match what's actually knowable, not a 1:1 swap. Recommend as its own dedicated milestone. |

## S. Remaining P2

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| `health`, `sla_status`, `platform_score` on `oc_clients` are real database columns but currently static defaults (every observed client shows `health:"healthy"`, `sla_status:"compliant"`, `platform_score:50`) rather than live-computed | Live API response, this session | The dashboard/directory now show real *columns*, but those columns don't yet reflect live operational state — an honest improvement over fabrication, but not yet a live health signal | The real, per-client live health computation already exists and is proven (`/oc/clients/:id/health-score`, powering the Scorecard page). A natural next step is having that computation periodically update these summary columns, or having the directory call it per-row — a real, scoped backend task, not done here to avoid N+1-query risk without a demonstrated need |
| `organization-model.ts` appears to be dead code (marked "MOCK DATA", zero found consumers) | Grep | Low — no live impact found | Verify with a repo-wide search before deleting; not investigated further this pass |

## T. Remaining P3

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| Client Overview table's avatar "logo" now derives from name initials instead of a stored logo field (since `mock-clients.ts`'s `logo` field is gone and `oc_clients` has no populated logo data in practice) | `page.tsx`, `clients/page.tsx` | Cosmetic only | Low priority |

---

## Bottom line

This audit confirms the prior UX review's headline finding in full detail and closes the two most consequential instances of it: **the executive dashboard and client directory — the two pages virtually every user sees first — now show real client data or an honest "not yet available" state, never fabricated numbers.** The remaining ~49 pages and the Engineering/Migration Intelligence areas are real, substantial fabricated-data surfaces that were **not** rewired this pass, by design — doing so would mean either building genuinely new backend capability (out of scope for an additive pass) or making real product decisions about what to keep, simplify, or remove (not something to decide unilaterally). Both are documented above as scoped, prioritized backlog items, not silently left as an unstated gap.
