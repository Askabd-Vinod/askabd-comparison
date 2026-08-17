# Identity & Authentication — Production Requirements

No real secrets appear in this document — placeholders only, per explicit instruction.

**Updated this milestone**: the real `askabd-identity` service's source was located and read
directly (see `docs/identity-token-contract.md`). Several facts previously documented here as
"unverified, standards-based assumptions" are now either **confirmed** or **confirmed
incompatible** — this document has been corrected accordingly, not left as a stale guess.

## Required environment variables

```
IDENTITY_PROVIDER_URL:
<REQUIRED — e.g. https://identity.askabd.app, per askabd-identity/docs/API.md's documented base URL>

JWT_SECRET:
<NOT APPLICABLE to the real service as currently implemented — it signs with EdDSA
 (asymmetric), never HS256. Setting this will never successfully verify a real token. Kept as a
 supported option in apps/api/src/middleware/auth.ts only for local/DEV testing with
 self-signed tokens (as this session's tests already do) or for a future issuer that uses HS256.>

JWKS_URL:
<REQUIRED FOR PRODUCTION, BUT DOES NOT YET EXIST — the real askabd-identity service has no
 JWKS endpoint, no `.well-known` route, and no public-key-distribution mechanism at all (grep
 confirmed against its source). Its signing key is generated in memory per-process and never
 persisted or exposed. This is not a "not yet configured" gap — it is a genuine missing
 capability on the identity-service side. See docs/identity-token-contract.md, "Compatibility
 conclusion," for the two possible resolutions (identity service publishes JWKS, or this API
 switches to remote token validation) — both require a decision by the identity/security teams,
 not something this repository can unilaterally implement.>

JWT_ISSUER:
askabd-identity   (CONFIRMED correct — matches the real service's SignJWT().setIssuer() call
 exactly. No placeholder needed; this is already the default in middleware/auth.ts.)

JWT_AUDIENCE:
<NOT APPLICABLE — the real service's token issuance code never calls .setAudience(). Leave
 unset in every environment. Setting any value here will cause every real token to be
 incorrectly rejected (jose enforces `aud` once configured, and no real token will ever satisfy
 it). This corrects the prior milestone's framing of this as merely "unset until known" — it is
 now confirmed there is no real value to eventually set unless the identity service is changed
 to start issuing an `aud` claim.>
```

## Choose exactly one verification method — corrected guidance

Given the confirmed EdDSA/no-JWKS reality above, **neither existing option
(`JWT_SECRET` nor `JWKS_URL`) can currently verify a real production token issued by
askabd-identity.** `middleware/auth.ts` still supports both (harmless, already tested, useful
for DEV/staging tokens signed with a shared test secret) but production readiness is now
correctly understood to be blocked on an identity-service-side change, not an
askabd-comparison-side configuration step. See "Remaining P0" in
`docs/identity-tenant-security-final-report.md`.

## Role/permission claim format — corrected from "unverified assumption" to "verified absent"

The prior milestone read this as: *"This app reads `roles`/`permissions`/`scope` — a
best-effort, standards-based guess, unconfirmed against a real token."*

That guess is now **verified false** by direct inspection of `askabd-identity/src/services/token-service.ts`:
the real access token contains only `sub`, `org`, `sid`, `iat`, `exp`, `jti` — no
`roles`/`permissions`/`scope` claim is ever set, under any name. The identity service instead
expects a consuming API to call its own `POST /v1/policy/check` endpoint per authorization
decision (see `docs/identity-token-contract.md`).

The claim-reading code added in the prior milestone (`normalizeClaimList()` in
`middleware/auth.ts`) is **not wrong to keep** — it remains a safe, fail-closed no-op against
real tokens (a real token simply never satisfies it, so real users still correctly resolve to
`customer` unless the identity/comparison-API integration is redesigned around the policy-check
model) and it is what makes this session's DEV/test tokens (which deliberately DO set `roles`
claims to exercise the RBAC engine) work in tests. But it should not be described as "will work
once we get a real token" — it will not, unless `askabd-identity`'s token contract changes, or
this API is redesigned to call `/policy/check` remotely.

## DEV bypass — confirmed DEV-only, unchanged this milestone

`devBypass` is only ever `true` when: `NODE_ENV !== 'production'` **and** neither `JWT_SECRET`
nor `JWKS_URL` is set. In `NODE_ENV=production`, the bypass expression is unconditionally
`false` — re-verified this milestone (`tests/tenant-access.test.ts`, "production-shaped config
never grants the dev-user-000 shortcut").

## Tenant/client access — NEW this milestone

See `docs/tenant-authorization-matrix.md` for the full model. Summary: there is no mapping from
an identity (or its `org_context`) to a specific `oc_clients.client_id`, in either this
repository's database or the real identity service. Until a real product decision creates one,
only `admin`/`super_admin` roles may access client-scoped Operations Center data — enforced by
`apps/api/src/platform/rbac/tenant-access.ts`.

## Environment matrix

| | Development | Staging | Production |
|---|---|---|---|
| Auth | DEV bypass (no key needed) | Blocked — no JWKS endpoint exists on the identity side; HS256 shared secret possible ONLY if the identity service adds HS256 support (it does not today) | Same blocker as staging |
| Role/permission claims | N/A (bypass has no roles) | N/A — real tokens never carry these; authorization would need `/policy/check` remote calls, not yet implemented | Same |
| Tenant/client access | N/A (bypass is treated as super_admin) | Admin/super_admin only, others denied (see matrix doc) | Same |
| Audience | Not enforced (unset, correctly — real service never issues `aud`) | Same | Same |
| CORS | `*` (unchanged, pre-existing, flagged in a prior milestone's production-readiness report) | Explicit allowlist required | Explicit allowlist required |
