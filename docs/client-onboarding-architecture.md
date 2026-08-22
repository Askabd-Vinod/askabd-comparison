# Client Onboarding Architecture

**Date:** 2026-08-18. Covers the real, implemented architecture for how a brand-new
customer gets from "AskABD decides to onboard them" to "logged into their client
workspace" — and marks, explicitly, everywhere that architecture stops today.

## The real flow, as implemented

```
AskABD admin (Admin.Access role)
  │
  │  POST /api/v1/oc/clients/:clientId/invitations
  │  { email, orgContext }
  ▼
oc_invitations row created (status: invited)
  │  real EmailService.sendEmail() — Mailpit in dev, real SMTP provider in production
  ▼
Invitee receives a real email with a real, single-use, expiring link
  │  GET /accept-invitation?token=...  (apps/web)
  │  → GET /api/v1/oc/invitations/lookup?token=...  (public route, no auth)
  ▼
Invitee sees which client they're joining, chooses a password
  │  POST /api/v1/oc/invitations/accept  { token, credential }  (public route, no auth)
  ▼
InvitationService.acceptInvitation() — real orchestration of askabd-identity's REAL HTTP API:
  1. POST {IDENTITY_URL}/v1/identities           (create the real identity)
  2. POST {IDENTITY_URL}/v1/identities/:id/verify (auto-verify — the email click already proved ownership)
  3. POST {IDENTITY_URL}/v1/identities/:id/credential/store (set the chosen password)
  4. ClientIdentityMappingService.createMapping()  (grant real access to THIS client only)
  5. POST {IDENTITY_URL}/v1/auth/login             (real login, same real credential)
  │
  ▼
oc_invitations row updated (status: accepted, accepted_identity_id recorded)
Real access/refresh tokens returned → apps/web stores the real session → redirects to
/client-portal/:clientId, which is now the exactly-one client this org_context is authorized for.
```

## Ownership boundary — who owns what, and why

| Concept | Owned by | Why |
|---|---|---|
| Identity (login, password, MFA, sessions) | askabd-identity | Its own domain — untouched by this milestone, per the explicit "preserve the existing identity service architecture" requirement. |
| `oc_clients` (AskABD's consulting customers) | askabd-comparison | Always has been. |
| `client_identity_mapping` (org↔client access) | askabd-comparison | A concept askabd-identity has no model for and doesn't need one for — see `docs/askabd-tenant-model.md`. |
| `oc_invitations` (the onboarding bridge) | askabd-comparison | Same reasoning — an invitation is "AskABD granting access to one of its own clients," not an identity-service concept. |

No new identity engine was built. No duplicate auth system was built. Every credential
check, every password rule, every token — all real askabd-identity calls, unchanged.

## What is NOT part of this architecture (explicitly, not silently)

- **No self-service signup.** Every account starts from an admin-created invitation.
  There is no "create your own account" path, by design — matches the explicit brief
  ("AskABD admin: create/select client → invite user").
- **No customer self-service invitations** (a logged-in customer inviting their own
  teammates). Only Admin.Access-holding AskABD staff can create invitations today.
- **No org/organization-level admin role.** `client_identity_mapping` grants a whole
  `org_context` access to a client; there's no sub-role within that org_context
  (e.g. "this teammate can only view, not act") — every identity sharing an org_context
  gets identical access, per the existing RBAC model (roles come from the identity's
  own token claims, not from anything invitation-specific).
- **No password-reset flow wired into this journey.** askabd-identity has a real
  `/credential/reset/request` / `/credential/reset/confirm` pair; nothing in
  `apps/web` calls it yet (no "forgot password" link on `/login`).
- **The internal AskABD staff console (`/clients/:clientId/*`, ~50 pages, including the
  new Invitations admin page) has no real staff authentication wired at all** — every
  page there uses a plain, unauthenticated `fetch`, relying entirely on
  askabd-comparison's DEV bypass. This is a large, pre-existing gap this session did
  not introduce and did not fix (it predates this milestone and spans the entire
  console, not just the new Invitations page) — see
  `docs/customer-portal-security-review.md` for the full split between what IS and
  ISN'T really authenticated in this codebase today.

## Database schema added this pass

- `apps/api/src/db/migrations/024_client_identity_mapping.sql` — see `docs/askabd-tenant-model.md`.
- `apps/api/src/db/migrations/025_client_invitations.sql` — `oc_invitations` (client_id,
  org_context, email, token_hash, status, invited_by, expires_at, accepted_at,
  accepted_identity_id, revoked_at/by, resent_count, last_sent_at). Only the SHA-256
  hash of the raw token is ever persisted.

Both are additive-only (`CREATE TABLE IF NOT EXISTS`), applied to the real local
Postgres this session, verified live (see `docs/production-readiness-final.md`).
