# Customer Journey Audit

**Date:** 2026-08-18. Every stage of the full journey brief, classified honestly:
**GREEN** = real + verified live, **YELLOW** = partially implemented, **RED** = missing,
**BLOCKED** = requires a business decision or external infrastructure this session
does not have authority/access to invent.

| # | Stage | Status | Evidence |
|---|---|---|---|
| 1 | Login (real customer) | 🟢 GREEN | `apps/web/src/app/login/page.tsx` — real org+email+password → real askabd-identity `/v1/auth/login`. Live-verified this session and the prior one (see `docs/identity-real-contract.md`). |
| 2 | Client selection (multi-client org) | 🟡 YELLOW | `GET /api/v1/oc/me` resolves the full authorized set server-side and `/login` redirects to the first one; there is no UI picker if an org has more than one authorized client — the customer always lands on `authorizedClientIds[0]`. Real data, incomplete UX for the multi-client case. |
| 3 | Welcome | 🔴 RED | No dedicated welcome/onboarding-intro screen exists. `/client-portal/:clientId` is the landing page directly. |
| 4 | Organization information | 🔴 RED | No UI collects/displays organization profile (industry, geography, contacts) as part of onboarding. `oc_clients` has these fields (industry, country, etc.) but they're set by AskABD admins via `/clients/:clientId/edit`, not by the customer. |
| 5 | Service confirmation | 🟡 YELLOW | Real backend exists from an earlier milestone (`oc_client_services`, confirmation UX, `ServiceRequirementMatrixService`) — not re-verified or re-wired to the new auth boundary this pass. |
| 6 | Requirement discovery | 🟡 YELLOW | Same — `GET /oc/clients/:clientId/onboarding/requirements` is real and pre-existing; not re-verified against the new tenant boundary this pass. |
| 7 | Connection requirements | 🟡 YELLOW | Pre-existing, real (`ServiceRequirementMatrixService`); not touched or re-verified this pass. |
| 8 | Connection configuration | 🟡 YELLOW | Pre-existing `ConnectorService` is real (from an earlier milestone's "Configured≠Connected≠Verified" honesty work); not touched this pass. |
| 9 | Connection testing | 🟡 YELLOW | Pre-existing, real for PostgreSQL/SMTP (per `docs/enterprise-connection-validation-report.md`); not touched this pass. |
| 10 | Evidence collection | 🟡 YELLOW | Real connector-test-history endpoints exist from an earlier milestone; not touched this pass. |
| 11 | Discovery | 🟡 YELLOW | Real `DiscoveryService` exists; not touched or re-verified this pass. |
| 12 | Assessment | 🟡 YELLOW | Real `AssessmentService` exists; not touched this pass. |
| 13 | Gap analysis | 🟡 YELLOW | Real `GapAnalysisService` exists; not touched this pass. |
| 14 | Recommendations | 🟡 YELLOW | Real `RecommendationService` exists; not touched this pass. |
| 15 | Engineering intelligence | 🟡 YELLOW | Real, wired to real defects (earlier milestone); not touched this pass. |
| 16 | Migration intelligence | 🟡 YELLOW | Real, wired to real migration data (earlier milestone); not touched this pass. |
| 17 | Commercial engagement | 🟡 YELLOW | Real `CommercialEngagementService`; not touched this pass. |
| 18 | Approvals | 🟡 YELLOW | Real transition endpoints, Admin.Access-gated; not touched this pass. |
| 19 | Delivery tracking / health scorecard | 🟡 YELLOW | Real `ClientHealthService`; not touched this pass. |
| 20 | Incidents / defects / remediation | 🟡 YELLOW | Real, evidence-based (earlier milestones); not touched this pass. |
| 21 | Reporting | 🟡 YELLOW | Real report endpoints exist; not touched this pass. |
| 22 | Audit | 🟢 GREEN (for what was added this pass) | Invitation create/resend/revoke/accept and mapping create/revoke all write real `oc_audit_log` rows — verified in tests and live. Pre-existing audit coverage for phases 5-21 unchanged, not re-audited this pass. |
| 23 | Ongoing collaboration | 🔴 RED | No customer-initiated messaging/collaboration surface exists (this was never claimed to exist; not part of this pass's scope). |
| 24 | Invitation (real onboarding entry) | 🟢 GREEN | Full real flow — see `docs/client-onboarding-architecture.md`. Live-verified via browser this session, including real email via Mailpit. |
| 25 | Logout / session protection | 🟢 GREEN | Real, live-verified: sign-out clears session and redirects to `/login`; post-logout direct URL access redirects to `/login`, not stale data. |
| 26 | Cross-tenant isolation | 🟢 GREEN | Real, live-verified: a customer mapped to Client A is denied (403) Client B even knowing its real, valid ID — both via automated tests and live browser UAT. |

## Summary

This pass's real, verified contribution is stages 1, 2 (partial), 24, 25, 26, and the
audit trail for the new invitation/mapping surfaces (22, partial). Stages 3-4 and 23 are
genuinely not built. Stages 5-21 have real, pre-existing backends from earlier
milestones that were NOT touched, NOT broken, and NOT re-verified this pass — their
status here reflects "exists but not re-confirmed today," not "broken."
