# Invitation Lifecycle

**Date:** 2026-08-20. Real root cause found during manual UAT: the same customer
email could appear as multiple invitation rows, and staff had no way to reuse or
renew an existing invitation without it looking like a duplicate.

## Root cause (confirmed, reproduced live before the fix)

`invitation-service.ts`'s `createInvitation()` only checked for an existing row
with `status = 'invited'` before inserting a new one — a plain `SELECT` followed by
an `INSERT`, not atomic. Once an invitation was **accepted**, that check no longer
matched anything, so re-inviting the same email created a genuinely new, separate
row sitting right next to the accepted one — exactly the "same email, multiple
rows" bug reported. Live evidence found in this repo's own preserved UAT data
before the fix: `uat.customer@example.com` had one `accepted` row and one
`invited` row for the same client.

## The model: invitation as a persistent business object

```
CREATED → PENDING → ACCEPTED
PENDING → REVOKED
PENDING → EXPIRED           (derived from expires_at, not a separate flag)
EXPIRED → RENEWED → PENDING (same row, id unchanged, token rotated)
```

`createInvitation()` (`apps/api/src/services/invitation-service.ts`) now always
looks for a reusable existing row (same `client_id` + normalized — trimmed,
lowercased — email) **before** creating anything:

| Existing row's real state | Action |
|---|---|
| `invited`, not expired | **Reuse** — return the existing row as-is. No new row, no new email. |
| `invited`, expired | **Auto-renew** — same row, id unchanged, token rotated, fresh email sent. |
| `accepted`, mapping still active | **Reject** (`already_a_member`, 409) — re-inviting an active member is a real error, not silently ignored. |
| `accepted`, mapping since revoked | **New row** — a real, distinct re-invitation is appropriate. |
| `revoked` | **New row** — a real, staff-decided terminal state; never silently reused. |

## Database is the final authority (concurrency)

Application-level check-then-insert is inherently racy. Migration
`032_invitation_dedupe_and_normalization.sql` adds:

```sql
CREATE UNIQUE INDEX idx_oc_invitations_one_active_per_client_email
  ON oc_invitations (client_id, lower(trim(email)))
  WHERE status = 'invited';
```

If two requests race past the application-level pre-check, the loser's `INSERT`
fails with Postgres error `23505` (unique_violation); `createInvitation()` catches
exactly that code, re-reads the winner's row, and returns it as a reuse — the
caller-facing contract is always "you get back one usable invitation," never a raw
500 and never two live rows. **Proven** by a real concurrency test
(`apps/api/tests/invitation-service.test.ts`, `Promise.all` of two simultaneous
`createInvitation` calls for the same client+email) — exactly one row exists
afterward, both calls return `ok: true` resolving to the same id.

## Path A — email link (new OR returning customer)

`POST /api/v1/oc/invitations/accept` (public — the token itself is the
authorization):

1. Attempt to create the identity. `201` → new customer: verify, set the chosen
   password, create the mapping, log in, mark accepted.
2. `409 identifier_exists` → **a real returning customer** (the multi-client case:
   they already have an AskABD account and are accepting a second/Nth client's
   invitation with the same email). Rather than hard-failing, the service attempts
   a real login with whatever the invitee just typed, treated as their EXISTING
   password:
   - Succeeds → create the mapping for THIS invitation's client, mark accepted,
     return the real session. The accept-invitation page (`(auth)/accept-invitation/page.tsx`)
     relabels itself in place ("An account already exists... enter your existing
     password") rather than presenting a dead end.
   - Fails → honest `identity_conflict` error; the invitee can retry with their
     real password.
   - MFA-enrolled account → real `mfa_required` outcome, handled by a real 6-digit
     code screen on the same page, identical pattern to the normal login flow.

   **Live-verified** (this pass): a real customer accepted a second client's
   invitation using their real existing password; both `client_identity_mapping`
   rows exist independently; a wrong password on the second attempt was honestly
   rejected first.

## Path B — existing account, no link at all

A customer who already has an account can simply sign in at `/login` normally.
After a successful login (and before deciding where to land), the frontend calls
the new `GET /api/v1/oc/me/pending-invitations` — matched by the caller's own
**verified `org_context`** (the same authorization key `client_identity_mapping`
already uses everywhere else in this schema — never email, since askabd-identity
exposes no email-based lookup and this platform has no other email-keyed
authorization concept), excluding anything already mapped. If any are found, a
real "You have a pending invitation" screen lists each one (client name resolved
server-side, organization, invited email, expiry) with an explicit **Accept**
button — nothing is auto-granted merely because the org_context matches. Accepting
calls `POST /api/v1/oc/me/pending-invitations/:id/accept`, which is tenant-isolated
the same way: the invitation's own `org_context` must equal the caller's, or the
response is an indistinguishable 404 (no enumeration).

**Live-verified** (this pass): logged in as an existing customer with one existing
workspace and one pending invitation to a second client — the pending screen
appeared, Accept created the second real mapping, and the multi-client workspace
picker showed both real client names afterward. A cross-tenant accept attempt
(different `org_context`) was rejected as a plain 404, and the real
`client_identity_mapping` table confirmed no grant was created.

## Admin UI (`(app)/clients/[clientId]/invitations/page.tsx`)

Actions now match the real lifecycle instead of a generic "Resend":

- **Pending**: Review (detail modal, no secrets shown), Copy Link (rotates the
  token silently, copies the fresh URL — no email sent), Renew (rotates AND
  re-sends the real email), Revoke.
- **Accepted**: View Client.
- **Revoked**: Create New Invitation (pre-fills the form).
- The "Organization ID" free-text field (previously an unexplained `acme-corp`
  placeholder) now has a `<datalist>` of real, previously-used org_context values
  (`GET /api/v1/oc/org-contexts`, drawn from real mappings + invitations, never
  fabricated) plus plain-language help text explaining it is the customer's own
  organization identifier, not this AskABD client. A rigid dropdown was
  deliberately NOT used — a brand-new customer organization is a legitimate,
  common case a fixed enum would block; the client itself is already
  unambiguous on this page (it's the page's own URL param), so no client
  selector was needed here.
- Status badges carry both an icon and text (never color-only).

## Security (unchanged, re-verified)

Tokens remain cryptographically random (`randomBytes(32)`), stored only as a
SHA-256 hash, single-use (`token_hash` looked up, invitation marked `accepted`
immediately), invalid after acceptance or revocation, rotated on renewal, and
never appear in logs or the audit trail (`audit()` only ever receives
`clientId`/`orgContext`/`email`/`path` — never the token or `acceptUrl`). The raw
token/acceptUrl is returned to the (already-authenticated, Admin.Access-gated)
staff caller's HTTP response exactly once, at the moment it's generated
(create/renew/copy-link) — never persisted, never re-fetchable afterward.

## Tests added this pass

`apps/api/tests/invitation-service.test.ts` (15 tests, up from 7) and
`apps/api/tests/invitation-routes.test.ts` (9 tests) and the new
`apps/api/tests/pending-invitations-routes.test.ts` (4 tests) cover: create,
reuse (never duplicate, case/whitespace-insensitive), auto-renew-on-expiry,
real concurrency (two simultaneous creates → one row), revoke idempotency, renew
(token rotation + email), copy-link (rotation, no email), renewing a
revoked/accepted invitation (honest failure), no-enumeration lookup, the full
real accept flow (new account), the real multi-client returning-customer accept
flow (existing password success + wrong-password honest rejection), pending
detection (present until mapped, gone after), authenticated-accept (tenant
isolation — a different org_context gets 404, real org_context succeeds and the
real mapping exists afterward), and HTTP-level RBAC gating for every admin route
including the two new ones (`/renew`, `/link`).
