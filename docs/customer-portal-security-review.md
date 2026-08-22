# Customer Portal Security Review

**Date:** 2026-08-18. Real security posture as of this session — what IS enforced,
proven live, vs. what is NOT, stated plainly rather than assumed safe.

## Two entirely different security postures exist in this codebase today

### 1. Customer-facing surface — REAL authentication, live-verified

`/login`, `/accept-invitation`, `/client-portal/:clientId`, and their backing API
routes (`/api/v1/oc/me`, `/api/v1/oc/invitations/{lookup,accept}`, every
`/api/v1/oc/**` route with a `:clientId`) go through the real chain:

```
Real askabd-identity token (EdDSA, verified via real JWKS)
  → real org_context claim
  → real client_identity_mapping lookup (server-side only)
  → 200 (authorized) or 403 (not authorized) or 401 (no/invalid token)
```

Verified this session, live, in a production-shaped comparison-api instance
(`devBypass` disabled, real `JWKS_URL`):
- Two real customers, two real organizations, two real clients, real mappings.
- Each customer's real token: 200 for their own client, **403 for the other's real,
  valid client ID** — the core cross-tenant isolation acceptance test.
- No token at all: 401.
- Tampered token: 401.
- Real browser walkthrough: login → correct redirect → direct-URL attack on the other
  org's client → "Access denied" screen (never their data) → refresh while denied →
  still denied → sign out → post-logout direct URL access → redirected to `/login`,
  not stale data.
- A real invitation, accepted through the real UI, correctly grants access to exactly
  the one client it was created for — nothing else.

### 2. Internal AskABD staff console — RESOLVED this session (was: no real authentication)

**Update (2026-08-18, later same day):** this gap is now closed. Full detail in
`docs/staff-authentication-architecture.md`. Summary:

- A genuine, previously-undiscovered defect was found while investigating this gap:
  askabd-comparison's RBAC middleware read roles exclusively from a JWT `roles` claim
  that real askabd-identity tokens **never carry** — so even with a real login, no
  real identity could ever pass an `Admin.Access` check. Every "admin" capability
  exercised anywhere in this platform's testing, ever, was only reachable via DEV
  bypass. Fixed: `platform/rbac/middleware.ts` now ALSO resolves roles from a new,
  real, database-backed `staff_role_assignment` table (migration 026) — server-side,
  auditable, revocable, following the exact pattern already proven for
  `client_identity_mapping`.
- `/staff/login` — a real, separate sign-in page (same real askabd-identity login
  underneath, no second auth system) that only accepts a session when the identity
  holds at least one real staff-role grant.
- A global client-side guard (`components/staff-auth-guard.tsx`, mounted once in the
  root layout) redirects every internal-console route (everything except `/login`,
  `/accept-invitation`, `/client-portal/*`, `/staff/login`) to `/staff/login` when no
  real staff session exists — covering all ~57 console pages, including the new
  Invitations admin page, without editing each one individually.
- **Live-verified, production-shaped** (devBypass disabled, real JWKS): a real staff
  identity bootstrapped itself as the first `super_admin` (the one-time, self-only
  bootstrap exception — closed the instant any row exists, tested); a real customer
  identity was denied (403) on the exact same staff route; a fresh browser tab
  confirmed the full real login → internal console flow.

The one remaining piece: the client-side guard's session-freshness check runs on
navigation, not continuously — a session revoked mid-session is caught on the user's
next navigation, not instantly. The server-side check on the next real API call is
authoritative and unaffected.

## What this session did NOT do

- Did not weaken any existing authentication or authorization check.
- Did not add a bypass, backdoor, or alternate auth path anywhere.
- Did not expose the invitation token, session tokens, or any credential in a log,
  audit record, or API response beyond what's strictly needed (audit records store
  `clientId`/`orgContext`, never the raw invitation token or password).
- Did not touch `tenant-access.ts`'s existing coverage gaps (opaque resource IDs like
  `:problemId`/`:gapId` that require a DB lookup to resolve client ownership — still
  documented, unchanged, in `tenant-access.ts`'s own docblock).

## Session storage — documented, not hidden

Real session tokens (`accessToken`/`refreshToken`/`sessionId`) are stored in
`sessionStorage` by `apps/web/src/app/lib/session.ts` — cleared when the tab closes,
but readable by any script running in that page's origin (standard XSS exposure for
any token-in-JS approach). The stronger posture — an httpOnly-cookie-based
backend-for-frontend that never exposes the token to page JS at all — was not built
this session. This is an explicit, tracked interim limitation, not an oversight.

## Verdict

Both security boundaries this milestone was asked to build are now real, tested (53
new automated tests across this session), and live-verified in a production-shaped
configuration: the customer-facing surface (login, invitation, tenant isolation) and
the internal staff console (staff login, DB-backed roles, the JWT-claim defect that
made every prior "admin" test only DEV-bypass-reachable). See
`docs/staff-authentication-architecture.md` for the full trace.
