# Local Development Runbook

**Date:** 2026-08-19. Real, verified commands and ports — every value below was
confirmed working against this exact checkout, not copied from a template.

## Dependencies

| Service | How it runs | Port | Notes |
|---|---|---|---|
| comparison-postgres | Docker (`docker compose up -d` in `askabd-comparison/`) | 5442→5432 | `apps/api/.env` `DATABASE_URL` points here |
| identity-postgres | Docker (`docker compose up -d` in `askabd-identity/`) | 5532→5432 | separate DB, separate container |
| Mailpit | Docker (bundled in `askabd-comparison/docker-compose.yml`) | 1025 (SMTP), 8025 (web UI) | invitation emails land here in dev |
| askabd-identity | `npm run dev` in `askabd-identity/` | 3100 | real auth, JWKS at `/.well-known/jwks.json` |
| comparison API | `npm run dev --workspace=apps/api` in `askabd-comparison/` | 4200 | |
| comparison web | `npm run dev --workspace=apps/web` in `askabd-comparison/` | 3001 | |

Layout: `askabd-comparison/` and `askabd-identity/` are sibling directories
(`<parent>/askabd-comparison`, `<parent>/askabd-identity`).

## One-command startup

```bash
npm run dev:all
```

Brings up both Docker Postgres containers, then starts identity → API → web in
order, waiting for each to report healthy before starting the next. Prints
clear failure messages (not silent hangs) if a dependency never comes up.

## Health check

```bash
npm run health
```

Checks Docker containers, both Postgres ports, Mailpit, identity `/v1/health`
and JWKS, API `/health` and `/ready`, and the web dev server — prints ✓/✗ per
dependency with the real error, never a fabricated "all good."

## Critical config: JWKS_URL

`apps/api/.env` **must** set `JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE`.
Without `JWKS_URL` (and no `JWT_SECRET`), `apps/api/src/middleware/auth.ts`'s
`devBypass` formula (`NODE_ENV !== 'production' && !JWT_SECRET && !JWKS_URL`)
evaluates true and **every request is silently treated as an authenticated
dev-admin identity, real RBAC and tenant checks never run.** This was found
missing during a live runtime diagnosis on 2026-08-19 and is now set to:

```
JWKS_URL=http://localhost:3100/.well-known/jwks.json
JWT_ISSUER=askabd-identity
JWT_AUDIENCE=askabd-platform
```

If `/staff/login` reports *"Signed in, but could not reach AskABD to
determine your access"*, check (in order): is the API process actually
running (`npm run health`)? Is `JWKS_URL` set in `apps/api/.env`? Is the
identity service's JWKS endpoint reachable?

## Critical config: askabd-identity's own DATABASE_URL

`askabd-identity` also had no `.env` file at all until this was found and
fixed on 2026-08-19. Its code default (`src/config/env.ts`) points
`DATABASE_URL` at `localhost:5432` — but this repo's own `docker-compose.yml`
deliberately remaps the container to host port **5532** (5432 collides with
an unrelated, pre-existing native Postgres install on this machine that has
no `identity_user` role or `identity` database at all). Without an explicit
`.env`, the identity service silently tries to connect to the wrong Postgres
instance and fails with `password authentication failed for user
"identity_user"` (a misleading error — the real problem is the wrong
port/instance, not a wrong password). Fixed with a real
`askabd-identity/.env` setting `DATABASE_URL` to
`postgresql://identity_user:identity_local_pass@localhost:5532/identity`.
If you ever see this error again after a fresh `docker compose up -d`, check
that this `.env` file still exists and still points at 5532.

## A note on JWKS_URL and the test suite

`apps/api/src/middleware/auth.ts`'s `registerAuthMiddleware` merges an
explicit test config (`{ jwtSecret: SECRET, ... }`, used by nearly every file
in `apps/api/tests/`) with this process's real `.env`. A caller that
explicitly supplies its own `jwtSecret` (or `jwksUrl`) is treated as opting
out of the env-derived `JWKS_URL`/`JWT_AUDIENCE` fallback — this is what lets
the test suite sign its own fast, offline HS256 tokens without needing a real
identity-issued token, even though the real dev environment's `.env` has a
real `JWKS_URL` configured. If you ever see a wave of test failures shaped
like "expected 401 to be 200/403" right after touching auth-related env vars,
this is the first place to look.

## Manual UAT sequence

1. Open **http://localhost:3001/staff/login**.
2. Sign in with a real, provisioned staff identity (staff accounts are
   provisioned by AskABD administrators — there is no self-service staff
   signup). Org context, work email, and password are required. The known real
   staff identity in this checkout: org `askabd-internal`, email
   `hello@askabd.com`. Its password was reset via the real
   `/credential/reset/request` + `/credential/reset/confirm` flow on 2026-08-20
   (the previously-documented password was no longer valid — see
   `docs/session-architecture.md`'s changelog); the current password was
   communicated directly to the requesting user, not recorded in this file.
3. You land on the Dashboard/Client Directory with real data from
   `oc_clients` — never a fabricated client.
4. To test the customer side: from a client's detail page, create a real
   invitation (`POST /api/v1/oc/clients/:id/invitations`) with a real
   `email`/`orgContext`. The invitation email lands in Mailpit
   (**http://localhost:8025**) — open it there to get the real accept link.
5. Open **http://localhost:3001/login** to sign in as an existing customer,
   or use the Mailpit link to accept a fresh invitation at
   `/accept-invitation?token=...`.
6. Verify tenant isolation: a customer session can never reach `/clients`,
   `/platform`, or any other staff-console route — it redirects to
   `/staff/login`. A staff session reaches the full console.

## Known, intentional local-dev limitations

- Password recovery: askabd-identity has a real `/credential/reset/request`
  and `/credential/reset/confirm` token flow, but no email-delivery
  mechanism is wired up anywhere in this checkout — so no user could ever
  actually receive a reset token. The UI honestly says *"Password recovery
  is currently handled by AskABD support"* rather than faking an "email
  sent" success.
- Session tokens live in `sessionStorage` (staff and customer, separately),
  not an httpOnly cookie — a documented, deliberate interim tradeoff (see
  `apps/web/src/app/lib/session.ts`). A same-site, JS-set (non-httpOnly)
  cookie also exists (`askabd_staff_token`) solely so Server Component pages
  can read the staff session for SSR; it does not replace `sessionStorage`
  as the primary session store.

## Database migrations

Both repos have real migrations that must be applied after a fresh clone or
a fresh Docker volume — there is no auto-migration on server startup.

```bash
cd apps/api && npm run migrate                # comparison DB — includes CRM (030, 031)
cd ../../askabd-identity && npm run migrate   # identity DB — includes MFA replay prevention (004)
```

`npm run health` does not check migration status — if a route 500s with a
missing-column/table error, run both `migrate` commands above first.

## Test commands

```bash
# API — 358 tests
cd apps/api && npm test

# askabd-identity — 213 tests (separate repo, sibling directory)
cd ../askabd-identity && npm test

# Web — 33 tests
cd apps/web && npm test

# Typechecks
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd ../askabd-identity && npx tsc --noEmit
cd ../askabd-comparison/apps/web && npx tsc --noEmit -p tsconfig.json

# Production builds (stop the web dev server first — see Windows note below)
cd apps/api && npm run build
cd ../../askabd-identity && npm run build
cd ../askabd-comparison/apps/web && npm run build
```

**Windows note:** running `npm run build` for the web app while `next dev` is
live corrupts `.next`. Always stop the dev server, `rm -rf .next`, build,
then restart the dev server.

## Session lifetimes (2026-08-20)

`askabd-identity/.env` sets `SECURITY_ACCESS_TOKEN_LIFETIME_SEC=120` (2 minutes)
for local/UAT convenience only — so a real access-token renewal cycle can be
observed in ~2 minutes rather than the 15-minute production-typical default. This
is not a security downgrade (the platform ceiling in `security.ts` is unchanged
and still enforced); see `docs/session-architecture.md` for the full rationale,
config table, and live verification evidence. Remove or raise this override for a
real production deployment.

## MFA local testing

askabd-identity's real TOTP MFA has no UI-driven QR code (the manual-entry
secret + `otpauth://` URI are shown as text at `/account/security` and
during login enrollment) — use any real authenticator app's "enter code
manually" option, or compute a code directly from the secret with
`node:crypto`'s `createHmac('sha1', ...)` per RFC 6238 (see
`mfa-service.ts`'s `generateTotp` for the reference implementation) for
scripted testing.
