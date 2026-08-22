# askabd-identity — Real Contract (Phase 2)

**Date:** 2026-08-17. This is the master-milestone's Phase 2 deliverable. It consolidates and
extends the prior milestone's `docs/identity-token-contract.md` (still the canonical deep-dive
on the JWT claim shape and compatibility analysis) with additional schema evidence gathered this
milestone. Nothing here is assumed — every fact is a direct read of
`D:\.kiro\askabd-identity`'s source and migrations.

## JWT algorithm, claims, key lifecycle — summary (full detail: `identity-token-contract.md`)

- **Algorithm:** EdDSA (asymmetric). Not HS256, not RS256.
- **Key storage:** generated in memory per-process (`jose.generateKeyPair('EdDSA')`), never
  persisted to a database, file, or secret store, never exposed via any endpoint.
- **Claims:** `sub`, `org`, `sid`, `iat`, `exp`, `jti`. No `roles`, `permissions`, `scope`, `aud`.
- **Access token lifetime:** hard ceiling 900s (15 min), platform-enforced.
- **Issuer:** `askabd-identity` (matches `askabd-comparison`'s default).

## Database schema — full picture (new evidence this milestone)

Ten migrations, all read directly:

| Table | Purpose | Multi-tenancy shape |
|---|---|---|
| `identities` | Core principal record | `org_context VARCHAR(255) NOT NULL` — **a scalar column, one org per identity**, enforced by `UNIQUE (org_context, identifier)`. No many-to-many membership. |
| `verification_tokens` / `reset_tokens` | Email verification / password reset, hashed | Scoped by `identity_id` only |
| `sessions` | Server-tracked authenticated context, idle/absolute expiry | Carries its own `org_context` copy |
| `access_tokens` | JWT revocation tracking (id/expiry/revoked flag only — **not the key material**) | Scoped by `session_id` |
| `refresh_tokens` | Opaque, hashed, rotation chain with reuse detection | Scoped by `session_id` |
| `role`, `permission`, `role_assignment`, `role_permission` | Identity's own RBAC, entirely separate from `askabd-comparison`'s | Scoped by `org_context` |
| `audit_events` | Append-only (R16.2: app DB role has INSERT/SELECT only, no UPDATE/DELETE) | Scoped by `org_context` |
| MFA, lockout-state, webhooks tables (006, 008, 009) | TOTP enrollment, brute-force lockout, webhook registrations | Scoped by `identity_id`/`org_context` |

**Confirms with certainty:** `org_context` is a flat, single-valued field — the current schema
does **not** support one identity belonging to multiple organizations, and there is no
`organizations` table at all (only the string value lives on `identities`/`sessions`/
`audit_events`/RBAC tables). This directly answers one of Phase 4's questions with real evidence
rather than assumption.

## The authorization contract — `POST /v1/policy/check`

Per `askabd-identity/docs/API.md` and `src/services/authorization-service.ts`:

```
POST /v1/policy/check
Headers: X-Org-Context: <org>
Body:    { identityId, action, resourceType }
Returns: { decision: "allow" | "deny" }
```

Server-side logic (`AuthorizationService.check`): validates all four required fields; looks up
the identity within the given org (unknown identity → deny, R13.3); resolves permissions via
`role_assignment` → `role_permission` → `permission` joins, scoped to `org_context`; returns
`allow` only if the resolved permission set contains an exact `(action, resourceType)` match.
**No wildcard/`*` support** in this engine (unlike `askabd-comparison`'s own RBAC, which has a
`super_admin` wildcard) — confirmed by reading the exact `.some()` match logic, which requires an
exact tuple match, not a prefix or wildcard check.

## `@askabd/shared-contracts`'s organization/membership types — available, unused

`askabd-shared/packages/contracts/src/organization.ts` defines a generic, tested (11 tests)
`Membership<TRole>` / `OrganizationContext` model supporting many-to-many user↔org relationships
with typed roles — **conceptually richer than `askabd-identity`'s actual scalar `org_context`
column**. Confirmed by repo-wide grep: this type is imported and used by **nothing** in
`askabd-identity`, `askabd-comparison`, or `askabd-workflow`. If a future product decision
requires multi-org membership (a user belonging to more than one organization, or an
organization owning more than one AskABD client), this shared contract is the natural existing
building block to adopt — but adopting it would require a real schema migration in
`askabd-identity` (adding an actual `organizations`/`memberships` table) that this milestone did
not attempt, since it is a genuine business/schema decision, not a documentation-only exercise.

## Phase 3 — production safety of the ephemeral signing key

Traced precisely, from `token-service.ts`'s module-level `signingKey`/`verifyKey` variables and
`getKeys()` (generates once, lazily, on first call, then reuses for the process lifetime):

| Scenario | What actually happens | Evidence |
|---|---|---|
| `askabd-identity` process restarts | A brand-new EdDSA key pair is generated on the first token operation after restart. **Every access token issued before the restart becomes unverifiable** — `jose.jwtVerify` will fail with a signature-verification error against the new key. Refresh tokens are unaffected (they're opaque, hash-compared against the database, not signed) — so a client holding only a refresh token can silently obtain a new, validly-signed access token via `/tokens/refresh`, but any client presenting an old access token directly is rejected. | `getKeys()`: `if (!signingKey \|\| !verifyKey) { ...generateKeyPair... }` — no persistence read attempted |
| `askabd-comparison` API restarts | No effect on `askabd-identity`'s keys (separate process/repo) — irrelevant to this scenario, included for completeness only. |
| `askabd-identity` crashes and is restarted by an orchestrator | Same as "process restarts" above — indistinguishable from a planned restart from the key-lifecycle perspective. |
| Multiple `askabd-identity` instances run concurrently (horizontal scaling) | **Each process generates its own independent key pair** — a token signed by instance A cannot be verified by instance B. In a load-balanced deployment with more than one replica and no sticky routing between token issuance and validation, this fails unpredictably: some validation requests succeed (routed back to the issuing instance) and others fail (routed to a different instance), depending on load-balancer routing — not a deterministic failure, which is worse than a clean failure for diagnosability. | Same `getKeys()` singleton, scoped per Node.js process, no cross-instance coordination anywhere in the codebase (no Redis-backed key store, despite Redis already being present in `docker-compose.yml` for other purposes) |
| An old token is presented after any of the above | Rejected with a signature-verification failure, surfaced by this service's own `validate()` as `{ valid: false, reason: 'signature_invalid' }` — a safe, fail-closed outcome, not a silent bypass. |

**Classification: real production blocker, not a hidden one.** This is not "keys expire and get
rotated" (a normal, manageable operational event) — it is "every issued token becomes invalid the
moment the process that issued it stops existing," which is incompatible with any deployment that
restarts (rolling deploys, autoscaling, crash recovery) or runs more than one replica. Redis is
already provisioned alongside this service (`docker-compose.yml`) but is not used for key storage
today (confirmed by grep — no `redis`/key-store reference anywhere in `token-service.ts`).

**Correct fix, not invented here:** persist the EdDSA key pair (e.g., in the already-provisioned
Redis, a secrets manager, or the database) so all instances load the same key, OR move to the
already-planned-but-unimplemented `JWKS_URL`-publishing model referenced by the stale
`.env.example` comments. Both are legitimate, existing-architecture-compatible paths; this
milestone did not implement either because doing so requires modifying `askabd-identity`'s own
production key-management design — a decision for that service's own team, consistent with this
milestone's "do not invent an identity replacement" instruction. Documented here as the concrete
technical reason behind the P0 in `docs/identity-token-contract.md`.

## Compatibility conclusion — reaffirmed from the prior milestone, not re-litigated

`askabd-comparison`'s JWT verification model (`JWT_SECRET`/HS256 or `JWKS_URL`) cannot verify a
real `askabd-identity` token today: no JWKS endpoint exists, and the algorithm families don't
match. This is the single most important P0 in this platform's identity story. Full analysis,
including the two possible resolutions and why neither was implemented unilaterally, remains in
`docs/identity-token-contract.md`, "Compatibility conclusion" — unchanged and reaffirmed by this
milestone's fresh re-read of the same source files.

## Phase 5 update (2026-08-18) — RESOLVED: key persistence + JWKS endpoint implemented

The P0 above is resolved. The user explicitly chose "Option 1: Persist the EdDSA identity key and
add a JWKS endpoint" (the first of the two paths this document already identified as legitimate,
existing-architecture-compatible) and it has now been implemented in `askabd-identity`:

- **New migration** `askabd-identity/src/db/migrations/003_signing_keys.sql` — a `signing_key`
  table (`kid`, `algorithm`, `public_key_jwk`, `private_key_encrypted`, `status`, `created_at`,
  `retired_at`), with a Postgres partial unique index enforcing at most one `status='active'` row
  at a time.
- **`getKeys(db)`** in `token-service.ts` now loads the active key from that table on first use
  per process (instead of generating a fresh in-memory key pair every start). A cold-start race
  between two instances is handled by catching the partial-index's unique-violation (Postgres
  error `23505`) and re-reading the winning row — no two active keys ever coexist, and no instance
  ever crashes on the race.
- **Private key encryption at rest**: `askabd-identity/src/services/key-crypto.ts` — AES-256-GCM
  via Node's built-in `crypto` (no new dependency), keyed by `SIGNING_KEY_ENCRYPTION_KEY`,
  fail-closed in production if unset (throws rather than falling back to a key that ships in
  source). The KEK's own real-secrets-manager provenance remains an open, already-documented gap
  shared with every other secret in this platform (`JWT_SECRET`, DB passwords) — not something
  this change alone resolves, and not claimed to be.
- **New JWKS endpoint**: `GET /.well-known/jwks.json` (unprefixed — standard discovery path,
  registered outside the `/v1` prefix in `server.ts`), implemented by `getPublicJwks(db)`, which
  publishes the active key plus any key retired within the last hour (so a token issued moments
  before a rotation remains verifiable until it naturally expires — access tokens are capped at
  15 minutes). Never publishes `private_key_encrypted` or any private key material.
- **`aud` claim added**: tokens now carry `aud: TOKEN_AUDIENCE` (env-configurable, defaults to
  `askabd-platform`) and `kid` in the signed JWT header; `validate()` now enforces the audience on
  verification (previously absent, as this document originally noted).
- **Tests**: `askabd-identity/tests/key-persistence.test.ts` (16 tests) — key generation/
  persistence, restart-survival (the actual defect being fixed: a token issued before a simulated
  restart, i.e. `resetTokenKeys()` against a mock DB whose rows survive, is proven still valid
  after), stable `kid`/`aud` in issued tokens, the cold-start race path, JWKS shape (never leaks
  private material), and token-validation enforcement (tampered signature, expired, wrong issuer,
  wrong audience — plus a positive control case proving the verifier isn't simply rejecting
  everything). Full existing suite: 193/193 passing, `npx tsc --noEmit` clean.
- **`askabd-comparison` side wired to consume it**: `apps/api/src/config/env.ts` gained
  `JWT_ISSUER`/`JWT_AUDIENCE` to the validated config schema; `apps/api/src/middleware/auth.ts`
  now reads `JWT_SECRET`/`JWKS_URL`/`JWT_ISSUER`/`JWT_AUDIENCE` from that validated config object
  instead of raw `process.env` (a latent inconsistency fixed along the way — `config.JWT_SECRET`/
  `config.JWKS_URL` already existed, validated, but were unused). `.env.example` and
  `deploy/k8s/{secrets,api-deployment}.yaml` updated to document `JWKS_URL` as the real production
  path for actual `askabd-identity` tokens (EdDSA-only — `JWT_SECRET`/HS256 structurally cannot
  verify them, regardless of value). New test file
  `apps/api/tests/jwks-verification.test.ts` (10 tests) exercises real HTTP + real EdDSA
  signatures against `jose.createRemoteJWKSet` — accept/reject on valid/unknown-kid/wrong-issuer/
  wrong-audience/expired tokens, fail-closed on an unreachable or malformed JWKS endpoint, and a
  key-rotation scenario (a token signed with a newly-published key, whose `kid` the client has
  never seen, is picked up automatically; the still-published retired key's tokens remain valid
  too).

**Live cross-process verification — performed (2026-08-18), not simulated:**

1. Started `identity-postgres` (fresh, empty — first time this exact container/volume existed)
   and applied all 3 real migrations, including `003_signing_keys.sql`, via `npm run migrate`.
   (Found and fixed a genuine local-only collision along the way: host port 5432 was already
   bound by an unrelated, pre-existing native Postgres install on this machine — confirmed via
   `netstat` showing two listeners — so `askabd-identity/docker-compose.yml` now maps the
   container to host port 5532 instead, mirroring the pattern `askabd-comparison`'s own
   `docker-compose.prod.yml` already uses for the same reason. Also found and fixed a missing
   `pino-pretty` devDependency that prevented the dev server from starting at all —
   `NODE_ENV=development` logging unconditionally requires it in `server.ts` but it was never
   added to `package.json`; installed via `npm install --save-dev pino-pretty`.)
2. Started the real `askabd-identity` server (`npm run dev`, real Fastify process, PORT 3100)
   against that real database.
3. Ran the real HTTP registration → email-verification → credential-set → login flow
   (`POST /identities` → `POST /identities/:id/verify` → `POST /identities/:id/credential/store`
   → `POST /auth/login`) end-to-end via `curl` against the live server. Received a real,
   EdDSA-signed access token with real `kid`/`iss`/`aud`/`sub`/`org`/`sid` claims.
4. `GET /.well-known/jwks.json` on the live server published exactly that key's public half —
   `kid` matching the token header, `kty: OKP`/`crv: Ed25519`, no private material.
5. Ran `askabd-comparison`'s real, unmodified `registerAuthMiddleware` (the actual production
   function in `apps/api/src/middleware/auth.ts`, not a reimplementation) in a real Fastify
   instance configured with `jwksUrl` pointed at the live identity server's real JWKS URL.
   Injected three real HTTP requests: the real token → **200**, correct `userId`/`tenantId`/
   `sessionId` extracted from the real claims; no token → **401** (fail closed); a tampered
   version of the real token → **401** (fail closed).
6. **The actual restart test**: killed the real `askabd-identity` process (`Stop-Process`,
   confirmed the port stopped responding), then started a brand-new process against the same
   database. `GET /.well-known/jwks.json` on the new process published the identical `kid` and
   public key — loaded from the database, not regenerated. The pre-restart access token was then
   re-validated:
   - `POST /v1/tokens/validate` on the (new) real identity process → `{"valid":true,...}` with
     the original claims intact.
   - The real `askabd-comparison` middleware, run again against the restarted server's JWKS
     endpoint → **200** for the same pre-restart token.

   This is the literal scenario in the "Phase 3" table above ("`askabd-identity` process
   restarts... every access token issued before the restart becomes unverifiable") — and it is
   now false. A token issued before a real restart remains valid after it, verified both by the
   issuing service itself and by a real consuming service over real HTTP.
7. Test fixture cleanup: the one identity/session/credential/token/audit-event row set created
   for this verification was deleted by exact ID afterward (`DELETE ... WHERE id = '<the exact
   uuid>'` across each table) — the persisted `signing_key` row itself was left in place, since
   it is real infrastructure state, not test data.

Not yet performed: this was a single-instance restart-survival check, not a concurrent
multi-instance (horizontal scaling) check — the cold-start race path is covered by
`askabd-identity/tests/key-persistence.test.ts`'s mock-DB race test, not by a second live
process racing the first. A live multi-instance race was not attempted this session.
