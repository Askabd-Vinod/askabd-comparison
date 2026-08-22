# Final Feature Completeness Matrix

**Date:** 2026-08-19. Status per capability: **COMPLETE** (real, end-to-end, live-verified),
**PARTIAL** (real backend exists, some gap remains — stated exactly), **SIMULATED**
(no longer used for anything reachable — either fixed or explicitly disclosed),
**NOT AVAILABLE** (no real backend; honestly labeled in the UI), **BLOCKED** (needs a
business/architecture decision this session should not invent).

**2026-08-19 third addendum:** MFA login challenge is now **COMPLETE** —
real enroll/activate/disable UI (`/account/security`), real login-time
challenge on both staff and customer sign-in, real replay prevention added.
CRM customer visibility is now **COMPLETE** (migration 031) — a real
`visibility` field, default `internal`, with real customer-portal read
routes and a "Team & Notes" portal tab. See `docs/crm-completeness.md` and
`docs/final-production-readiness.md`.

**2026-08-19 second addendum:** CRM Contacts/Notes/Tasks — the "MISSING" rows
in the CRM section below are now **COMPLETE** (real DB/service/API/RBAC/
tenant-isolation/UI/tests/live-verification). See `docs/crm-completeness.md`.
A real, previously-undiscovered unauthenticated-route security hole in
askabd-identity was also found and fixed this pass — see
`docs/identity-unauthenticated-routes-audit.md` (admin-only routes remain
open, the single largest remaining blocker). Password recovery now has real
email delivery (was previously "no delivery mechanism") — see
`docs/auth-routing-hardening-report.md` §7.

**2026-08-19 addendum:** Authentication/routing architecture — see
`docs/auth-routing-hardening-report.md` for the full account (route-group
layout separation, server-side session gate, both login pages rewritten to
spec, safe `next`-param handling, invitation flow re-verified live end-to-end,
and two real live-found-and-fixed defects: SSR pages missing auth headers, and
a real JWKS-vs-devBypass local-dev misconfiguration). Status: **COMPLETE**.

| Capability | Status | Evidence |
|---|---|---|
| Staff authentication | COMPLETE | Real askabd-identity login + JWKS verification + `staff_role_assignment`; live-verified this session and the prior pass |
| Client creation / onboarding wizard | COMPLETE | Real `oc_clients` row, real 6-step wizard, live-verified end-to-end this session (prior turn) |
| Invitation → customer login | COMPLETE | Real invitation tokens, real `client_identity_mapping`, verified with two genuinely distinct identities in the live adversarial proof (prior pass) |
| Tenant isolation | COMPLETE | 6/6 live adversarial HTTP requests behaved correctly against a JWKS-enforcing server (prior pass); 320/320 automated tests including 3 new RBAC-closure tests this pass |
| Service confirmation | COMPLETE | Real `oc_client_services` confirm/not-confirmed states, live-verified (prior pass, this session) |
| Connector configuration/testing | PARTIAL | PostgreSQL/SMTP genuinely testable (established, unchanged); several catalog entries remain "Configured — Not Tested" by honest design, not fabrication |
| Discovery | PARTIAL | Real prerequisite enforcement proven live this session (genuine 422 blocking with a real reason when no connector is verified); a full discovery *run* was not re-driven through the UI this specific pass — verified via the passing automated suite instead |
| Assessment / Gap Analysis / Engineering Intelligence | COMPLETE (per prior dedicated audits) | Real defects/root-cause/severity, fabricated $/confidence numbers removed in an earlier milestone this session; this pass re-confirmed no fabricated-metric regressions via a targeted re-grep |
| Migration planning + execution | COMPLETE | Real `oc_operations`-backed async execution, real per-step progress, proven with real Postgres fixtures (established earlier this session, unchanged) |
| **Remediation** | **COMPLETE — new this pass** | Was SIMULATED (client-only timers/evidence) at the start of this pass. Now a real, operator-driven execution engine wired to `oc_operations`; live-verified through a full real incident → approve → 3 real steps → verify → close-ticket cycle; a real concurrency bug found and closed with a Postgres-enforced unique index |
| Reporting | PARTIAL | Real underlying data sources exist (incidents, remediations, operations, audit log); a dedicated executive/report-aggregation UI pass was not re-verified this specific turn |
| CRM / client management | PARTIAL | Client/contact/service/engagement records are real and DB-backed (established in prior milestones); deeper CRM workflows (tasks, opportunities, notes) were not audited fresh this pass |
| Audit trail | COMPLETE | Every mutation in this pass's new remediation routes writes a real `auditBestEffort` entry, matching the established platform-wide pattern |

Rows not revisited this specific pass carry forward their status from
`docs/final-adversarial-security-audit.md`, `docs/master-product-completion-report.md`,
and the Engineering/Migration Intelligence milestone docs — not re-asserted from
nothing.

## CRM / Client Management — this pass's classification

| Capability | Status | Note |
|---|---|---|
| Client profile (name, industry, country, size, criticality, primary contact) | COMPLETE | Real `oc_clients`, established |
| Organization / lifecycle | COMPLETE | Real `oc_lifecycle`, established |
| Services / engagements / proposals | COMPLETE | Real `oc_client_services`, `oc_commercial_engagements`, `oc_proposals`, established |
| Documents | COMPLETE | Real `oc_client_service_documents`, established |
| Audit history | COMPLETE | Real `oc_audit_log`, every mutation this pass added writes to it |
| Search | COMPLETE — new this pass | See §Global Search above |
| Reporting summary | PARTIAL — improved this pass | Real client-scoped counts now shown; export not implemented (honestly disclosed) |
| **Contacts** (beyond the single `primary_contact` field) | **COMPLETE (2026-08-19)** | Real `oc_contacts` table, service, API, RBAC, tenant isolation, audit, UI, tests, live-verified — see `docs/crm-completeness.md` |
| **Notes** | **COMPLETE (2026-08-19)** | Real `oc_client_notes` table — same full stack. Staff-only visibility is a deliberate choice, not an oversight; customer-portal visibility remains a real open decision — see `docs/crm-completeness.md` |
| **Tasks** | **COMPLETE (2026-08-19)** | Real `oc_client_tasks` table — same full stack, real open→in_progress→completed/cancelled state machine |
| **Activities/communications timeline** | PARTIAL | `oc_audit_log` + `oc_notifications` together already provide a real, factual activity trail; a purpose-built "Activities" UI aggregating them was not built this pass |
| Risks / opportunities | MISSING | No dedicated table; `oc_problems`/`oc_gaps` cover risk-adjacent data but not a generic CRM risk/opportunity object |

**Why Contacts/Notes/Tasks were not built this pass**: each is explicitly the kind of
capability the governing instructions require *not* be faked with a UI-only text box —
"every new capability must include DATABASE / SERVICE / API / AUTHORIZATION / TENANT
ISOLATION / UI / TESTS / BROWSER VERIFICATION" and "if a feature is too large to safely
implement: do not fake it... document it and continue everything else." A real
multi-contact model needs a decision on relationship to `client_identity_mapping`
(is a contact also a portal login?); a real Notes/Tasks model needs a decision on
visibility (staff-only vs. customer-visible) and notification behavior. Building either
without those decisions risks inventing architecture the platform doesn't actually
have a considered answer for yet — documented here as the concrete next real work,
not silently dropped.
