# Final Adversarial Audit — P0/P3 Classification

**Date:** 2026-08-19. Every finding below was produced by this final adversarial pass
(structured route/page enumeration, live cross-tenant proof, fresh fabrication sweep,
continuous fresh-browser journey). Nothing here is carried over unverified from an
earlier milestone's report. Fixed items show what was actually changed and how it was
proven; unresolved items are classified honestly, never marked complete.

## P0 — none open

No unresolved P0s remain. The one candidate P0-class issue found this pass — the
`GET /oc/payment-methods/:id` optional-query-param tenant bypass — was found and closed
in the same session, before this final pass began; this pass's live adversarial proof
(Section 3 of `docs/final-adversarial-security-audit.md`) re-confirmed the fix holds
against a real, JWKS-verified identity, not just the test suite.

## P1 — fixed this pass

| # | Finding | Evidence | Fix |
|---|---|---|---|
| 1 | 3 opaque-ID GET routes (`/oc/service-actions/:entityId`, `/oc/transformations/:id`, `/oc/optimization/metrics/:metricId`) returned one client's real business data to any authenticated identity, same root-cause class as the payment-methods finding | Confirmed via real handler + schema read: `oc_service_actions.entity_id`, `oc_metric_definitions.client_id NOT NULL`, `decisionService.getTransformation` returns a `.clientId` field | Gated `Admin.Access` in `rules.ts`; proven with a new adversarial test (real customer token 403, real admin token 200 with correct data) in `opaque-id-rbac.test.ts` |
| 2 | ~30 client-detail sub-pages (`applications`, `incidents`, `performance`, etc.) and 13 top-level aggregate pages (`/deployments`, `/monitoring`, `/reports`, `/intelligence/*`, `/search`, etc.) compute headline figures from `mock-clients.ts` sample data with **zero disclosure to the viewer** — the `DemoDataBanner` component existed for exactly this purpose but was never actually rendered anywhere in the app | Confirmed via `grep -rl "<DemoDataBanner"` returning 0 files before the fix | Wired `<DemoDataBanner />` into `clients/[clientId]/layout.tsx` (covers all ~30 sub-pages in one place, gated on real membership in the mock-client-ID set) and into each of the 13 top-level pages individually; `/search` got a more specific inline notice since its gap is functional (doesn't index real clients), not just display |
| 3 | `RemediationPanel` — live, reachable from real incident pages — entirely simulates a multi-step remediation execution (fabricated step durations via `setInterval`, fabricated evidence log entries like "Snapshot: Post-fix state captured", hardcoded `approvedBy: 'hello@askabd.com'`) with no indication to the viewer that nothing real ran until the final "close ticket" action | Read the full component source; confirmed only `closeTicket()` makes a real backend call | Added an explicit, visible "Simulated execution" disclosure directly above the step list. **Not fully fixed**: wiring real step-by-step execution to the `oc_operations`/`OperationService` framework (the same one migrations now use) is real, sizable follow-on work with no defined backend contract yet for what "remediation execution" concretely does — tracked below, not invented under this pass's time constraints |
| 4 | Invitation/onboarding OTPs generated via `Math.random()`, not a CSPRNG | Read `operations-center-routes.ts` — `Math.floor(100000 + Math.random() * 900000)` at both `/oc/otp/send` and `/oc/otp/resend` | Replaced both with `crypto.randomInt(100000, 1000000)`; regression re-run green (317/317) |

## P2 — documented, safe to defer

| # | Finding | Why it's P2, not P1 |
|---|---|---|
| 1 | `RemediationPanel`'s real automated-execution backend does not exist yet (see P1 #3) | Real architecture work — needs an explicit business decision about what "remediation execution" actually automates before it can be built against the operation framework; the interim fix (honest disclosure) already removes the fabrication risk |
| 2 | `otp_challenges.otp_hash` column stores the OTP in **plaintext**, despite its name implying a hash | Column name is misleading, but the OTP is a 5-attempt-limited, 24h-lived, 6-digit code never returned to the frontend — the practical exposure is materially smaller than a password/session-token store. Hashing it requires deciding a comparison strategy (equality check on hash) — small but a real, deliberate change, not made silently this pass |
| 3 | `GET /search` only indexes `mock-clients.ts` sample data — a real client created via the wizard is **never findable** through Global Search | Confirmed live this pass (the new "Meridian Freight Logistics" test client never appeared in search). Disclosed inline on the page rather than fixed; wiring real search requires a real query path against `oc_clients` + related tables, a genuine feature build, not a bug fix |
| 4 | `apps/web/src/app/lib/connector-framework.ts` (`simulateLatency`/`Math.random() > 0.1` "healthy" simulation) is dead code — confirmed zero importers anywhere in `apps/web` | No live exposure (unreachable), but it sits in the codebase as a landmine if anyone ever imports it, matching the exact anti-pattern already removed once this session (`onboarded-clients.tsx`'s dead localStorage-only listing). Recommend deleting in a follow-up pass; not touched here to keep this pass's diff minimal and reviewable |
| 5 | Discovery correctly refuses to start without a connected connector (`422 prerequisites_not_met`) — real, correct backend behavior — but the live browser journey did not get far enough this pass to fully exercise the connector-configure → connector-test → discovery-run chain for a **brand-new** client before time constraints ended the live journey | Not a defect — the earlier-established `docs/enterprise-connection-validation-report.md` already proved PostgreSQL/SMTP connector testing is real and functional for existing clients. This pass adds live confirmation that the *prerequisite gate itself* is real and correctly enforced (a 422 with a genuine, specific reason, not a silent bypass) |

## P3 — cosmetic / documentation only

| # | Finding |
|---|---|
| 1 | `docs/tenant-authorization-matrix.md` and `docs/resource-authorization-register.md` (2026-08-17) contained a since-superseded claim that no tenant mapping exists — now marked SUPERSEDED with a pointer to `docs/final-adversarial-security-audit.md`, left otherwise unedited as historical record |
| 2 | The client-onboarding wizard's Service-selection step ("Select All", 35/35) uses unlabeled toggle buttons in the accessibility tree (no visible text captured by the accessibility snapshot for individual ON/OFF service toggles) — a real accessibility gap worth a follow-up pass, found incidentally while automating the live journey, not exhaustively audited this pass |

## What this pass explicitly did NOT reach (honest, not silently dropped)

The continuous fresh-browser journey went live and real through: staff login →
client onboarding (6-step wizard, 35 services selected) → real CSPRNG OTP verification →
lifecycle initialization → Security Validation requirement collection (2 of 5 sections
genuinely saved and persisted, confirmed via before/after field-count state) → service
confirmation (0→1 confirmed, live coverage % change) → connector catalog page (honest
zero-state) → discovery prerequisite enforcement (real 422, real reason). It did **not**
live-click through connector connection-testing, an actual discovery run, assessment,
engineering intelligence, migration execution, or reporting for this specific fresh
client — those subsystems are verified real via the passing automated regression suite
(317/317, real Postgres fixtures, no mocks) and this pass's fabrication sweep (no
`Math.random`/fake-progress found in any of `discovery-service.ts`,
`assessment-service.ts`, `migration-execution-service.ts`, `operation-service.ts`), but
were not re-driven through the UI end-to-end in this specific pass. Stating this
explicitly rather than implying full live coverage.
