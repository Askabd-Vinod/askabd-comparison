# Authentication Production Checklist (Phase 0G)

**Date:** 2026-08-17. Every item below is marked from direct evidence — code, test, or config —
never assumed. `[x]` = VERIFIED, `[~]` = PARTIAL (explained), `[ ]` = MISSING/EXTERNAL DEPENDENCY.

- [~] **Login exists** — for the internal/DEV-bypass operating mode: N/A (no login needed).
  For real customer self-service: **MISSING, and intentionally so** — see
  `docs/authentication-missing-investigation.md`'s "customer-login question."
- [ ] **Login connects to real identity service** — no login exists to connect (see above).
- [ ] **Identity service reachable** — `askabd-identity` is not running in this environment
  (`curl localhost:3100/health` refused, re-confirmed this session).
- [ ] **Token issued** — no live issuance path from this environment.
- [x] **Token signature valid** (when a token IS presented) — `jose.jwtVerify` enforced,
  proven by `tests/rbac-service-assignment.test.ts` and `tests/auth-error-ux.test.ts` (tampered
  token → 401).
- [x] **Algorithm allowlisted** — `jose.jwtVerify` only accepts the algorithm implied by the
  configured key type (HS256 for `JWT_SECRET`, RS/EdDSA for `JWKS_URL`); no `none`/downgrade
  path exists (unchanged, pre-existing, re-confirmed by code read).
- [x] **Issuer validated** — `issuer: cfg.issuer` always enforced;
  `tests/rbac-service-assignment.test.ts` proves wrong-issuer → 401.
- [x] **Audience validated where configured** — no-op when unset (correct, since real tokens
  never carry `aud`, see `docs/identity-real-contract.md`), enforced when set
  (`tests/rbac-service-assignment.test.ts`, audience tests).
- [x] **Expiration validated** — automatic via `jose.jwtVerify`;
  `tests/auth-error-ux.test.ts` proves expired → `reasonCode: token_expired`.
- [ ] **Key rotation supported** — **MISSING at the source.** `askabd-identity`'s signing key is
  ephemeral and regenerated per-process (`docs/identity-real-contract.md`, Phase 3) — there is no
  rotation mechanism because there is no persistence to rotate.
- [ ] **JWKS available or equivalent secure verification exists** — **MISSING.** No JWKS endpoint
  exists on `askabd-identity` (confirmed by repo-wide grep). `askabd-comparison`'s own JWKS
  *client* support is real and tested but has nothing to point at.
- [ ] **Restart does not invalidate all signing infrastructure unexpectedly** — **FAILS.**
  Confirmed: every access token becomes unverifiable after any `askabd-identity` restart
  (`docs/identity-real-contract.md`, Phase 3, traced from `token-service.ts`).
- [ ] **Horizontal replicas can validate the same tokens** — **FAILS**, same root cause; each
  replica generates an independent key.
- [x] **API receives authentication** — `Authorization: Bearer` header parsing, unchanged,
  covered by 10+ tests across `security-auth-guard.test.ts`/`rbac-service-assignment.test.ts`.
- [x] **API validates authentication** — same evidence.
- [x] **User identity resolved** — `AuthContext.userId = claims.sub`, unchanged, tested.
- [~] **Organization resolved** — the raw `org` claim IS read into `AuthContext.tenantId`
  (unchanged, tested), but there is no `Organization` entity beyond that string
  (`docs/askabd-tenant-model.md`).
- [~] **Client/tenant resolved** — **no mapping exists** from organization to a specific
  `oc_clients` row (`docs/askabd-tenant-model.md`) — the only enforced rule is
  admin-role-may-cross-boundaries / everyone-else-denied
  (`apps/api/src/platform/rbac/tenant-access.ts`, 12 tests).
- [x] **Authorization enforced** — RBAC (`platform/rbac/middleware.ts`) + tenant boundary
  (`tenant-access.ts`), both tested, both fail-closed.
- [x] **Cross-tenant access denied** — `tests/tenant-access.test.ts`, explicit symmetry test
  across two different client IDs.
- [x] **DEV bypass restricted to DEV** — `devBypass` requires `NODE_ENV !== 'production'` AND no
  key configured; `tests/tenant-access.test.ts` and the prior milestone's tests prove a
  production-shaped config never activates it, even for a token whose `sub` literally equals
  `dev-user-000`.
- [x] **STAGING bypass disabled** — same guard applies uniformly to any non-`development`
  `NODE_ENV`; no staging-specific carve-out exists anywhere in the code (confirmed by reading the
  exact boolean expression, which has no environment name other than `'production'` in it — i.e.
  staging is treated the same as production for this purpose, not given a permissive middle
  ground).
- [x] **PRODUCTION bypass disabled** — same evidence; additionally
  `docker-compose.prod.yml` requires `JWT_SECRET` to even start the container
  (`${JWT_SECRET:?JWT_SECRET required}`), and `deploy/k8s/api-deployment.yaml` now wires
  `JWT_SECRET` from a Secret (fixed this milestone — previously this env var was entirely absent
  from the K8s manifest, a real gap, see `docs/authentication-missing-investigation.md`).
- [x] **401 handled correctly** — distinct `reasonCode`s added this milestone
  (`not_authenticated`/`token_expired`/`invalid_token`), 5 new tests.
- [x] **403 handled correctly** — distinct `reasonCode`s added this milestone
  (`forbidden`/`tenant_not_resolved`), 2 new tests.
- [ ] **Logout/session expiration handled** — no login exists to log out of (see top of this
  list); `askabd-identity`'s own session/logout endpoints are real but unreachable from this
  product today.
- [x] **Authentication failures audited safely** — `request.log.warn` logs a safe reason string
  server-side only, never the token; `/metrics` tracks `authFailures`/`authzDenials` counts
  (unchanged, pre-existing, re-confirmed).
- [x] **No credentials logged** — re-confirmed this milestone: no 401/403 response body or log
  call includes the token value (`tests/auth-error-ux.test.ts`, explicit assertion).
- [x] **No token exposed to frontend unnecessarily** — `apps/web` sends no `Authorization` header
  at all today (by design, per the managed-service model), so there is no token to expose;
  nothing in the API response ever echoes the caller's own token back.
- [x] **Authentication failure monitoring exists** — `/metrics`'s `authFailures`/`authzDenials`
  counters (pre-existing); CI (`.github/workflows/ci.yml`) runs the full test suite, including
  every auth/tenant/error-UX test added this session, on every push — a real auth regression
  (e.g., a bypass accidentally reachable in production) would fail CI before deployment.

## Honest overall status

**Not GREEN.** 9 of 27 items are genuinely missing or partial, and none of the missing items were
marked otherwise. The platform's own INTERNAL authentication posture (DEV-bypass discipline,
RBAC, tenant isolation, error UX, monitoring) is solid and well-tested. The EXTERNAL, real
customer-identity integration remains blocked on the two P0s already documented
(`docs/identity-real-contract.md`) and the one business decision above
(`docs/authentication-missing-investigation.md`). This checklist should be re-run, not assumed
still accurate, once either is resolved.
