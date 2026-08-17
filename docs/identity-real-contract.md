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
