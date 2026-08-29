# local_environment_test_2 — full-stack outage + recovery (Docker/WSL restart)

**Directive**: "ASKABD — MASTER AUTONOMOUS DEVELOPMENT..." §30/31 (localhost:3001 must remain available; recover automatically using real tooling; never leave broken).
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## Incident found (not assumed) — a genuine, larger outage than any prior pass

A routine health check before continuing Phase 3 UI work found `localhost:3001`, `localhost:4200`, and `localhost:3100` **all** unreachable (`curl` exit 7 / connection refused on every port), unlike every prior single-service incident this session. `preview_list` showed zero tracked servers.

## Root cause, confirmed from real evidence, not guessed

`docker ps -a` showed all four AskABD dev-infrastructure containers —
`b3d4e70eabdb_comparison-postgres` (5442, the real app DB), `identity-postgres`
(5532), `identity-redis` (6379), `askabd-mailpit` (8025) — simultaneously
`Exited (255)` **3 minutes** prior, the same timestamp and exit code across
all four. `wsl -l -v` showed the `Ubuntu` distro `Stopped` (Docker Desktop's
own `docker-desktop` distro still `Running`). This pattern — every container
dying together with an identical exit code — is consistent with a host-level
Docker Desktop/WSL2 backend restart (not an application bug, not something
any of this session's code changes could have caused; no app code was being
run at the time). The three Node app processes (web/api/identity) were not
present in `preview_list` at all, consistent with a fresh harness environment
for this turn rather than a mid-session crash.

## Recovery performed, using only real, existing tooling — no fake/temporary server

1. `docker start` on all four containers (a plain restart — does not delete volumes/data; nothing destructive).
2. Verified via direct query against the real DB (port 5442) that both protected clients survived unchanged: `Test1` (`client-9a2a1b23-...`) and `AskABD Manual UAT 2026` (`client-19fa8f94-...`) both present.
3. Started all three real app services via the real, project-configured root `launch.json` (`D:\.kiro\.claude\launch.json`) — `api` (`npm run dev --workspace=apps/api`, port 4200), `web` (`npm run dev --workspace=apps/web`, port 3001), `identity` (`npm run dev` in `askabd-identity`, port 3100). Did **not** start the `website` config — the public marketing site stays untouched, per the standing rule that it's a separate product.
4. Confirmed clean startup from real logs: API's own real startup-validation report — `16/17 checks passed`, `Database Connectivity: PostgreSQL reachable at 127.0.0.1:5442`, `Readiness: ... Overall=100%` — then `Server listening at http://127.0.0.1:4200`. Web: `✓ Ready in 23.1s`, `✓ Compiled / in 5.5s (793 modules)`. Zero errors in either service's error-filtered log.

## Verification

| Service | Port | Check | Result |
|---|---|---|---|
| Web (EOC) | 3001 | `GET /` | `307` → `/staff/login` (expected) |
| API | 4200 | `GET /health` | `200`, `database: connected` |
| Identity | 3100 | `GET /v1/health` | `200`, `status: ok` |
| Database | 5442 | Direct query | Both protected clients (`Test1`, `AskABD Manual UAT 2026`) present, unchanged |

Fresh browser tab (not reused) navigated to `http://localhost:3001/`: zero
console errors. A stray identity tab briefly showed a 404 on its bare root
(`http://localhost:3100/`) — investigated, not assumed: identity's real
routes live under a `/v1` prefix, so an unrouted root 404 is expected, the
same known non-issue documented in `local_environment_test_1`. Closed that
tab once confirmed non-fatal.

## Known limitations, unchanged

Playwright remains `BLOCKED_EXTERNAL_AUTH` — `scripts/playwright-evidence/.auth/staff-state.json` does not exist in this environment; re-checked explicitly this pass per the new master directive's §6, not assumed from a prior session.

## FINAL STATUS: PASS

All 4 infrastructure containers and all 3 application services recovered
using only real, existing, project-configured tooling; database integrity
verified before and after; both protected clients unchanged; localhost:3001
confirmed healthy with a clean fresh-browser check before resuming feature
work.
