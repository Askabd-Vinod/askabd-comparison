# Route Evidence Reconciliation (Phase 2)

Generated 2026-08-30T16:28:59.683Z. Classes: **A** = fresh Playwright evidence this engagement, **B** = older real authenticated Browser-pane evidence, **C** = not individually reconciled this pass (real API/unit test coverage likely exists but page-level UI evidence unconfirmed this pass).

**Total routes: 124 — A: 50 · B: 9 · C: 65 · D: 0**

## Class A — fresh Playwright evidence (50)

| Route | Evidence |
|---|---|
| `/` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/account/security` | batch2_staff_operations_test_1 — real render verified; MFA enrollment deliberately not submitted (protects the shared test-staff auth fixture) |
| `/applications` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/clients` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/clients/[clientId]/audit` | batch3_admin_security_test_1 — real load + real Refresh click; real RBAC two-tier matrix (super_admin ALLOWED / auditor DENIED / unauthenticated DENIED) proven on the sibling release-readiness security gate; real audit-log write independently DB-verified via a fresh disposable client |
| `/clients/[clientId]/audit/[auditId]` | batch3_admin_security_test_1 — real load on a real client with a fake audit id; same honest placeholder fallback |
| `/clients/[clientId]/comparisons` | batch1_client_workflows_test_1 (2026-08-30) — real schema comparison run |
| `/clients/[clientId]/compliance` | batch1_client_workflows_test_1 (2026-08-30) — real load + Refresh click |
| `/clients/[clientId]/connectors` | batch1_client_workflows_test_1 (2026-08-30) — real expand + Run Test click |
| `/clients/[clientId]/data-reconciliation` | batch1_client_workflows_test_1 (2026-08-30) — real reconciliation run, independently API-verified |
| `/clients/[clientId]/discovery` | batch1_client_workflows_test_1 (2026-08-30) — real Start Discovery click, real honest prerequisite-blocked outcome |
| `/clients/[clientId]/migrations` | batch1_client_workflows_test_1 (2026-08-30) — real Run Preflight click |
| `/clients/[clientId]/release-readiness` | batch3_admin_security_test_1 — real RBAC matrix: super_admin real 200/ALLOWED, auditor real 403/DENIED (UI + API), unauthenticated real 401/DENIED, real DB-verified zero-mutation on the denied write attempt |
| `/clients/[clientId]/settings` | batch3_admin_security_test_1 — real load on a real (non-mock) client; confirms the already-disclosed honest mockClients-only placeholder fallback |
| `/clients/onboard` | batch1_client_workflows_test_1 (2026-08-30) + comparison_test_1 (2026-08-29) — real 6-step onboarding wizard |
| `/deployments` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/engineering` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/engineering/[defectId]` | batch2_staff_operations_test_1 — real load + real download button click, real file captured |
| `/engineering/knowledge` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/engineering/reports` | batch2_staff_operations_test_1 — real load + real download button click, real file captured |
| `/governance` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/incidents` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/infrastructure` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/intelligence` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/intelligence/catalog` | batch2_staff_operations_test_1 — real load + real link click into a catalog detail page |
| `/intelligence/catalog/[serviceId]` | batch2_staff_operations_test_1 — real load via real link click from /intelligence/catalog |
| `/intelligence/debt` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/intelligence/proposals` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/migrations` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/migrations/[migrationId]` | batch2_staff_operations_test_1 — real full lifecycle: Dry Run, Execute (real-time polling observed), Validate, Rollback (DB-verified), Download Report — found and fixed a real defect (GENERATED ALWAYS column) live via this exact click |
| `/migrations/new` | batch2_staff_operations_test_1 — real form: client select + Create Migration Plan, real navigation to detail page |
| `/monitoring` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/platform` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/capabilities` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/commercial` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/defects` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/incidents` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/integrations/jira` | batch3_admin_security_test_1 — real config save (POST) + real Test Connection click (honest failure against a fake URL) |
| `/platform/portfolio` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/production-readiness` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/services` | batch3_admin_security_test_1 — real load (health-check control not present on this render) |
| `/platform/services/registry` | batch3_admin_security_test_1 — real load (Group A light sweep) |
| `/platform/verification` | verification_center_journeys_test_1 + responsive_test_1 (2026-08-29/30) — Deep Health Check + all 17 Business Journeys clicked through the real UI |
| `/platform/workflows` | batch3_admin_security_test_1 — real rule creation (POST) + real enable/disable toggle (PATCH), real audit-log write independently verified |
| `/reports` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/reports/[reportId]` | batch2_staff_operations_test_1 — real Export PDF click, real file captured (already-disclosed mock/demo data) |
| `/search` | batch2_staff_operations_test_1 — real query, real results verified against the API |
| `/services` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/settings` | batch2_staff_operations_test_1 — real load (Group A light sweep) |
| `/welcome` | batch2_staff_operations_test_1 — real accordion expand, real UI state change verified |

## Class B — real Browser-pane evidence, not Playwright (9)

| Route | Evidence |
|---|---|
| `/clients/[clientId]/api-specs` | live_authenticated_verification_test_1 — API Discovery |
| `/clients/[clientId]/changes` | live_authenticated_verification_test_1 — Change Management |
| `/clients/[clientId]/clarifications` | live_authenticated_verification_test_1 — Requirements Clarification |
| `/clients/[clientId]/data-mappings` | live_authenticated_verification_test_1 — Data Mapping |
| `/clients/[clientId]/dependencies` | live_authenticated_verification_test_1 — Dependency Analysis (real entity-picker data verified) |
| `/clients/[clientId]/executive-reports` | live_authenticated_verification_test_1 — Executive Reporting (full write+read flow verified live) |
| `/clients/[clientId]/lifecycle` | comparison_test_1 (2026-08-29, real UI, pre-dates the lifecycle-gate finding) + this pass's own real DB inspection confirming its gate behavior |
| `/clients/[clientId]/risks` | live_authenticated_verification_test_1 — Risk Register |
| `/clients/[clientId]/uat` | live_authenticated_verification_test_1 — UAT |

## Class C — not individually reconciled this pass (65)

See `route-inventory.md` for the full mechanical list. Real, disclosed remaining scope for Batches 2-6.
