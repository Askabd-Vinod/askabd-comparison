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

- **Evidence engine**: confirm whether existing per-feature evidence needs
  unifying into one polymorphic `evidence` table/service (gap analysis
  Section 3, item 9) — this is a genuine open question, not a given; audit
  before building.
- **Generic Versioning engine**: `entity_versions` table + service, usable
  by any entity type via `entity_type`/`entity_id`.
- **Generic Approval Workflow engine**: `approval_workflows` +
  `approval_steps`, DRAFT→IN_REVIEW→CHANGES_REQUESTED→APPROVED→REJECTED→
  SUPERSEDED, polymorphic entity reference, real audit on every transition.
- **Generic Traceability engine**: `traceability_links` table + service,
  supporting the BR→FR→TR→EWR→EWP→Task→TC→Defect→Deployment→UAT→Production
  chain from Part 8, but generic enough for any two linked entities.

These four are foundational because Phases 2–7 all want to version, approve,
and trace the things they create. Building them first avoids each later
phase inventing its own ad hoc mechanism (which is exactly the
duplicate-capability risk the gap analysis's Section 4 flags as the
platform's one real ongoing hazard).

---

## Phase 2 — Discovery + requirements + gaps

- **Universal Discovery capability** (Part 1): free-text problem statement
  intake first (cheapest, highest value); document/file ingestion
  (PDF/Word/spreadsheet/screenshot) as a fast-follow, each format landing in
  a `discovery_sources` / `discovery_extractions` pair with real
  Source/Evidence/Confidence per extracted field — never silently assumed.
- **Current State Assessment** (Part 2): extend the existing
  `assessment-service.ts` shape (already Source/Evidence/Confidence/Status
  for infrastructure) to the other six categories (Business, Application,
  Data, Security, Quality, Operations) rather than a parallel schema.
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
- **Gap Analysis extension** (Part 4 + 6): the real `oc_gaps`/`oc_gap_options`
  foundation (migration 037) already exists — extend with the full field
  set the brief wants (Business Impact, Technical Impact, Risk, Recommended
  Resolution, Owner, Priority) if not already present; verify before adding.

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
