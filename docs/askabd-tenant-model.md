# AskABD Tenant Model — User / Organization / Client / Resource

**Date:** 2026-08-17. Answers Phase 4's explicit questions with real evidence from both
repositories' actual schemas — no assumption that `organization = client`.

## The two, currently disconnected, tenancy concepts

```
askabd-identity's world:              askabd-comparison's world:

USER (identity)                        oc_clients
   │ org_context (scalar,                  │ (AskABD's own consulting
   │  1 per identity)                      │  customer companies)
   ▼                                       ▼
ORG_CONTEXT                            SERVICES / CONNECTORS / REQUIREMENTS /
(a string — no Organization             COMMERCIAL ENGAGEMENTS / DOCUMENTS /
 entity table exists)                   AUDIT / etc. (all scoped by client_id)
```

**No code anywhere maps one to the other.** This was established in the prior Identity/Tenant
milestone and re-confirmed this milestone by reading every relevant migration in both
repositories directly.

## Answering Phase 4's exact questions, with evidence

**Can one organization own multiple clients?** No mechanism exists to express this today —
`org_context` is a string on `askabd-identity`'s `identities` table; `oc_clients` in
`askabd-comparison` has no `org_context`/`organization_id` column at all (confirmed by reading
every `oc_*` migration). There is no `organizations` table anywhere that a client could belong
to. This is not "no" as a business answer — it's "the schema has no way to represent it yet."

**Can a user belong to multiple organizations?** **No**, not in the current schema —
`askabd-identity`'s `UNIQUE (org_context, identifier)` constraint plus the scalar `org_context`
column on `identities` means one identity row = exactly one org context. A user needing access to
a second organization would need a second, separate `identities` row (a different `identifier`
uniqueness scope), not a membership relationship.

**Can a user access multiple clients?** In practice, **yes, but only via the `admin`/`super_admin`
role**, per the tenant-access boundary built in the prior milestone
(`apps/api/src/platform/rbac/tenant-access.ts`) — an explicit, documented, coarse-grained
privileged capability, not a per-client grant list. There is no mechanism for a non-admin user to
be scoped to a specific SUBSET of clients (e.g., "this account manager may see clients A and C but
not B") — the only two states available today are "admin: all clients" or "everyone else: no
clients."

**Can a client belong to one organization?** N/A given the above — `oc_clients` has no
organization reference of any kind.

**Can clients be transferred?** N/A — there is no ownership field to transfer.

**Can organization administrators manage multiple clients?** This collapses into the same answer
as "can a user access multiple clients" above, since `askabd-comparison` has no concept of an
"organization administrator" distinct from its own `admin`/`super_admin` roles — those roles are
not organization-scoped, they are platform-wide.

## Why no schema was invented to close these gaps

Per this milestone's explicit instruction ("If a required relationship does not exist, DO NOT
immediately create a schema... If a business decision is genuinely required: document it and
continue unrelated work"): every one of the above is a genuine, unresolved **business decision**,
not a technical gap that has an obviously-correct answer:
- Should `askabd-comparison`'s `oc_clients` gain an `org_context` (or a new `organization_id`)
  column, and if so, is it a 1:1 or many:1 relationship to `askabd-identity` organizations?
- Should `askabd-identity`'s `identities` table move from a scalar `org_context` to a real
  many-to-many `memberships` table (the `@askabd/shared-contracts` `Membership` type already
  exists for exactly this, unused — see `docs/identity-real-contract.md`)?
- Is "admin sees everything, everyone else sees nothing" the intended long-term model, or is a
  finer-grained "this staff member is scoped to clients A and C" model actually wanted?

None of these has a single obviously-correct technical answer inferable from the existing code —
they are product/business decisions. **STOPPED HERE, documented, not invented.** Everything else
in this milestone that does not depend on this decision was completed regardless (see the final
report).

## What IS safely enforced today, regardless of this open question

The tenant-access boundary (prior milestone, re-verified this milestone) already gives a correct,
fail-closed answer for the CURRENT, real state of the schema: since no per-client mapping exists
for any role, only the roles that are DESIGNED to be platform-wide (`admin`/`super_admin`) may
cross client boundaries; everything else is denied. This is not a placeholder pending the business
decision above — it is the objectively correct, safe behavior given what the schema actually
contains right now, and it does not need to be revisited unless the business decision above
introduces a real mapping that should relax it.

## Update (2026-08-18) — RESOLVED: real mapping table implemented

The business decision above is resolved. The user explicitly chose "Add a real mapping table"
(rejecting an `org_context == client_id` naming convention as insufficient — it was never
implemented) and specified 30 numbered requirements governing exactly how. Implemented as:

- **New table**: `client_identity_mapping` (askabd-comparison,
  `apps/api/src/db/migrations/024_client_identity_mapping.sql`) — `(client_id, org_context)` pairs,
  `status` (`active`/`revoked`), `created_by`/`revoked_at`/`revoked_by`. Lives entirely on the
  askabd-comparison side — askabd-identity's own schema/architecture is untouched, per the
  explicit "preserve the existing identity service architecture" requirement. One `org_context`
  can map to multiple `client_id`s (and vice versa) — a real UNIQUE constraint per pair, not a
  1:1 assumption.
- **New service**: `ClientIdentityMappingService`
  (`apps/api/src/services/client-identity-mapping-service.ts`) — the sole place client-scope
  resolution happens: `resolveAuthorizedClientIds(orgContext)` / `isAuthorized(orgContext,
  clientId)` (read path), `createMapping`/`revokeMapping` (write path, both audited via the
  existing `oc_audit_log` table — no new audit mechanism invented). Idempotent revoke, upsert-style
  reactivation of a previously-revoked mapping (never a duplicate row).
- **Server-side-only resolution, enforced**: `platform/rbac/tenant-access.ts` now resolves the
  authorized client set from the VERIFIED JWT's `org` claim (`auth.tenantId`, set only after real
  signature/issuer/audience/expiry verification) and checks the request's client ID for
  MEMBERSHIP in that server-resolved set — a client ID supplied by the request (URL/body/query)
  is never trusted to expand access, exactly as required. `admin`/`super_admin` still cross all
  client boundaries unconditionally (existing, still-tested behavior) — everyone else requires an
  active mapping; no mapping → denied; revoked mapping → denied.
- **New `GET /api/v1/oc/me`** (`operations-center-routes.ts`) — lets a real frontend discover
  which client(s) an authenticated identity may see, resolved server-side, before it ever makes a
  client-scoped call.
- **Tests**: `apps/api/tests/client-identity-mapping.test.ts` (19 tests, real Postgres, real
  fixtures cleaned by exact ID) — service-level create/revoke/reactivate/audit/multi-client, and
  middleware-level cross-tenant isolation: a customer mapped to client Alpha is denied client Beta
  even though Beta is a real, valid client ID (the literal acceptance criterion); symmetric denial
  the other direction; an unmapped org denied a real client; multiple different users (different
  `sub`) sharing one `org_context` get identical, correct access; a mapping revoked mid-session
  denies the very next request; admin/super_admin unconditional cross-client access still holds.
  Existing `tests/tenant-access.test.ts` (12 tests, unmodified) and
  `tests/tenant-access-body-query.test.ts` (6 tests) continue to pass unchanged. Full API suite:
  260/260 passing, `tsc --noEmit` clean, both API and web production builds clean.
- **Minimal real client login UI** (`apps/web/src/app/login/page.tsx`,
  `apps/web/src/app/lib/session.ts`) — a real (org, email, password) form calling askabd-identity's
  actual `/v1/auth/login`, then this app's `/api/v1/oc/me` to discover the authorized client(s),
  storing the real session in `sessionStorage` (documented interim limitation — not yet a
  cookie-based BFF). `client-portal/[clientId]/page.tsx` gained a real auth guard: no session →
  `/login`; a 401 → session cleared, redirected to `/login`; a 403 → an explicit "Access denied"
  screen (never a blank page, never silently treated as "no data yet"); a "Sign out" action.
- **Live, real, cross-repository, cross-process verification performed** (not simulated): two real
  identities registered/verified/logged-in against a real running askabd-identity (real Postgres),
  two real `oc_clients` created, one mapping each to a different organization. Against a real,
  production-shaped (`devBypass` disabled, real `JWKS_URL`) running askabd-comparison instance:
  each user's real token was accepted for their own mapped client and rejected (403) for the
  other's real, valid client ID, and rejected (401) with no token at all. **Live browser UAT**
  (not just curl) through the actual login page confirmed the same: real login → redirected to the
  correct, authorized client; direct URL navigation to the other organization's real client →
  "Access denied" (never their data); a page refresh while denied stays denied; navigating back to
  the authorized client works again; Sign out clears the session and redirects to `/login`; a
  direct URL to a previously-authorized client after sign-out redirects to `/login` rather than
  showing stale data. All test fixtures (2 identities, 2 clients, 2 mappings, related audit rows)
  were deleted by exact ID afterward; the `signing_key` row and all other real platform state were
  left untouched.
- **What is NOT yet built**: an admin-facing UI for creating/revoking mappings (the service and
  its tests exist; only the HTTP surface for admins to call it is not yet wired to a route/UI —
  mappings were created directly via the service in this verification). The client-portal
  "journey" sub-page (`client-portal/[clientId]/journey/page.tsx`) still uses unauthenticated
  `fetch` calls — not yet updated to the new `authFetch` pattern; a real gap, not silently ignored.
  Client invitation and onboarding UI (creating a brand-new client + inviting their first user,
  which is presumably how mappings get created in the intended real flow) remains unbuilt — this
  was task #115, not attempted this pass.
