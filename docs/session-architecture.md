# Session Architecture

**Date:** 2026-08-20. Real root cause found and fixed during manual UAT: an
authenticated session (staff and customer alike) became unusable partway through
active use, with no recovery and no clear message.

## Root cause (confirmed, not guessed)

askabd-identity's `TokenService` (`askabd-identity/src/services/token-service.ts`)
already issued a real, short-lived access token (≤15 minutes, hard platform ceiling
— `security.ts`'s `ACCESS_TOKEN_MAX_LIFETIME_SEC`) plus a real, rotating, single-use
refresh token with reuse detection (`refresh_token` table, `status: active | rotated
| revoked`). A real `POST /v1/tokens/refresh` route already existed and worked.

**Nothing in `askabd-comparison`'s web app ever called it.** `lib/session.ts` and
`lib/staff-session.ts` stored the access token and used it forever; the moment it
expired, every subsequent API call returned 401, and:

- The customer portal (`client-portal/[clientId]/page.tsx`) treated any 401 as a
  terminal failure: immediate `logout()` + redirect to `/login`, losing the page the
  customer was on.
- `staff-auth-guard.tsx`'s route-change check did the same on the staff side.
- The `client-portal/[clientId]/journey/page.tsx` page had a separate, worse bug:
  it never attached an Authorization header **at all** (plain `fetch()`, not
  `authFetch()`) — every request there 401'd immediately, not just after 15 minutes.

## The fix

`lib/session.ts` (customer) and `lib/staff-session.ts` (staff) — identical
architecture in both, kept as two files per the existing, deliberate separation of
the two security domains:

- **`Session`/`StaffSession` now carry `expiresAt`** (ms since epoch), decoded from
  the access token's own `exp` claim at issue/rotation time (no signature
  verification client-side — this is scheduling data, not a trust decision; the
  server independently re-verifies every request regardless).
- **`refreshSession()` / `refreshStaffSession()`** — calls the real
  `/v1/tokens/refresh`, persists the rotated pair. **Concurrency-safe**: a module-level
  in-flight promise means simultaneous callers (e.g. a portal page's `Promise.all`
  of nine endpoints all noticing an expired token at once) share ONE real network
  request — rotation is single-use, so two concurrent rotation attempts would
  otherwise trip real reuse-detection and fail spuriously.
- **`authFetch()` / `staffFetch()`** — proactively renew when the current token is
  within 60s of expiry BEFORE attaching it; if the server still returns 401
  (revoked, or expired between the check and the request), renew once and retry the
  SAME request exactly once. A 401 on the retried request is a genuine, terminal
  failure — returned as-is, never looped.
- **A background renewal timer** (`components/staff-auth-guard.tsx` for staff,
  the new `components/portal-session-keepalive.tsx` mounted from
  `(portal)/layout.tsx` for customers) reschedules itself from the real token's own
  `expiresAt` — 60s before expiry — so an idle-but-open tab renews itself even with
  no user-triggered fetch in flight. **Live-verified**: watched a real session's
  `expiresAt` advance by exactly one token lifetime with zero user action, on both
  the staff and customer surfaces.
- **Fail-closed, once**: when a renewal genuinely fails (refresh token
  expired/revoked/reused), the session is cleared and the user is redirected to the
  correct login page (`/login` or `/staff/login`) with `next=<original path>` and
  `expired=1`. The login page shows an honest "Your session has expired. Please
  sign in again — you'll be returned to where you left off" message instead of a
  generic prompt, and — **live-verified** — a login after this redirect actually
  lands back on the exact page (including the multi-client case: if `next` names a
  workspace the identity is authorized for, it's honored directly instead of
  re-showing the workspace picker).
- **Logout still invalidates the session for real** — `logout()`/`staffLogout()`
  call the real `/v1/auth/logout`, which the pre-existing `AuthService`/
  `SessionManager` already revoke server-side; this pass did not need to touch that
  path, only proved (live) that a protected page is genuinely inaccessible
  afterward (client-side guard redirects immediately; any request against a revoked
  session's token would independently 401 server-side regardless).
- **No token in `localStorage`.** Tokens remain in `sessionStorage` (cleared when
  the tab closes) plus the one pre-existing same-site cookie for SSR reads — this
  was already the architecture (see `lib/session.ts`'s own top-of-file doc) and
  remains a deliberate, documented interim tradeoff, not this pass's concern.

## Why NOT a full httpOnly-cookie BFF migration

The web app's client-side code calls askabd-identity (`localhost:3100`) and the
comparison API (`localhost:4200`) **directly**, cross-origin from its own origin
(`localhost:3001`). An httpOnly cookie set by 3001 is never automatically sent to
3100/4200 without a much larger rewrite: every direct `fetch()` call in this app
(dozens of pages) would need to go through a same-origin Next.js proxy route
instead. That is a real, larger, separate architectural project — attempting it
inside this pass would risk exactly what the governing instructions prohibit
("do not break existing authentication... do not create duplicate architecture").
What this pass fixes is real and complete on its own: the token that already exists
is now genuinely short-lived AND genuinely renewed, which is the actual, concrete
bug reported ("session gets interrupted"). The BFF migration remains a legitimate
future step, tracked here rather than silently dropped.

## Configuration

`askabd-identity/src/config/security.ts` enforces hard platform ceilings
regardless of environment configuration — the service refuses to start if either
value is out of bounds:

| Setting | Env var | Platform ceiling | This repo's local/UAT value |
|---|---|---|---|
| Access token lifetime | `SECURITY_ACCESS_TOKEN_LIFETIME_SEC` | ≤ 900s (15 min) | **120s** — see below |
| Refresh token lifetime | `SECURITY_REFRESH_TOKEN_LIFETIME_SEC` | ≤ 2,592,000s (30 days) | 604,800s (7 days, default — unchanged) |

`askabd-identity/.env` sets `SECURITY_ACCESS_TOKEN_LIFETIME_SEC=120` **for local
UAT convenience only** — so a real renewal cycle can be observed in ~2 minutes
instead of waiting the full 15-minute production-typical lifetime. This is not a
security downgrade: the ceiling is unchanged, every access token (however
short-lived) is still verified via real JWKS signature + expiry + revocation on
every single request, and the refresh token — the thing that actually gates how
long a session can be renewed without a fresh login — is left at its real 7-day
default. **For a real production deployment, remove this override** (or set it
explicitly up to 900s).

## Verified (live, this pass)

1. **Login** — real credentials, real MFA challenge where enrolled, real session
   issued with a real `expiresAt`.
2. **Automatic renewal, proactive** — watched `expiresAt` advance by exactly one
   token lifetime with zero user action, on both staff and customer sessions.
3. **Continued use through a renewal** — the customer-portal page kept rendering
   real data through a live renewal cycle; zero console errors, zero visible
   interruption.
4. **Reactive renewal-then-retry** — unit-tested (`apps/web/tests/session-refresh.test.ts`)
   with a real 401 injected mid-flight: renews once, retries once, succeeds.
5. **Logout** — real `/v1/auth/logout` call; a protected page visited immediately
   after redirects to login (client-side guard), never renders stale data.
6. **Genuine renewal failure fails closed** — corrupted a real refresh token live;
   the app cleared the session and redirected to `/login?next=<page>&expired=1`
   with the honest message, no loop, no crash.
7. **Return to intended destination** — logged back in after the forced-expiry
   test; landed directly back on the exact page (`/client-portal/<id>`), including
   through the multi-client workspace-picker case.
8. **No infinite loop** — `authFetch`/`staffFetch` retry a failed request exactly
   once; the background timer only ever reschedules itself after either a
   successful renewal or fails closed (never re-arms after a failure).

## Not yet done (real, honest scope boundary)

- The full httpOnly-cookie BFF migration described above.
- Idle-timeout enforcement distinct from the access-token lifetime (askabd-identity
  has real `sessionIdleTimeoutSec`/`sessionAbsoluteTimeoutSec` config —
  `SESSION_IDLE_MAX_SEC`/`SESSION_ABSOLUTE_MAX_SEC` — but nothing in this pass wires
  a client-side idle detector to it; the access-token renewal cycle is the only
  mechanism currently enforcing a practical session ceiling from the browser side).
