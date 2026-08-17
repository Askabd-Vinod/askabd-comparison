# Master Final Baseline

**Date:** 2026-08-17, ~21:00 UTC (after an ~8-hour autonomous window). Every number below was
re-run fresh this session, not carried over — per explicit instruction not to trust prior counts.

## Infrastructure incident found and resolved (non-destructive)

On resuming, the API test suite showed **68 failing tests** (`ECONNREFUSED 127.0.0.1:5442`).
Investigated immediately rather than assumed a code regression: `docker ps -a` showed both the
`comparison-postgres` and `askabd-mailpit` containers had exited ~6 minutes prior (status
`Exited (255)`), consistent with a machine sleep/restart during the unattended window. Restarted
both with `docker start` (existing containers, existing volumes — **not** `docker run`, no data
was recreated or lost). Both dev servers (API port 4200, web port 3001) had also stopped and were
restarted the same way. This was environmental, not a code defect — confirmed by the full suite
passing cleanly once infrastructure was back.

## Fresh test/build results

| Repository | Tests | Build |
|---|---|---|
| `askabd-comparison` API | **216/216 passing** (31 files) | Clean (`tsc --noEmit`) |
| `askabd-comparison` web | n/a (no unit test suite) | Clean (`tsc --noEmit` + full `next build`, both fresh) |
| `askabd-identity` | **177/177 passing** (14 files) | 13 pre-existing TS errors, unchanged (see `docs/cross-repository-baseline.md`) |

## Runtime health (fresh)

- API `/health`: `{"status":"ok","database":"connected"}`
- API `/platform/startup`: 17 checks, 15 pass, 1 warn (JWT Configuration — expected in DEV), 1
  skip (Redis, optional) — unchanged from the prior milestone's finding.
- Web: `200` on `/`.
- PostgreSQL (`comparison`, 5442): healthy, reconnected.
- Mailpit (SMTP dev, 1025/8025): healthy, reconnected.
- `askabd-identity` service itself: still not running in this environment (unchanged — not part
  of this incident, was never started this session).

## Git state (unchanged from every prior milestone this session)

```
askabd-comparison:  a9082ca478b94a4dabf35dbe5a5076a1499b6226  (feature/reliability-hardening)
askabd-identity:     77f76f8366c5db3f3bee99bb43a193270e265a2e  (master)
askabd-shared:       3141e55e69460bc20e649b6dc43ae09c497f2098  (main)
askabd-website:      c79c034b9ceb86c6b85694cfecd5fb645879b2be  (Dev)
askabd-workflow:     not a git repository
```

All HEADs identical to every previous baseline this session. No commit, no push, no reset.

This baseline supersedes all step-counts quoted in earlier milestone reports for the purpose of
starting this 8-hour program — everything from here forward is measured against these numbers.
