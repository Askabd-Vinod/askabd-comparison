# AskABD Staff Authentication Architecture

**Date:** 2026-08-18. Answers the 10 investigation questions from source before any
implementation — no guessing, per this milestone's explicit stop condition.

## The 10 questions, answered from actual source

**1. How is a user represented?** A single `identity` row in askabd-identity
(`src/db/migrations/001_initial_schema.sql`): `id`, `identifier`, `org_context`
(scalar string — one org per identity), `identity_type`, `verification_status`. No
concept of "customer" vs "staff" exists at this layer — an identity is just an
identity.

**2. How are staff users represented?** **They previously weren't**, at any layer.
`identity_type`'s real enum values (`human_user`, `service_account`, `api_client`,
`machine_identity`, `federated_identity`, `guest_user`) contain nothing meaning
"AskABD staff." The only real signal available is `org_context` (a staff member's own
organization — by convention, `askabd-internal` in this environment, not a hardcoded
requirement) — but by itself, org_context alone does not grant any capability.

**3. How are roles represented?** **Two separate, non-integrated systems**, confirmed
by reading both:
- askabd-identity has its own `role`/`permission`/`role_assignment`/`role_permission`
  tables (migration 001), scoped by `org_context` — that service's OWN internal RBAC
  for managing identities within an org. Never surfaced in the JWT, never consumed by
  askabd-comparison.
- askabd-comparison has an entirely separate RBAC engine (`platform/rbac/`:
  `roles.ts`, `engine.ts`, `middleware.ts`) with its own role vocabulary (`customer`,
  `business_user`, `admin`, `super_admin`, `merchant`, `partner`, `support`,
  `auditor`) and its own permission set (`Product.Read`, `Admin.Access`, etc.) —
  entirely local to this application, unrelated to identity's own role tables.

**4. How are permissions represented?** Same split as above — askabd-comparison's
`Admin.Access`-style permissions are resolved from `ROLE_MAP`
(`platform/rbac/roles.ts`) given a role list. **The real defect this milestone found
and fixed**: that role list was read exclusively from the JWT's `roles` claim
(`middleware/auth.ts` → `middleware.ts`'s `extractRoles`) — and a real
askabd-identity access token carries **no such claim** (confirmed directly from
`token-service.ts`'s real claim set: `sub`/`org`/`sid`/`iat`/`exp`/`jti`/`kid`/`aud`
only). Every genuinely real token therefore resolved to zero permissions — no real
identity could ever pass an `Admin.Access` check; every "admin" capability exercised
in this platform's testing before this milestone was only ever reachable through DEV
bypass.

**5. How does Admin.Access actually work?** `platform/rbac/engine.ts`'s
`authorizeAny()` checks the resolved permission set (derived from the resolved role
list via `ROLE_MAP`) against a route's required permissions — purely a local,
in-process check. Never calls askabd-identity.

**6. How is organization context represented?** The verified JWT's `org` claim
(`auth.tenantId`) — the SAME mechanism `client_identity_mapping` already uses (see
`docs/askabd-tenant-model.md`). Reused, not reinvented, for staff.

**7. How does identity service policy authorization work?** `POST /v1/policy/check`
— a remote, per-decision HTTP call (`{X-Org-Context, identityId, action,
resourceType}` → `{decision}`), scoped to identity's own org-scoped role tables (see
Q3). **Not used here** — adopting it for askabd-comparison's own authorization
decisions would mean a network call on every authorized request with no agreed
failure-mode policy (fail open/closed on identity being slow/down), which this
milestone's own brief explicitly named as out of scope to invent unilaterally (see
`docs/identity-token-contract.md`'s "Compatibility conclusion").

**8. Can a staff user belong to an AskABD internal organization?** Yes — nothing
prevents provisioning a real identity with `org_context = 'askabd-internal'` (or any
value an operator chooses); this is a convention, not a hardcoded requirement enforced
anywhere in code. The REAL authorization boundary (see below) does not depend on this
convention at all.

**9. How are super_admin/admin users distinguished?** By the resolved role list from
whichever source is used. Before this milestone: the (structurally broken) JWT claim.
After this milestone: `staff_role_assignment` (see below).

**10. What is the safest production-compatible model?** A real, database-backed grant
table — owned by askabd-comparison (not askabd-identity, not a JWT claim), following
the EXACT pattern already proven for `client_identity_mapping`: askabd-identity stays
a pure "who is this, is this token real" service; askabd-comparison owns its own
application-level authorization concerns via real, auditable, revocable database rows.

## The real fix: `staff_role_assignment`

`apps/api/src/db/migrations/026_staff_role_assignment.sql` — `(identity_id, role,
status, granted_by, granted_at, revoked_by, revoked_at)`, keyed by the real
askabd-identity `sub` claim (not org_context — different staff sharing one
organization can hold different roles, least-privilege). `StaffRoleService`
(`services/staff-role-service.ts`) is the real, tested, audited CRUD layer.
`platform/rbac/middleware.ts` now resolves roles from BOTH the JWT claim (kept for
backward compatibility with tests/tooling that forge a token carrying its own roles
claim) AND this table (the real, production path) — merged, deduplicated. An identity
with zero rows here has zero roles, full stop — the honest definition of "not staff."

## Two separate security domains, one real authentication service

```
/login (customer)                    /staff/login (AskABD staff)
   │                                     │
   └──────────────┬──────────────────────┘
                   ▼
        askabd-identity /v1/auth/login  (the ONE real auth system — no duplicate)
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
  client_identity_mapping   staff_role_assignment
  (which client(s)?)         (which roles?)
        │                     │
        ▼                     ▼
  /client-portal/:id        /clients, /platform, ... (internal console)
```

Both login pages call the exact same real identity endpoint. The distinction is
entirely server-side and post-login: `/staff/login` additionally requires
`GET /api/v1/oc/me` to return a non-empty `roles` array (i.e., at least one active
`staff_role_assignment` row) before accepting the session — an identity with zero
grants (every real customer, by construction, since the invitation flow never creates
one) is refused, even though the underlying identity login itself succeeded.

## Client-side separation, server-side enforcement

- `apps/web/src/app/lib/session.ts` (customer) and `staff-session.ts` (staff) use
  **separate `sessionStorage` keys** — never conflated, never cross-attached.
- `apps/web/src/app/components/staff-auth-guard.tsx`, mounted once in the root
  layout, redirects any guarded route (everything except `/login`,
  `/accept-invitation`, `/client-portal/*`, `/staff/login`) to `/staff/login` when no
  real staff session exists, and installs a fetch interceptor that attaches the real
  staff token to the app's own API calls made from a guarded route — without editing
  each of the ~57 individual internal-console page files.
- **The client-side guard is a UX convenience, not the security boundary.** The real
  boundary is server-side: `platform/rbac/middleware.ts`'s DB-backed role resolution,
  proven live (see `docs/production-readiness-final.md`) to return 401 with no token,
  403 with a real customer token (zero roles), and 200 only for a real token backed
  by a real, active `staff_role_assignment` row — verified via direct HTTP calls
  independent of any frontend code.

## The bootstrap problem, solved without a backdoor

A fresh deployment has zero `staff_role_assignment` rows — no real token could ever
satisfy `Admin.Access` to grant the very first one. `POST /api/v1/oc/staff/roles`
(the ONLY route with this exception) allows a real, authenticated identity to grant
**themselves** a role **only** when the table is genuinely empty — closed permanently
the instant any row exists. Verified live: the real first staff identity bootstrapped
itself as `super_admin`; a second real identity's attempt immediately afterward
(same empty-table window closed) was denied (403); no identity, at any point, could
grant a role to someone else via this path (tested).

## What remains open (documented, not silently skipped)

- No UI yet for staff to manage OTHER staff's role assignments (the service and API
  routes exist and are tested; the admin console page for it is not built).
- The client-side guard's session-freshness check runs on pathname change, not
  continuously — a session revoked while the user sits idle on an already-loaded page
  is only caught on their next navigation, not instantly. The server-side check on
  the very next real API call is unaffected and remains authoritative.
- Staff self-service password reset is not wired into `/staff/login` (same gap as the
  customer `/login` page — askabd-identity's real reset endpoints exist, unused by
  either frontend).
