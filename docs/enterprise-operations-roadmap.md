# AskABD Enterprise Operations Centre — Implementation Roadmap

**Date:** 2026-08-22. Built directly on `docs/enterprise-operations-gap-analysis.md`.
This is a living document — update it at the end of every session so the next
session can continue without rediscovery, per the governing brief.

## How to use this document

Each phase lists concrete, real work items tied to the gap analysis. A phase
is not "done" until every item meets the brief's own Definition of Done
(Part 41): Database + Service + API + RBAC + Tenant isolation + Audit + UI +
Validation + Error handling + Tests + Playwright + Persistence verification +
Security verification + Documentation, all together. Do not mark a phase
complete because a screen renders.

**Before Phase 1 starts:** resolve the Section 0 standing risk in the gap
analysis — commit and push the current verified state (HEAD `283cfdc` plus
the 260 uncommitted files, all established as green per the FINAL SIGN-OFF)
as a real checkpoint. This is a prerequisite, not part of any phase's scope,
and should take one session at most.

---

## Phase 0 — Foundation safety pass (do this before any new feature)

Directly from the gap analysis's Section 5 (Security risk map) and the
report's own "explicitly not done" list:

1. Fresh backend `Math.random`/`mock-`/`fake`/`sample`/`demo`/
   `localStorage`/`sessionStorage` sweep — the frontend was swept, the
   backend was not, per the eighth pass's own honest accounting.
2. First-turn verification of `ai-copilot.tsx` — confirm whether it calls
   anything real. If not, either wire it to a real, clearly-labeled
   AI-assistance backend (Part 34) or remove/disable it until it is. Do not
   leave an ambiguous fake-AI surface reachable by real users.
3. The full 5-breakpoint field-UX sweep the eighth pass explicitly flagged
   as unverified (Part 26) — confirm before building more UI on top of
   possibly-inconsistent existing screens.
4. Commit/push checkpoint (see above).

**P0 per the brief's own priority order** (Part 40): this phase is Security
+ existing-functionality stability — must come first.

---

## Phase 1 — Foundation / shared engines

Priority P1 items that unlock everything else:

- ✅ **AUDITED (2026-08-22) — concluded NOT to build a unifying table.**
  Searched all 52 files referencing "evidence" across the API. Found three
  genuinely distinct concepts, not one idea wearing different names:
  1. **Compliance's evidence lifecycle** (`compliance-service.ts`,
     migration 014) — `evidence_status` (missing/expired/met),
     `evidence_required` (a checklist), `evidence_references` (the actual
     artifacts), plus a real scheduled job (`COMPLIANCE_EVIDENCE_CHECK`,
     daily) that alerts on expired/missing evidence. The richest, most
     mature model here — built for a real regulatory need.
  2. **Assessment/Gap-Analysis's citation string** (`assessment-service.ts`,
     `gap-analysis-service.ts`) — a lightweight `evidence: string` or
     `evidence: string[]` pointing at which discovery finding justified a
     conclusion (e.g. `"Discovery: server X version Y"`). No lifecycle, no
     status — just a citation.
  3. **The frontend's `EvidenceBadge`/`EvidenceTrail`** (`evidence-status.tsx`)
     — a real-time verification-status vocabulary (verified/action_required/
     checking/failed/not_configured/not_yet_available) for connector tests.
     Not stored evidence at all — a live claim-verification state.
  Forcing these into one polymorphic table would either strip compliance's
  real lifecycle down to nothing (its whole value is the missing/expired
  distinction) or bloat a "generic" schema with fields only one caller
  ever uses. **Decision: leave all three as they are.** New work (this
  session's `business_requirements.quality_findings`) correctly followed
  the existing precedent — a structured, real, explainable findings field
  local to its own entity — rather than waiting on a shared engine that
  would not have clearly helped. This item is closed, not deferred.
- ✅ **DONE (2026-08-22)** — **Generic Versioning engine**: `entity_versions`
  table (migration 039) + `versioning-engine.ts` service, usable by any
  entity type via `entity_type`/`entity_id`. Real concurrency safety
  (`pg_advisory_xact_lock`, transaction-scoped, serializes version-number
  assignment per entity — proven via a 10-concurrent-writer test producing
  exactly versions 1-10 with zero duplicates/gaps) plus a real field-level
  `diff()` helper. Deliberately NOT retrofitted onto the existing
  per-entity history tables (`oc_client_service_requirement_history`,
  `oc_business_requirement_history`, ...) — those are real, working code;
  this engine is for new work going forward. 12 real tests, 12/12 passing.
  See `docs/enterprise-operations-progress.md` for full detail.
- ✅ **DONE (2026-08-22)** — **Generic Approval Workflow engine**:
  `approval_workflows` + `approval_workflow_steps` (migration 040) +
  `approval-workflow-engine.ts`. Real, enforced state machine (DRAFT →
  IN_REVIEW → APPROVED | REJECTED, IN_REVIEW → CHANGES_REQUESTED →
  IN_REVIEW loop) — an attempted invalid transition (e.g. approving
  directly from DRAFT) is rejected with a clear error, never silently
  coerced. Two real DB-enforced guarantees, not just application-level
  checks: a partial unique index allows at most one open (non-terminal)
  workflow per entity at a time, and opening a new workflow for an entity
  that already has an APPROVED one automatically (and visibly, via a real
  logged step) transitions the old one to SUPERSEDED. Every transition
  writes a real, attributed `approval_workflow_steps` row — the actual
  audit trail, not inferred from current status alone. 11 real tests,
  11/11 passing, including both DB-constraint proofs. See
  `docs/enterprise-operations-progress.md` for full detail.
- ✅ **DONE (2026-08-22)** — **Generic Traceability engine**:
  `traceability_links` table (migration 041) + `traceability-engine.ts`.
  Supports the BR→FR→TR→EWR→EWP→Task→TC→Defect→Deployment→UAT→Production
  chain from Part 8, generic enough for any two linked entities. Idempotent
  linking (recording the same link twice is a no-op, not a duplicate row),
  real direct inbound/outbound lookup, and real multi-hop chain traversal
  in both directions via a genuine recursive CTE with an explicit path-based
  cycle guard and a hard depth ceiling (25) — proven on an actual 3-node
  cyclic graph (A→B→C→A) that the traversal terminates rather than hanging,
  and on a diamond-shaped graph that a convergent node is reported via both
  real paths rather than silently collapsed or duplicated wrongly. 11 real
  tests, 11/11 passing. See `docs/enterprise-operations-progress.md` for
  full detail.

**Phase 1 is now fully complete** (2026-08-22): Evidence engine (audited,
concluded not to build), Versioning engine, Approval Workflow engine,
Traceability engine — all done, tested, committed. These four were
foundational because Phases 2–7 all want to version, approve, and trace
the things they create. Building them first avoids each later phase
inventing its own ad hoc mechanism (which is exactly the
duplicate-capability risk the gap analysis's Section 4 flags as the
platform's one real ongoing hazard). None of the three built engines has a
route/UI surface yet — they are backend building blocks for Phase 2+ to
wire into as each capability needs them, not standalone features.

---

## Phase 2 — Discovery + requirements + gaps

- ✅ **DONE — free-text intake only (2026-08-22)** — **Universal Discovery
  capability** (Part 1): `discovery_sources` / `discovery_extractions`
  (migration 042) + `discovery-intake-service.ts`. Confirmed genuinely new
  before building — distinct from `discovery-service.ts` (live
  connector-based TECHNICAL discovery: tables/repos via real credentials)
  and `problem-universe-service.ts` (already-CLASSIFIED problem records).
  This is the real upstream starting point: the client's own raw,
  free-text problem narrative, preserved verbatim. Extraction of structured
  fields from that raw text is a real STAFF action — never a fabricated
  "AI extracted this" claim, since no real NLP/AI backend exists in this
  platform yet (confirmed via `ai-copilot.tsx`'s own honest disclosure) —
  every extraction requires a real evidence quote that is verified,
  server-side, to actually appear verbatim in the source text before it can
  be saved. Wired into the new Traceability Engine (Phase 1): each
  extraction is linked to its source via a real `derives_from` link, so a
  later Business Requirement built from a finding can trace all the way
  back to the client's original words. 11 real tests, 11/11 passing — found
  and fixed one real bug along the way (a `message.includes('not found')`
  string-match in the route handler false-positived on the
  evidence-quote-verification error's own wording; fixed with a proper
  `DiscoverySourceNotFoundError` class instead of message-sniffing). Full
  UI (`(app)/clients/[clientId]/discovery-intake`) following the canonical
  pattern. ✅ **Document/file ingestion — DONE (2026-08-23)**, real scope:
  migration 045 extends `discovery_sources` (not a parallel table) with
  real file metadata (storage reference, original filename, MIME type,
  size, checksum) + an honest `extraction_status`. Reuses the existing
  `DocumentStorageService`/`StorageProvider` (a new `saveDiscoveryDocument`
  method on the same class, same underlying provider — not a second
  storage service) for real multipart upload, real checksums, a real 20MB
  limit, and the same allowed-MIME-type discipline as the existing
  onboarding-document upload route. **A real, deliberate scope decision,
  not a silent gap**: no PDF/DOCX/XLSX parsing library exists anywhere in
  this codebase (confirmed by inspection before writing code) — real text
  extraction is built only for formats needing zero new dependencies
  (plain text, CSV); every other allowed format (PDF/DOCX/PNG/JPEG) is
  stored for real (real bytes, real checksum) but honestly marked
  `extraction_status='not_supported'`, never a fabricated or silently-empty
  extraction. 6 real tests (real multipart bodies, real extraction proof
  for TXT/CSV, honest not_supported proof for PDF, disallowed-type
  rejection, RBAC, default-title-from-filename), 6/6 passing. UI extends
  the existing Discovery Intake page (a mode toggle between typing free
  text and uploading a file) — never a second page. See
  `docs/enterprise-operations-progress.md` for full detail.
- ✅ **DONE (2026-08-22)** — **Current State Assessment** (Part 2): extended
  the existing `assessment-service.ts`/`oc_assessments` shape (migration
  043 adds one `domain` column, CHECK-constrained to the 7 real values,
  default `'infrastructure'` for backward compatibility) to the other six
  categories: Business, Application, Data, Security, Quality, Operations —
  same `AssessmentResult`/`AssessmentFinding` interfaces, extended with
  real new category values, genuinely NOT a parallel schema. Every finding
  cites a real, checkable evidence source on the client's own actual
  record (`departments`/`capabilities`/`processes` for Business;
  `tech_apps`/`tech_services`/`tech_apis` for Application;
  `tech_databases` + the latest completed discovery run's real table/
  schema counts for Data — genuinely reused, not a disconnected source;
  `oc_connectors.security_level` distribution + `oc_client_compliance`
  evidence-missing/expired counts for Security; real open-defect counts by
  severity from `oc_defects` for Quality; `environments`/`monitoring` JSONB
  for Operations). An empty/zero real count is always an honest `info`- or
  `medium`-severity "not recorded yet" finding, never silently skipped —
  matching this platform's "Not provided"/"Insufficient evidence" honesty
  convention. **A real bug was found and fixed before it ever reached a
  test run**: the Quality analyzer was first written against a column
  (`askabd_status`) that does not exist on `oc_defects` at all — a
  same-named column from a *different* table (Jira issue-link tracking)
  was mistakenly assumed to apply here; caught by directly re-verifying
  the live schema before writing tests, not by a failing assertion.
  Corrected to the real `status` column and its real vocabulary
  (`detected`/`acknowledged`/`investigating`/`mitigating`/`resolved`/
  `verified`/`closed`). 15 real tests, 15/15 passing. New routes
  (`POST /oc/assessment/domain/start`, `GET /oc/assessment/:clientId/domain/:domain`)
  added directly into the existing `operations-center-routes.ts` assessment
  block, not a new route file — genuinely extending, not duplicating. UI:
  the existing Assessment page gained a "Current State Assessment — Beyond
  Infrastructure" section with one real run/re-run card per domain,
  extending the same page rather than adding a new one. See
  `docs/enterprise-operations-progress.md` for full detail.
- ✅ **DONE (2026-08-22)** — **Requirement quality/completeness
  classification** (Part 3): COMPLETE/PARTIALLY_COMPLETE/INCOMPLETE/
  AMBIGUOUS/CONFLICTING/DUPLICATE/UNVERIFIED, real rule-based classifier
  with an evidence-carrying `quality_findings` JSONB column for the *why*
  (not a separate table — kept inline on the requirement row, matching the
  existing `oc_client_service_requirement_history` shape more directly and
  avoiding an unnecessary join for the single most common read path).
  **Real architecture refinement made here, not a literal "add to the
  existing requirement model" as this line originally said**: built as a
  NEW table, `oc_business_requirements` (migration 038), deliberately
  separate from `oc_client_service_requirements`
  (`requirements-service.ts`). Investigated first, documented in the
  migration's own doc comment: the existing table is AskABD's own fixed,
  well-specified ONBOARDING catalog (Database Host, Security Contact, ...)
  — every field is authored by AskABD, not the client, so "is this
  requirement ambiguous?" is not a meaningful question to ask of it. The
  new table holds the CLIENT's own business/functional/technical
  requirements, which genuinely can be incomplete/ambiguous/duplicate. Full
  vertical slice: service, routes, RBAC, 15 real tests, UI page following
  the canonical Connector-Configuration pattern. See
  `docs/enterprise-operations-progress.md`'s Phase 1/2 entry for full detail.
- ✅ **DONE (2026-08-23)** — **Gap Analysis extension** (Part 4 + 6):
  extended the real, already-mature `oc_gaps`/`oc_gap_options`/`oc_decisions`/
  `oc_transformations` system (migration 037, gap-analysis-service.ts,
  decision-transformation-service.ts, 21 existing routes, the existing
  `clients/[clientId]/gaps` UI) — confirmed via full inspection first that
  most of the brief's field list (Business Impact, Technical Impact,
  Security Impact, Compliance Impact, Root Cause, Owner, Priority,
  Dependencies, Assumptions, Version-via-`created_at`/`updated_at`) already
  existed; the real gaps were compliance-status classification, structured
  evidence, customer visibility, actor attribution on the row itself, and
  genuine cross-engine wiring. Migration 044 (additive columns +
  `oc_gap_evidence` table). Full detail, including two real defects found
  and fixed along the way (a pre-existing customer-portal route that
  exposed every gap with no visibility filter at all; a JSONB/TEXT type
  collision against an undocumented pre-existing `constraints` column) and
  the explicit Playwright/API-DB verification-level breakdown, in
  `docs/enterprise-operations-progress.md`.

---

## Phase 3 — Documents + traceability

- **Document Generation Engine** (Part 7 — the largest gap): template
  registry (Part 37: name/version/category/required-inputs/
  optional-inputs/sections/source-mappings/output-formats/approval-workflow)
  first, then the generation pipeline for a small starting set (BRD, SRS,
  EWR, EWP — the four the existing platform vocabulary already names in
  `HANDOFF.md`) before the full ~50-document catalog in Part 7. Wire to the
  Phase-1 Versioning and Approval engines, not a bespoke mechanism. Export:
  Markdown first (cheapest, no new dependency), then PDF/DOCX.
- **Requirements Traceability Matrix UI** (Part 8): built on the Phase-1
  Traceability engine, surfacing the real chain for a given requirement.

---

## Phase 4 — Comparison + assessment

- **Generalize `comparison-service.ts`** (Parts 9–10) from
  migration-source/target-scoped to arbitrary DEV/TEST/UAT/PROD/SYSTEM-A-vs-B,
  across database/schema/API/config/infra/security dimensions, with the
  full reporting shape (Executive Summary, Matches, Differences, Missing,
  Added, Changed, drill-down to evidence). Read-only, always — no
  comparison operation may write to either compared system.
- **Compliance re-verification** (Part 5): fresh
  COMPLIANT/PARTIALLY-COMPLIANT/NOT-ASSESSED/INSUFFICIENT-EVIDENCE pass
  against the existing multi-framework schema, distinguishing "not
  compliant" from "insufficient evidence" explicitly in the UI, not just
  the data model.
- **Data Profiling depth** (Part 11): extend `connector-service.ts`/
  `discovery-service.ts` read-only inspection with column-level profiling
  (null rates, duplicates, orphan relationships, sensitive-data indicators).

---

## Phase 5 — Migration intelligence

Already the most mature area (COMPLETE per the gap analysis). Real
remaining work: rollback planning (Part 12 names it explicitly; confirm
whether it already exists in `migration-execution-service.ts` before
building — do not assume it's missing without checking).

---

## Phase 6 — Testing + delivery

- SDLC Command Centre (Part 14): re-map the existing unified journey view's
  stages to the brief's 12-stage naming, surfacing per-stage requirements/
  risks/gaps/documents/tasks/defects/evidence/approvals — reuse the view,
  don't build a second one.
- Universal Search extension (Part 19): enumerate `client-search-service.ts`'s
  actual current entity coverage against the brief's ~17-item list; extend
  only the real gaps.

---

## Phase 7 — Post-delivery operations

- Executive/Client Value Dashboard (Part 17): audit
  `portfolio-intelligence-service.ts` + `client-portal-service.ts` against
  the brief's exact metric list; every score must cite explainable
  underlying evidence, per Part 17's own explicit rule — no new "health
  score" may be invented without a real, inspectable formula.
- Platform Health extension (Part 36): the existing `npm run health` (11
  checks) is real; extend its coverage list against Part 36's list
  (background jobs, queues, document generation, search) rather than
  building a parallel health surface.

---

## Phase 8 — Smart recommendations + optimization

- Smart Recommendation Engine extension (Part 18): extend
  `recommendation-service.ts` with the newer proactive categories (missing
  evidence, unconfigured connectors, incomplete lifecycle stages), each
  recommendation carrying WHY/EVIDENCE/IMPACT/RECOMMENDED-ACTION and never
  auto-executing.
- AI/Smart Assistance (Part 34): only after Phase 0's `ai-copilot.tsx`
  verification. If a real backend is warranted, output must always be
  labeled as AI-generated, carry Evidence/Confidence/Reasoning/Source, and
  never become an approved business decision without a human
  approval-workflow step (reuse Phase 1's Approval engine).

---

## Session continuation protocol

At the end of every working session on this program:

1. Update this roadmap's phase statuses (add a dated status line under the
   relevant phase — do not rewrite history, append).
2. Update `docs/enterprise-operations-gap-analysis.md` if new evidence
   changes a capability's status.
3. Record exact regression numbers (API/Identity/Web test counts,
   `npm run health` result) at the moment the session ends, matching the
   existing report's own convention.
4. Name anything genuinely blocked (needs a business/architecture decision)
   explicitly — never leave it silently dropped.
5. Do not deploy production. Keep all work in DEV until the full change set
   for a phase has passed regression and a dedicated security verification
   pass.

**Status as of 2026-08-22 (this session):** Audit complete. Phase 0, item 1
(backend fabrication sweep) done this session: **clean, no findings**. No
`Math.random()` in reachable backend code (only comments correctly noting
`randomUUID` is used instead), no `mock-`/`fake`/`sample`/`demo` literals
presenting fabricated data as real, no `localStorage`/`sessionStorage`
leaking into server code. The one `mode: 'real' | 'demo'` field in
`connector-service.ts` is a legitimate, honestly-persisted (`last_test_mode`
column, written to `oc_connection_tests`) disclosure of demo-mode testing —
not a fabrication. This closes the one gap the eighth pass explicitly left
open. No other implementation code changed this session — everything else
in Phase 0 (commit/push checkpoint, `ai-copilot.tsx` verification, the
5-breakpoint field-UX sweep) remains for the next session, in that priority
order.
