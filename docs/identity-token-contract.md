# AskABD Identity — Real Token Contract Audit

**Date:** 2026-08-17. Unlike the prior Identity/RBAC milestone (which had to treat the real
`askabd-identity` service as an unreachable black box and document a *standards-based
guess*), this audit was performed against the **actual source code** of the real
`askabd-identity` service, found at `D:\.kiro\askabd-identity` — a sibling repository in the
same workspace, not previously known to be present. Every finding below is a direct read of
that repository's code, not an assumption. The service itself is **not running** in this
environment (`curl localhost:3100/health` refused) — this is a static source audit, not a
live integration test. See "What remains unverified" at the end.

## Claim contract — VERIFIED from `askabd-identity/src/services/token-service.ts`

| Claim | Present in real token? | Type | Source |
|---|---|---|---|
| `sub` | Yes — required | string (identity ID) | `TokenService.issueForSession` |
| `org` | Yes — required | string (`org_context`) | same |
| `sid` | Yes — required | string (session ID) | same |
| `iat` | Yes — required | number (unix seconds) | `jose.SignJWT.setIssuedAt` |
| `exp` | Yes — required | number (unix seconds), **≤ 900s from `iat`, hard platform ceiling** | `jose.SignJWT.setExpirationTime`, enforced by `security.ts` `BASELINE.ACCESS_TOKEN_MAX_LIFETIME_SEC` |
| `jti` | Yes — required | string (token ID, used for revocation lookups) | `jose.SignJWT.setJti` |
| `iss` | Yes — always `"askabd-identity"` | string | `jose.SignJWT.setIssuer('askabd-identity')` — matches this API's existing default |
| `roles` | **No — never set** | — | confirmed absent from every `SignJWT(...)` call site in `token-service.ts` (both `issueForSession` and `refresh`) |
| `permissions` | **No — never set** | — | same |
| `scope` | **No — never set** | — | same |
| `aud` | **No — never set** | — | `jose.SignJWT` chain never calls `.setAudience()` |

**This corrects the prior milestone's documentation**, which read `roles`/`permissions`/`scope`
as an "unverified, standards-based OIDC/OAuth2 assumption." That assumption is now **verified
false** for the real service as currently implemented: it does not embed authorization data in
the token at all, under any claim name.

## Signing algorithm — VERIFIED

**EdDSA (asymmetric)**, not HS256, not RS256. The key pair is generated in memory
(`jose.generateKeyPair('EdDSA')`) the first time a token is issued or validated in a given
process, and is held only in a module-level variable
(`token-service.ts` lines 38-49). It is:
- **Never persisted** to a database, file, or secret store in this codebase.
- **Never exposed via any HTTP endpoint.** A repo-wide search for `jwks`, `.well-known`, and
  `publicKey`/`public_key` inside `askabd-identity/src` returns only the two lines that
  generate the ephemeral key pair — there is no JWKS route, no public-key-retrieval endpoint,
  anywhere in this service.
- Regenerated from scratch on every process restart (so a token signed before a restart can
  no longer be verified even by the issuing service itself, let alone a second process).

`askabd-identity/.env.example` contains commented-out placeholders
(`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_ALGORITHM=RS256`) suggesting a persisted/configured
key was originally planned — but `src/config/env.ts`'s actual `envSchema` does not read any of
these three variables. They are stale, unimplemented placeholders, confirmed by their total
absence from every source file in the repository (`grep -rn "JWT_PRIVATE_KEY|JWT_PUBLIC_KEY|JWT_ALGORITHM" src` → no matches).

## Refresh tokens — VERIFIED

Opaque (not a JWT), stored server-side only as a SHA-256 hash, rotated on every use with reuse
detection (presenting an already-rotated token revokes the entire session's token chain).
Default lifetime 7 days, hard ceiling 30 days (`security.ts`). Not directly relevant to this
API's verification path (this API never sees refresh tokens, only access tokens), but material
to the session-lifetime story in the production requirements doc.

## Authorization — VERIFIED to be a separate, remote mechanism

`askabd-identity` has its OWN complete RBAC system
(`src/services/authorization-service.ts`): `role`, `permission`, `role_assignment`,
`role_permission` tables, entirely inside `askabd-identity`'s own database — completely
separate from this repository's `platform/rbac/roles.ts` static role catalog. There is no
overlap or shared source of truth between the two.

Per the identity service's own published contract (`askabd-identity/docs/API.md`), a consuming
service is expected to determine authorization by calling:

```
POST /v1/policy/check
Headers: X-Org-Context: <org>
Body:    { identityId, action, resourceType }
Returns: { decision: "allow" | "deny" }
```

This is a **remote, per-decision HTTP call** — not a locally-verifiable claim. The official
`IdentitySdk` (`askabd-identity/src/sdk/identity-sdk.ts`) exposes this as `policyCheck()`.

## Compatibility conclusion (Phase 2) — real, confirmed mismatch

Comparing the real contract above against `apps/api/src/middleware/auth.ts` as it exists after
the prior milestone's fix:

| Question | Answer | Evidence |
|---|---|---|
| Are roles represented the same way? | **No** — real tokens never carry a `roles` claim | token-service.ts |
| Are permissions represented the same way? | **No** — real tokens never carry `permissions`/`scope`; authorization is a remote call | authorization-service.ts, API.md |
| Is user ID represented the same way? | **Yes** — `sub` matches | token-service.ts |
| Is org/client represented? | Partially — `org` claim exists and matches this API's `claims.org` read, but see "Tenant model" below for why it does NOT map to `oc_clients.client_id` | identity-manager.ts |
| Is issuer correct? | **Yes** — `askabd-identity`, matches this API's default | both sides |
| Is audience correct? | **N/A** — real tokens never set `aud`; this API's audience check is a no-op unless configured, so this remains harmless | token-service.ts, auth.ts |
| Are token expiration rules compatible? | **Yes** — real ≤900s access tokens are well inside what `jose.jwtVerify`'s automatic `exp` check accepts | security.ts |
| Are signing algorithms compatible? | **No** — real service signs EdDSA with an ephemeral, unpublished key; this API's config supports HS256 (`JWT_SECRET`) or a JWKS-fetched key (`JWKS_URL`) — **neither option can currently verify a real token**, because no shared secret exists and no JWKS endpoint exists | token-service.ts vs auth.ts |
| Is JWKS compatible? | **No — does not exist.** Not "not yet configured": genuinely absent from the real service | confirmed by repo-wide search |

**Which side is authoritative:** the identity service. It is real, deployed-intent code with
substantive security engineering behind it (Argon2id, TOTP, refresh-token reuse detection,
platform-wide security floors/ceilings) — this API's assumptions about its token format were
reasonable guesses that turned out to be wrong on the two points that matter most
(authorization claims, and how to verify the signature at all).

**Why the fix is not implemented in this milestone:** closing this gap correctly requires one
of two architecture decisions that belong to the identity-platform and security teams, not to
this milestone acting alone:
1. `askabd-identity` publishes a JWKS endpoint (or a persisted, rotatable EdDSA key) so this
   API can verify tokens locally and stateless, as originally intended by this API's existing
   `JWKS_URL` support — **no code change needed on this side**, only a real JWKS URL to
   configure; or
2. This API switches to calling `POST /tokens/validate` and `POST /policy/check` remotely for
   every authenticated request — a materially different architecture requiring an explicit,
   agreed failure-mode policy (fail open or fail closed if `askabd-identity` is slow or down),
   a caching/latency strategy, and a network-reachability guarantee between the two services in
   every environment. Inventing that failure-mode policy unilaterally is explicitly out of
   scope for this milestone (see the milestone's own stop conditions).

Per the milestone's explicit instruction ("if the real identity provider is unavailable,
document exactly what must be provided rather than pretending the integration is verified"),
this is marked:

```
IDENTITY_TOKEN_CONTRACT = UNVERIFIED_EXTERNAL_DEPENDENCY (live), STATICALLY VERIFIED (source)
```

The claim shape (Phase 1 table above) is now known with high confidence from source. Whether a
real, running instance of `askabd-identity` in a given deployment actually matches its own
source code (e.g. hasn't been patched, hasn't had the placeholder env vars wired up since this
audit) is not verifiable without a live instance — none is reachable from this environment.

### Phase 5 update (2026-08-18) — resolution path #1 above has been implemented

The row `Is JWKS compatible? — No, does not exist` and the "Are signing algorithms compatible? —
No" row are now stale. Resolution path #1 listed above ("`askabd-identity` publishes a JWKS
endpoint... no code change needed on this side, only a real JWKS URL to configure") is exactly
what was implemented — see `docs/identity-real-contract.md`'s "Phase 5 update" section for the
full change list (signing-key persistence, `GET /.well-known/jwks.json`, `aud`/`kid` claims,
tests on both sides). The prediction that this side would need no code change was only partially
right in practice: `apps/api/src/config/env.ts`/`auth.ts` needed a small consistency fix (reading
`JWT_SECRET`/`JWKS_URL` from the app's own validated config instead of raw `process.env`, and
adding `JWT_ISSUER`/`JWT_AUDIENCE` to that same schema) to make the already-existing `JWKS_URL`
support actually configurable the same way every other setting in this app is — not a new
verification code path.

Still open: a live cross-process verification (real identity process issuing, real comparison
process verifying over real HTTP/DB) has not yet been performed as of this update — see
`docs/identity-real-contract.md`'s "What this does NOT yet claim" note.

## Tenant model — the org/client mapping question (feeds Phase 4)

`org_context` in `askabd-identity` is that service's OWN multi-tenancy dimension — "which
tenant of the identity platform does this identity belong to." `oc_clients.client_id` in this
repository is a completely different concept — AskABD's own consulting customers, the entities
whose operations data this platform manages. **No code in either repository maps one to the
other.** It is possible a real deployment provisions `org_context` values that happen to equal
`oc_clients.client_id` values, but nothing enforces, documents, or guarantees this — assuming it
would be exactly the kind of invented mapping this milestone prohibits. See
`docs/tenant-authorization-matrix.md` for the full consequence of this gap.

## Required production placeholders (Phase 3)

```
IDENTITY_PROVIDER_URL:
<REQUIRED — e.g. https://identity.askabd.app, per askabd-identity/docs/API.md's documented base URL. Not yet configured anywhere in this repo.>

JWKS_URL:
<REQUIRED IF the identity team adds JWKS support (recommended) — does not exist today>

JWT_ISSUER:
askabd-identity   (already the correct default in apps/api/src/middleware/auth.ts — confirmed matching, no placeholder needed)

JWT_AUDIENCE:
<NOT APPLICABLE today — the real service never sets `aud`. Leave unset; setting anything here will incorrectly reject every real token.>

TEST_ADMIN_USER:
<REQUIRED FOR STAGING — an askabd-identity identity with an admin-equivalent role AND, separately, the real service must be told how this API expects to receive that role (see Phase 2 mismatch above — no mechanism exists yet)>

TEST_CUSTOMER_USER:
<REQUIRED FOR STAGING — same caveat>
```

No credential, key, or secret value is present in this document.
