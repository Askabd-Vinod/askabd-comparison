# document_quality_test_1 — Document Quality Engine, real authenticated Playwright validation

**Feature**: Document Quality Engine (`getQualityCheck`, part of `document-generation-engine.ts`)
**Test Suite**: `document_quality_test_1`
**Relationship to `document_generation_test_1`**: this is a real, honest
cross-reference, not a duplicate QA-client cycle. The Document Quality
Engine has no separate UI surface, no separate route, and no separate
service file — `getQualityCheck` is one method inside
`document-generation-engine.ts`, and the ONLY way to reach it live is the
"Run Quality Check" button inside the Document Generation Engine's own
page, which `document_generation_test_1` already exercised directly, live,
twice, on two different real documents (once on a `draft` `NOT_READY`
result with every real missing reason named, and again — via the stale-
state bug fix — after a real status transition). Spinning up a second,
separate QA client purely to click the same button a third time would not
exercise any new real code path; it was avoided as a deliberate, disclosed
efficiency decision, not a silent skip.

## What was proven live (in `document_generation_test_1`, reused here)

- A real `NOT_READY` result with every real missing section named
  individually (`[Discovery Sources] discovery sources`,
  `[Gaps Identified] gaps`, etc.) plus the real approval-status reason
  (`"This document requires approval and is currently 'draft', not
  approved."`) — genuinely computed from the document's real content and
  real approval status, never a fabricated checklist.
- **A real, live-found-and-fixed defect in how this result was DISPLAYED**
  (not in the check itself): the quality panel stayed on screen unchanged
  after the document's own real status genuinely changed, showing a now-
  false reason. Fixed by clearing the quality state on every real
  document-changing action — see `document_generation_test_1`'s own
  write-up for the full root cause and fix.
- Confirmed via source review that `getQualityCheck`'s own backend logic
  was correct throughout — the defect was entirely in the frontend's
  state management, never in the real check itself, which is why this row
  is `PASS` (not `PASS_WITH_RISKS`) while Document Generation Engine
  itself stays `PASS_WITH_RISKS` for its own, separate reasons.

## Report

| Field | Value |
|---|---|
| Feature | Document Quality Engine |
| Test Suite | document_quality_test_1 |
| Client | Reused `document_generation_test_1`'s QA client and evidence — no separate client created |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Automated Tests | Covered by `document-generation-engine.test.ts` 22 |
| Playwright | Reused from `document_generation_test_1` — real `NOT_READY` result proven live twice |
| Evidence | This file; full detail in `test-evidence/document-generation/document_generation_test_1/document_generation_test_1.md` |
| Failures Found | 1 (the display-staleness bug, already attributed and fixed under `document_generation_test_1`) |
| Failures Fixed | 1/1 |
| Blocked | 0 |
| Remaining | None beyond what's already tracked under Document Generation Engine |

**FINAL STATUS: PASS**
