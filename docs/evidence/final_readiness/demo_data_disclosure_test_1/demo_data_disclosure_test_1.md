# demo_data_disclosure_test_1 — investigated, found already correctly disclosed, self-corrected (Phase 35, Final Master Completion Directive)

**Directive**: "ASKABD — FINAL MASTER COMPLETION, VERIFICATION & PRODUCTION
READINESS DIRECTIVE", Phase 35 ("No Fabrication") and Phase 18 ("UI/UX
Master Audit — misleading labels").
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## What happened (including a real mistake, corrected before commit stood)

A repository-wide mechanical sweep for `mockClients` usage (Phase 35's own
explicit instruction) found 39 files importing the fabricated sample-client
dataset. A grep for the existing `<DemoDataBanner />` disclosure component
found 24 of the 25 client-scoped pages under `clients/[clientId]/*` with
**no direct import of it in the page file itself**, and — without first
checking the shared layout those pages render inside — this was initially
treated as a real, undisclosed-fabrication gap. `<DemoDataBanner />` was
added directly to all 24 page files and committed (`046d8f4`).

**This was wrong, and was caught and reverted in the same pass.** Reading
`clients/[clientId]/layout.tsx` (the shared layout wrapping every page
under this route) showed it already renders `<DemoDataBanner />`
unconditionally for `isDemoClient` on both of its own branches (lines 110
and 158) — meaning every one of the 24 pages already displayed the
disclosure, automatically, before this pass touched anything. Adding a
second, page-level banner would have produced a real UI regression: two
identical "Sample data" banners stacked on every demo-client page. This
exact fact was also already correctly recorded in
`docs/enterprise-feature-gap-register.md`'s own 2026-08-29 entry ("the '15
of 32 lack DemoDataBanner' claim is stale... every real `CapabilityPlaceholder`
consumer already carries the disclosure automatically via the shared
layout") — a register entry that should have been read before concluding
the gap was real and unaddressed.

**Corrected**: all 24 files were reverted to their pre-edit state via
`git checkout <prior-commit> -- <files>` before being committed again,
restoring the single, correct, layout-level disclosure with no
duplication. `tsc --noEmit` and a full `next build` were re-run clean
after the revert.

## Why this is recorded rather than quietly dropped

This session's own standing discipline is to investigate and correct wrong
prior conclusions rather than let them stand (see, for example,
`risk_014_triage_test_6`'s correction of `risk_014_triage_test_3`'s own
wrong `GET /oc/workflow/rules` claim). The same standard applies to a
mistake made *within* this pass, not just to mistakes inherited from
earlier ones — this file exists so the investigation, the incorrect
initial fix, and its correction are all visible rather than only the
final, correct state.

## What is actually true, confirmed

- Every `clients/[clientId]/*` page's demo/mock branch is disclosed via
  the shared layout's `<DemoDataBanner />` — no per-page fix was needed
  or applied.
- `search/page.tsx` independently already carries a finer-grained,
  per-result `real`/`demo` label (correctly not using the page-level
  banner).
- Real, database-backed clients (UUID ids) never take the mock branch of
  any of these pages — confirmed by reading each file's own
  `if (!client) return <CapabilityPlaceholder/>` / real-branch routing
  logic; no ID collision is possible between the 8 hardcoded demo slugs
  (`meridian-financial`, etc.) and a generated UUID.
- The one genuinely fixed disclosure gap from the prior 2026-08-29 pass
  (`apps/web/src/app/(app)/services/page.tsx`, the top-level Platform
  Services catalog) remains fixed and is unaffected by this pass.

## Verification after the revert

- `tsc --noEmit` clean on `apps/web`.
- `next build` succeeded (45 routes, same clean result as before the
  incorrect edit).
- `git status` confirms all 24 files match their pre-edit committed state
  exactly (byte-for-byte revert via `git checkout <commit> -- <paths>`,
  not a manual re-edit).
- `main` independently re-verified unchanged at `b63f797` throughout.

## Net effect on the repository

None — this pass makes no functional change to the 24 client-scoped
pages. Its value is the negative result itself (confirming the existing
layout-level disclosure is complete and correct, closing the question
Phase 35 raised) plus this record of the self-correction.
