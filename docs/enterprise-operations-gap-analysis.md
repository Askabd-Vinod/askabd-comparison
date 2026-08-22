# AskABD Enterprise Operations Centre — Gap Analysis

**Date:** 2026-08-22. **Scope:** audit only, per the governing "Master Platform
Evolution Program" brief. No implementation code was changed to produce this
document.

**Method:** This audit does not re-derive the platform from nothing. It is
built on top of the platform's own recent, honest, live-verified audit trail
— principally `docs/final-uat-readiness-report.md` (eight dated passes,
FINAL SIGN-OFF 2026-08-21, HEAD `283cfdc` unchanged since, confirmed via
`find ... -newer` that no source file has changed since that report was
written), `docs/final-feature-completeness-matrix.md`, and `HANDOFF.md` —
cross-referenced against direct inspection of the current routes, services,
migrations, and select source files. Where the existing audit trail already
answered a question with live-verified evidence, that evidence is cited
rather than re-claimed from scratch. Where this pass could not confirm a
claim first-hand, it is marked **NEEDS VERIFICATION**, not asserted.

**Baseline confirmed this pass:**
- Branch `feature/reliability-hardening`, HEAD `283cfdc` (unchanged)
- 59 backend services, 339 API routes across 11 route files (241 in
  `operations-center-routes.ts` alone), 37 applied migrations
- Per the report's last regression run: API 358/358, Identity 213/213, Web
  33/33 tests passing; all three `tsc --noEmit` clean; `npm run health` 11/11
- 260 files modified/untracked on this branch relative to `main` — **none of
  this session's-worth of work (migrations 024–037, CRM, invitations, staff
  roles, client requests, database connections, connector multi-instance,
  gap/decision/transformation, remediation, MFA, etc.) has been committed or
  pushed.** This is a real, standing risk independent of anything below —
  see Section 0.

---

## Section 0 — Standing risk: uncommitted work

260 changed files including 14 new migrations, ~10 new services, ~5 new
route files, dozens of new tests, and a large frontend route-group
restructuring (`(app)`/`(auth)`/`(portal)`) are sitting uncommitted on
`feature/reliability-hardening`. This is not itself a defect in the
platform, but it is the single largest operational risk right now:
uncommitted work is not recoverable if the working tree is lost, cannot be
code-reviewed, and cannot be deployed. **Recommendation: before any new
implementation work begins under this brief, commit and push the existing
verified state as a checkpoint** (the report's own FINAL SIGN-OFF already
establishes it as green). This is a process action, not a feature, and is
called out explicitly rather than silently bundled into Phase 1 below.

---

## Section 1 — Current capability map (what genuinely exists, with evidence)

| Capability | Status | Evidence |
|---|---|---|
| Client/Lifecycle Management | COMPLETE | `oc_clients`, `oc_lifecycle`, `lifecycle-service.ts` (authoritative state machine); real onboarding wizard, live-verified (`final-feature-completeness-matrix.md`) |
| Client onboarding / discovery from vague input | PARTIAL | Real 6-step onboarding wizard exists and is live-verified; a **Universal Discovery** capability accepting free text + arbitrary documents (PDF/Word/spreadsheets/screenshots/diagrams) and extracting structured requirements does **not** exist — `discovery-service.ts` is infrastructure/connector discovery, not document ingestion. Real gap — see Part 1 below |
| Requirements engine | COMPLETE (recently root-cause fixed) | `requirements-service.ts`, `oc_client_service_requirements`; a real missing-`options` bug was found and fixed this cycle, live-verified end to end (`final-uat-readiness-report.md` §1) |
| Requirement quality/completeness analysis (COMPLETE/PARTIAL/AMBIGUOUS/CONFLICTING/DUPLICATE/UNVERIFIED classification) | GAP | Requirements have `provided`/`not_provided` status and readiness blocking; there is no dedicated ambiguity/conflict/duplicate detection engine. Real gap — see Part 3 |
| Gap Analysis | COMPLETE | `oc_gaps`, `oc_gap_options`, `gap-analysis-service.ts` (migration 037, uncommitted); `oc_gap_options` already models "possible resolutions per gap" — substantially satisfies Part 6's Gap Resolution Engine concept, not yet independently live-verified this pass |
| Compliance / Conformance | PARTIAL | Real multi-framework (SOC2 + NIST) schema, cross-framework mapping, exceptions, remediation (migrations 015/016); the report doesn't document a fresh COMPLIANT/PARTIALLY COMPLIANT/NOT ASSESSED/INSUFFICIENT EVIDENCE re-verification this cycle — carried forward from earlier milestones |
| Document Generation Engine (BRD/SRS/EWR/EWP/Test Plan/etc., with templates, versioning, approval, multi-format export) | GAP | `document-storage-service.ts` (64 lines) + `oc_client_service_documents` (migration 009) is **file storage/attachment**, not generative. No `document_templates` table, no template registry, no PDF/DOCX/Markdown export, no document-level approval workflow found. This is the largest single gap against the brief — see Part 7 |
| Requirements Traceability Matrix (BR→FR→TR→EWR→EWP→Task→TC→Defect→Deployment→UAT→Production) | GAP | No dedicated traceability-link table found; "traceability" appears only in `invitation` and `problem-universe` contexts, not as a cross-entity link model. See Part 8 |
| Universal Environment Comparison | PARTIAL | `comparison-service.ts` exists (84 lines) — real, but scoped to migration source/target comparison, not a generic DEV vs TEST vs UAT vs PROD / SYSTEM A vs B engine across database/schema/API/config/infra/security with drill-down reporting. See Parts 9–10 |
| Universal Data Profiling (read-only) | NEEDS VERIFICATION | `connector-service.ts` and `discovery-service.ts` exist and are read-only by established design ("PostgreSQL/SMTP genuinely testable... Configured — Not Tested by honest design, not fabrication" — `final-feature-completeness-matrix.md`); whether column-level profiling (null rates, duplicates, orphan relationships, sensitive-data indicators) exists was not confirmed this pass |
| Migration Intelligence | COMPLETE (established) | Real `oc_operations`-backed async execution with per-step progress, proven against real Postgres fixtures; `migration-validation-service.ts` + `migration-execution-service.ts` |
| Connector / Integration management, multi-instance | COMPLETE — recently fixed | Migration 035 (`connector_multi_instance`, uncommitted) closed a real "single-instance-per-provider" defect found live this week (`final-uat-readiness-report.md`, Fifth pass) — multiple named instances (e.g. "PostgreSQL Production" + "PostgreSQL UAT") are now real, not aspirational |
| SDLC Command Centre (Discover/Require/Analyse/Design/Build/Integrate/Test/Migrate/Deploy/Deliver/Operate/Improve, one unified stage view) | GAP | The platform's authoritative journey (`Onboard → Discover → Assess → Problems → Gaps → Value → Options → Decision → Transform → Validate → Outcome → Optimize`, at `/client-portal/[clientId]/journey`) is real and service-aware, but does not match the brief's exact 12-stage SDLC naming/grouping, and does not currently surface per-stage requirements/risks/gaps/documents/tasks/defects/evidence/approvals in one view. Reusing the existing journey view is the right foundation — see Part 14 |
| Department coverage (BA/PM/Architecture/Dev/QA/Data/DevOps/Security/etc. as one shared platform, not silos) | PARTIAL | The service-registry/capability-registry model is explicitly domain-agnostic by design (`HANDOFF.md` §2: "domain-agnostic and designed as reusable IP"); whether every named department has a first-class surface was not audited item-by-item this pass |
| Executive / Client Value Dashboard | PARTIAL | Portfolio Intelligence (`portfolio-intelligence-service.ts`) and Client Portal aggregation (`client-portal-service.ts`) exist; whether they cover every metric in Part 17 (compliance assessment, migration readiness, connector health, pending approvals in one view) was not itemized this pass |
| Smart Recommendation Engine | PARTIAL | `recommendation-service.ts` exists and is established/COMPLETE per the completeness matrix for its current scope; whether it covers the newer proactive categories in Part 18 (missing evidence, unconfigured connectors, incomplete lifecycle stages) was not audited |
| AI / Smart Assistance, clearly labeled | GAP / RISK | An `ai-copilot.tsx` frontend component exists but contains **no** `fetch`/API-integration code found in this pass — it is very likely UI-only with no real backend AI call. This is exactly the kind of half-built surface the platform's own audit culture would flag as a defect if it's reachable by real users. **Needs first-turn verification before any Part 34 work starts** — if it's dead/decorative, either wire it to something real or remove it; do not leave an unlabeled fake AI surface live |
| Universal Search | PARTIAL | `client-search-service.ts` is real and client-scoped (matches Part 19's literal framing, "Global search across a client"); which of the ~17 entity types listed in Part 19 it actually covers was not enumerated this pass |
| Versioning (documents/requirements/comparisons/etc.) | GAP | No generic version-history/diff/restore engine found; `022_lifecycle_version_column.sql` adds a version column to one table, not a reusable versioning capability. See Part 20 |
| Approval Workflow | GAP (as a *shared engine*) | Approval exists per-feature via ad hoc `approved_by`/`approved_at` columns (migrations 006, 016, 020) — real, but not a single reusable DRAFT→IN_REVIEW→CHANGES_REQUESTED→APPROVED→REJECTED→SUPERSEDED state machine usable across requirements/scope/documents/architecture/migration-plans/UAT/go-live as the brief asks. See Part 21 |
| Evidence Management | PARTIAL | "Evidence" is a pervasive real concept across 10+ migrations (compliance, discovery, problem-universe, etc.); whether it's unified into one unified Evidence entity/service usable by every module, or remains per-feature, was not confirmed |
| Security / Tenant isolation / RBAC / Audit | COMPLETE, actively hardened | This is the platform's most heavily and recently verified area: case-insensitive-login safety fix with canonical org_context (this cycle), a real unauthenticated-admin-route hole found and closed, JWKS verification, tenant-isolation adversarial testing (6/6 + 320+ automated tests), audit-attribution fabrication (`actor: 'admin'` hardcoded in 8 files) found and fixed this cycle. See `docs/final-adversarial-security-audit.md`, `docs/tenant-authorization-matrix.md` |
| CRM (Contacts/Notes/Tasks) | COMPLETE (2026-08-19) | Real `oc_contacts`, `oc_client_notes`, `oc_client_tasks` — full stack, live-verified (`docs/crm-completeness.md`) |
| Client Requests (service/connector requests, incidents, changes) | COMPLETE — new, uncommitted | Migrations 033/036, `client-request-service.ts`, full customer-initiated request state machine live-verified end to end this week including 3 real bugs found and fixed (invisible-to-staff request, raw-slug display, hidden invitation error) |
| Remediation execution | COMPLETE — new this cycle | Was SIMULATED; now a real operator-driven engine wired to `oc_operations`, live-verified through a full incident→approve→3 steps→verify→close cycle; a real concurrency bug closed with a Postgres unique index |
| Platform Health | COMPLETE | `npm run health` — 11 checks, real, run repeatedly through the report as the standing regression gate |
| Consistent UI (Connector Configuration canonical pattern) | COMPLETE — new this cycle | Fourth pass found 15 pages on an isolated dark-mode design and rolled them onto the canonical layout/cards/expandable-rows/status-badge pattern (matches the user's own memory note on this exact standard) |
| Field UX (visible label + helper text + required/optional + validation, never placeholder-only) | NEEDS VERIFICATION | The report's eighth pass explicitly flags this as **not** freshly re-walked: "the full 5-breakpoint sweep... the broader visual-consistency sweep... beyond the pages directly touched by this pass's bug fixes" was not done. Treat as unverified, not assumed clean |

---

## Section 2 — Existing capability reuse map

These existing engines/patterns should be **extended, not rebuilt**, when
implementing the brief's Parts:

| Brief asks for | Reuse this existing foundation |
|---|---|
| Part 1 Universal Discovery | New capability, but should emit into the *existing* `oc_client_service_requirements` model, not a parallel one |
| Part 2 Current State Assessment | `assessment-service.ts` + `discovery-service.ts` already model Source/Evidence/Confidence/Status for infrastructure; extend the same shape to Business/Application/Data/Security/Quality/Operations categories rather than inventing a new schema per category |
| Parts 3–4 Requirement Intelligence / Gap Analysis | `requirements-service.ts` + `gap-analysis-service.ts` + the new `oc_gaps`/`oc_gap_options` (migration 037) are the right foundation; add quality-classification fields to existing requirement rows rather than a parallel table |
| Part 5 Compliance | `compliance-service.ts` + existing multi-framework schema (migrations 014–016) — extend, do not replace |
| Part 6 Gap Resolution | `oc_gap_options` already models options-per-gap; extend with Benefits/Risks/Dependencies/Complexity fields |
| Part 7 Document Generation | `document-storage-service.ts` + `oc_client_service_documents` is the storage layer to build *on top of*, not the generation engine itself (genuinely new) |
| Part 9–10 Comparison | `comparison-service.ts` is the seed to generalize, not replace |
| Part 12 Migration | `migration-validation-service.ts` + `migration-execution-service.ts` — already real and COMPLETE; extend for rollback planning if missing |
| Part 13 Integration Assessment / multi-instance connectors | `connector-service.ts` + migration 035 (multi-instance) — already largely built this week |
| Part 14 SDLC Command Centre | The existing `/client-portal/[clientId]/journey` unified-journey view — re-map its stages to the brief's naming rather than building a second command centre |
| Part 17 Executive Dashboard | `portfolio-intelligence-service.ts` + `client-portal-service.ts` |
| Part 18 Recommendations | `recommendation-service.ts` |
| Part 19 Search | `client-search-service.ts` — extend entity coverage, don't rebuild |
| Part 23 Security | Already the most mature area — extend the existing RBAC/tenant-isolation/audit pattern established across `platform/rbac/*` |
| Part 32 Reusable Engines | Most of the 19 named engines already have a real service-file seed (see table above); this brief's real work is mostly *generalizing and connecting* existing services, not creating 19 new ones from zero |

---

## Section 3 — Missing capability map (genuine gaps, prioritized)

1. **Document Generation Engine with template registry** (Part 7 + 37) — no
   generation, no templates, no versioning, no approval workflow, no
   multi-format export. Largest gap.
2. **Requirements Traceability Matrix** (Part 8) — no cross-entity
   traceability-link model.
3. **Generic Approval Workflow engine** (Part 21) — exists only as
   per-feature ad hoc columns.
4. **Generic Versioning engine** (Part 20) — exists only as one column on
   one table.
5. **Universal Discovery from unstructured input** (Part 1) — no
   document/file-ingestion-to-requirements pipeline.
6. **Requirement quality/ambiguity/conflict classification** (Part 3) — no
   COMPLETE/AMBIGUOUS/CONFLICTING/DUPLICATE engine.
7. **Generalized Universal Environment Comparison** (Parts 9–10) — exists
   only in a migration-scoped form.
8. **AI/Smart Assistance, clearly labeled with evidence/confidence** (Part
   34) — `ai-copilot.tsx` needs first-turn verification; likely not wired to
   anything real yet.
9. **Unified Evidence Management entity** (Part 22) — evidence concept is
   real but scattered per-feature, not a shared engine.
10. **Data Profiling depth** (Part 11) — connector read-only access is real;
    column-level quality profiling depth unconfirmed.

## Section 4 — Duplicate/overlapping capability map

No genuine duplicates were found this pass. The platform's own audit
culture (visible throughout `final-uat-readiness-report.md`) has been
actively hunting and removing exactly this kind of drift — e.g. the fourth
pass's canonical-UI rollout was explicitly about eliminating a duplicate,
divergent design system across 15 pages. The one area worth a first-turn
look: `document-storage-service.ts` vs. any new Document Generation Engine
built for Part 7 — the new engine must call into the existing storage
service for the actual file bytes, not stand up a second storage path.

## Section 5 — Security risk map

Carried forward, not re-derived (see `docs/final-adversarial-security-audit.md`
and `docs/tenant-authorization-matrix.md` for the full detail):

- **Real, closed this cycle:** identity admin-route auth hole; case-sensitivity
  login/org_context mismatch; hardcoded `actor: 'admin'` audit fabrication
  (8 files); test-suite audit-log pollution.
- **Closed this pass:** the eighth pass explicitly left a backend
  `Math.random`/`mock-`/`fake`/`sample`/`demo`/`localStorage`/`sessionStorage`
  sweep undone. Run this pass: **clean, no findings.** No `Math.random()` in
  reachable backend code, no fabricated-data literals presented as real, no
  browser-only storage APIs leaked into server code. The single
  `mode: 'real' | 'demo'` field in `connector-service.ts` is a legitimate,
  honestly-persisted disclosure (written to `oc_connection_tests.mode`), not
  a fabrication.
- **New risk surfaced by this brief specifically:** Part 24's read-only
  connector default is already the established pattern
  (`final-feature-completeness-matrix.md`: "PostgreSQL/SMTP genuinely
  testable... by honest design"); anything built for Universal Data
  Profiling or Universal Discovery must inherit this default explicitly, not
  assume it.

## Section 6 — Data-model impact

New tables genuinely required (not yet existing, per Sections 1/3):
- `document_templates`, `generated_documents`, `document_versions`,
  `document_approvals` (Part 7)
- `traceability_links` (source_type, source_id, target_type, target_id,
  link_type) — a generic graph-edge table (Part 8)
- `approval_workflows`, `approval_steps` — generic, reusable across entity
  types via a polymorphic `entity_type`/`entity_id` pair (Part 21)
- `entity_versions` — generic version-history table, same polymorphic
  pattern (Part 20)
- `discovery_sources`, `discovery_extractions` — for Universal Discovery
  input tracking and extracted-field provenance (Part 1)
- `requirement_quality_findings` — ambiguity/conflict/duplicate findings per
  requirement (Part 3)
- `evidence` — a unified evidence table, polymorphic `entity_type`/
  `entity_id`, if Section 3 item 9 is confirmed as a real gap on closer look

All new tables should follow the platform's existing conventions: `client_id`
scoping where applicable, `created_at`/`updated_at`, and real audit-log
writes on every mutation — no new pattern needs inventing.

## Section 7 — API impact

New route files following the existing per-capability pattern (see
Section "routes files" above — this platform already splits routes by
capability rather than one giant file per app, aside from the large legacy
`operations-center-routes.ts`): `document-generation-routes.ts`,
`traceability-routes.ts`, `approval-routes.ts`, `discovery-routes.ts`. Each
new capability needs full RBAC + tenant-isolation wiring matching the
existing `platform/rbac/*` middleware — this is non-negotiable per the
platform's own Critical Rule #3 (client isolation on every query).

## Section 8 — UI impact

All new UI must use the canonical Connector Configuration pattern (layout/
cards/expandable-rows/status-badge) that the fourth pass already rolled out
platform-wide — this is the user's own confirmed standing standard. New
screens: Document Generation workspace (generate/preview/edit/version/
compare/approve/export), Traceability Matrix view, generic Approval queue,
Universal Discovery intake screen. Every field must have a visible label +
helper text + required/optional + validation per Part 26 — the report's
eighth pass already flags this as **unverified** platform-wide, so this
should be checked, not assumed, even on existing screens touched by new
work.

## Section 9 — Test impact

Current baseline (from the report, unchanged): API 358/358, Identity
213/213, Web 33/33. Every new capability must add real tests following the
existing pattern (`apps/api/tests/*.test.ts`, vitest) and — per Part 28 —
real Playwright-equivalent browser verification for every UI feature, using
exact-ID cleanup on temporary fixtures, never broad `DELETE` statements, and
never touching the two named real/protected clients (`AskABD Manual UAT
2026`, `Test1`).

---

*See `docs/enterprise-operations-roadmap.md` for the phased implementation
plan building on this analysis.*
