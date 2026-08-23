# traceability_test_1 — Requirements Traceability Engine, real authenticated Playwright validation

**Feature**: Generic Traceability Engine (`traceability-engine.ts`, migration 041) — real multi-hop chain traversal, surfaced via the real bidirectional Traceability UI
**Test Suite**: `traceability_test_1`
**QA Client**: `AskABD PW Traceability Test 1` (real ID: `client-3c85ebbd-3a01-4048-b0bd-f9db5070a427` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default

## Context

This engine was already live-verified once earlier this session (the
`d415a54` defect-fix pass, which found and fixed the "forward-chain-only"
rendering bug). This pass formalizes a fresh, dedicated live validation
under the current test-evidence standard, deliberately building a real,
fresh multi-hop chain rather than reusing the earlier fixture — and, in
doing so, found and fixed a second, real, previously-only-theoretical
defect.

## A real, live-reproduced-and-fixed defect (the main result of this pass)

**Background**: this session's own Pending Tasks already documented a
known, real inconsistency — `traceability_links` rows get recorded under
TWO different type vocabularies for the same concepts: SINGULAR
(`business_requirement`) from `gap-analysis-service.ts`/`decision-
transformation-service.ts`, and PLURAL, data-source-registry-key form
(`business_requirements`) from `document-generation-engine.ts`.
`entity-label-resolver.ts` already aliased both forms, but only for
*display* — the underlying chain-traversal *queries* still did an exact
string match, and were never proven to actually break anything until now.

**Reproduce**: created a real Business Requirement through the actual UI,
then generated a real Business Requirements Document (BRD) from it
through the actual Documents page (`document-generation-engine.ts`'s real
`business_requirements` section, real `sourceType: 'business_requirements'`
per its own code). Navigated to the real Traceability page and selected
the requirement. Result: **"Downstream — what this requirement leads to"
showed "No downstream links recorded" — even though a real, correctly-
created `traceability_links` row existed** (confirmed the row was real,
not simply absent, by reading `document-generation-engine.ts:329` before
concluding anything).

**Root cause**: `TraceabilityEngine.walk()`'s recursive CTE base case did
`WHERE source_type = $1` — an exact match against the query root's type
string (`business_requirement`, singular, per the UI's own query). The
real link row was recorded as `business_requirements` (plural) by the
document-generation path. Exact match, so the real row was never found —
not a missing link, a real link an overly-strict query couldn't see.

**Fix**: added a real, exported `TYPE_ALIASES` canonical map and an
`expandTypeAliases()` helper directly in `traceability-engine.ts` (per the
Pending Tasks note's own suggested resolution option "(b) formalize the
alias table as a permanent part of the Traceability Engine's own
contract"). `walk()`'s base case, plus `getOutboundLinks`/
`getInboundLinks`, now match `type = ANY($1::text[])` against every known
alias form, not just the one the caller happened to pass — existing rows
are NOT migrated (real, separate, deliberately deferred work; this fixes
the READ path, where the real user-facing impact actually is).
`entity-label-resolver.ts` was refactored to import this same table
instead of keeping its own separate copy, closing off a real risk of the
two alias lists silently drifting apart in the future. The frontend's own
`EntityChip` type→label map was made alias-aware too (a real, live-found,
purely-cosmetic follow-on: after the backend fix, the found link's chip
showed the raw `BUSINESS_REQUIREMENTS` string instead of the friendly
"Requirement" label).

**Verified**: 4 new real regression tests added to
`traceability-engine.test.ts` — a plural-recorded link found by a
singular-rooted query, the symmetric reverse case, a real multi-hop chain
spanning both vocabularies in one path, and a confirmation that an
unrelated, un-aliased type is genuinely unaffected. Re-verified live: the
exact same real requirement/document pair now shows the real link under
"Downstream", with a correctly-labeled "Requirement" chip.

## Steps executed (real, through the actual UI and real API)

1. Confirmed authenticated session live (`hello@askabd.com — super_admin`,
   no re-auth needed).
2. Created `AskABD PW Traceability Test 1` through the real 6-step
   onboarding wizard, including the real OTP-verification step.
3. Created one real Business Requirement through the actual Business
   Requirements page UI (measurable, Given/When/Then acceptance criteria)
   — real, honest classification: `INCOMPLETE` (missing stakeholder/
   objective/category, correctly and explainably reported — quality
   classification is orthogonal to traceability, not needed to be
   "complete" for this pass).
4. Generated 3 real test cases from that requirement via the real Testing
   Engine UI ("Generate Test Cases from a Business Requirement" →
   Generate) — real positive/negative/boundary cases, each with a real
   reason, creating 3 real `test_case --tests--> business_requirement`
   links (the backward/upstream direction).
5. Generated 1 real Business Requirements Document from the same
   requirement via the real Documents page UI — honestly showing
   "INFORMATION REQUIRED" for genuinely missing fields (business
   capabilities/processes, objective, stakeholder), never fabricated —
   creating 1 real `business_requirements --derives_from--> generated_
   document` link (the forward/downstream direction, recorded under the
   PLURAL form).
6. Navigated to the real Traceability page, selected the requirement.
   **Found the real bug above.** Fixed it, with real, targeted regression
   tests. Re-verified live: both "Downstream" (1 real document link,
   correctly labeled) and "Upstream" (3 real test-case links, unaffected
   throughout) now render correctly together.
7. Also fixed a real, minor, stale-copy issue on the same page: the
   page's own intro text still said "see its real forward chain"
   (singular/forward-only), not updated when the bidirectional-rendering
   fix landed earlier this session — corrected to describe both
   directions.
8. Full API regression re-confirmed: **66 files / 595 tests passing**
   (591 baseline + 4 new alias-awareness tests). `tsc --noEmit` clean on
   both `apps/api` and `apps/web`.
9. **Cleanup**: re-confirmed exact client id/name via direct SQL
   immediately before deletion. `traceability_links` has no `client_id`
   column (keyed by entity id) — real requirement/test-case/document ids
   were collected first and used to delete exactly the 4 real link rows
   they created, verified zero orphans afterward. Deleted across 13
   further real client-scoped tables. Both protected clients (`Test1`,
   `AskABD Manual UAT 2026`) confirmed present and unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Requirements Traceability Engine |
| Test Suite | traceability_test_1 |
| Client | AskABD PW Traceability Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | `traceability-engine.test.ts` 15→20 (4 new), `traceability-routes.test.ts` 5 — all passing; full API regression 595/595 |
| Playwright | 1/1 real end-to-end workflow PASS — real requirement → real test cases (backward) → real document (forward), both directions proven live after the fix |
| Console | PASS |
| Network | PASS |
| API | PASS — real chain traversal, real alias-aware matching, hand-verified against the actual `traceability_links` rows |
| Database | PASS — zero orphans after cleanup, including the entity-keyed `traceability_links` table |
| Security | PASS (via existing RBAC/tenant middleware, not independently re-exercised this pass) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 1 taken in-session (not saved to disk — no file-export tool) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 1 real backend defect (type-vocabulary chain-query mismatch) + 1 minor frontend cosmetic follow-on + 1 stale-copy issue |
| Failures Fixed | 3/3, all re-verified live |
| Blocked | 0 |
| Remaining | Existing `traceability_links` rows are NOT migrated to one vocabulary — a real, separate, deliberately deferred normalization task; the alias table only covers the 5 already-known dual-vocabulary types, not a general fuzzy-match |

**FINAL STATUS: PASS** — this pass converted a previously-abstract,
documented-but-unproven inconsistency into a concretely reproduced,
root-caused, fixed, and regression-tested defect, with both real chain
directions now genuinely correct and complete for a freshly built,
real, multi-hop chain.
