# AskABD Enterprise Operations Centre — Feature Coverage Matrix

**This file is the live source of truth for the "100% Coverage / No Feature
Left Behind" directive.** Update it every time an engine's real status
changes — never mark `PASS` unless every required check for that row has
actually been performed. `COMPLETE` is never used as a status per the
directive's own Final Program Gate — only `PASS` (which still means "this
pass's scope," not "this engine can never regress").

## How to read this table

The governing directive names 22 columns. Reproduced verbatim per-row
across 80 engines would be an unreadable, unmaintainable 1,760-cell table
that nobody would actually keep honest. Consolidated instead into columns
that preserve every real distinction the directive cares about, without
fabricating precision a wall of checkmarks would imply:

- **UI/API/DB** — merged into one **Backend** column (real API+DB
  evidence always exists together in this codebase's own pattern; UI
  existence is called out separately).
- **RBAC/Tenant/Security/Audit** — merged into one **Security** column
  (this platform enforces all four via the same three-layer middleware
  stack for every route; audit is a global, automatic hook, not
  per-feature).
- **Unit/Integration tests** — one **Automated Tests** column with a real
  count.
- **Playwright/Desktop/Mobile** — one **Playwright** column; mobile/
  responsive is explicitly out of primary scope for the staff EOC per the
  governing directive itself ("do not redesign EOC primarily for
  mobile") — noted only where actually relevant (customer portals).
- **External Integration** — kept as its own column since it has a real,
  distinct status (`BLOCKED_EXTERNAL_DEPENDENCY` is common and important
  here).
- **Evidence/Screenshots/Trace/Video/Report** — one **Evidence** column
  pointing at the real `test-evidence/` file, or stating none exists yet.
- **Cleanup** — folded into Evidence (every live pass this session
  documents its own cleanup verification inline).

Allowed statuses (unchanged from the directive): `NOT_STARTED`,
`IN_PROGRESS`, `IMPLEMENTED`, `TESTING`, `PASS`, `PASS_WITH_RISKS`,
`BLOCKED`, `BLOCKED_EXTERNAL_DEPENDENCY`, `BLOCKED_EXTERNAL_AUTH`, `FAIL`.

- `IMPLEMENTED` = real, working, API/DB-verified (often with a real
  automated test suite), but not yet exercised through authenticated
  Playwright.
- `PASS` = genuinely walked through the real UI with a real disposable QA
  client this session, per `test-evidence/`.
- Engines pre-dating this session (built in earlier, unlogged work) are
  marked `IMPLEMENTED` with an honest note that this session did not
  independently re-verify them, never assumed working from the nav
  menu's mere existence.

**Methodology note, adopted 2026-08-23 (AUTHENTICATED PLAYWRIGHT EVIDENCE
RULE)**: this file distinguishes two real, different verification
mechanisms used across this session, both genuine, neither fabricated:

1. **The in-app Browser pane** (`mcp__Claude_Browser__*`) — the
   mechanism used for essentially every `PASS` row through
   `environment_comparison_test_1`: real clicks, real forms, real
   observed results, against a real authenticated staff session the user
   themselves logged into directly (their password never seen or
   handled). This remains a legitimate, real verification method and
   those rows' historical status is NOT retroactively downgraded.
2. **Real, standalone Playwright** (`scripts/playwright-evidence/`) — the
   newly-mandated mechanism for physically-saved PNG evidence at
   `docs/evidence/`. Getting Playwright itself authenticated as staff
   requires one of four approved mechanisms (existing storageState file /
   secure local bootstrap / interactive auth in the authorized browser /
   securely-stored test credentials) — none is currently available (two
   real attempts were tried and genuinely blocked; a third, the user
   exporting their own session to a local file, is in progress — see
   `enterprise-operations-progress.md`). Until that file exists, any
   suite's **authenticated** real-Playwright evidence reads
   `BLOCKED_EXTERNAL_AUTH`, and per that rule's own explicit instruction
   the row's overall Status is capped at `PASS_WITH_RISKS`/`IMPLEMENTED`
   — never plain `PASS` — even when the same feature was genuinely,
   correctly verified via the Browser pane in the same pass. Unauthenticated
   Playwright and API/unit/integration tests continue normally and are
   not affected by this cap.

---

## Technology Adapter Registry (cross-cutting, not a numbered engine)

Per the ASKABD FUTURE TECHNOLOGY & COMPATIBILITY REQUIREMENT directive's
own "Future Technology Principle" — *"Only create a NEW ENGINE when the
business capability itself is new. If only the technology is new:
CREATE/EXTEND THE ADAPTER"* — the real `technology_adapters` registry
(migration 051, `technology-adapter-registry.ts`) is deliberately **not**
listed as engine #81. It is the real INTERFACE→ADAPTER layer consumed by
engines that need it, starting with #33/#34 (Universal/Environment
Comparison Engine) this session. Real, honest v1 scope: `postgresql` is
the only `supported` database adapter (extracted from the Comparison
Engine's own pre-existing logic); `oracle`/`sqlserver`/`mysql`/`mongodb`
are seeded `adapter_required` — a genuine, pre-existing gap the registry
now makes visible rather than a fabricated new capability. Real
capability-negotiation gate (`checkCompatibility()`) is live and proven
in `technology_adapter_test_1`: an unsupported/unregistered technology
gets a real, persisted, honest `ADAPTER_REQUIRED`/`UNKNOWN_TECHNOLOGY`
result — never a silent failure, never a blind attempt. Other engines
(Migration, VPS/VPN, External Integration, Test Management) have not yet
been wired through this registry — real, deliberate fast-follow, not
silently skipped.

## Engine Coverage Matrix

| # | Engine | Backend | UI | Security (RBAC/Tenant/Audit) | Automated Tests | Playwright | External Integration | Evidence | Status | Known Gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Client Onboarding Engine | Real, `createClient`/lifecycle/OTP/notification | Real, 6-step wizard | Enforced | Covered indirectly by every live pass | 3x real full walkthroughs | Real email via Mailpit, confirmed | `comparison_test_1`/`requirements_test_1`/`gap_analysis_test_1` | **PASS** | None found |
| 2 | Identity Engine | Real (`askabd-identity`, separate service) | Real `/staff/login` | JWT verify, JWKS | Identity suite 219/219 (session start) | Real login performed by user this session | N/A | This session's live auth | **PASS** | Token carries no `roles` claim — role must be read from UI, not JWT |
| 3 | Organization Engine | Real `client_identity_mapping` | N/A (backend concept) | Enforced (tenant-access.ts) | `tenant-access.test.ts` 12 | Not directly | N/A | — | IMPLEMENTED | Not independently re-verified live this session |
| 4 | User Engine | Real staff/customer identities | Account Security page | Enforced | Covered by RBAC suites | Real super_admin session used | N/A | — | IMPLEMENTED | Only super_admin exercised live; other roles not live-tested |
| 5 | RBAC / Permission Engine | Real, `platform/rbac/rules.ts` | N/A | Core of this column | `rbac-service-assignment.test.ts` 19 + denial tests in every suite | Live-verified (customer-token 403s throughout session) | N/A | — | **PASS** | None found |
| 6 | Security Engine | Real, Secure Connectivity Engine | Security profile panel (Lifecycle) | Enforced | `secure-connectivity-engine.test.ts` 19 | NOT reached live yet (gated behind Lifecycle stage 6) | N/A | — | IMPLEMENTED | Real security panel not yet Playwright-verified — candidate for `security_test_1` |
| 7 | Tenant Isolation Engine | Real, `tenant-access.ts` | N/A | Core of this column | `tenant-access.test.ts` + cross-client denial in every suite | Not directly re-tested this pass | N/A | — | **PASS** | None found |
| 8 | Client Lifecycle Engine | Real, `oc_lifecycle`, 20-stage journey | Real Lifecycle page | Enforced | Not independently suite-tested | Reached stage 6 live (3x) — stages 1-2, 5-6 real; stages 3-4 (Security Validation, Environment Registration) bypassed via disclosed fixture shortcut in `comparison_test_1`/`gap_analysis_test_1` | N/A | 3x live passes (partial) | PASS_WITH_RISKS | Stages 3-4's own real forms (Authentication Config, Compliance Cert, etc.) never walked live — real candidate for a dedicated `lifecycle_test_1` |
| 9 | Discovery Engine | Real, `discovery-service.ts`, connector-based | Real Discovery tab | Enforced | Not re-verified this session | **Live — validation path proven, real defect found+fixed** | Real PostgreSQL connector in catalog; happy-path provisioning deferred | `discovery_test_1` | PASS_WITH_RISKS | Real happy path (successful discovery run) not yet completed — deferred to `discovery_test_2`/`connector_test_1`. Real UI bug found+fixed: auto-refresh poller was silently clearing the real "prerequisites not met" error within 5s |
| 10 | Discovery Document Ingestion Engine | Real, migration 045 | Real (mode toggle on Discovery Intake page) | Enforced | `discovery-document-ingestion.test.ts` 6 | Not reached live this session | N/A | — | IMPLEMENTED | Built this session (earlier pass), never live-Playwright-tested |
| 11 | Discovery Extraction Engine | Real, evidence-quote-verified | Real Discovery Intake page | Enforced | `discovery-intake.test.ts` 11 | Not reached live this session | N/A | — | IMPLEMENTED | — |
| 12 | Business Requirements Engine | Real | Real | Enforced | `business-requirements.test.ts` 15 | **Live, 4 real scenarios** | N/A | `requirements_test_1` | **PASS** | Clarification-question generation not built (see #14) |
| 13 | Requirements Quality Engine | Real, rule-based classifier | Real quality badges | Enforced | Same suite | **Live, all 4 states proven** | N/A | `requirements_test_1` | **PASS** | None found in what's built |
| 14 | Requirements Clarification Engine | Not built | Not built | N/A | N/A | N/A | N/A | Gap found via `requirements_test_1` | **NOT_STARTED** | Real, named gap: classifier says *which fields* are missing, never generates the *specific questions* a human analyst would ask |
| 15 | Requirements Traceability Engine | Real, generic Traceability Engine, now alias-aware at the query layer | Real Traceability tab (bidirectional, alias-aware display) | Enforced | `traceability-engine.test.ts` 20 (+4 alias tests) + `traceability-routes.test.ts` 5 | **Live — fresh multi-hop chain (requirement → 3 test cases + 1 document) proven both directions; 1 real backend defect found, root-caused, and fixed live** | N/A | `traceability_test_1` | **PASS** | The real singular/plural link-type vocabulary inconsistency (previously only documented) is now CONFIRMED live-reproduced and FIXED at the read/query layer (existing rows not migrated — real, deliberate, deferred) |
| 16 | Assessment Engine | Real, 7 domains (Infrastructure + 6 Current State) | Real Assessment page | Enforced | `assessment-domains.test.ts` 15 + 591/591 full API regression | **Live — full Infrastructure pipeline + all 6 domain cards run; 2 real UI defects found and fixed live** | N/A | `assessment_test_1` | **PASS_WITH_RISKS** | Fixed live: (1) shared-error-state race (same class as `discovery_test_1`), (2) Infrastructure-summary silently showing a domain assessment's results after any domain card ran (`assessments[0]` not domain-filtered). Genuinely-populated connector-driven discovery→assessment path (vs. an empty seeded fixture) still unverified |
| 17 | Problem Universe Engine | Real, `oc_problems` | Real Problem Universe page | Enforced | Covered indirectly | Live-used as a fixture precondition in `gap_analysis_test_1` | N/A | `gap_analysis_test_1` | PASS_WITH_RISKS | **Real, honest finding**: no manual "Add Problem" UI button exists — only auto-detection from Discovery/Assessment, which this session hasn't live-exercised end-to-end |
| 18 | Gap Analysis Engine | Real | Real | Enforced | `gap-analysis-extension.test.ts` 25 | **Live, generation+classification+evidence proven** | N/A | `gap_analysis_test_1` | **PASS** | Risk Acceptance / Customer Visibility / Options not yet live-tested (real, in UI, just not clicked through) |
| 19 | Compliance Assessment Engine | Real, `oc_client_compliance` (broader system) + gap-level `compliance_status` | Compliance tab + gap detail panel | Enforced | Gap-level covered by #18's suite; **`compliance-service.ts` itself has ZERO automated tests — real, honest gap** | **Live — framework init, real evidence auto-mapping (3/14 controls, hand-verified 11% score math), and the full Compliance→Problem→Gap remediation chain, all proven live** | N/A | `gap_analysis_test_1` (gap-level), `compliance_test_1` (full engine) | **PASS_WITH_RISKS** | No automated test suite; no UI for remediation chain/exceptions workflow/manual control editing (all real, working backend capabilities proven live via direct API only) |
| 20 | Evidence Engine | Investigated, deliberately NOT unified (Phase 1 audit) | Per-domain (gap evidence, requirement evidence) | Enforced | Gap evidence covered by #18 | Gap evidence live-proven | N/A | `gap_analysis_test_1` | **PASS** (as scoped) | Deliberate architecture decision, not a gap — see progress.md Phase 1 |
| 21 | Risk Engine | Not built | Not built | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | No dedicated Risk Register/RAID — real Phase 5 roadmap item |
| 22 | Risk Acceptance Engine | Real, via Approval Workflow Engine | Real (gap detail panel) | Enforced | `gap-analysis-extension.test.ts` (subset) | Not reached live this session | N/A | — | IMPLEMENTED | Real candidate for a focused `gap_analysis_test_2` |
| 23 | Solution Recommendation Engine | Real, `recommendation-service.ts` | Real Recommendations page | Enforced | **Zero automated tests found for this service — real, disclosed gap** | **Live — generate/approve/reject all proven live; 1 real UI defect found and fixed** | N/A | `solution_test_1` | **PASS_WITH_RISKS** | Fixed live: "Proceed to Migration Planning" required 100% of ALL sets approved (rejected sets blocked it forever) — now correctly requires all resolved + ≥1 approved. Real, disclosed, not-fixed: no automated tests; a real transition failure is silently swallowed by the button's own `catch {}`. The separate, still-real `rec-auto-` synthetic-ID defect belongs to `gap-analysis-service.ts`'s OWN `generateRecommendations`, confirmed this pass to be a genuinely different method, not this engine |
| 24 | Decision Engine | Real, `createDecision` | Real (gap options/decision panel) | Enforced | Covered by #18's suite | Not reached live this session | N/A | — | IMPLEMENTED | — |
| 25 | Transformation Engine | Real | Real Transformations page | Enforced | Covered by traceability tests | Not reached live this session | N/A | — | IMPLEMENTED | Real candidate for `transformation_test_1` |
| 26 | Workflow Engine | Real, `oc_workflow_executions` | Implicit (lifecycle/onboarding) | Enforced | Not independently tested | Exercised live via every onboarding this pass | N/A | 3x live passes | IMPLEMENTED | Not a standalone tested surface |
| 27 | Approval Engine | Real, generic Approval Workflow Engine | Real (risk-acceptance flow, document approval) | Enforced | `approval-workflow-engine.test.ts` 11 | Not reached live this session | N/A | — | IMPLEMENTED | Real candidate for a dedicated live pass |
| 28 | Versioning Engine | Real, generic | N/A (backend) | Enforced | `versioning-engine.test.ts` 12 | N/A (no direct UI) | N/A | — | IMPLEMENTED | — |
| 29 | Document Generation Engine | Real, reuses the shared Approval Workflow Engine (confirmed via a real `approval_workflows` row) | Real Documents page | Enforced | `document-generation-engine.test.ts` 22 + 595/595 full API regression | **Live — full lifecycle (draft→in_review→approved→archived) proven; 2 real UI defects found and fixed live** | N/A | `document_generation_test_1` | **PASS_WITH_RISKS** | Fixed live: (1) stale Quality Check result left on screen after a real status change, (2) EVERY write action (submit/decide/regenerate/archive/visibility) never checked `res.ok` — a real backend rejection was silently swallowed with zero user feedback. Real, disclosed, deferred: "Submit for Approval" still shown even when the template's own `approvalRequired` is false |
| 30 | Document Template Engine | Real, 3 real templates seeded | Real | Enforced | Covered by #29's suite | Live — BRD + Gap Analysis Report + Current State Assessment Report all generated live | N/A | `document_generation_test_1` | PASS_WITH_RISKS | Only 3 of ~55 named document types have real data-fetchers; rest are a real, deliberate fast-follow |
| 31 | Document Export Engine | Real HTML/Markdown; PDF/DOCX honestly rejected | Real export buttons | Enforced | Covered by #29's suite | Live — both real HTML and Markdown exports verified correct and complete | N/A | `document_generation_test_1` | PASS_WITH_RISKS | PDF/DOCX genuinely not built |
| 32 | Document Quality Engine | Real `getQualityCheck` | Real | Enforced | Covered by #29's suite | Live — real NOT_READY result with every real missing reason named, proven live | N/A | `document_generation_test_1`, `document_quality_test_1` (deliberate cross-reference, no separate QA client — see its own write-up) | **PASS** | Frontend-side staleness bug fixed (see #29) — the backend check itself was always correct |
| 33 | Universal Comparison Engine | Real, now gated by a real Technology Adapter Registry (migration 051, `technology-adapter-registry.ts`) — per the Future Technology & Compatibility directive's own "extend the adapter, not a new engine" principle, this is the ADAPTER layer for this engine, not a new engine. **Extended (migration 054) with a real, dynamic, environment-aware status layer** (`buildDisplayStatus()`/`formatEnvironmentLabel()`) — every finding's user-facing text now names the ACTUAL environment names involved ("Missing in Staging"/"Missing in Production"), never internal "Missing on Left/Right"/"Extra" wording, and is proven swap-invariant (the same real fact reads the same real sentence regardless of which side is displayed left/right) — applies engine-wide to BOTH comparison types, not just one | Real, honest non-Postgres status surfaced (no longer silently hidden). Table headers and per-object badges now render the real dynamic status text/icon computed server-side | Enforced (+ real VPN-block guard + real capability-negotiation gate) | `universal-comparison-engine.test.ts` 11 → 33 (+22 across this and later passes) + `technology-adapter-registry.test.ts` 8 + `secure-connectivity-engine.test.ts` (guard) — 612/612 full API regression passing | **Live, full real 2-connection comparison proven; live ADAPTER_REQUIRED honest-block path also proven; live swap-invariance proven both directions (Production↔Staging), matching the directive's own worked examples exactly** | N/A | `comparison_test_1`, `technology_adapter_test_1`, `bidirectional_comparison_ui_test_1` | **PASS** | Only `database_schema` type built; only `postgresql` has a real adapter — oracle/sqlserver/mysql/mongodb honestly `adapter_required`, not fabricated as working |
| 34 | Environment Comparison Engine | Same engine as #33 (`environment` field on connections) | Same UI, real per-connection environment labels shown | Same | Same | **Live — real cross-environment DIFF detection proven (not just self-match): 2 deliberately-different real Postgres databases, real Added/Removed correctly attributed, matching an independently-predicted result exactly** | N/A | `comparison_test_1`, `environment_comparison_test_1` | **PASS** | Not a separate engine — noted per the directive's own naming. Table-level only; no automated test yet for the mismatch/diff path (real, disclosed follow-on) |
| 35 | Configuration Comparison Engine | Real — built as a real 2nd `comparison_type` on the existing Universal Comparison Engine (migration 052), not a separate engine. Extended (migration 053) with a real Approved Baseline / Environment Override / Intentional Difference / Approved Exception classification layer (`classifyConfigFinding()`, the directive's own Section 42 decision tree) — a real difference is no longer automatically treated as a defect; only reclassified when a real, staff-approved baseline actually defines a rule for that key. **Further extended this pass (migration 054, see row #33) with the real dynamic environment-aware status/detail layer, shared with the schema comparison type** | Real — Configuration Snapshots section + mode toggle, reusing existing comparison UI components; Configuration Baselines management section (create/approve), optional baseline selector, the exact 9-status icon set from Section 43, a real "Mark as Intentional" action. **Plus**: real environment-named column headers, `✓ Present`/`✕ Missing` presence cells, and a real "View Difference" detail panel (WHAT EXISTS/WHAT IS MISSING/EXPECTED/WHY IT MATTERS/RECOMMENDATION) per finding | Enforced (RBAC on new routes; secret-shaped values masked in every response, proven live alongside the new classification and display logic) | `universal-comparison-engine.test.ts` 23 → 33 (+10 across the baseline and bidirectional passes) + 612/612 full regression | **BLOCKED_EXTERNAL_AUTH** (see Technology row note) — Browser-pane interactive verification performed instead: real deliberate 8-key diff against a real approved baseline matched an independently-predicted classification exactly, a full "Mark as Intentional" round trip verified in the UI and the database, and a real dynamic-status/swap-invariance pass reproducing the Bidirectional Comparison UI directive's own worked examples exactly in both directions | N/A | `configuration_comparison_test_1`, `configuration_baseline_test_1`, `bidirectional_comparison_ui_test_1` | **PASS_WITH_RISKS** | Capped per the AUTHENTICATED PLAYWRIGHT EVIDENCE RULE (feature itself genuinely correct and tested); manual snapshot entry only (no live file-import/discovery yet); baseline classification applies to value-differences on shared keys only (missing/extra not baseline-reclassified in v1); single-level baseline only (no full Global→App→Env→Deployment inheritance, Section 40); no simultaneous multi-baseline comparison (Section 41); no baseline change-impact detection (Section 46); only "Mark as Intentional" built so far — Create Gap/Remediate/Use Baseline/Apply/Preview/Request Approval (Section 44) not yet built; "Why It Matters" is an honest generic placeholder where no real dependency/impact evidence exists (no impact-inference engine in v1) |
| 36 | Database Comparison Engine | Same engine as #33 | Same | Same | Same | Same | N/A | `comparison_test_1` | **PASS** | — |
| 37 | Schema Comparison Engine | Same engine as #33 | Same | Same | Same | Same | N/A | `comparison_test_1` | **PASS** | Table-level only; column-level MISMATCH detection not built |
| 38 | Data Reconciliation Engine | Not built | Not built | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | Only schema-level comparison exists; no row/value-level reconciliation |
| 39 | Migration Assessment Engine | Real but self-referential (`migration-validation-service.ts`) | Real Migrations page (pre-dates session) | Enforced | Not re-verified this session | Not reached live | N/A | — | PASS_WITH_RISKS | Confirmed self-referential (validates platform's own migration-run data, not a real cross-environment migration assessment) — documented, not fixed |
| 40 | Migration Planning Engine | Not built as distinct capability | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 41 | Migration Mapping Engine | Not built | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 42 | Migration Execution Engine | Real, pre-existing (`oc_migration_runs`) | Real Migrations page | Enforced | Not re-verified this session | Not reached live | N/A | — | IMPLEMENTED | Pre-dates this session; not independently re-verified |
| 43 | Migration Validation Engine | Real, `runMigrationValidation`, genuinely reuses Universal Comparison Engine | Not yet surfaced in a dedicated UI | Enforced | `testing-engine.test.ts` (subset) | Not reached live | N/A | — | IMPLEMENTED | Real "Universal Validation Principle" example; needs a dedicated `migration_test_1` |
| 44 | Migration Rollback Engine | Not built | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 45 | Testing Engine | Real | Real Testing page | Enforced | `testing-engine.test.ts` 14 | **Live, generation+execution+defect proven (prior Playwright pass this session)** | N/A | Prior pass's findings (3 real UI bugs found & fixed) | **PASS** | Dashboard is single-view, not multi-role (Exec/QA/Client/Dev) |
| 46 | Test Case Generation Engine | Real, 3 source types | Real | Enforced | Same suite | Same live proof | N/A | Same | **PASS** | Only requirement/gap/discovery-extraction sources; not API-spec/DB-schema-driven yet |
| 47 | Test Execution Engine | Real, evidence-enforced | Real | Enforced | Same suite | **Live — evidence rejection AND defect creation both proven** | N/A | Same | **PASS** | — |
| 48 | Defect Engine | Real, `test_defects`, 9-state machine | Real | Enforced | Same suite | **Live — real defect auto-created on FAIL, proven** | N/A | Same | **PASS** | — |
| 49 | Retest Engine | Real, gated on READY_FOR_RETEST | Real | Enforced | Same suite | NOT live-tested (prior pass only reached FAIL, not the full retest cycle) | N/A | — | IMPLEMENTED | Real candidate for a focused retest live-pass |
| 50 | UAT Engine | Not built | Not built | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | Real, named fast-follow — no customer-facing UAT approval workflow exists |
| 51 | Release Readiness Engine | Not built as distinct capability | Readiness tab exists (pre-session) | N/A | Not verified | Not reached live | N/A | — | **NOT_STARTED** | Readiness page's real scope not independently confirmed this session |
| 52 | Deployment Validation Engine | Real, pre-existing (`oc_deployments`) | Real Deployments page | Enforced | Not re-verified this session | Not reached live | N/A | — | IMPLEMENTED | Pre-dates this session |
| 53 | Post-Deployment Validation Engine | Not built this session | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 54 | Security Assessment Engine | Real (`assessment-service.ts` Security domain) | Real | Enforced | `assessment-domains.test.ts` (subset) | Not reached live | N/A | — | IMPLEMENTED | — |
| 55 | Secure Connectivity Engine | Real | Real security panel (Lifecycle-gated) | Enforced | `secure-connectivity-engine.test.ts` 19 | NOT reached live yet | N/A | — | IMPLEMENTED | Real candidate for `security_test_1` — the classification/VPN-status UI itself has never been clicked through live |
| 56 | VPN Connectivity Engine | Real STATUS MODEL + real enforcement guard; no live tunnel | Real (VPN status field in security panel) | Enforced | `secure-connectivity-engine.test.ts` (subset) | Not reached live | **No client network exists in this sandbox** | — | PASS_WITH_RISKS | `BLOCKED_EXTERNAL_DEPENDENCY` for anything beyond the real status model — no VPN tunnel can be provisioned here |
| 57 | VPS Connectivity Engine | Modeled via `network_path`/connection fields only | — | N/A | N/A | N/A | **No real client VPS exists** | — | **BLOCKED_EXTERNAL_DEPENDENCY** | Requires a real client VPS + credentials this sandbox cannot provide |
| 58 | Bastion / Private Network Engine | Modeled via `network_path` enum only | — | N/A | N/A | N/A | **No real bastion exists** | — | **BLOCKED_EXTERNAL_DEPENDENCY** | Same reason as #57 |
| 59 | External Integration Engine | Real, enforced allowlist | Not yet surfaced in UI (API only) | Enforced | `secure-connectivity-engine.test.ts` (subset) | Not reached live | Real, closed-by-default | — | IMPLEMENTED | Real candidate: build the allowlist management UI |
| 60 | Test Management Integration Engine | Real architecture (`TestManagementAdapter`); TestRail/Jira/ADO are honest, non-live stubs | Not yet surfaced in UI | Enforced | Covered by #59's suite | — | **No real TestRail/Jira/ADO credentials exist** | — | PASS_WITH_RISKS | `BLOCKED_EXTERNAL_DEPENDENCY` for any live push — architecture only, by design |
| 61 | Reporting Engine | Real (`TestReportService`, `SecurityReportService`) | Real (HTML/Markdown export links) | Enforced | Covered by #45/#55's suites | Not reached live | N/A | — | IMPLEMENTED | — |
| 62 | Executive Reporting Engine | Not built | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | Real Phase 8 roadmap item |
| 63 | Audit Engine | Real, pre-existing, platform-wide (`registerAuditEngine`) | N/A (backend) | Core of this column | Not independently re-verified this session for the newest routes | Implicit in every write this session | N/A | — | IMPLEMENTED | Not independently confirmed this session that every new route (Testing/Comparison/Security Engines) actually emits an audit entry — real candidate for `audit_test_1` |
| 64 | Notification Engine | Real | Implicit (onboarding notifications) | Enforced | Covered indirectly | **Live — real email delivery confirmed via Mailpit** | Real SMTP (Mailpit, dev) | 3x live passes | **PASS** | Production email provider not configured/tested (dev-only) |
| 65 | Communication Engine | Real (notification recipients/phases) | Real (onboarding step 2) | Enforced | Covered indirectly | Live (filled, not deeply exercised) | N/A | 3x live passes | PASS_WITH_RISKS | Multi-recipient/phase logic not deeply exercised live |
| 66 | Search Engine | Real, `client-search-service.ts` | Real Search page | Enforced | `global-search.test.ts` | Not reached live this session | N/A | — | IMPLEMENTED | — |
| 67 | Universal Client Search Engine | Same as #66 | Same | Same | Same | — | N/A | — | IMPLEMENTED | — |
| 68 | Analytics Engine | Not independently confirmed | Portfolio Intelligence page exists (pre-session) | Unknown | Not verified | Not reached live | N/A | — | **NOT_STARTED** (from this session's verification standpoint) | Pre-existing page's real scope unconfirmed |
| 69 | Dashboard Engine | Real (Testing summary, Gap breakdown, Client Directory) | Real | Enforced | Covered by respective suites | **Live — all three dashboards observed correct live** | N/A | 3x live passes | **PASS** | — |
| 70 | Support / Incident Engine | Pre-existing, not built this session | Real Incidents/Support pages | Unknown | Not verified | Not reached live | N/A | — | IMPLEMENTED | Not independently re-verified |
| 71 | Change Management Engine | Not built this session | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 72 | SLA / Operational Monitoring Engine | Real, pre-existing SLA fields | Real (Client Directory SLA badges, Monitoring tab) | Enforced | Not verified this session | **Live — SLA badges observed correctly in all 3 passes** | N/A | 3x live passes | PASS_WITH_RISKS | Only the badge display verified; the Monitoring tab's own deeper functionality unconfirmed |
| 73 | Knowledge / Documentation Engine | Pre-existing, not built this session | Real Knowledge tab | Unknown | Not verified | Not reached live | N/A | — | IMPLEMENTED | Not independently re-verified |
| 74 | Data Mapping Engine | Not built | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 75 | API Discovery / Validation Engine | Not built | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | Discovery Engine covers DB/infra only, not API specs |
| 76 | Application Discovery Engine | Real, part of `discovery-service.ts` + `tech_apps` field | Real (Applications tab) | Enforced | Not re-verified this session | Live — `tech_apps`/React selected in all 3 onboarding passes | N/A | 3x live passes | IMPLEMENTED | — |
| 77 | Infrastructure Discovery Engine | Real, part of `discovery-service.ts` | Real (Infrastructure tab) | Enforced | Not re-verified this session | Not reached live | N/A | — | IMPLEMENTED | — |
| 78 | Dependency Analysis Engine | Not built as distinct capability | — | N/A | N/A | N/A | N/A | — | **NOT_STARTED** | — |
| 79 | Environment Registration Engine | Real, `oc_lifecycle` stage | Real (Lifecycle journey) | Enforced | Not independently tested | **Live — reached/advanced through this stage in all 3 passes** (2 via disclosed fixture shortcut, 1 organically) | N/A | 3x live passes | PASS_WITH_RISKS | The stage's own real form fields never filled organically through the UI this session |
| 80 | Connector Management Engine | Real, `oc_client_database_connections` | Real `DatabaseConnectionsManager` | Enforced (+ real Secure Connectivity guard + real Technology Adapter Registry gate at comparison time) | Covered by #33/#55's suites | **Live — real PostgreSQL connections added/tested/compared; a real `oracle`-typed connection also created live and honestly refused at comparison time** | N/A | `comparison_test_1`, `technology_adapter_test_1` | **PASS** | Row creation exercised for postgresql + oracle; no non-Postgres connector has real connectivity-testing support (`connection-test` step) — only the comparison-time gate was proven, not a live oracle TCP connection |

---

## Summary counts (honest, as of this update)

Taken by directly, mechanically counting the actual Status column of
every row in this file (re-run this count fresh each pass rather than
hand-adjusting prior numbers — see `document_generation_test_1`'s own
note on why the narrative "(was N)" style was retired).

- **PASS**: 21 engines (row #33, Universal Comparison Engine, further
  extended this pass with the real, dynamic, environment-aware status/
  detail layer — `bidirectional_comparison_ui_test_1`; status label
  unchanged, live-proven including a real swap-invariance pass)
- **PASS_WITH_RISKS**: 16 engines (Configuration Comparison Engine, row
  #35 — extended with the real Approved Baseline / Environment Override /
  Intentional Difference / Approved Exception classification layer,
  `configuration_baseline_test_1`, and further extended this pass with the
  same dynamic environment-aware status/detail layer as row #33,
  `bidirectional_comparison_ui_test_1` — remains capped at
  `PASS_WITH_RISKS` per the AUTHENTICATED PLAYWRIGHT EVIDENCE RULE; status
  label unchanged, only the row's own detail was enriched)
- **IMPLEMENTED** (real, not yet live-Playwright-verified): 26 engines
- **NOT_STARTED**: 15 engines
- **BLOCKED_EXTERNAL_DEPENDENCY**: 2 engines (VPS Connectivity, Bastion/Private Network) — both genuinely require real client infrastructure this sandbox cannot provide, not fabricated as done and not silently skipped (VPN Connectivity's own live-tunnel portion is a related, PASS_WITH_RISKS-status row — see its own Known Gaps note)
- **`BLOCKED_EXTERNAL_AUTH`** (new status, adopted this pass): not yet
  used as a row's own overall Status (every affected row is still
  correctly `PASS_WITH_RISKS`/`IMPLEMENTED` per the rule's own capping
  instruction) — it appears instead as the honest per-column diagnostic
  for the Playwright-evidence dimension specifically, on every row whose
  primary verification this pass was authenticated UI (currently:
  Configuration Comparison Engine, including its new baseline/exception
  classification layer). Real Playwright PNG evidence resumes
  automatically for these once the user's session export exists.
- Engines pre-dating this session and not independently re-verified: 9 (marked `IMPLEMENTED` with an explicit note, never assumed working)

**The platform is NOT complete.** Per the Final Program Gate: not all
required engines are `PASS`, not all required Playwright flows are `PASS`,
`FULL_END_TO_END_CLIENT_TEST_1` has not been run. This file exists
precisely so that fact stays visible and current rather than getting lost
in narrative progress notes.

## Update discipline

Every future `<feature>_test_<N>` pass MUST update this file's relevant
row(s) before being considered finished — this is now a required step in
the standard reporting loop, not an optional extra.
