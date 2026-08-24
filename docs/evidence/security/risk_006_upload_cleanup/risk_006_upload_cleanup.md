# risk_006_upload_cleanup — RISK-006 resolved: real physical-file cleanup, live-verified end-to-end

**Feature under test**: `scripts/playwright-evidence/cleanup-qa-client.mjs`'s new `removeClientUploads()` — sweeps physical uploaded files, not just DB rows, when a disposable QA client is cleaned up.
**Environment**: local dev, real filesystem, real Postgres

## The real fix

The script deleted DB rows but never the corresponding physical files under `apps/api/uploads/<clientId>/` (or the separate discovery-document tree, `apps/api/uploads/discovery/<clientId>/` — both real `storageReference` shapes `document-storage-service.ts` uses, both now handled). `removeClientUploads(clientId)` resolves the real uploads root relative to the script's own file location (not `process.cwd()`, which depends on where the script happens to be invoked from) and removes both real directory shapes with `fs.rmSync(..., {recursive:true, force:true})` — only called AFTER the DB transaction genuinely commits, never deleting real files ahead of a rollback.

## Live, end-to-end verification (not just a code read)

1. Created a real disposable client (`RISK-006 Cleanup Script Test`) via a direct `INSERT INTO oc_clients`.
2. Wrote real files into both real upload-directory shapes: `apps/api/uploads/<clientId>/testfile.txt` and `apps/api/uploads/discovery/<clientId>/source.txt`.
3. Ran the real script: `node cleanup-qa-client.mjs <clientId> "RISK-006 Cleanup Script Test"`.
4. Confirmed both directories physically removed (`ls` on each path after returns "No such file or directory" — the expected, desired outcome), the DB row deleted, zero orphans across the script's own full sweep, and both real protected clients (`AskABD Manual UAT 2026`, `Test1`) confirmed unaffected.

## FINAL STATUS: RESOLVED

The exact fix this risk's own disclosure named, implemented as described and proven end-to-end against a real filesystem and real database — not just read for correctness.
