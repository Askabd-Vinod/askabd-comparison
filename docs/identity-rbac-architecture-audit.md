# Identity, Authentication & RBAC — Architecture Audit

**Date:** 2026-08-17. Performed before any code change, per this milestone's explicit Phase 1 instruction. Every finding below is from direct code/database inspection, not assumed.

## Pipeline trace

```
LOGIN            → EXTERNAL (askabd-identity service). Not present in this repository.
TOKEN CREATION   → EXTERNAL (askabd-identity service). Not present in this repository.
TOKEN CLAIMS     → PARTIAL (see below)
TOKEN VALIDATION → IMPLEMENTED
USER RESOLUTION  → IMPLEMENTED
ROLE RESOLUTION  → FIXED THIS MILESTONE (was MISSING; now IMPLEMENTED but UNVERIFIED against real tokens)
PERMISSION RES.  → IMPLEMENTED (local, once roles/direct-grants are known)
AUTHORIZATION    → IMPLEMENTED
```

### LOGIN — EXTERNAL

No login endpoint, password handling, or session-creation code exists anywhere in `apps/api` or `apps/web`. The only credential-adjacent flow in this repo is OTP-based *business owner identity verification* during client onboarding (`otp_challenges` table, `oc/clients/onboard` flow) — a different concept (verifying a prospective client's business owner email) from staff/admin authentication. Staff login is handled entirely by the external `askabd-identity` service (referenced only by `issuer: 'askabd-identity'` string in `middleware/auth.ts` and an OpenAPI description string). No source code, API contract, or database schema for that service exists in this repository.

### TOKEN CREATION — EXTERNAL

Same as above — this repo only verifies tokens, never issues them.

### TOKEN CLAIMS — PARTIAL (before this milestone: effectively MISSING for authorization purposes)

Before this milestone, `TokenClaims` (the interface `verifyToken()` casts the JWT payload to) declared only `sub`, `org`, `sid`, `jti`, `iat`, `exp` — no role or permission field. Critically, `jose.jwtVerify()` returns the **full decoded payload** at runtime regardless of the TypeScript interface — so if a real token from `askabd-identity` already includes a `roles`/`permissions`/`scope` claim, it was being silently discarded by the middleware's explicit `permissions: []` and role-less `metadata: { sessionId: claims.sid }` construction. This was confirmed by reading the exact line, not inferred.

**Fixed this milestone**: `TokenClaims` now includes optional `roles`, `permissions`, `scope` fields (industry-standard OIDC/OAuth2 claim names), and the middleware reads them via `normalizeClaimList()` (handles both JWT-array and OAuth2 space-separated-string conventions). **This remains unverified against the real askabd-identity service** — the claim names are a standards-based best guess, not confirmed integration. See "Remaining P0" in the final report.

### TOKEN VALIDATION — IMPLEMENTED

Signature verification via `jose` (HS256 with `JWT_SECRET`, or RS/EdDSA via `JWKS_URL` — either supported, mutually exclusive by which env var is set). Issuer validation always enforced (`issuer: cfg.issuer`, defaults to `'askabd-identity'`). **Audience validation added this milestone** — `audience: cfg.audience`, only enforced when `cfg.audience`/`JWT_AUDIENCE` is actually set (jose skips the check when undefined, so this changes nothing until the real audience value is known — see production requirements doc). Expiry (`exp`) validation is automatic via `jose.jwtVerify`. Tampered/wrong-key tokens rejected (signature mismatch). All verified by test.

### USER RESOLUTION — IMPLEMENTED

`AuthContext.userId = claims.sub`, `tenantId = claims.org ?? 'public'`. Straightforward, correct, unchanged this milestone.

### ROLE RESOLUTION — FIXED THIS MILESTONE

Previously: **MISSING**. `extractRoles()` (`platform/rbac/middleware.ts`) reads `auth.metadata.roles`, which was never populated → always fell through to `['customer']` for every authenticated request, application-wide, regardless of actual user identity. Confirmed by direct code read and a passing test that reproduced the exact condition before any fix (from the prior milestone).

Now: middleware populates `metadata.roles` from the token's `roles` claim (if present). `extractRoles()` itself was **not modified** — the fix was entirely in what gets fed to it.

### PERMISSION RESOLUTION — IMPLEMENTED (local)

`resolvePermissions(roles, ROLE_MAP)` expands role names to their statically-defined permission sets (`platform/rbac/roles.ts`, unchanged, real, already existed). `AuthContext.permissions` (direct grants layered on top of role-derived permissions) now also correctly reads the token's `permissions`/`scope` claim if present (was previously always `[]`).

### AUTHORIZATION — IMPLEMENTED

`registerAuthorizationMiddleware` + `COMPARISON_API_RULES` (declarative route rules), unchanged. `denyAccess()` already returns a generic, non-leaking 403 message in production (`"You do not have permission to perform this action."`) with the specific reason exposed only outside production — confirmed already correct, no change needed (Phase 13 requirement was already satisfied).

## User → Role → Permission model — authoritative source

**No local `users`, `roles`, `permissions`, `user_roles`, or `role_permissions` table exists anywhere in the PostgreSQL database** — confirmed via `\dt` against the real running instance; the ~80 real tables are entirely business-domain data (`oc_*` operations-center tables, e-commerce `item`/`merchant`/`category` tables, etc.). The role *definitions* (`ROLES`, `PERMISSIONS` in `platform/rbac/roles.ts`) are static, in-code, real, and correct — but *which role a given user has* is entirely the external identity service's responsibility, communicated only via the JWT. There is no local "identity repository" to reuse, and none was invented.

## Existing tests before this milestone

`security-auth-guard.test.ts` (10 tests) — thoroughly covers JWT signature/expiry/dev-bypass-guard behavior, but **never tested role/permission resolution** (only authentication, not authorization). `rbac-service-assignment.test.ts` (from the prior milestone, 4 tests) — first file to touch authorization at all; extended this milestone to 19 tests covering the fix.

## Frontend

`apps/web` sends no `Authorization` header on any request inspected this session (all `fetch()` calls to the API are unauthenticated from the browser's perspective) — consistent with this build's current "internal single-admin console" operating mode (customer self-service auth was explicitly removed in an earlier commit, `2c288ff` "convert to managed service — remove customer auth"). This is a real, current fact about this build, not a gap this milestone can safely change (adding real frontend auth would be a major architectural addition requiring UI login flows, token storage, and refresh handling — explicitly out of this security-hardening milestone's "do not perform unrelated UI work" instruction).
