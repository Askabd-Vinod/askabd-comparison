# risk_005_mime_sniffing_test_1 — RISK-005 resolved: real magic-byte content sniffing on both upload routes

**Feature under test**: `services/mime-sniff.ts` (new, shared) — real magic-byte content verification, closing the client-supplied-`Content-Type`-only trust gap on both real document-upload routes.
**Test Suite**: `risk_005_mime_sniffing_test_1` (2026-08-25, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE" directive, Phase 1)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## Scope widened during investigation

RISK-005 was originally found against the Security Validation document-upload route (`operations-center-routes.ts`). Reading the codebase for the same pattern (this session's own mechanical-audit discipline) found `discovery-intake-routes.ts`'s discovery-source document upload has the identical gap — both fixed with one shared module.

## The real fix

`services/mime-sniff.ts`'s `sniffMimeType(claimedMimeType, buffer)`:
- Real magic-byte checks: PDF (`%PDF`), PNG (8-byte signature), JPEG (`\xFF\xD8\xFF`), DOCX (ZIP magic `PK\x03\x04` — a real, disclosed limit: this cannot by itself distinguish DOCX from another ZIP-based format without parsing the archive's internal entries, deliberately not attempted this pass).
- TXT/CSV: no format has defined magic bytes for plain text. The real check is a NUL-byte scan of a real sample plus a check against every OTHER known binary signature — the strongest check possible without a dedicated encoding detector, a real and disclosed inherent limitation, not specific to this implementation.
- An unrecognized claimed type is never trusted.

Both routes wired to call it before persisting: `operations-center-routes.ts` now buffers the upload (bounded by the existing 20MB multipart limit) to sniff before writing; `discovery-intake-routes.ts` already buffered — added the sniff check as an additional, independent layer before its own (unchanged) allowlist check.

## Security — live proof (Security Testing Addendum)

`apps/api/tests/risk-005-mime-sniffing-test-1.test.ts`, 14/14 passing:

**Unit-level** (real magic bytes, both directions): genuine PDF/PNG/JPEG/ZIP/text accepted when correctly claimed; a real PNG falsely claimed as PDF, text/plain, or a real JPEG falsely claimed as PNG, a real ZIP falsely claimed as PDF — all rejected; NUL-byte binary garbage falsely claimed as text rejected; an unrecognized claimed type rejected regardless of content.

**Live, end-to-end** (the actual attack scenario): a genuine PNG's real magic bytes uploaded with `Content-Type: text/plain` against BOTH real routes:

| Route | Result |
|---|---|
| `discovery-intake-routes.ts` | **400**, zero orphaned `discovery_sources` rows |
| `operations-center-routes.ts` | **400**, zero orphaned `oc_client_service_documents` rows |
| Genuine, correctly-labeled text upload | **201**, accepted end-to-end — the fix does not break real uploads |

## Regression

Full suite: **922/922 passing** (901 baseline + 14 new, combined with RISK-004/006 in the same pass). `tsc --noEmit` clean. No migration this pass. Zero orphaned test clients/documents/files verified after the run. Both protected clients confirmed unchanged.

## FINAL STATUS: RESOLVED

Real content verification on both real upload routes, closing a confirmed spoofing gap the original disclosure's own path-traversal testing had already partially probed. Honest, disclosed limits (DOCX-as-ZIP, text/CSV heuristic) documented rather than overclaimed as complete.
