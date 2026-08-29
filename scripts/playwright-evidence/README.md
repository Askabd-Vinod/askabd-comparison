# AskABD Playwright Evidence Infrastructure

Real, automated Playwright testing against the real, running AskABD app
(`localhost:3001`/`4200`/`3100`) — no manual session export required for
day-to-day validation runs.

## Quick start (fresh clone)

```bash
# 1. Bring up all three services (idempotent — reuses them if already running)
npm run dev:all

# 2. One-time: provision a dedicated DEVELOPMENT/TEST staff account
#    (idempotent — safe to re-run any time; reuses the existing account
#    if it still works, only creates a fresh one if genuinely missing)
npm run playwright:setup-staff

# 3. Run an authenticated Playwright smoke test with real, physically
#    saved screenshots
npm run playwright:smoke
```

That's it — no browser, no DevTools, no password ever typed by a human
into this flow.

## How authentication works (and why it's safe)

`apps/api/scripts/setup-playwright-test-staff.ts` creates a real,
dedicated, clearly-marked test identity
(`playwright-e2e-test@askabd-dev.local`, org `askabd-internal`) using
**only real, already-existing application flows** — the exact same real
HTTP calls a genuine signup performs against the real, running
`askabd-identity` service:

1. `POST /v1/identities` — real registration.
2. `POST /v1/identities/:id/verify` — real verification.
3. `POST /v1/identities/:id/credential/store` — a real password this
   script **generates itself** (`node:crypto.randomBytes`) — never a real
   human's password, never extracted from a browser.
4. `StaffRoleService.grantRole(...)` — this repo's own real, already
   -tested service that grants a role via the `staff_role_assignment`
   table (the actual, DB-backed source of AskABD roles — real
   `askabd-identity` tokens carry no `roles` claim at all).

The resulting credentials are written to a **local, gitignored** file:
`scripts/playwright-evidence/.auth/test-staff-credentials.json`. This
file is never committed (see `.gitignore`) and is never printed by the
setup script after the initial run.

Playwright then logs in through the **real** `/staff/login` UI form —
`scripts/playwright-evidence/lib/auth.mjs`'s
`getAuthenticatedContextViaTestStaffLogin()` — producing a genuine,
real, EdDSA-signed session from the real identity service, exactly as a
human would get. It is indistinguishable from a real staff session at
the protocol level, but it belongs to a dedicated, disposable, clearly
-named fixture account with a password nobody (not even the person
running these scripts) needs to know.

**This never touches a real human's credentials.** No live browser
session is extracted, no cookie is copied, no password is typed by a
human into an automated flow.

### If the test account is ever lost/reset

Re-run `npm run playwright:setup-staff`. It's idempotent: it first tries
a real login with the cached credentials, and only provisions a fresh
account if that genuinely fails (e.g. the identity database was reset).

## Real bugs found and fixed while building this

Two real, reproducible Playwright timing bugs were found and fixed via
actual test runs, not assumed:

1. **Hydration race**: navigating with `waitUntil: 'domcontentloaded'`
   and clicking immediately let the click fall through to the browser's
   native HTML form submission (a page reload) instead of this
   Next.js page's real React click handler, because React hadn't
   attached its event listeners yet. Fixed by waiting for
   `networkidle` and the form field's own visibility before
   interacting.
2. **`sessionStorage` isolation**: AskABD's staff session lives in
   `sessionStorage`, which — like real browsers — Playwright never
   shares with a *new* page/tab, even inside the same browser context.
   Every helper in `lib/auth.mjs` now returns `{ context, page }`
   (the SAME page that performed the real login) instead of just
   `context`, and every script that calls them reuses that page rather
   than calling `context.newPage()` afterward.

Both were latent in the pre-existing `bootstrap-and-smoke-test.mjs` and
`comparison_test_1.mjs` scripts too (never caught before because neither
had ever actually been run against a real, valid session until this
pass) — both fixed for consistency.

## Files

- `lib/auth.mjs` — three real auth paths:
  1. `getAuthenticatedContextViaTestStaffLogin()` — **the default,
     fully automated path** described above.
  2. `getAuthenticatedContextFromExport()` — a real, user-exported
     session file (see `export-session-instructions.md`) — kept for the
     rare case you want to test against your own real staff account's
     exact permissions rather than the dedicated test account.
  3. `getAuthenticatedContext()` — headed interactive login; confirmed
     NOT viable in this sandboxed shell (no display attached), kept for
     a differently-provisioned environment.
- `lib/evidence.mjs` — `EvidenceRun`: physically writes numbered PNGs
  (`page.screenshot()`), verifies each one (exists, non-zero size, real
  PNG signature) immediately after writing, and generates a real
  markdown + JSON report under
  `docs/evidence/<feature>/<feature>_test_N/`. Screenshots are
  intentionally **not** committed to git (see the repo's own
  `.gitignore`) — only the structured `.md`/`.json` reports are, so the
  written record stays verifiable without bloating the repo with binary
  history.
- `authenticated-smoke-test-1.mjs` — the reference authenticated test:
  login → Verification Center → screenshot → authenticated API check
  (via a real network listener) → console-error capture → network
  -failure capture.
- `smoke-test-1.mjs` — a real, unauthenticated smoke test proving the
  Chromium + evidence-capture pipeline itself works, independent of auth.

## Known, disclosed limitation

The Next.js dev server compiles routes on demand — the first hit on a
given route after a fresh navigation can take anywhere from ~4s to
20s+. `getAuthenticatedContextViaTestStaffLogin()` uses a generous
45s timeout for the post-login redirect to accommodate this; a
production build would not have this variance.
