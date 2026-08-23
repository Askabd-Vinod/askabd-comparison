# Enterprise Feature Gap Register

**Date:** 2026-08-17. Built from direct source inspection and live browser verification during
the 8-hour autonomous completion program, not assumed from prior reports.

## P0 finding this session: `CapabilityPlaceholder` fabricated every real client's data — FIXED

`apps/web/src/app/clients/[clientId]/capability-placeholder.tsx` is consumed by **32 files** —
essentially every "ancillary" client-detail nav tab (Roadmap, Testing, Knowledge, Consulting,
Contacts, Timeline, Automation, Contracts, Support, Performance, Usage, Risks, Maturity,
Capabilities, Settings, Documents, plus the fallback branch of Engineering, Monitoring,
Infrastructure, Applications, Reports, Deployments, Environments, Alerts, Readiness).

**Before this session:** every one of these pages first looks up the client via
`mockClients.find(c => c.id === clientId)` — a hardcoded array of ~20 static demo entries. **Every
real client created through the actual onboarding flow this entire session (every "E2E
Lifecycle..." client used for all prior milestones' browser UAT) is NOT in that array.** For those
real clients, all 32 pages fell through to `CapabilityPlaceholder`, which showed:
- Hardcoded, identical-for-every-client fake metrics: `CPU Avg: 32%`, `Uptime: 99.9%`,
  `MTTR: 23 min`, `Error Rate: 0.01%`, `SLA Compliance: 100%`, `Compliance Score: 96%`, etc. — not
  fetched from anywhere, never varying.
- An unconditional green banner: **"Operational — Connected to AskABD Platform... Data flows
  automatically from connected infrastructure."** — shown even for pages with zero real data
  behind them at all.

This is a direct violation of the platform's own "CONFIGURED != CONNECTED" /
"never fabricate ... integration success" principle, and it was the state seen by every real
client in this platform for these 32 page types.

**Fixed this session:** `capability-placeholder.tsx` rewritten to make no unbacked claim — states
plainly "No dedicated {X} tracking exists yet for this client," explains why (no database-backed
implementation for this page), and links only to real, working pages (services, connectors,
readiness, lifecycle). Verified live in the browser across Testing, Knowledge, and Risks for the
real client `client-c9683df9-...` — all three now show the honest state. Verified builds clean
(`tsc --noEmit`, full `next build`). No test suite covers this file (it's presentational only,
no API/business logic), so no test was broken or needed removing.

## P1 finding: pages ALSO fabricate data even for the ~20 mock clients that DO match

Investigating further, several of these pages fabricate data on their OWN "client found" branch
too — not just the `CapabilityPlaceholder` fallback:
- **`readiness/page.tsx`**: derives 6 "readiness dimension" scores (Business/Technology/
  Connector/Security/Governance/Operations Readiness) by adding or subtracting arbitrary
  constants (+3, +5, -15, -2, -5) from a single `client.platformScore` field. This is arithmetic
  on one number, not six independent measurements — even for a matching mock client, none of
  these six scores represent anything real.
- **`testing/page.tsx`**: a hardcoded `testSuites` array (`Smoke Tests: 12/12 passed`,
  `Deployment Validation: 7/8 passed`, etc.) — identical for every mock client, not sourced from
  any test-execution system.
- **`roadmap/page.tsx`**: a hardcoded `phases` array (`Enable automated monitoring alerts`,
  `Implement CI/CD pipeline`, etc.) — identical for every mock client, not a real transformation
  plan.

**Not fixed this session** — these are a different, larger problem than the `CapabilityPlaceholder`
fallback: each would need a genuine per-page decision about what real data source (if any) exists
or should be built (e.g., is there a real "platform readiness" concept distinct from the
already-real per-service readiness at `/oc/client-services/:clientId/:serviceId/readiness`? Is
there a real test-execution system to source `testing/page.tsx` from, or should this page be
retired in favor of the API test suite's own CI results?). Answering these for 20+ mock-client
pages in one unattended pass risks shallow, poorly-considered fixes across a huge surface — the
`CapabilityPlaceholder` fix was prioritized because it affects **every real client** and required
no new design decision (the honest answer is simply "not yet available"); these remaining pages
only affect the ~20 static demo clients, a much smaller and lower-priority blast radius, and each
needs its own real decision, not a mechanical honesty pass.

**Update (2026-08-24, `deployment_validation_test_1` / `post_delivery_test_1`)**:
**Deployments** is the first of the pages named above (alongside "Readiness",
fixed earlier) to be fully resolved, not just deferred — both `deployments/page.tsx`
and `deployments/[deploymentId]/page.tsx` were rewritten against a genuinely new,
real `oc_deployments` backend (`deployment-service.ts`, migration 057) rather than
`mockClients`; zero `mockClients` import remains in either file, confirmed by direct
grep. This was a materially larger fix than the `CapabilityPlaceholder` honesty pass
above — it required a real state machine, a real `ReleaseReadinessService` gate, real
`ApprovalWorkflowEngine` reuse, and a real post-deployment validation workflow, not
just an honest "not yet available" message. See `docs/eoc-feature-coverage-matrix.md`
rows #52-53 and `docs/evidence/deployment_validation/deployment_validation_test_1/`.
The remaining pages in the list above (Infrastructure, Applications, Reports,
Environments, Alerts, and the other 20+ ancillary tabs) are unchanged — still real
candidates for the same treatment, each needing its own genuine data-source decision.

**Mechanical follow-up search performed same pass**: `grep -rln "\.deployments\b"`
across `apps/web/src` and `apps/api/src` (checking whether the same fabricated
`client.deployments` field is read anywhere OTHER than the two pages just fixed)
found 9 more real references, all pre-existing, all part of this same already
-known gap, none touched this pass: `applications/[appId]/page.tsx`,
`environments/[envName]/page.tsx`, `knowledge/page.tsx`, `reports/page.tsx` (both
the per-client and platform-level versions), `timeline/page.tsx`,
`governance/page.tsx`, `reports/[reportId]/page.tsx`, `search/page.tsx` — each
reads `mockClients`' fabricated `deployments` array as incidental supporting data
for its own primary (also-fabricated) content. Not fixed this pass — same
"needs its own genuine decision, not a mechanical batch fix" reasoning as above;
listed here precisely (rather than left as a vague "~26 remaining pages" note) so
a future pass can act on it directly.

## P1 finding, re-confirmed not newly discovered: `mock-clients.ts` itself

Already documented in `docs/real-data-integrity-register.md` (an earlier milestone this session)
and re-confirmed unchanged: `apps/web/src/app/lib/mock-clients.ts`'s ~20 static demo entries
remain the data source for the pages above when a client ID happens to match one. This register
entry is not new; it is restated here because this session's fresh investigation shows its blast
radius is broader than previously catalogued (the `CapabilityPlaceholder` fallback chain wasn't
previously traced to all 32 consumers).

## Website ↔ product coherence gap (Phase 5 of this session's brief)

Reviewed `askabd-website` (the public marketing site) for the first time this session. Finding:
**the website and the actual product (`askabd-comparison`'s Operations Center) describe two
different businesses.** The website markets a generic custom-software-development agency (mobile
apps, e-commerce platforms, AI chatbots, business dashboards, SaaS platforms) across six
industries (Healthcare, FinTech, E-Commerce, Logistics, Education, Real Estate), with a generic
"Discover → Analyze → Strategize → Design → Develop → Deploy → Scale & Support" process. It never
mentions any of the Operations Center's actual real capabilities: Discovery Engine, Engineering
Intelligence, Migration Intelligence, service-driven onboarding, connector verification,
commercial engagement governance, or compliance tracking — none of this vocabulary appears
anywhere on the site. There is no link from the website into the platform at all (re-confirmed:
zero login/portal links).

**What IS real and working on the website:** the primary conversion mechanism — the contact form
(`contact.html`) — genuinely POSTs to a real third-party form-to-email service
(`https://formsubmit.co/ajax/hello@askabd.com`), not decorative. Minor: two footer links
("Blog" → `index.html`, "Careers" → `contact.html`) are placeholder redirects to existing pages
rather than 404s — not broken, but not truthful about having a blog or careers page either.

**Not rewritten this session:** repositioning a 30+ page marketing site's core value proposition
to match the Operations Center product is a brand/business-strategy decision, not a technical
fix — consistent with this session's established pattern of stopping at genuine business-judgment
forks rather than inventing a new company narrative unilaterally overnight.

## Confirmed still accurate from prior milestones (re-verified, not re-derived from scratch)

- Identity contract, tenant isolation, connection validation, service governance, commercial
  bridge, error UX `reasonCode`s, K8s auth config — all re-run fresh this session (216/216 API
  tests, 177/177 identity tests), unchanged and intact. See `docs/identity-real-contract.md`,
  `docs/tenant-authorization-matrix.md`, `docs/authentication-missing-investigation.md`,
  `docs/fortune500-security-review.md` for full detail — not duplicated here.
