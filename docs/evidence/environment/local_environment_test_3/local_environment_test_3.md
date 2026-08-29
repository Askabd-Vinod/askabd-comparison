# local_environment_test_3 — production build corrupted the dev-server cache (again), recovered

**Directive**: master autonomous directive §31 ("after npm build ... always verify localhost:3001 again ... diagnose, restart/recover, verify before continuing").
**Date**: 2026-08-29 · **Branch**: `feature/reliability-hardening`.

## What happened

As part of the post-Phase-3 regression pass, `npm run build --workspace=apps/web` (a real production build, run to verify all 10 new pages compile cleanly) was run against the same `apps/web/.next` directory the live `next dev` server (port 3001) was using. The production build itself succeeded cleanly (`✓ Compiled successfully in 91s`, all 44 routes including all 10 new engine pages listed with real bundle sizes, exit 0) — but exactly as previously documented in `local_environment_test_1`, running `next build` against a shared `.next` directory corrupts the dev server's own webpack cache.

## Root cause, confirmed not guessed

Post-build health check found `localhost:3001` refusing connections. `preview_logs` showed the identical, previously-documented signature: `Error: Cannot find module './4787.js'`, `code: 'MODULE_NOT_FOUND'`, referencing `.next\server\webpack-runtime.js`. Same class of failure as `local_environment_test_1`, same real cause (dev/production cache cross-contamination in one `.next` directory), confirmed from real logs, not assumed.

## Recovery — same proven, real procedure

1. `preview_stop` on the web server.
2. Deleted `apps/web/.next` entirely (pure build artifact).
3. Restarted via the real `web` launch config (`npm run dev --workspace=apps/web`).
4. Waited for a clean `✓ Starting...` → verified `curl http://localhost:3001/` → `307` within ~20s.

## A stale-tab false alarm, investigated and correctly dismissed

Immediately after recovery, the ALREADY-OPEN browser tab (which had loaded the broken page before the restart completed) still showed console errors referencing the same `Cannot find module './4787.js'` — a cached client-side artifact from its pre-recovery load, not a new failure. Verified by opening a genuinely fresh tab and re-navigating: zero console errors, both `/` and `/clients/verification-probe-000/dependencies` (one of the pages just added) rendered clean. This is exactly the scenario the standing "never rely on a stale tab, always verify in a fresh browser context" rule exists for — the stale tab would have produced a false BLOCKED/FAIL if taken at face value.

## Final verification

| Service | Check | Result |
|---|---|---|
| Web (EOC) | `GET /` | `307` → `/staff/login` |
| API | `GET /health` | `200`, `database: connected`, same PID/uptime — never touched |
| Identity | `GET /v1/health` | `200` — never touched |
| Browser (fresh tab) | `/` and `/clients/.../dependencies` | Zero console errors on both |

## FINAL STATUS: PASS

A real, reproducible, previously-documented failure mode recurred under a
genuinely new trigger (this pass's own regression-build step), was
root-caused from real logs (not assumed), recovered with the same real,
non-destructive, project-configured tooling as before, and a stale-tab
false alarm during verification was correctly investigated and dismissed
rather than reported as a new problem.
