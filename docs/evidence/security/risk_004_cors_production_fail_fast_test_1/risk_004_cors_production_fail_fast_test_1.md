# risk_004_cors_production_fail_fast_test_1 — RISK-004 resolved: production fails fast on unsafe CORS config

**Feature under test**: `config/env.ts`'s `validateProductionCorsOrigin` — refuses to start in production with the risky `credentials:true` + wildcard-reflecting-origin CORS combination.
**Test Suite**: `risk_004_cors_production_fail_fast_test_1` (2026-08-25, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE" directive, Phase 1)
**Environment**: local dev, real Postgres · **Playwright**: `BLOCKED_EXTERNAL_AUTH`

## The real fix

`server.ts` combines `credentials: true` with `origin: true` (reflect-any-Origin) whenever `CORS_ORIGIN` is `'*'` — its own schema default when the env var is unset. `deploy/PRODUCTION.md`'s own go-live checklist already required "CORS_ORIGIN restricted to actual frontend domain"; this makes that requirement impossible to silently skip. `config/env.ts` now calls a new, pure, exported `validateProductionCorsOrigin(nodeEnv, corsOrigin)` and refuses to start (`process.exit(1)`) when `NODE_ENV === 'production'` and the effective `CORS_ORIGIN` is `'*'` — the exact same fail-fast shape this file already uses for other invalid configuration.

## Regression evidence

`apps/api/tests/risk-004-cors-production-fail-fast.test.ts`, 7/7 passing:

| Scenario | Result |
|---|---|
| `production` + explicit `'*'` | refused |
| `production` + unset (`undefined`) | refused (exactly as dangerous as explicit `'*'`) |
| `production` + a real restricted origin | allowed |
| `production` + a real comma-separated multi-origin list | allowed |
| `development` + `'*'` | allowed (dev-only convenience, unchanged) |
| `test` + `'*'` | allowed (this repo's own suite runs `NODE_ENV=test`) |
| unset `NODE_ENV` | never treated as production |

## Regression

Full suite: **922/922 passing** (901 baseline + 7 new, combined with RISK-005/006 in the same pass). `tsc --noEmit` clean. No migration this pass. Both protected clients confirmed unchanged.

## FINAL STATUS: RESOLVED

The exact fix this risk's own disclosure named, implemented as described. Development and test environments are completely unaffected.
