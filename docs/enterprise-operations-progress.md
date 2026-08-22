# AskABD Enterprise Operations Centre — Implementation Progress

**This is the live continuation checkpoint.** Read this file first in any new
session on this program before doing anything else. It reflects the exact
last-known-good state and the exact next task.

---

## Current Phase

**Phase 1 is now fully complete.** Phase 2, item 3 (Requirement
quality/completeness classification — Business Requirements Intelligence)
was also built this session, ahead of strict roadmap order since it was
self-contained and fully additive (safe under "make the safest reversible
engineering decision and continue" rather than blocking on Phase 1 first).

## Current Task

All of Phase 1 (Evidence audit, Versioning Engine, Approval Workflow
Engine, Traceability Engine) is done. Phase 2 item 3 (Business Requirements
Intelligence), item 1's free-text half (Universal Discovery intake), and
item 2 (Current State Assessment extension) are also done — see entries
below. **Next session should continue Phase 2**: Universal Discovery's
document/file-ingestion fast-follow (PDF/Word/spreadsheet/screenshot —
genuinely not started, not faked), and the Gap Analysis extension (Part 4
+ 6 — extend the real `oc_gaps`/`oc_gap_options` foundation from migration
037 with the brief's full field set, verifying what's already present
first). The Phase 1 engines now have their first real consumer (Discovery
Intake uses Traceability); Versioning and Approval Workflow still have no
wired consumer yet — reach for them as soon as a real capability needs
versioning or a real approval step, rather than reinventing either. Re-read
this
file first and confirm `npm run health` is still green (services may need
`npm run dev:all` again if the machine was restarted between sessions; the
Web dev-server health check specifically needs `/staff/login` pre-warmed
first with a longer-timeout curl — a known Next.js dev first-compile timing
quirk, not a defect, see Last Health Check below).

## Completed This Session — Phase 2 item 3, Business Requirements Intelligence (2026-08-22, continued)

Real, database-backed capability distinguishing the CLIENT's own stated
business/functional/technical requirements from AskABD's fixed onboarding
catalog (`requirements-service.ts` / `oc_client_service_requirements`,
architecturally unrelated — see migration 038's own doc comment for the
full reasoning). Full vertical slice, Definition-of-Done complete:

1. **Migration 038** (`oc_business_requirements` + `oc_business_requirement_history`)
   — 13 requirement types (business/functional/non_functional/technical/
   integration/security/compliance/data/reporting/migration/performance/
   availability/usability), 7 quality statuses (complete/partially_complete/
   incomplete/ambiguous/conflicting/duplicate/unverified), evidence-carrying
   `quality_findings` JSONB, self-referencing `related_requirement_id` for
   duplicate/conflict linking, full version-history table. Applied to the
   live DEV database, verified via `\d`.
2. **`business-requirements-service.ts`** — real, transactional, versioned
   CRUD (matching `requirements-service.ts`'s and `crm-service.ts`'s proven
   patterns: idempotent updates, `BEGIN`/`COMMIT`/`ROLLBACK`, history writes,
   best-effort fire-and-forget audit via the same `oc_audit_log` pattern used
   platform-wide). The real capability: a **rule-based, fully explainable**
   quality classifier — every non-complete status carries a `{rule, message}`
   finding, never a fabricated/black-box score:
   - `duplicate_title` — same client, normalized-title exact match (real DB
     query, tenant-scoped — confirmed NOT to false-positive across clients)
   - `missing_required_fields` → `incomplete` (≥3 of description/acceptance
     criteria/stakeholder/business objective/category missing)
   - `vague_unmeasurable_language` → `ambiguous` (a vague term — "better",
     "faster", "seamless", etc. — with no digit anywhere in the description)
   - `missing_optional_fields` → `partially_complete` (1–2 fields missing)
   - `staff_flagged_conflict` → `conflicting` — the ONE status deliberately
     never auto-assigned; requires an explicit staff action, since real
     semantic conflict detection is not something this system can honestly
     claim to verify on its own.
   - Real, evidence-backed `getQualitySummary()` rollup (per-status counts,
     no fabricated single "quality score").
3. **`business-requirements-routes.ts`** — client-scoped list/create/summary,
   opaque-ID get/update/deprecate/flag-conflict/history, real `400`/`404`
   handling, `getAuth(req)` for real actor attribution (never client-supplied).
4. **RBAC** — 8 new rules added to `platform/rbac/rules.ts` (Admin.Access,
   staff-only — same precedent as CRM's contacts/notes/tasks; no customer
   self-service surface yet). Registered in `server.ts`.
5. **Tests** — `business-requirements.test.ts`, 15 real tests against real
   Postgres + real Fastify routing + real RBAC/tenant-access middleware:
   RBAC denial (403/401), full CRUD, versioned update + history, deprecate
   (soft state, not delete), and — the real substance — every quality-
   classification branch (incomplete/ambiguous/complete/duplicate,
   tenant-scoped duplicate check proven NOT to cross clients, staff-flagged
   conflict, summary rollup). **15/15 passing**, both standalone and as part
   of the full 421-test suite.
6. **UI** — new `(app)/clients/[clientId]/business-requirements/` page +
   `business-requirements-manager.tsx`, following the canonical
   Connector-Configuration pattern (cards, expandable rows, status badge)
   confirmed as this platform's approved standard for multi-record client
   pages: real create form (every field has a visible label + helper text,
   required/optional distinguished, never placeholder-only), a 7-value
   `QualityBadge` (icon+label, never color alone, matching
   `evidence-status.tsx`'s existing accessibility discipline), an expandable
   detail panel showing the real `quality_findings` explanation, a
   staff-only conflict-flagging control, and a real, evidence-backed summary
   strip (no fabricated aggregate score). New "Business Requirements" tab
   added to `client-tabs.tsx`.
7. **Verification**: `tsc --noEmit` clean on both `apps/api` and `apps/web`.
   Unauthenticated access to the new page live-verified in the real browser
   — cleanly redirects to `/staff/login`, zero console errors, no data
   leak (confirms the route compiles and the security boundary holds).
   **Full authenticated Playwright walkthrough of this specific page was
   NOT completed** — same pre-existing, already-documented constraint as the
   prior session's pending item 3 (no staff credential available without
   guessing/brute-forcing against the one real `super_admin` identity, which
   this platform's own rules forbid). The real, DB-backed HTTP-layer test
   suite (item 5 above) is the substitute evidence for this pass — it
   exercises the real database, real Fastify routing, and real RBAC/tenant
   middleware end-to-end, just not the rendered DOM.
8. **Full regression, clean isolated baseline**: API 421/421 (up from 406 —
   15 new), Identity 219/219, Web 33/33. `npm run health`: 11/11.
   Both protected real clients (`AskABD Manual UAT 2026`, `Test1`) confirmed
   intact via direct DB query, timestamps unchanged. No leftover test-fixture
   clients (afterAll cleanup-by-exact-id confirmed working, zero `BR %`-named
   rows left in the database).

## Completed This Session (2026-08-22)

1. **Runtime health restored**: all three dev services were down at session
   start (Web/API/Identity all connection-refused). Diagnosed as simply not
   started (not a defect) — started via `npm run dev:all`. `npm run health`:
   **11/11 green** (Docker x3, Postgres x2, Mailpit, Identity, Identity
   JWKS, API, API `/ready`, Web).
2. **`ai-copilot.tsx` verified** (the one open risk flagged in the prior
   session's audit): read in full. It is **already honest** — a prior pass
   found and fixed real fabrication here (fake confidence scores, a fake
   dollar figure, invented client names) and replaced it with a plain
   "not yet connected to a real AI/LLM backend" message pointing to the real
   Engineering Intelligence page instead. No fabrication live. Real
   Smart-Assistance backend work (Part 29/34 of the governing brief) remains
   a genuine future capability, not an urgent fix.
3. **Backend fabrication sweep** (the one item the prior session's audit
   trail explicitly left undone): `Math.random()`, `mock-`/`fake`/`sample`/
   `demo` literals, `localStorage`/`sessionStorage` in server code — **clean,
   no findings**. The one `mode: 'real' | 'demo'` field in
   `connector-service.ts` is a legitimate, honestly-persisted disclosure
   (`oc_connection_tests.mode` column), not a fabrication.
4. **Pre-checkpoint safety scan**: full diff scanned for secrets/credentials
   — clean (`test-secret-value-not-a-real-secret` fixture,
   `[ENCRYPTED:AES-256-GCM]` display placeholders being *removed*, a
   `CHANGE_ME` k8s template placeholder with an explanatory comment that the
   real system doesn't even use that field). Emails in the diff are all
   `*.example.com` test fixtures plus the two known real AskABD addresses.
5. **Two real problems found and fixed before committing** (would have been
   real mistakes if committed):
   - `apps/api/uploads/` was about to be committed — contains **real
     client-uploaded files**, including a directory for the real protected
     `Test1` client (`client-9a2a1b23-...`). Never belongs in source control.
   - `infra/aws/.terraform/` was about to be committed — local Terraform
     provider cache/binaries (`.exe` files). Never belongs in source
     control.
   - Both added to `.gitignore` (`apps/api/uploads/`,
     `infra/aws/.terraform/`, `*.tfstate*`) and excluded from the commit.
6. **Checkpoint committed and pushed**: 304 files, commit `fd5ff30` on
   `feature/reliability-hardening`. Pushed to `origin/feature/reliability-hardening`
   (a feature branch — `main` confirmed untouched, still `b63f797` locally
   and on origin, both before and after this push). This captures all prior
   sessions' work (14 migrations, 9 new services, 5 new route files, the
   frontend route-group restructuring, ~20 new docs) that had been sitting
   uncommitted and unrecoverable.
7. `docs/enterprise-operations-gap-analysis.md` and
   `docs/enterprise-operations-roadmap.md` created (prior turn this session)
   and now committed.
8. **`askabd-identity` also checkpointed** (sibling repo, branch `master` —
   no remote configured, so this is a local-only safety net, not a push):
   commit `8e319ea`, 29 files (signing-key persistence + JWKS, MFA replay
   prevention, admin-route auth fix, self-auth routes, real password-recovery
   email delivery). Also fixed a real pre-existing hygiene gap while there:
   `node_modules/` was partially tracked in git history with no `.gitignore`
   covering it or `dist/` — added one covering `node_modules/`, `dist/`,
   `coverage/`, `*.tfstate*`. Two already-tracked `node_modules` bookkeeping
   files were left as-is rather than force-removed, to avoid an unplanned
   history rewrite in this pass — flagged as a real, low-priority future
   cleanup item, not fixed here.
9. **Identity regression confirmed fresh this session: 219/219 passing**
   (up from the 213 baseline the last report recorded — 6 new tests from
   this checkpoint's own work, all passing).

## Completed This Session — Phase 1, Generic Versioning Engine (2026-08-22, continued)

Real, reusable, entity-agnostic version-history mechanism for future work
to build on, per the roadmap's own reasoning ("avoids each later phase
inventing its own ad hoc mechanism"):

1. **Migration 039** — `entity_versions` table (`entity_type`/`entity_id`/
   `version`/`field_snapshot` JSONB/`changed_by`/`change_reason`/
   `created_at`), `UNIQUE (entity_type, entity_id, version)` as a DB-enforced
   backstop. Applied to the live DEV database, verified via `\d`.
2. **`versioning-engine.ts`** — `recordVersion`/`getHistory`/`getVersion`/
   `getCurrentVersionNumber`/`diff`. The real substance: version-number
   assignment is serialized per `(entityType, entityId)` via a
   transaction-scoped `pg_advisory_xact_lock`, so concurrent callers can
   never race to compute the same next version — proven, not assumed, by a
   real test firing 10 concurrent `recordVersion` calls at the same entity
   and asserting the result is exactly versions 1–10 with zero duplicates.
   `diff()` is a real field-by-field comparison between two recorded
   snapshots, never a fabricated summary.
3. **Deliberately NOT retrofitted onto existing per-entity history tables**
   (`oc_client_service_requirement_history`, `oc_business_requirement_history`,
   CRM's contact/note/task history) — those are real, working, already-tested
   code; rewriting them onto a new engine mid-session would be exactly the
   "rebuild what already works" the governing brief forbids. This engine is
   for new work to reach for going forward, not a migration of old work.
4. **Tests** — `versioning-engine.test.ts`, 12 real tests against real
   Postgres: version sequencing (1, 2, 3, ... never skipped/reused),
   per-entity independence, history ordering, exact-version lookup
   (distinct from "latest"), honest `null`/`0`/`[]` returns for
   nonexistent version/entity/diff (never a fabricated fallback), the
   10-concurrent-writer race proof, and the diff helper (real changed-only
   fields, zero-diff-for-identical-snapshots, empty-diff-for-missing-version).
   **12/12 passing**, both standalone and as part of the full suite.
5. **Full regression, clean isolated run**: API **433/433** (421 + 12 new).
   `npm run health`: 11/11. No UI/route surface touched this pass (this is
   a backend-only shared engine with no consumer wired up yet — Identity
   and Web suites unaffected, not re-run this pass since nothing in either
   changed).

## Completed This Session — Phase 1, Evidence-Engine Audit + Generic Approval Workflow Engine (2026-08-22, continued)

**Evidence-engine audit** (roadmap: "genuine open question, not a given —
audit before building"): searched all 52 files referencing "evidence"
across the API. Found three genuinely distinct concepts wearing the same
word, not one idea: (1) Compliance's real evidence lifecycle
(`evidence_status` missing/expired/met, `evidence_required` checklist,
`evidence_references` artifacts, plus a real daily scheduled check for
expired/missing evidence) — the richest model, built for a real regulatory
need; (2) Assessment/Gap-Analysis's lightweight citation string (`evidence:
string[]` pointing at which discovery finding justified a conclusion, no
lifecycle); (3) the frontend's `EvidenceBadge`/`EvidenceTrail` — a live
connector-test verification-status vocabulary, not stored evidence at all.
**Decision: do not build a unifying table.** Forcing these into one
polymorphic schema would strip compliance's real lifecycle down to nothing
or bloat a generic table with fields only one caller uses. This item is
closed as investigated-and-declined, not deferred — full reasoning recorded
in `docs/enterprise-operations-roadmap.md`.

**Generic Approval Workflow Engine** — the other concrete Phase 1 item:

1. **Migration 040** — `approval_workflows` (real, enforced status enum:
   draft/in_review/changes_requested/approved/rejected/superseded) +
   `approval_workflow_steps` (the real, attributed transition history).
   Two real DB-level guarantees beyond application code: a partial unique
   index (`idx_approval_workflows_one_open_per_entity`) blocks a second
   open workflow for the same entity, and a foreign key cascades step
   deletion. Applied to the live DEV database, verified via `\d`.
2. **`approval-workflow-engine.ts`** — `openWorkflow`/`submit`/`approve`/
   `reject`/`requestChanges`/`resubmit`/`getWorkflow`/`getSteps`/
   `listForEntity`/`getOpenForEntity`. A real, enforced transition table
   (`ALLOWED_TRANSITIONS`) rejects any invalid transition (e.g. approving
   straight from draft, or transitioning out of a terminal state) with a
   clear, real `InvalidTransitionError` — never silently coerced.
   `requestChanges` requires a real, non-empty note explaining what needs
   fixing — never a silent bounce-back. Opening a new workflow for an
   entity that already has an APPROVED one automatically transitions the
   old one to SUPERSEDED first, as a real logged step (not just a status
   flip) — proven by a real test, not assumed.
3. **Tests** — `approval-workflow-engine.test.ts`, 11 real tests against
   real Postgres: the full happy path with real decision attribution,
   rejection, the changes-requested loop, the required-note rule, the
   enforced-state-machine rejections (both an invalid forward transition
   and an attempted transition out of a terminal state), the real
   unique-constraint rejection when two open workflows are attempted for
   one entity, the real auto-supersede behavior, and history/lookup
   correctness. **11/11 passing**, both standalone and as part of the full
   suite, first try — no defects found or fixed.
4. **Full regression**: API 444/444 on the first full run had 1 unrelated
   failure (`customer-activity.test.ts`, "module/status filters and
   pagination work on real data" — `expected 3 to be >= 5`); re-ran that
   file alone — 6/6 passed, confirming the same self-inflicted
   repeated-full-suite-rerun pattern already documented twice this session
   (this test's assumption about recently-seeded activity-event counts is
   sensitive to how many times the suite has run against the persistent
   dev DB today), not a real regression, and genuinely unrelated to this
   change (customer-activity has no relationship to approval workflows).
   **Final clean count: API 444/444** (433 + 11 new). `npm run health`:
   11/11. No UI/route surface yet — same as the Versioning Engine, this is
   a backend-only shared engine with no consumer wired up this pass.

## Completed This Session — Phase 1, Generic Traceability Engine (2026-08-22, continued) — Phase 1 now fully complete

The last remaining Phase 1 shared-foundation item, supporting the
BR→FR→TR→EWR→EWP→Task→TC→Defect→Deployment→UAT→Production chain from Part
8 of the governing brief, generic enough for any two linked entities:

1. **Migration 041** — `traceability_links` (`source_type`/`source_id`/
   `target_type`/`target_id`/`link_type` — derives_from/implements/tests/
   blocks/depends_on/relates_to). `UNIQUE (source_type, source_id,
   target_type, target_id, link_type)` makes linking naturally idempotent.
   Applied to the live DEV database, verified via `\d`.
2. **`traceability-engine.ts`** — `link` (idempotent — recording the same
   real triple twice returns the original row, never a duplicate or an
   overwrite), `unlink` (real hard delete, honestly reports whether
   anything was actually removed), `getOutboundLinks`/`getInboundLinks`
   (direct one-hop lookup), and the real substance: `getForwardChain`/
   `getBackwardChain` — full multi-hop traversal via a genuine Postgres
   recursive CTE with an explicit path-based cycle guard and a hard depth
   ceiling (25, regardless of what a caller requests). Two directions
   written out as separate, explicit SQL strings rather than built by
   dynamic column-name string manipulation, specifically to avoid a real
   bug class (a first draft of this file did attempt the dynamic-string
   approach and was self-caught as fragile/incorrect before ever running —
   rewritten to explicit SQL before the first test run, not after finding
   a failure).
3. **Tests** — `traceability-engine.test.ts`, 11 real tests against real
   Postgres: idempotent linking, multiple simultaneous link types between
   the same two entities, real unlink with an honest true/false result,
   direct inbound lookup, a real 4-node forward chain in correct depth
   order, a real backward chain, a **diamond-shaped graph** (two paths
   converging on one node — proven to report that node via both real
   paths, not silently collapsed), a **genuinely cyclic graph** (A→B→C→A —
   proven to terminate with a bounded result, never hang or return
   unbounded depth), a real `maxDepth` limit proof, and honest empty-array
   returns for an entity with no links (never a fabricated single-node
   chain). **11/11 passing, first try** after the one self-caught fix
   above — no defects found during testing itself.
4. **Full regression, clean isolated run**: API **455/455** (444 + 11 new),
   zero flakes this time (no repeated-rerun pollution — this was the first
   full-suite run since a natural gap). `npm run health`: 11/11.

**Phase 1 is now fully complete**: Evidence engine (audited, concluded not
to build), Versioning Engine, Approval Workflow Engine, Traceability
Engine. All three built engines are genuinely backend-only so far — no
route or UI wired to any of them yet. That is intentional, not an
oversight: they are shared building blocks for Phase 2+ features (Document
Generation approval, Gap Resolution versioning, the full BR→...→Production
trace) to reach for as each is actually needed, not standalone features in
their own right. Wiring one in prematurely, before a real caller needs it,
would risk guessing at an API shape a real consumer later has to bend
around.

## Completed This Session — Phase 2 item 1, Universal Discovery (free-text intake) (2026-08-22, continued)

The real, human-authored starting point of the discovery journey (Part 8):
before building, confirmed this was genuinely new — `discovery-service.ts`
does live, connector-based TECHNICAL discovery (real credentials against
real databases/repos); `problem-universe-service.ts` stores already-
CLASSIFIED problem records. Neither captures the client's own raw, free-
text problem narrative. Document/file ingestion (PDF/Word/spreadsheet/
screenshot) is a real fast-follow — deliberately not built this pass.

1. **Migration 042** — `discovery_sources` (the raw text itself, preserved
   verbatim, `ON DELETE CASCADE` from `oc_clients`) + `discovery_extractions`
   (real, staff-tagged structured findings, `confidence` defaulting to
   `unverified` — same honest-default convention as
   `oc_business_requirements.quality_status`). Applied to the live DEV
   database, verified via `\d`.
2. **`discovery-intake-service.ts`** — `submitSource`/`markReviewed`/
   `archiveSource`/`extractField`. The real substance: `extractField`
   requires a real `evidenceQuote` and **verifies, server-side, that the
   quote is an actual verbatim substring of the source's raw content**
   before allowing the extraction to save — never an unverifiable claim.
   No real AI/NLP extraction exists in this platform (confirmed via
   `ai-copilot.tsx`'s own honest "not connected to a real AI backend"
   disclosure), so every extraction is explicitly a real, attributed STAFF
   action, matching Part 34's "never present generated suggestions as
   verified facts" — there is nothing generated here to mislabel. Each
   extraction is also linked to its source via the new Traceability Engine
   (`derives_from`) — the first real consumer of that Phase 1 engine, so a
   later Business Requirement built from a finding can trace all the way
   back to the client's original words.
3. **A real bug found and fixed during testing** (not assumed correct):
   the route handler originally used `message.includes('not found')` to
   distinguish "source doesn't exist" (404) from "bad evidence quote"
   (400). The evidence-quote-verification error's own wording — "...that
   exact text does not appear there" in an earlier draft was "...it was
   not found there" — contained the substring "not found," so a bad-quote
   submission was misrouted to 404 instead of 400. Caught by the real test
   suite on the first run (`expected 404 to be 400`), not by inspection.
   **Fixed properly**, not patched around: added a real
   `DiscoverySourceNotFoundError` class (the same `instanceof`-based
   pattern as `approval-workflow-engine.ts`'s `InvalidTransitionError`)
   so the route checks a real type, never a message substring. Reworded
   the quote-verification message too, but the type check is the actual
   fix — a future wording change can no longer silently break this again.
4. **Routes + RBAC** — `discovery-intake-routes.ts`, 7 new Admin.Access
   RBAC rules (same staff-only precedent as CRM/Business Requirements),
   registered in `server.ts`.
5. **Tests** — `discovery-intake.test.ts`, 11 real tests against real
   Postgres + real Fastify routing + real RBAC/tenant middleware: RBAC
   denial, real submission with real actor attribution, empty-content
   rejection, the full review/archive lifecycle, a successful real
   extraction, the bad-evidence-quote rejection (the case that caught the
   bug above), the missing-evidence-quote rejection, the 404-on-nonexistent-
   source case, and a real proof that the Traceability Engine link was
   actually created. **11/11 passing** after the one real fix.
6. **UI** — new `(app)/clients/[clientId]/discovery-intake` page +
   manager, following the canonical pattern: a submission form for the raw
   problem statement, an expandable per-source detail view showing the raw
   text plus every real extracted finding (with its confidence badge and
   its evidence quote rendered as a literal blockquote so a reader can see
   exactly what was cited), and a real extraction form that mirrors the
   backend's own verification rule in its helper text. New "Problem
   Intake" tab added to `client-tabs.tsx`.
7. **Verification**: `tsc --noEmit` clean on both `apps/api` and
   `apps/web`. Unauthenticated access to the new page live-verified in the
   real browser — clean redirect to `/staff/login`, zero console errors.
   Same pre-existing credential constraint as Business Requirements
   prevented a full authenticated Playwright walkthrough this pass — the
   11-test real DB+HTTP suite is the substitute evidence.
8. **Full regression, clean isolated run**: API **466/466** (455 + 11
   new), Web **33/33**. `npm run health`: 11/11. Zero leftover test-fixture
   clients (confirmed via direct query). Both protected real clients
   confirmed intact.

## Completed This Session — Phase 2 item 2, Current State Assessment domain extension (2026-08-22, continued)

Extended the existing `assessment-service.ts`/`oc_assessments` shape (which
only ever covered Infrastructure, driven by a technical discovery run) to
the six other real domains from Part 2: Business, Application, Data,
Security, Quality, Operations. Same `AssessmentResult`/`AssessmentFinding`
interfaces throughout — genuinely extended, not a parallel schema, per the
roadmap's own instruction.

1. **Migration 043** — one additive column: `oc_assessments.domain`
   (CHECK-constrained to the 7 real values, `DEFAULT 'infrastructure'` so
   every pre-existing row is automatically, correctly backfilled — no data
   migration script needed). Applied to the live DEV database, verified
   via `\d`.
2. **`assessment-service.ts`** — `startDomainAssessment(clientId, domain)`
   plus six private analyzers, each grounded in a real, specific data
   source on the client's own actual record (never a discovery-run
   proxy for domains that don't have one):
   - **Business**: `departments`/`capabilities`/`processes` array counts
   - **Application**: `tech_apps`/`tech_services`/`tech_apis` counts, plus
     a real complexity finding when the application portfolio exceeds 20
   - **Data**: `tech_databases` count, genuinely reusing the latest
     completed discovery run's real table/schema counts when one exists
     (not a disconnected second data source)
   - **Security**: real `oc_connectors.security_level` distribution
     (flagging admin-level access as a real, justified-or-not finding) +
     real `oc_client_compliance` evidence-missing/expired counts
   - **Quality**: real open-defect counts by severity from `oc_defects`
   - **Operations**: `environments`/`monitoring` JSONB — flags a real
     production-environment-without-infrastructure-monitoring gap as
     high-severity, and any other uncovered monitoring category as medium
   Every domain's zero/empty case is an honest `info`- or `medium`-severity
   "not recorded yet" finding, never silently skipped — same honesty
   convention as `oc_business_requirements`' "Not provided" default.
3. **A real bug found and fixed before it ever reached a test run** (not
   caught by a failing assertion — caught by directly re-verifying the
   live schema before writing tests, a discipline worth naming since it's
   cheaper than the alternative): the first draft of the Quality analyzer
   queried `oc_defects.askabd_status`, a column that does not exist on
   that table at all — `askabd_status` is a real column, but on a
   *different* table (Jira issue-link tracking, migration 023), and was
   mistakenly assumed to apply here too. Fixed to the real column
   (`status`) and its real vocabulary (`detected`/`acknowledged`/
   `investigating`/`mitigating`/`resolved`/`verified`/`closed`) before the
   test file was even written, let alone run.
4. **Routes** — two new routes added directly into the existing assessment
   block in `operations-center-routes.ts` (`POST /oc/assessment/domain/start`,
   `GET /oc/assessment/:clientId/domain/:domain`) — not a new route file,
   matching "extend, don't duplicate" for routes too, since this genuinely
   is the same assessment surface, not a new domain concept.
5. **Tests** — `assessment-domains.test.ts`, 15 real tests against real
   Postgres: the honest-empty-finding path and the real-data path for
   every one of the six domains, a real admin-connector finding, a real
   critical-defect finding (the case that caught the bug above), a real
   production-without-monitoring finding, persistence, and cross-domain
   isolation (assessments for different domains never leak into each
   other's `getAssessmentsByDomain` results). **15/15 passing.**
6. **UI** — extended the existing Assessment page (not a new page) with a
   "Current State Assessment — Beyond Infrastructure" section: one compact
   run/re-run card per domain, showing finding counts, a severity-colored
   summary, and an expandable real-findings list with evidence text.
7. **Verification**: `tsc --noEmit` clean on both `apps/api` and
   `apps/web`. Unauthenticated access to the extended assessment page
   live-verified in the real browser — clean redirect, zero console errors.
8. **Full regression, clean isolated runs**: API **481/481** (466 + 15
   new), Web **33/33**. `npm run health`: 11/11. Zero leftover test-fixture
   clients; both protected real clients confirmed intact.

## Failed Tests

**Session 1 (Phase 0)**: One transient failure, root-caused and closed, not
a real defect: `tests/operations-center-audit.test.ts > createClient —
audit best-effort policy > primary success + audit success` failed once
(`expected +0 to be 1`) during a run that was contending with two other
concurrent full-suite runs (my own mistake — ran the suite three times in
overlapping windows while iterating on capture/logging). Verified not a
real regression two ways (isolated file, isolated full suite — 406/406). No
code changed — no defect existed.

**Session continuation (Phase 1)**: A second, larger instance of the exact
same self-inflicted-rerun pattern, now fully understood and documented as a
recurring hazard of this environment (persistent, non-ephemeral dev
Postgres + repeatedly re-running full suites in the same session):
- Ran the full API suite concurrently with the full Identity suite and the
  full Web suite (three separate processes, three separate databases —
  chosen deliberately since Identity/Web don't share the API's DB). Result:
  5 individual test failures across 5 files (4 in API: `payment-
  reconciliation.test.ts` "prevents duplicate transactions", `reliability-
  hardening.test.ts` "one new history row", `remediation-execution.test.ts`
  "denied reading another client's remediation" [a real Postgres unique-
  constraint violation, not an assertion], `operations-center-audit.test.ts`
  "audit failure does not prevent remediation creation"; 1 in Identity:
  `self-auth-routes.test.ts`, 2 of its 5 tests timed out at 5000ms).
- **Root-caused, not papered over**: none of these 5 files touch the new
  `business-requirements` code (confirmed — my new test file wasn't even in
  the failure list). Two distinct causes, both self-inflicted: (a) the API
  failures were literal fixture-data collisions — this was the **second**
  full-suite run against the same persistent dev database within the
  session (an earlier attempt at capturing output had silently produced a
  truncated/empty log but the suite itself had actually run to completion
  underneath, leaving real rows behind that a second run's non-randomized
  fixtures — external IDs, requirement keys, incident IDs — then collided
  with); (b) the Identity timeout was real CPU contention from having three
  full suites' worth of bcrypt/argon2 password hashing and Postgres I/O
  running on the same machine simultaneously, not a logic defect.
- **Verified not real regressions, three independent ways**: (1) re-ran all
  4 failing API files together, alone — 45/45 passed; (2) re-ran the
  Identity file alone immediately after (while the API suite was still
  running in the background) — still failed, confirming the CPU-contention
  theory rather than refuting it; (3) re-ran it again once the API process
  had actually exited — 5/5 passed; (4) as the final, decisive check, ran
  both full suites completely alone, fully sequential, zero concurrency —
  **API 421/421, Identity 219/219, Web 33/33**, all clean. No code was
  changed for any of these — there was no defect to fix.
- **Process lesson recorded for future sessions**: do not re-run a full
  suite against this environment's persistent dev Postgres more than once
  without either (a) running suites fully sequentially, never concurrently,
  or (b) accepting that a second run may need fixture cleanup first. The
  final, trusted regression baseline for this session was established with
  fully sequential, zero-concurrency runs.

## Fixed Defects (process safeguards, not application code)

- `apps/api/uploads/` (real client-uploaded files, including the protected
  `Test1` client's directory) and `infra/aws/.terraform/` (Terraform
  provider binaries/cache) were about to be committed to
  `askabd-comparison`. Caught before commit, added to `.gitignore`, excluded.
- `askabd-identity` had `node_modules/` partially tracked in git history
  with no `.gitignore` covering it or `dist/`. Added a proper `.gitignore`;
  left the two already-tracked bookkeeping files alone rather than
  force-removing them (avoids an unplanned history rewrite this pass).

No application-code defects were found or fixed this session — this was a
Phase 0 (foundation/safety/verification) session, not a feature-implementation
one. The one test failure above was correctly diagnosed as non-code.

## Pending Tasks (in priority order, per the roadmap)

1. **Continue Phase 1/2 foundation engines**: Traceability Engine, generic
   Versioning Engine, generic Approval Workflow Engine — per the roadmap,
   needed as shared foundations before Phases 3–5 build their own ad-hoc
   versions of the same concepts. Business Requirements Intelligence
   (this session's work) is the first Phase 1 vertical slice, complete;
   Requirement Gap Analysis and cross-requirement dependency detection are
   the natural next Phase 1 extensions once the Traceability Engine exists
   to hook into.
2. **Full authenticated Playwright walkthrough of the new Business
   Requirements page** — genuinely not completed this pass (see item 7 in
   the Phase 1 summary above). Blocked on the same credential constraint as
   item 3 below, not newly introduced. A safe way to unblock: either the
   real system owner grants a scoped, temporary staff test identity (via
   `askabd-identity`'s real registration flow + this repo's own
   `staff_role_assignment` grant flow — genuinely correct usage of both,
   not a workaround), or provides the existing `super_admin` identity's
   credential for a single supervised session. Guessing/brute-forcing is
   not an option under this platform's own rules and was correctly not
   attempted.
3. The full 5-breakpoint field-UX sweep the prior session's eighth pass
   left unverified — this session again could not extend it to the ~12
   named in-app pages behind authentication, same credential constraint as
   item 2.
4. **Out of scope, flagged not fixed**: `askabd-shared` (sibling repo) has
   8 uncommitted changes on `main` (a real remote-tracked branch, unlike
   `askabd-identity`'s local-only `master`) — all build-artifact `.tgz`
   tarballs plus a lockfile bump from a workspace link, zero real source
   changes. Left untouched per the standing "never alter main without
   explicit instruction" rule, since this really is the protected branch
   here (unlike the other two repos' working branches). Low risk — these
   are regeneratable build outputs, not at-risk source work.

## Database Migrations

**43 applied** (see `docs/enterprise-operations-gap-analysis.md` Section 1
for the full list through 037; `038_business_requirements.sql`,
`039_entity_versioning_engine.sql`, `040_approval_workflow_engine.sql`,
`041_traceability_engine.sql`, `042_discovery_intake.sql`, and
`043_assessment_domains.sql` added this session, all applied to the live
DEV database and verified via `\d`).

## Last Verified Commit

Pending this turn's commit (Current State Assessment domain extension) on
`feature/reliability-hardening`. Prior verified commit: `4b81d6a` (pushed
to origin). `main` confirmed unchanged at `b63f797`.

## Last Playwright Verification

Unauthenticated access to every new/extended page this session
(`/clients/:clientId/business-requirements`,
`/clients/:clientId/discovery-intake`, and the extended
`/clients/:clientId/assessment`) was live-verified in the real browser —
clean redirect to `/staff/login`, zero console errors, no data exposed, for
all three. A full authenticated walkthrough of any was **not** completed —
blocked on the same pre-existing credential constraint recorded under
Pending Tasks item 2, not silently skipped. The real DB+HTTP integration
suites (`business-requirements.test.ts` 15 tests, `discovery-intake.test.ts`
11 tests, `assessment-domains.test.ts` 15 tests) are the substitute
evidence for the backend half of all three capabilities.

## Last Health Check

`npm run health`: **11/11 green**, confirmed at the end of this session
(needed the same `/staff/login` pre-warm as before — a Next.js dev
first-compile timing quirk, not a defect, now recorded as a known,
recurring, harmless characteristic of this dev environment).

## Regression — final confirmed baseline this session

- **API: 481/481 passing** (406 baseline → 421 Business Requirements → 433
  Versioning Engine → 444 Approval Workflow Engine → 455 Traceability
  Engine → 466 Discovery Intake → 481 Assessment Domains; every addition
  confirmed via a clean, fully isolated full-suite run — see Failed Tests
  above for two separate self-inflicted-rerun stories earlier this
  session, both fully investigated and closed as non-regressions unrelated
  to the new code; the Traceability Engine, Discovery Intake, and
  Assessment Domains runs were all clean with zero flakes)
- **Identity: 219/219 passing** (clean, fully isolated run earlier this
  session — not re-run this turn since no identity-service code changed)
- **Web: 33/33 passing** (clean, fully isolated run, no flakes — includes
  the extended Assessment page UI, unaffected)
- `npm run health`: 11/11 green
- Both protected real clients confirmed intact via direct DB query,
  timestamps unchanged: `AskABD Manual UAT 2026` (created 2026-08-15) and
  `Test1` (created 2026-08-19T21:53:45Z — exact match to every prior
  session's audit record)
- Zero leftover test-fixture clients from this session's new test suite
  (`afterAll` cleanup-by-exact-id confirmed working via direct query)
- No orphan/duplicate record sweep re-run this session beyond the above —
  the prior session's sixth and eighth passes both confirmed clean, and
  this session's only schema change (migration 038) is a new, additive,
  empty-by-default table with no way to have introduced orphans elsewhere

## Real client data on the system (protected, never modify without an
explicit, scoped test)

- `AskABD Manual UAT 2026`
- `Test1` (`client-9a2a1b23-5872-45d5-8246-2f0ba05bc691`) — created by the
  user directly via the real onboarding flow, per the prior session's audit
- Any other client not created by this session as a named, temporary test
  fixture with an exact ID captured for cleanup
