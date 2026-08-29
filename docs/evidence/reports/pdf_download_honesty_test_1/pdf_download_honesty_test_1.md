# pdf_download_honesty_test_1 — "PDF" export downloads were plain text mislabeled as .pdf

**Directive**: master continuation/hardening directive §16/§68 ("physically test downloaded files... never mark PASS merely because the download button renders").
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Investigation, triggered by testing Migration Report Download live

Using the real, live staff session found in the Browser pane (see
`live_authenticated_verification_test_1`), clicked "Export Report" on the
real Migration Intelligence page (`/migrations`) for the real client
"Acme Digital Solutions Pvt Ltd". No network request fired (expected —
`DownloadButton` builds its file entirely client-side from data already on
the page, confirmed by reading `download-button.tsx`). Read the component
in full to verify what it actually produces.

**Real defect found**: every one of 9 real consumer files requesting
`format="pdf"` downloaded a file literally named `*.pdf` whose actual
bytes were plain text (`generatePDFText()`, `mimeType: 'text/plain'`, the
component's own code comment already honestly said "in production, use a
PDF library" — but the file extension didn't match that disclosure). A
real PDF viewer (Preview, Acrobat, a browser's built-in viewer) would
refuse to open such a file or show a "damaged file" error — a `.pdf`
extension is a promise about the byte format, not just a label. 3 of the
9 consumers (`reports/report-cards.tsx`, `reports/[reportId]/page.tsx`,
`clients/[clientId]/documents/documents-view.tsx`) additionally render no
custom button label, falling back to `format.toUpperCase()` — literally
displaying "PDF" on the button itself.

## Fix

No PDF-generation library exists anywhere in this project (confirmed via
grep across both `package.json` files) — adding one is a genuine,
separate feature decision, not a one-line fix. The honest fix, matching
this platform's own already-established "PDF/HTML honestly not
implemented, ship what's real" precedent (Executive Reporting's Markdown
-only export): `download-button.tsx` now downloads the real `.txt` file
it always was for `format="pdf"` requests, and the default button label
fallback shows the real format ("TXT") instead of "PDF". All 9 consumer
files needed zero changes — the fix is entirely in the shared component.

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json`: **0 errors**.
- Live, authenticated verification via the Browser pane's real staff
  session: navigated to `/reports` — the "Health Report" card's format
  badges now correctly read `TXT` / `XLSX` / `CSV` (previously `PDF` /
  `XLSX` / `CSV`), confirmed via a fresh screenshot; clicked the badge,
  no console error, no crash.
- `localhost:3001/4200/3100` all healthy throughout.
- No backend touched — no API regression run required.

## FINAL STATUS: PASS

A real, previously undiscovered, live-tested defect (found by actually
exercising the download flow the master directive explicitly asked to be
physically tested, not assumed working because the button renders) is
fixed at its single shared root cause, verified live with a real
authenticated session.
