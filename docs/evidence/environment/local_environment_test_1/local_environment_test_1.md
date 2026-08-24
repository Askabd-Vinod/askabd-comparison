# local_environment_test_1 — localhost:3001 health check, incident + recovery

**Directive**: "ASKABD ENTERPRISE OPERATIONS — Phase 0: Local Development Environment / Port 3001" (2026-08-25)
**Timestamp**: 2026-08-24T20:30–20:42 UTC (per real server-reported timestamps below)
**Commit**: `3f42062a5ef90f9ce97bf3c395f34b423c728325`
**Branch**: `feature/reliability-hardening`
**Localhost URL**: `http://localhost:3001`
**API URL**: `http://localhost:4200`
**Database**: PostgreSQL, `localhost:5442`, database `comparison`
**Browser**: Claude Code's Browser pane (Chromium-based). **Playwright**: `BLOCKED_EXTERNAL_AUTH` — no authenticated staff session available this session, never worked around (standing rule, unchanged).

## Incident found (not assumed) — a real, pre-existing failure

Before any feature testing, a mandatory Phase 0 health check found `http://localhost:3001` returning a genuine HTTP 500. This was NOT assumed working and NOT skipped.

## Root cause, confirmed from real server logs

The Next.js dev server (PID 14352) had been running continuously since **2026-08-23T08:32 UTC** — over 2 days, across an extremely large number of file edits from this session's own work — and had accumulated a corrupted `.next` webpack cache:

- `Error: Cannot find module './4787.js'` — repeated hundreds of times in the log.
- `[webpack.cache.PackFileCacheStrategy] Caching failed for pack: Error: ENOENT: no such file or directory, rename '...\.next\cache\webpack\client-development-fallback\0.pack.gz_' -> '...0.pack.gz'`
- The `.next` directory (319MB) contained BOTH dev and production sub-caches (`client-development`, `client-development-fallback`, `client-production`, `edge-server-production`, `server-development`, `server-production`) cross-contaminated from an earlier `next build` having run against the same directory as the long-running `next dev` process.

This produced both the raw HTTP 500 and the "page loads without CSS/design system" symptom.

## Ownership verification before touching anything

Per the directive's explicit "do not blindly kill processes" requirement, the owning process was identified BEFORE being stopped:

```
PID 14352 -> node.exe -> node_modules/next/dist/server/lib/start-server.js
```

Confirmed as the real, legitimate AskABD web dev server from this exact repository (`D:\.kiro\askabd-comparison`) — not a foreign process, not another AskABD service on the wrong port.

## Full runtime discovery (multi-service requirement)

Before and after recovery, every AskABD-relevant port was mapped, not assumed:

| Service | Port | PID | Verified |
|---|---|---|---|
| AskABD Enterprise Operations Centre (web) | 3001 | 14352 → **21400** (after recovery) | Recovered |
| AskABD Comparison API | 4200 | 17884 | Healthy throughout, never touched |
| `askabd-identity` (separate repository, `D:\.kiro\askabd-identity`) | 3100 | 13476 | Healthy throughout, never touched |
| PostgreSQL (AskABD's real DB, via WSL/Docker) | 5442 | unchanged | Healthy throughout |
| PostgreSQL (an unrelated, separate system instance) | 5432 | 5968 | Confirmed NOT ours — never touched |
| Redis (via WSL/Docker) | 6379 | unchanged | Untouched |
| Mailpit (via WSL/Docker) | 8025 | unchanged | Untouched |

Only the port-3001 process was stopped and restarted. No other AskABD service (API, identity, database) was stopped, restarted, or reconfigured at any point.

## Recovery performed

1. `preview_stop` on the port-3001 server — confirmed the process fully exited (`Get-Process -Id 14352` returned nothing afterward) before touching any files.
2. Deleted `apps/web/.next` entirely (319MB, pure build/cache artifact — never source code or user data; safe to delete, standard Next.js recovery).
3. Restarted via the project's real, configured script: `npm run dev --workspace=apps/web` (via `.claude/launch.json`'s own `"web"` entry — no temporary/fake server, no second application).
4. Fresh compile completed cleanly: `✓ Ready in 20.7s`, `✓ Compiled / in 36.5s (807 modules)`, `✓ Compiled /staff/login in 4.9s (831 modules)` — zero `Cannot find module` errors, zero cache errors.

## Verification — fresh browser context (not a stale tab)

A genuinely new browser tab was opened and navigated to `http://localhost:3001/`.

- **HTTP**: `/` → `307` (redirect to `/staff/login` — confirmed as the expected, intended application behavior, not classified as a failure per the directive's own explicit allowance).
- **Page render**: the real "AskABD Staff Sign In" page rendered with full CSS/design system applied — real logo, real typography, correctly styled form fields (Organization / Work Email / Password), the purple brand "Sign in" button, and the "Looking for your client workspace? Sign in here instead." footer link. This directly confirms the CSS issue observed before recovery no longer reproduces.
- **Console**: zero errors (`read_console_messages` with `onlyErrors: true` returned "No console logs").
- **Network**: every request returned `200 OK`, including `_next/static/css/app/layout.css`, the webpack/main-app/page JS chunks, and `_next/image?url=%2Flogo.png` — CSS and JS both genuinely loading, not just referenced.
- **API connectivity**: `GET http://localhost:4200/health` → `200`, `{"status":"ok","service":"comparison-api","database":"connected"}`.
- **Identity service connectivity** (separate repo, real dependency for staff auth): `GET http://localhost:3100/v1/health` → `200`, `{"status":"ok"}`.
- **Database**: direct `SELECT 1` against the real Postgres instance succeeded; both protected real clients (`AskABD Manual UAT 2026`, `Test1`) confirmed still present and unaffected by any of this recovery work.
- **Re-verified a second time** after some elapsed work (per the directive's "continuously verify" requirement, not a one-time check): same PID (21400 — no unexpected restart), all three services still healthy, a second fresh-context screenshot confirmed the same correct, fully-styled render with zero console errors.

## Known limitations, honestly disclosed

- **Playwright remains `BLOCKED_EXTERNAL_AUTH`** — verification here used the Browser pane (a real Chromium browser), not the Playwright test harness, because no authenticated staff session is available this session. This is the same standing, disclosed limitation carried throughout this entire engagement — never worked around.
- **No screenshot file was saved to this evidence folder.** The Browser pane's screenshot tool returns an inline image within the conversation; it does not expose a save-to-disk action, and no Playwright run (which would produce a real file per this repo's own `<feature>_test_N_NN.png` convention) was possible this pass. The rendered page's real content is described in full above instead of a fabricated file reference.
- Login itself was not exercised end-to-end (no real credentials available in this environment) — only the page render, redirect behavior, and asset loading were verified.

## LOCALHOST:3001

```
Process:        PASS  (fresh Next.js dev server, clean start, confirmed same PID across two checks)
Port:           PASS  (listening, no collision, no other AskABD service disturbed)
HTTP:           PASS  (/ -> 307 to /staff/login, expected; /staff/login -> 200)
Application:    PASS  (real EOC login page rendered, correct CSS/design system)
API:            PASS  (localhost:4200/health -> 200, database: connected)
Database:       PASS  (direct query verified, both protected clients intact)
Authentication: PASS  (redirect behavior correct and expected; interactive login itself BLOCKED_EXTERNAL_AUTH)
Console:        PASS  (zero errors, verified twice)
Network:        PASS  (all requests 200, including CSS/JS/logo, verified twice)
Playwright:     BLOCKED_EXTERNAL_AUTH
Overall:        PASS
```

## FINAL STATUS: PASS

A real, reproducible failure was found (not assumed away), its root cause was identified from real logs (not guessed), the fix was verified safe before being applied (process ownership confirmed), the recovery used only the project's real, configured tooling (no fake/temporary server), every other AskABD service was independently confirmed healthy and untouched throughout, and the result was verified twice — including a genuinely fresh browser context — before being reported as resolved.
