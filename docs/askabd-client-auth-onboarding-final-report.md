# AskABD Client Auth & Onboarding Milestone — Status Report

**Date:** 2026-08-18
**Scope covered this session:** the two explicit, evidence-based architecture P0s blocking any
real client login — (1) askabd-identity's signing-key persistence + JWKS, (2) the
organization↔client tenant-mapping model — plus a minimal, real, functioning client login slice
built on top of both. **Not covered:** the remainder of the original 25-section milestone
(invitation flow, full service-driven onboarding, connector requirements UI, engagement lifecycle
re-integration, extensive UI polish, admin mapping-management UI). See "What remains" below.

## Final status: **READY WITH BLOCKERS**

The two foundational P0s are genuinely resolved, tested, and live-verified end-to-end (not just
unit-tested). The client-facing product built on top of them is a real, minimal, working slice —
not a mockup — but is far short of the full lifecycle the original milestone described. Building
the rest (invitation, onboarding, requirements, connectors, full lifecycle) is safe to start from
this foundation; nothing here needs to be re-architected to support it.

---

## 1. What was resolved

### 1.1 JWT/JWKS — askabd-identity signing key persistence (the original P0)

**Before:** a fresh EdDSA key pair was generated in memory every process start, never persisted.
Every restart invalidated every previously-issued token; horizontal scaling was structurally
impossible (each instance had its own incompatible key); askabd-comparison had no JWKS endpoint
to verify against even in principle.

**Now:**
- `signing_key` table (askabd-identity migration `003_signing_keys.sql`) persists the active key,
  AES-256-GCM-encrypted at rest (`key-crypto.ts`, no new dependency), with a Postgres partial
  unique index enforcing at most one active key and race-safe cold-start handling.
- `GET /.well-known/jwks.json` publishes the active key (and any key retired within the last
  hour, for graceful rotation) — never private material.
- Tokens now carry `kid` and `aud` (`TOKEN_AUDIENCE`, default `askabd-platform`); `validate()`
  enforces audience.
- askabd-comparison's `middleware/auth.ts` now sources `JWT_SECRET`/`JWKS_URL`/`JWT_ISSUER`/
  `JWT_AUDIENCE` from its own validated config (a latent inconsistency fixed along the way) and
  documents `JWKS_URL` as the real path — HS256/`JWT_SECRET` structurally cannot verify a real
  askabd-identity token (EdDSA-only).

**Live proof, not simulated:** started a real askabd-identity process against a real (freshly
provisioned) Postgres, ran the real register → verify → set-credential → login HTTP flow, got a
real token, verified it via askabd-comparison's real, unmodified middleware over a real HTTP JWKS
call. Then **killed the identity process and restarted it fresh** against the same database — the
JWKS endpoint published the identical key, and the pre-restart token was still valid, both via
identity's own `/tokens/validate` and via comparison's middleware. This is the literal defect
being fixed, proven fixed live.

**Tests:** 16 new tests in askabd-identity (`tests/key-persistence.test.ts`) + 10 new tests in
askabd-comparison (`tests/jwks-verification.test.ts`, real HTTP + real EdDSA, including
unreachable/malformed-JWKS fail-closed and live key-rotation pickup).

Full detail: `docs/identity-real-contract.md` ("Phase 5 update"), `docs/identity-token-contract.md`.

### 1.2 Organization ↔ client tenant mapping (the second P0)

**Before:** no code anywhere mapped an authenticated identity's `org_context` to a specific
`oc_clients` row. The only access rule was "admin/super_admin see everything, everyone else sees
nothing" — safe, but unusable for a real customer login (a real customer is never `admin`).

**Now, per the user's explicit 30-point instruction (chose "Add a real mapping table," rejected an
`org_context == client_id` convention):**
- `client_identity_mapping` table (askabd-comparison migration `024_client_identity_mapping.sql`)
  — real `(client_id, org_context)` pairs, `active`/`revoked` status, audited via the existing
  `oc_audit_log` table. Supports one organization owning multiple clients and vice versa.
- `ClientIdentityMappingService` — the sole place client-scope resolution happens.
  Create/revoke are idempotent and audited; re-creating a revoked mapping reactivates the same
  row rather than duplicating it.
- `tenant-access.ts` resolves the authorized client set **server-side**, from the verified JWT's
  `org` claim only — a client ID supplied by the request (URL/body/query) is only ever checked
  for membership in that resolved set, never trusted to expand it. `admin`/`super_admin` still
  cross all boundaries unconditionally (unchanged, still tested).
- New `GET /api/v1/oc/me` lets the frontend discover its authorized client(s) server-side.

**Live proof, not simulated:** two real identities registered in two different organizations
against the real running identity service; two real `oc_clients` created; one mapping each. Against
a real, **production-shaped** (dev-bypass disabled, real JWKS wiring) running comparison instance:
each user's real token was accepted for their own mapped client and **rejected (403) for the
other's real, valid client ID** — the literal acceptance criterion — and rejected (401) with no
token at all.

**Tests:** 19 new tests (`tests/client-identity-mapping.test.ts`, real Postgres, real fixtures
cleaned by exact ID afterward) — cross-tenant isolation both directions, one org with multiple
clients, multiple different users sharing one org_context, unauthorized-org denial, revoked-mapping
denial (checked live, on the very next request), mapping creation/reactivation/audit,
admin/super_admin unconditional access preserved. Existing `tenant-access.test.ts` (12 tests) and
`tenant-access-body-query.test.ts` (6 tests) pass unmodified.

Full detail: `docs/askabd-tenant-model.md` ("Update — RESOLVED").

### 1.3 Minimal real client login (built on top of both P0s)

- `apps/web/src/app/login/page.tsx` — real (organization, email, password) form calling
  askabd-identity's actual `/v1/auth/login`, then `/api/v1/oc/me` to discover the authorized
  client(s) server-side, and redirecting there.
- `apps/web/src/app/lib/session.ts` — real session handling (sessionStorage; documented interim
  limitation, not yet a cookie-based backend-for-frontend), `authFetch()` wrapper.
- `client-portal/[clientId]/page.tsx` gained a real auth guard: no session → `/login`; a 401 →
  session cleared, redirected to `/login`; a 403 → an explicit "Access denied" screen (never a
  blank page, never mistaken for "no data yet"); a working "Sign out" action.

**Live browser UAT performed** (Claude Browser, real running dev servers, real backend, real
database — not a mock): real login → correct redirect to the authorized client → real (empty,
since the client is brand-new) data rendered → direct URL navigation to the other organization's
real client → "Access denied" screen, never their data → page refresh while denied → still denied
→ navigate back to the authorized client → works again → Sign out → redirected to `/login` →
direct URL to the previously-authorized client after sign-out → redirected to `/login`, not stale
data.

**Known, explicitly-tracked gap, not silently ignored:** `client-portal/[clientId]/journey/page.tsx`
still uses unauthenticated `fetch` — not yet migrated to `authFetch`. No admin-facing UI exists yet
for creating/revoking mappings (the service exists and is tested; only the HTTP/UI surface for an
admin to call it is missing — this session's live verification created mappings by calling the
service directly, not through a route).

---

## 2. Regression evidence

| Repo | Typecheck | Tests | Build |
|---|---|---|---|
| askabd-identity | `tsc --noEmit` clean | **193/193** passing | `npm run build` clean |
| askabd-comparison API | `tsc --noEmit` clean | **260/260** passing | `npm run build` clean |
| askabd-comparison web | `tsc --noEmit` clean | — (no test runner configured for web) | `next build` clean, `/login` route present |

No existing test was weakened, skipped, or deleted to make any of the above pass.

## 3. Database safety

- askabd-identity: 3 real migrations applied to a freshly-provisioned local Postgres (this exact
  container/volume did not exist before this session — a genuine port collision with a
  pre-existing, unrelated native Postgres install on this machine was found and fixed by remapping
  the container's host port, not by touching the native install).
- askabd-comparison: 1 real migration applied to the existing local Postgres — additive only,
  `CREATE TABLE IF NOT EXISTS`, no existing table altered or dropped.
- All live-verification fixtures (4 identities total across both P0 verifications, 4 test clients,
  mappings, sessions/tokens/audit rows) were deleted by exact ID afterward. No real client or
  platform data was touched. The persisted `signing_key` row (real infrastructure, not test data)
  was deliberately left in place both times.

## 4. Secret scan

No real secrets in any new or modified file — only documented placeholders (`CHANGE_ME`),
env-var names, and references to the existing `SIGNING_KEY_ENCRYPTION_KEY` fail-closed-in-production
pattern. Verified by targeted grep across every changed/new file in both repos.

## 5. Git status (nothing committed or pushed)

**askabd-identity** — branch `master`, HEAD unchanged at `77f76f8...` (Phase 9 commit). Modified:
`docker-compose.yml`, `package.json`/`package-lock.json` (added `pino-pretty` devDependency —
was missing entirely, blocking the dev server from starting at all), `src/config/env.ts`,
`src/routes/error-handler.ts`, `src/server.ts`, and the auth/authorization/identity/mfa/session/
token/webhook services (the earlier TS-compile-error fixes from this same milestone, already
covered in a prior report). New: `src/db/migrations/003_signing_keys.sql`, `src/routes/jwks.ts`,
`src/services/key-crypto.ts`, `tests/key-persistence.test.ts`. Untracked build artifact `dist/`
(from a verification build) — not staged, will not be committed.

**askabd-comparison** — branch `feature/reliability-hardening`, HEAD unchanged at `283cfdc...`
(the prior checkpoint). Modified: `.env.example`, `apps/api/src/config/env.ts`,
`apps/api/src/middleware/auth.ts`, `apps/api/src/platform/rbac/tenant-access.ts`,
`apps/api/src/routes/operations-center-routes.ts`, `apps/web/src/app/client-portal/[clientId]/page.tsx`,
`deploy/k8s/api-deployment.yaml`, `deploy/k8s/secrets.yaml`, and this session's three docs. New:
`apps/api/src/db/migrations/024_client_identity_mapping.sql`,
`apps/api/src/services/client-identity-mapping-service.ts`,
`apps/api/tests/client-identity-mapping.test.ts`, `apps/api/tests/jwks-verification.test.ts`,
`apps/web/src/app/lib/session.ts`, `apps/web/src/app/login/`. Pre-existing, already-excluded
untracked items unchanged (`apps/api/uploads/`, `askabd-shared-utilities-0.0.0.tgz`,
`infra/aws/.terraform/`, `apps/web/tsconfig.tsbuildinfo`).

**Nothing has been committed. Nothing has been pushed.** Both working trees are exactly as listed
above, awaiting explicit approval before any git write action.

## 6. What remains (explicitly, from the original 25-section milestone)

Not attempted this session — a clean starting point exists, nothing here requires re-architecture:

- Client invitation flow (creating a mapping + a first credential for a brand-new customer —
  currently only possible by calling the service directly, as this session's verification did).
- Service-driven onboarding, service selection/confirmation, requirements, connector requirements,
  connection verification UI wired to the new auth boundary.
- Full engagement-lifecycle re-integration behind real client login (discovery, assessment, gap
  analysis, recommendations, engineering/defects, migration, readiness, scorecard, remediation,
  reporting) — the existing engines are real and already built; they are not yet gated behind the
  new tenant boundary in every place, only in the ones covered by `tenant-access.ts`'s existing
  `extractClientId` coverage (documented gaps in that file's own docblock).
- Admin-facing UI for mapping creation/revocation.
- `client-portal/[clientId]/journey/page.tsx` migrated to authenticated fetches.
- A stronger session-storage posture (real backend-for-frontend / httpOnly cookies) for production.
- Full accessibility/responsive/multi-persona review of the new login/portal-guard UI.

**Do not treat this report as claiming the full client lifecycle is production-ready.** It is not.
What it does claim, with live evidence: real client authentication and real tenant isolation are
now genuinely possible and genuinely verified, end-to-end, across both repositories.
