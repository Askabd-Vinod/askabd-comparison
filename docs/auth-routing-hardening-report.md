# Authentication UX + Routing Hardening — Final Report

**Date:** 2026-08-19. Branch `feature/reliability-hardening`, base commit
`283cfdcd05aa4d0d84e577c4840354a9bea8677f` (unchanged — no commits made this
pass, per standing instruction).

## 1. Architecture — before and after

**Before:** a single root `app/layout.tsx` rendered the full staff Operations
Centre shell (env banner, `NavBar` with Dashboard/Clients/Platform navigation,
`StaffAuthGuard`, `AICopilot`, footer) unconditionally for **every** route,
including `/staff/login`, `/login`, and `/accept-invitation`. An
unauthenticated visitor to `/staff/login` saw the full authenticated shell —
navigation links present and clickable — before any client-side redirect
logic ran, producing a visible flash/flicker.

**After:** three genuine Next.js App Router route groups, each with its own
root-level layout:

- `app/layout.tsx` — minimal: `<html>`/`<head>`/fonts/global CSS/metadata
  only. No navigation, no auth guard, no authenticated data-fetching.
- `app/(app)/layout.tsx` — the real staff console shell (env banner, `NavBar`,
  `StaffAuthGuard`, `AICopilot`, footer). Everything that is genuinely part of
  the internal console.
- `app/(auth)/layout.tsx` — minimal, AskABD-branded, centered-card shell.
  Used by `/login`, `/staff/login`, `/accept-invitation`. No staff chrome of
  any kind.
- `app/(portal)/layout.tsx` — passes children straight through; the existing
  `client-portal/**` pages are already fully self-contained with their own
  dark-theme header and are not wrapped in any staff chrome.

This is structural, not a CSS/visibility trick: a page under `(auth)` or
`(portal)` has no code path that can render `NavBar`/`StaffAuthGuard`/
`AICopilot` — those components are never imported by their ancestor layouts.

## 2. Files changed (route-group migration)

~113 files physically moved via a one-time migration script
(`apps/web/migrate_route_groups.mjs`, deleted after verification) into
`(auth)/`, `(portal)/`, `(app)/`; every relative import specifier was
recomputed programmatically. `apps/web/src/app/lib/` and `.../components/`
were not moved (siblings of the route groups, imported with one extra `../`
from the new depth). Verified via a full `tsc --noEmit` (zero errors) and a
production build (clean) after the move.

## 3. Server-side gate (added this pass, beyond the original route-group split)

Route grouping alone fixes "auth pages show the shell." It does **not** stop
a Server Component under `(app)` from rendering real data for a request that
carries no valid session — that gap was found live (see §7) and closed with:

- `apps/web/src/app/lib/staff-session.ts` — `setStaffSession`/
  `clearStaffSession` now also write/clear a same-site, non-httpOnly session
  cookie (`askabd_staff_token`, no explicit expiry — a session cookie,
  cleared with the browser, mirroring `sessionStorage`'s own lifetime).
- `apps/web/src/app/(app)/layout.tsx` — now an **async Server Component**
  that reads that cookie via `next/headers` and calls `redirect('/staff/login')`
  before rendering any children if it's absent. Presence check only (not
  signature/expiry validation, to avoid a network round-trip on every
  navigation) — an expired/revoked token still reaches the shell, but every
  real API call a page makes then 401s honestly, and the existing client-side
  `StaffAuthGuard`'s live `/oc/me` re-check evicts the stale session shortly
  after.
- `apps/web/src/app/lib/api.ts` — the shared server-side fetch helper (used
  by 57 `(app)/**` Server Component pages) now reads the same cookie and
  attaches a real `Authorization: Bearer` header.

## 4. Staff login (`/staff/login`)

Title **"AskABD Staff Sign In"**, supporting text **"Sign in to the AskABD
Enterprise Operations Centre."** Fields: Organization (required, placeholder
`e.g. askabd-internal` — an example only, never a hardcoded value), Work
Email (required, `type=email`), Password (required, show/hide toggle).
Explicit line: **"Staff accounts are provisioned by AskABD administrators."**
— no "Create account"/"Sign up" anywhere. `next` query param honored on
success (sanitized — see §7). Loading state ("Signing in…"), real
backend-derived error states (invalid credentials, rate-limited with retry
seconds, network-unavailable, backend-unavailable, MFA-not-yet-supported).

## 5. Customer login (`/login`)

Title **"Sign in to your AskABD workspace."** Email/Password with show/hide.
"Don't have an account? Accept an invitation" link. **Never asks for a client
ID.** Post-login resolution, entirely server-derived from
`client_identity_mapping` via `/oc/me`:
- 0 mapped clients → honest **"Your workspace has not been assigned yet"**.
- 1 mapped client → auto-redirect to that client's portal.
- >1 mapped clients → a real selector, names resolved per-ID via
  `GET /oc/clients/:id` (tenant-gated — a customer can only resolve names for
  their own mapped IDs).
- A staff-capable identity (`crossClientAccess`) signing in through this page
  is told to use the staff sign-in page instead — a customer session must
  never be used to reach the internal console.

## 6. Invitation acceptance (`/accept-invitation`)

Audited against the spec; found already real and mostly complete from a
prior pass (real token lookup, real client-name/email resolution, real
identity creation + `client_identity_mapping` + session establishment). One
deliberate finding: the backend intentionally returns the **same** generic
"invalid or expired" outcome for invalid/expired/revoked/already-accepted
tokens (see `invitation-service.ts`'s own doc comment) — a considered
no-disclosure security decision, the same pattern already used for login
failures. Distinguishing those states in the UI, as this pass's brief
initially asked for, would require weakening that existing security
decision; left as-is rather than overridden without a business-owner
sign-off. **Live-verified end-to-end** this pass with a real, temporary
invitation fixture (§9) — real email delivered via Mailpit, real token,
real account creation, real auto-login, real redirect into the correct
client's portal.

## 7. Forgot password — now real, built this pass (2026-08-19 update)

Originally investigated and found real backend token logic
(`/credential/reset/request` + `/credential/reset/confirm`, hashed tokens,
expiry, single-use) but **no email-delivery mechanism anywhere in
askabd-identity** — the honest interim state was "Password recovery is
currently handled by AskABD support." That gap is now closed:

- New `askabd-identity/src/services/email-service.ts` — real delivery via
  Mailpit's REST send API with a minimal raw-SMTP fallback (mirrors
  `askabd-comparison`'s own working `email-service.ts` pattern; no new
  dependency added).
- `credential-manager.ts`'s `issueResetToken` now sends a real email
  containing the real reset link when `emailService`/`webUrl` are configured
  — genuinely not configured unless `SMTP_HOST` is set, so an unconfigured
  environment still behaves honestly rather than fabricating success.
- New `/forgot-password` and `/reset-password` pages (both `(auth)` group,
  no shell). Both login pages' "Forgot your password?" text is now a real
  link instead of the interim message.
- **Live-verified end-to-end** with a temporary fixture identity (created,
  tested, deleted by exact ID afterward — the real staff credential was never
  touched): request → real email arrived in Mailpit → real link → real
  reset → login succeeded with the new password → replaying the same token
  was honestly rejected ("This reset link has already been used…", not a
  generic error).
- 4 new automated tests in `askabd-identity/tests/credential-manager.test.ts`
  covering: real email sent when configured, never sent for a non-existent
  identity (R5.6 no-disclosure preserved), `emailSent: false` honestly
  reported when unconfigured, and backward-compatibility for existing callers
  with no `emailService` at all.

## 8. `next` parameter safety

New `apps/web/src/app/lib/safe-redirect.ts` — `sanitizeNextPath` rejects
anything that isn't a genuine single-leading-slash internal path: absolute
URLs, protocol-relative (`//evil.com`), backslash tricks, embedded
`javascript:`/`data:`/`vbscript:`/`file:` schemes, control characters.
`sanitizeNextForSurface` additionally refuses to bounce a customer login
into a staff-only path (or vice versa) and never redirects straight back
into an auth page. 17 unit tests cover every case named in the brief.

## 9. Live browser UAT (fresh runtime this pass)

All performed against the real, freshly-started local stack (API/identity/DB
all genuinely restarted and health-checked, not assumed):

- **A.** Direct load of `/staff/login` — only the auth layout renders, zero
  nav links present (`read_page` confirmed).
- **B.** Unauthenticated direct load of `/clients` (fresh tab, real cleared
  cookie+sessionStorage) — network trace shows the request resolves straight
  to `/staff/login?next=%2Fclients` server-side; the `(app)/clients/page.js`
  chunk is never even fetched. Zero shell flash.
- **C.** Successful staff login → `/clients` with real data (verified twice:
  once via the standard client-side flow, once via the server-side-gated
  `next`-redirect flow).
- **D.** Logout clears session (sessionStorage + cookie) and redirects to
  `/staff/login`.
- **E.** Back-button after logout — still shows the login page, no stale
  protected content.
- **F.** `/login` (customer) — confirmed zero nav elements.
- **G.** Mobile viewport (375×812) — `/staff/login` and `/login` have zero
  horizontal overflow (`scrollWidth === clientWidth`).
- **Customer invitation → login → tenant isolation**, full real cycle: real
  invitation created via the API, real email retrieved from Mailpit, real
  token used to accept, real account + mapping created, auto-login into the
  correct client portal, then confirmed that customer session is rejected
  (redirected to `/staff/login`) when it attempts to reach `/clients`.

## 10. Real defects found and fixed during this pass's UAT (not pre-existing to the route-group work — found live, fixed live, re-verified live)

1. **`apps/api/.env` was missing `JWKS_URL`/`JWT_ISSUER`/`JWT_AUDIENCE`.**
   Without them, `middleware/auth.ts`'s `devBypass` formula was true —
   *every* request (even fully unauthenticated ones) was silently treated as
   an authenticated dev-admin identity; real RBAC/tenant checks never ran.
   This is the direct cause of the "could not reach AskABD to determine your
   access" symptom reported at the start of this pass — the API process
   simply wasn't running. Fixed by starting it and by adding the missing
   config, restoring real JWKS verification.
2. **57 `(app)/**` Server Component pages sent zero Authorization header at
   all.** Invisible while devBypass masked it; the instant real verification
   was restored, every one of them 401'd and silently rendered "0 clients"
   for a real, existing client — a fabricated-looking empty state caused by
   a broken fetch, not real data absence. Fixed via the cookie + `api.ts`
   change in §3. Verified live on `/`, `/clients`, `/engineering`.
3. **NavBar horizontal overflow at 375px** (30px overflow, `scrollWidth 405`
   vs `clientWidth 375`) — a flex child (`overflow-x-auto` nav-item wrapper)
   lacked `min-w-0`, so it refused to shrink and blew out the whole page
   instead of scrolling internally. One-line fix
   (`apps/web/src/app/components/nav.tsx`), re-verified at 0 overflow on
   two representative pages.

## 11. Automated tests (new this pass)

`apps/web` had **zero** test infrastructure before this pass. Added a
minimal Node-environment vitest setup (no component/DOM testing framework —
that remains a real, documented follow-on investment) with 27 tests:
- `tests/safe-redirect.test.ts` (17) — next-param safety, every named attack
  shape.
- `tests/auth-layout-separation.test.ts` (7) — structural regression guard:
  root/auth/portal layouts never render `NavBar`/`StaffAuthGuard`/
  `AICopilot`; `(app)/layout.tsx` does; both login pages carry the exact
  required copy.
- `tests/server-component-auth.test.ts` (3) — regression guard for the
  cookie/Authorization fix in §3/§10.2.

Backend auth/tenant behavior (staff/customer login, cross-tenant denial,
invitation states, session lifecycle) continues to be covered by the
existing 333 API tests and 193 identity tests, unchanged by this pass —
not duplicated here.

## 12. Full regression + build results

- API: **333/333** passing, `tsc --noEmit` clean, `npm run build` clean.
- askabd-identity: **193/193** passing (unchanged this pass).
- Web: **27/27** passing (new), `tsc --noEmit` clean, `npm run build` clean.
- Live health check (`npm run health`): all 11 checked dependencies ✓.

## 13. Remaining gaps / business decisions still open

- **MFA is not handled by either login page.** `staffLogin`/`login` now
  detect the `mfa_required` outcome and show an honest
  "not yet supported, contact AskABD support" message instead of silently
  proceeding with an undefined token (a real latent bug fixed as part of
  this pass's error-classification work) — but a real MFA challenge UI is
  not built. No identity in this environment currently has MFA enabled.
- ~~Password recovery has no delivery mechanism~~ — **fixed, see §7 (2026-08-19
  update)**: real email delivery now built and live-verified end-to-end.
- **Full session-cookie validation at the layout boundary is a presence
  check, not a signature/expiry check** (§3) — deliberate, to avoid a
  network round-trip on every navigation; the tradeoff and its mitigations
  are documented in code.
- **`sessionStorage`-based session storage remains the primary session
  store** for both staff and customer — a real, working, but intentionally
  minimal architecture (see `lib/session.ts`); a full httpOnly-cookie BFF
  migration remains a larger, deliberate future step, not undertaken here.
- Three pre-existing `Math.random()`-based simulated values were found
  during a fresh fabrication grep this pass (`applications/page.tsx`,
  `infrastructure/servers/[serverId]/page.tsx`, `performance/page.tsx`) —
  not part of this pass's scope (auth/routing), not fixed here, flagged for
  a follow-up data-integrity pass.

## 14. Git safety

No commits made. `git status --short` on both repos shows only the working
tree changes described above (the route-group file moves + the listed edited
files); `HEAD` unchanged on both repos throughout this pass. No secrets found
in any tracked or newly-created file (`St4ffB00tstrap...` grep returns zero
matches outside this conversation).
