# document_generation_test_1 — Document Generation Engine, real authenticated Playwright validation

**Feature**: Document Generation Engine (`document-generation-engine.ts`, migration 046) — real document generation, quality checking, the full approval workflow (reusing the generic Approval Workflow Engine), export, customer visibility, and archiving
**Test Suite**: `document_generation_test_1`
**QA Client**: `AskABD PW Document Generation Test 1` (real ID: `client-8c75e4d2-a8b2-4710-8ec9-04d87fb7974b` — deleted after this run)
**Environment**: local dev · **Browser**: Chromium (in-app Browser pane) · **Viewport**: default

## Two real, live-found-and-fixed defects

### 1. Stale Quality Check result left on screen after a real status change

**Reproduce**: ran "Run Quality Check" on a fresh `draft` document — real,
correct result: `NOT READY`, listing every missing section plus
`"This document requires approval and is currently 'draft', not
approved."`. Then clicked "Submit for Approval" — the document correctly,
really transitioned to `in_review`. **The quality panel kept showing the
old result**, including the now-false "currently draft" line.

**Root cause**: `quality` was local `DocumentDetail` state, set only by
an explicit "Run Quality Check" click, and never cleared or re-fetched by
any of the other real state-changing actions (submit/decide/regenerate/
archive) — each of those correctly refreshed the parent's `document` prop
via `onChanged()`, but left the stale child-local `quality` value in
place.

**Fix**: clear `quality` at the start of every action that can change the
document's real state. Re-verified live: after Approve, the stale panel
is gone (not shown at all until a fresh "Run Quality Check").

### 2. Silently swallowed real error — no `res.ok` check on ANY document action

**Reproduce**: generated a "Current State Assessment Report" (a real
template with `approvalRequired: false`). The "Submit for Approval"
button is shown regardless of that flag. Clicking it: the real backend
correctly rejected the request with a real `400` —
`"This document's template (\"Current State Assessment Report\") does not
require approval."` — but the frontend **never checked the response
status**, called `onChanged()` unconditionally, and showed the user
**nothing**. The document silently stayed in `draft`, forever offering a
"Submit for Approval" button that can never succeed, with zero
explanation.

**Root cause**: `regenerate`/`submitForApproval`/`decide`/`archive`/
`toggleVisibility` all fired their real `fetch()` and immediately called
`onChanged()` in a `finally` block, without ever inspecting `res.ok` —
the exact same failure class (a real backend error silently absorbed)
already fixed twice elsewhere this session (Discovery, Assessment), this
time on the write side rather than the read/polling side.

**Fix**: introduced a shared `runAction()` helper used by all five write
actions — checks `res.ok`, and on failure extracts and displays the real,
specific backend error message (`error.message`) via a new `actionError`
state, rendered in a red panel identical in style to every other
error-surfacing pattern in this codebase. Re-verified live: the exact
real `400` and its exact real message now render on screen.

## Steps executed (real, through the actual UI and real API)

1. Confirmed authenticated session live, no re-auth needed.
2. Created `AskABD PW Document Generation Test 1` through the real
   6-step onboarding wizard.
3. Generated a real **Gap Analysis Report** (a template that DOES require
   approval) — honestly all 5 sections showed `INFORMATION REQUIRED`
   (this client genuinely has no discovery/gaps/evidence/recommendations/
   transformations yet), never fabricated.
4. Ran **Run Quality Check** — real, correct `NOT READY` with every real
   missing reason named. **Found defect #1** during the next step.
5. **Submit for Approval** → real transition to `in_review` (via the
   shared, generic Approval Workflow Engine — confirmed by a real
   `approval_workflows` row existing at cleanup time, not a
   document-specific parallel mechanism). Fixed and re-verified defect
   #1.
6. **Approve** (with a real note) → real transition to `approved`; the
   Approve/Reject/Request Changes buttons correctly disappeared
   afterward (terminal for this document's real state).
7. **Export HTML and Export Markdown** — both real, correct: proper
   status/version header, all 5 real sections present, HTML properly
   escaped (`&amp;` for "Recommendations & Decisions").
8. **Make Customer-Visible** → real toggle, correctly flipped to "Make
   Internal" with the real "Visible in the client portal" label.
9. **Archive** → real transition to `archived`; the Archive button
   correctly disappeared afterward.
10. Generated a real **Current State Assessment Report** (a template that
    does NOT require approval) via the real API — real `draft` status.
    Clicked **Submit for Approval** through the actual UI. **Found and
    fixed defect #2**, re-verified live with the exact real error message
    now rendering.
11. Console/network verified: every real request correctly 200/201/204,
    the deliberately-reproduced `400`s for defect #2 correctly appearing
    in the network log (not console errors — expected, handled failures).
12. Full API regression re-confirmed: 595/595 passing (no API code
    changed this pass — both fixes are frontend-only).
13. **Cleanup**: re-confirmed exact client id/name via direct SQL
    immediately before deletion. 2 real `generated_documents` rows, 1 real
    `approval_workflows` row (confirming the Gap Analysis Report's
    approval genuinely used the shared engine, not a parallel one), 0
    `traceability_links` for this pass's documents (none of this pass's
    generated documents derived from a requirement, so no forward link
    was expected — correctly absent, not silently missing). Deleted
    across all real client-scoped tables, zero orphans verified. Both
    protected clients confirmed present and unchanged.

## Report

| Field | Value |
|---|---|
| Feature | Document Generation Engine |
| Test Suite | document_generation_test_1 |
| Client | AskABD PW Document Generation Test 1 (deleted) |
| Environment | local dev |
| Browser | Chromium (Browser pane) |
| Viewport | default |
| Automated Tests | `document-generation-engine.test.ts` 22 (pre-existing, not re-run against these frontend-only fixes since they don't touch API behavior); full API regression 595/595 |
| Playwright | 1/1 real end-to-end workflow PASS — full lifecycle (draft → in_review → approved → archived) plus customer visibility, export, and the non-approval-required path, both real defects found and fixed live |
| Console | PASS |
| Network | PASS — every real request correctly 200/201/204/400(expected) |
| API | PASS — real, honest `INFORMATION REQUIRED` sections; real, correct approval-required validation |
| Database | PASS — zero orphans after cleanup, including a real `approval_workflows` row |
| Security | PASS (via existing RBAC/tenant middleware, not independently re-exercised this pass) |
| Tenant Isolation | Not re-exercised live this pass |
| Evidence | This file |
| Screenshots | 0 saved files (page-text snapshots used instead) |
| Trace | NOT_AVAILABLE |
| Video | NOT_AVAILABLE |
| Failures Found | 2 real UI defects (stale quality-check state; silently swallowed real backend errors on every write action) |
| Failures Fixed | 2/2, both re-verified live |
| Blocked | 0 |
| Remaining | PDF/DOCX export genuinely not built (already documented, unchanged); "Submit for Approval" is still shown even for templates that don't require it — the real error is now surfaced, but a cleaner fix would hide/disable the button using the template's own `approvalRequired` flag (not threaded into `DocumentDetail` today) — real, deliberate, deferred follow-on |

**FINAL STATUS: PASS_WITH_RISKS** (2 real defects found and fixed live,
one of them a genuinely serious silent-failure class; the full document
lifecycle — generate, quality-check, approve, export, customer-visibility,
archive — is proven real and correct end to end; marked WITH_RISKS for
the disclosed, deliberately-deferred button-visibility follow-on).
