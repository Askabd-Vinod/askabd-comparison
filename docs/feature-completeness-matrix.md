# Feature Completeness Matrix

**Date:** 2026-08-18 (updated same day, staff-auth pass). Everything built or verified
across this milestone, and its real state. No feature below is claimed complete
unless it was tested AND live-verified.

| Feature | Backend | Tests | Live-verified | UI |
|---|---|---|---|---|
| Signing key persistence (askabd-identity) | ✅ Real, migration 003 | ✅ 16 tests | ✅ Real process restart, real DB | N/A |
| JWKS endpoint (askabd-identity) | ✅ Real | ✅ Covered in above | ✅ Real HTTP, real EdDSA | N/A |
| JWKS verification (askabd-comparison) | ✅ Real | ✅ 10 tests | ✅ Real cross-process | N/A |
| client_identity_mapping (org↔client) | ✅ Real, migration 024 | ✅ 19 tests | ✅ Real two-org isolation test | N/A |
| Real customer login | ✅ Real | ✅ Covered above | ✅ Real browser walkthrough | ✅ `/login` |
| Client-portal auth guard (401/403/logout) | ✅ Real | ✅ Covered above | ✅ Real browser walkthrough | ✅ `client-portal/[clientId]/page.tsx` |
| Client invitations (create/resend/revoke) | ✅ Real, migration 025 | ✅ 9 service + 7 route tests | ✅ Real browser: admin creates, real email arrives | ✅ `/clients/:clientId/invitations` |
| Invitation acceptance (full identity creation) | ✅ Real, orchestrates real identity API | ✅ Full E2E test with real Mailpit capture | ✅ Real browser: click real link, set password, land in real portal | ✅ `/accept-invitation` |
| `GET /oc/me` (server-resolved authorization discovery) | ✅ Real | ✅ 2 tests | ✅ Real | N/A |
| **Staff role assignment (DB-backed roles)** | ✅ Real, migration 026 | ✅ 17 tests | ✅ Real production-shaped: real token w/ no roles claim, DB-granted vs ungranted | N/A |
| **RBAC middleware real-role resolution fix** | ✅ Real (fixed the actual "every admin test was DEV-bypass-only" defect) | ✅ Covered above + full 293-test regression unaffected | ✅ Real curl proof: `roles:["super_admin"]` from a genuine token | N/A |
| **Staff login (`/staff/login`)** | ✅ Real (same identity endpoint as customer login) | ✅ Covered above | ✅ Real browser: fresh tab, real credentials, real redirect to `/clients` | ✅ `/staff/login` |
| **Internal console auth guard** | ✅ Real (global fetch interceptor + redirect, all ~57 pages) | — (client-side; server-side boundary is what's tested) | ✅ Real browser: unauthenticated → redirected; authenticated staff → console loads | ✅ `components/staff-auth-guard.tsx` |
| **Staff role bootstrap (first admin)** | ✅ Real, self-only, closes permanently | ✅ 3 dedicated tests | ✅ Real: first identity self-granted `super_admin`; second identity's attempt denied | N/A |

## Explicitly NOT built this milestone (see `docs/customer-journey-audit.md` for the full 26-stage table)

- Welcome/onboarding-intro screen
- Organization-profile collection UI
- Multi-client picker (customer with >1 authorized client always lands on the first)
- Customer self-service invitations (only AskABD admins can invite)
- Password-reset UI wiring for either `/login` or `/staff/login` (askabd-identity's
  real reset endpoints exist, unused by either frontend)
- Admin UI for staff to manage OTHER staff's role assignments (the service/API exist
  and are tested; no console page yet)
- Any UI/UX design-system unification pass (see `docs/enterprise-uiux-review.md`)
- Re-verification of stages 5-21 (service confirmation through reporting) — real,
  pre-existing, not touched or broken, but not re-confirmed this session either
