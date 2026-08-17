# AskABD — Fortune 500 UX & Operator Experience Review

**Date:** 2026-08-16 | **Branch:** `feature/reliability-hardening` | **Base:** `a9082ca` + subsequent API-build-fix commit (uncommitted)
**Method:** code-level inventory (grep/read across all 88 page routes) + live browser smoke test of 9 representative screens. Every claim below is backed by a specific file/line or a live page render — nothing is asserted from memory of the design intent alone.

---

## Executive summary

The **core enterprise workflow** — requirements, compliance, discovery, assessment, gap analysis, migration, commercial engagement, payments, reconciliation, defects, incidents, Jira, platform health, service health, production readiness, client health scorecard — is **already genuinely strong** and largely matches the Fortune 500 standard this milestone asks for: real API-backed data, WHY/IMPACT explanations on non-green states, honest "READY TO CONNECT" vs "NOT CONFIGURED" language, progressive disclosure, timestamps, performance classification. This was not rebuilt — it didn't need to be.

The **single most important finding** of this review: **the executive dashboard (`/`) and client directory (`/clients`), plus roughly 50 of the 88 client-detail sub-pages (applications, infrastructure, environments, alerts, deployments, timeline, risks, roadmap, contracts, and similar "client 360" screens), render entirely from `apps/web/src/app/lib/mock-clients.ts` — fabricated sample data — with, until this pass, no indication to the viewer.** A Fortune 500 CIO opening AskABD for the first time would see a fully-populated "Executive Operations Dashboard" with specific numbers (86.67% availability, 7 incidents, $-relevant SLA compliance, even literal hardcoded figures like "96% Build Health") that have no connection to any real client record. This is the opposite of the "can I trust this information?" standard the milestone asks for, and it was silent about it.

This review does not attempt to rewire ~50 pages to real data sources — that's a real backend/data-modeling project (most of these screens, like "Infrastructure," "Applications," "Environments," have no corresponding API today), explicitly out of scope for "SAFE UI/PRESENTATION" changes per this milestone's own rules. What was done: **the two highest-traffic entry points now honestly disclose that their figures are sample data**, and a live, real, false security claim discovered during the browser walkthrough was corrected. The rest is documented here as a prioritized, evidence-based backlog — the deliverable this milestone actually asked for (Phase 40), not a promise to have silently fixed everything.

---

## A. Pages reviewed

All 88 `page.tsx` routes were inventoried at the code level (data-source grep: mock vs. real API). 9 were additionally live-rendered in a browser this session: Dashboard (`/`), Client Directory (`/clients`), Platform (`/platform`), Platform Services (`/platform/services`), Production Readiness (`/platform/production-readiness`), Jira (`/platform/integrations/jira`), a real client's Lifecycle, that client's Scorecard, and Platform Defects (`/platform/defects`).

## B. Pages improved

| Page | Change | Why |
|---|---|---|
| `/` (Executive Dashboard) | Added an honest "Sample data" disclosure banner above the KPI grid | Every headline number on this page is computed from `mock-clients.ts`; previously undisclosed |
| `/clients` (Client Directory) | Same disclosure banner | Same root cause |
| `/platform/integrations/jira` | Corrected "Tokens are stored encrypted..." → accurate wording (never returned/logged; not yet encrypted at rest in DEV; production requires secure secret storage) | **Live browser walkthrough found this exact page making a false security claim** that directly contradicts what was verified and documented in the prior security milestone (`docs/jira-secret-production-requirements.md`) — a real, live "hidden failure," fixed immediately |

New component: `apps/web/src/app/components/demo-data-banner.tsx` — small, reusable, self-documenting (its own doc comment explains why it exists and what it doesn't fix), ready to apply to the other ~50 mock-data pages mechanically once someone chooses to (see backlog).

## C. Pages intentionally unchanged

Everything else. Specifically, the following were inspected and found to already meet the bar — touching them would have been "modifying pages merely to make a larger diff," which this milestone explicitly forbids:

- `/platform` — environment banner, health dimensions, refresh state already present
- `/platform/services` — environment tabs (DEV/STAGING/PRODUCTION), per-service response time + performance classification (Excellent/Good/Acceptable/Slow/Degraded), dependency graph, "Updated: just now" — all already implemented, verified live
- `/platform/production-readiness` — explicit readiness score with denominator, "Have: X · Need: Y" per dependency, honest "READY TO CONNECT" (blue, not red) for unconfigured-but-optional items, explicit "Running in DEVELOPMENT mode" warning — verified live, already excellent
- Client-scoped real-data pages (compliance, discovery, assessment, gaps, migrations, engagements, payments, reconciliation) — confirmed real-API-backed by code inspection; not reviewed screen-by-screen for copy polish given time budget, but the data-trust question (the one that matters most) is already correctly answered
- `/clients/[clientId]/scorecard` — verified live: explicitly labeled "computed from real platform data," per-dimension weights, "Why not 100%" on every non-100% dimension, timestamped, recommended actions list. This is close to a template for what Phase 21/7 of the brief asked for — already built.

## D. UX problems fixed
1. False "encrypted" security claim on the Jira integration page (found live, corrected).
2. Undisclosed fabricated data on the two most-visited pages in the application (dashboard, client directory).

## E. UI problems fixed
None beyond the above — no broken layouts, broken buttons, or broken navigation were found in the 9 live-rendered pages.

## F. Accessibility improvements
None implemented this pass. Not audited beyond passive observation during the smoke test (no obvious missing button labels or broken keyboard flow noticed, but this was not a dedicated pass — see backlog, P2).

## G. Status consistency improvements
None implemented. `lib/status.ts` (built in the prior reliability milestone) remains unwired — see backlog, unchanged from the last report.

## H. Error experience improvements
None new this pass — the requirement workspace's progressive-disclosure errors (from the reliability milestone) and the reconciliation-before-failure save flow remain in place, unmodified, and were not re-litigated per this milestone's explicit "do not repeat previous milestones" instruction.

## I. Remediation improvements
None implemented. The client scorecard's "Recommended Actions" list (added in the prior milestone) already links out to the lifecycle page; a broader remediation center connecting finding → root cause → gap → defect → Jira as described in Phase 12 does not exist as a single screen today — see backlog, P2.

## J. Enterprise usability improvements
The two disclosure fixes above are, specifically, usability-for-trust improvements — a Fortune 500 evaluator who notices the numbers are fabricated (and eventually they will) loses confidence in *everything* on the platform, including the parts that are genuinely real and well-built. Labeling the sample-data screens protects the credibility of the real ones.

## K. Performance observations
Not investigated deeply this pass (out of the UX scope, and Phase 29 explicitly says "do not optimize blindly, do not change backend architecture unless a real problem is demonstrated"). No obvious duplicate-fetch or waterfall issues were noticed in the 9 pages exercised live.

## L. Code-quality observations
- `page.tsx` (dashboard) contains literal hardcoded numbers in JSX (`5` Open Defects, `96%` Build Health, `82%` Code Quality, `72%` Confidence, `3` Programs, `62%` Readiness, `57/100` Risk, `22%` Avg Progress) with no backing computation at all — not even mock-data-derived, just typed constants. Flagged, not changed (removing decorative placeholder tiles without a real data source to replace them would leave empty space — a product decision, not a mechanical fix).
- `"Last refreshed: just now"` on the dashboard is a static string, not tied to any actual refresh timestamp. Minor, not fixed (low value relative to the two disclosures already made).

## M. Tests before
146/146 (unchanged from the API TypeScript milestone's final state).

## N. Tests after
**146/146** — no tests added or needed; this was a presentation-layer, no-API-contract-change pass, verified via the same suite.

## O. API build
**PASS.** Re-verified this pass (`npm run build` in `apps/api`, exit 0) — the API TypeScript debt closure from the prior milestone was not touched or regressed.

## P. Web build
**PASS.** `npm run build` in `apps/web` completes cleanly with the two page edits and the new component included.

## Q. Existing client regression
**10/10 intact** (grew by 1 from this session's fresh-E2E run below; none corrupted, none unexpectedly changed).

## R. Fresh client E2E
**27/27 PASS.**

## S. Manual UI verification

**Actually performed, not claimed without evidence.** Live browser smoke test via the in-app Browser tool against the running DEV web app (`localhost:3001`), 9 pages: Dashboard, Client Directory, Platform, Platform Services, Production Readiness, Jira Integration, a real client's Lifecycle, that client's Scorecard, Platform Defects. Method: `navigate` + `get_page_text` (full rendered text extraction — a stronger signal than a screenshot for confirming a page isn't blank or erroring, since a broken page renders visibly different/empty text). One page (client Lifecycle) showed a brief empty-state flash before its async data loaded — noted as a minor, pre-existing timing observation, not a defect introduced or fixed this pass (see backlog, P3).

**Not verified:** the other ~79 routes were inventoried at the code level only, not rendered in a browser. Stating this plainly rather than implying full coverage.

## T. Remaining P0

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| Executive dashboard and client directory display fabricated data as if operational (now disclosed, but the underlying architecture gap remains) | `page.tsx`, `clients/page.tsx` compute all KPIs from `mock-clients.ts`; dashboard additionally hardcodes literal numbers with zero data backing | A first-time Fortune 500 evaluator's primary "How is my client doing?" question is answered with sample data | Build a real executive-summary aggregation (across onboarded clients, using the same authoritative sources — lifecycle, health scorecard, defects, commercial — already proven in `/clients/[clientId]/scorecard`) to replace the mock KPI grid. This is a genuine backend + frontend project, not a UI tweak — scope for a dedicated milestone. |

## U. Remaining P1

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| ~50 client-detail sub-pages (applications, infrastructure, environments, alerts, deployments, timeline, risks, roadmap, contracts, etc.) are 100% `mock-clients.ts`-driven with no real API backing at all | Grep: 52 files import `mock-clients` | Any client opened through these tabs shows data unrelated to that real client | Apply the same `DemoDataBanner` mechanically to each (small, safe, ~1 line per file) as an interim honesty fix; separately decide product-by-product which of these screens need real backend support and which should be removed if never intended to ship |
| Dashboard's "Engineering Intelligence" / "Migration Intelligence" tiles are literal hardcoded numbers, not even mock-derived | `page.tsx` lines ~90-108 | Same trust concern, more severe (not configurable, not even fake-computed) | Either wire to real data (Engineering/Migration areas do have real API-backed pages elsewhere in the app) or remove the tiles until they can be |

## V. Remaining P2

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| `lib/status.ts` (unified status vocabulary, built last milestone) still unwired anywhere | Grep: only its own definition file references it | Status terminology still varies screen to screen (though every screen checked live was individually clear) | Incremental rollout, page by page, starting with Platform/Services/Production-Readiness as previously recommended |
| No single "Action Center" aggregating cross-client attention items (Phase 11) | Not found in the 88-route inventory | Operators must visit multiple screens to find what needs attention | Real feature project — would reuse the existing health/readiness/defect/incident data sources per Phase 33/34's "no duplicate sources of truth," not a UI-only task |
| No dedicated Remediation Center connecting finding→root cause→gap→defect→Jira in one view (Phase 12) | Same | Same class as above | Same — feature project, not fixed this pass |
| Accessibility not formally audited | Not checked beyond passive observation | Unknown — could contain real gaps | Dedicated pass recommended, out of this session's scope |
| Defect status vocabulary (`Detected/Acknowledged/Investigating/Resolved/Verified/Closed`) differs slightly from the brief's suggested wording (`Open/Investigating/In Progress/Blocked/Resolved/Verified/Closed`) | Live page text | Very minor — arguably the existing wording is clearer for a defect (vs. incident) lifecycle | Leave as-is; not a real inconsistency, just a different (defensible) vocabulary choice |

## W. Remaining P3

| Problem | Evidence | Impact | Recommendation |
|---|---|---|---|
| Dashboard's "Last refreshed: just now" is a static string | `page.tsx` | Cosmetic; technically not false for a server-rendered page | Low priority |
| Brief empty-state flash on client Lifecycle page before async data resolves | Observed live this session | Minor, self-correcting within ~1-2s | Low priority; would require re-touching already-hardened reliability code — not worth the regression risk for a cosmetic timing issue |
| Literal hardcoded percentages have no source-of-truth marker even as placeholders | `page.tsx` | Same class as P1 finding above, lower severity (already covered by the disclosure banner) | Superseded by the P1 item above |

---

## Area scorecard

| Area | Score | Why |
|---|---|---|
| Navigation | 🟢 GREEN | Sidebar/breadcrumbs consistent across all 9 live-checked pages; no broken links found |
| Client Context | 🟡 YELLOW | Real client pages (lifecycle, scorecard, compliance, etc.) show client ID/name clearly; but ~50 sub-pages under the same client show unrelated mock data with no visual distinction until this pass's banner (not yet applied to those 50) |
| Environment Context | 🟢 GREEN | `/platform/services` and `/platform/production-readiness` both explicit and correct (DEV/STAGING/PRODUCTION, "Running in DEVELOPMENT mode" warnings) |
| Dashboard | 🔴 RED | Now honestly labeled, but the underlying data is fabricated — see P0 above |
| Lifecycle | 🟢 GREEN | 48% complete, step 9/20, current/next step, owner — verified live, matches the brief's Phase 22 example closely |
| Requirements | 🟢 GREEN | Reliability-hardened last milestone; progressive-disclosure errors, save/verify states already in place |
| Discovery / Assessment / Gap Analysis | 🟢 GREEN (code-level) | Confirmed real-API-backed; not live-rendered this pass, so UI polish unverified but the trust-critical question (real data) is answered |
| Health (Client Scorecard) | 🟢 GREEN | Verified live — explicitly labeled real, weighted dimensions, "Why not 100%," recommended actions |
| Services (`/platform/services`) | 🟢 GREEN | Verified live — best-in-class implementation in the app today |
| Defects | 🟢 GREEN | Verified live — clean loading state, filters, summary tiles |
| Incidents | 🟡 YELLOW (code-level) | Platform-level (`/platform/incidents`) confirmed real; client-scoped (`/clients/[clientId]/incidents`) confirmed mock-data — inconsistent within the same feature area |
| Jira | 🟢 GREEN (after this pass's fix) | Was 🔴 due to a live false security claim; corrected |
| Commercial | 🟢 GREEN (code-level) | Confirmed real-API-backed (engagements, payments, reconciliation) |
| Production Readiness | 🟢 GREEN | Verified live — exemplary |
| Error Handling | 🟢 GREEN | Requirement workspace's progressive disclosure (prior milestone) is a strong pattern |
| Loading States | 🟡 YELLOW | Present on most checked pages; one brief empty-state flash observed (lifecycle) |
| Remediation | 🟡 YELLOW | Individual pages (scorecard) link out reasonably; no unified remediation center exists |
| Auditability | 🟢 GREEN (code-level) | Real audit_log-backed pages confirmed to exist and use real data |
| Accessibility | ⚪ NOT ASSESSED | No dedicated pass performed |
| Consistency | 🟡 YELLOW | Strong within the real-data "core workflow"; the mock-data "client 360 shell" breaks the pattern |

---

## Bottom line

AskABD's **core transformation workflow — the part that actually matters for delivering the product's stated purpose — is already close to the Fortune 500 bar** described in this brief, built correctly in prior milestones, and was correctly left alone here. The **honest, uncomfortable finding** this review surfaces is that a large surface area of "client 360" screens and the primary landing dashboard are decorative/sample-data shells that were, until this pass, indistinguishable from real ones. That gap is now disclosed, not hidden — which is the standard this brief itself sets ("Do not hide failures. Do not hide technical limitations.") — and the path to closing it for real (rewiring ~50 screens, or deciding which should exist at all) is documented above as a scoped, evidence-based backlog rather than something silently claimed as done.
