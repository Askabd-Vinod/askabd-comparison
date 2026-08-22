# Tenant/Client Authorization Matrix

> **SUPERSEDED 2026-08-19** — this document's central claim ("no tenant mapping exists anywhere,
> and none was invented") is no longer true: `client_identity_mapping` and the real
> askabd-identity/JWKS integration now provide exactly that mapping, live-proven with real
> identities. See `docs/final-adversarial-security-audit.md` for the current state. Kept below,
> unedited, as an accurate historical record of the 2026-08-17 state.

**Date:** 2026-08-17. Built from direct inspection of `apps/api/src/platform/rbac/*`,
`apps/api/src/routes/operations-center-routes.ts`, and the database schema — not assumed.

## Tenant model — what exists, what does not (Phase 4)

```
IDENTITY (askabd-identity, external)
  ↓ org_context   [askabd-identity's OWN multi-tenancy dimension — verified via
  |                 identity-manager.ts / authorization-service.ts]
  ↓
  ??? — NO MAPPING EXISTS ANYWHERE ???
  ↓
oc_clients.client_id   [this repository's consulting-customer entities]
  ↓
RESOURCES (services, connectors, requirements, commercial engagements,
           documents, audit history, incidents, defects, migrations, ...)
```

**Confirmed by direct inspection, not assumed:**
- `oc_clients` and every other `oc_*` table (`\d` against the running database, and every
  migration file `006`–`0NN`) has **no** `org_context`, `identity_id`, `tenant_id`, or
  `owner_user_id` column. The only `tenant_id` column anywhere in this database belongs to the
  original e-commerce comparison tables (`category`, `item`, `brand`) and defaults to the
  literal string `'public'` — a different, older product surface, unrelated to the Operations
  Center.
- `apps/web` sends no `Authorization` header on any request (re-confirmed this milestone,
  unchanged since the prior Identity/RBAC audit) — there is no live path today that presents a
  real, role-bearing identity to this API at all. All current usage is via the DEV bypass.
- Per `docs/identity-token-contract.md`, the real `askabd-identity` token's `org` claim is that
  service's own tenancy concept, not a `client_id`. Nothing anywhere provisions or guarantees
  the two align.

**Conclusion:** there is no trustworthy, existing way to answer "which specific `oc_clients`
row(s) is this authenticated identity allowed to see" for any role other than the platform's own
broad-access roles. Per this milestone's explicit instruction ("do not invent a mapping"), none
was invented.

## Resource Access Matrix (Phase 6)

Built from the **existing** RBAC role catalog (`platform/rbac/roles.ts`) — no new roles were
invented. Note the pre-existing catalog was built for the original e-commerce catalog product
(Product/Category/Merchant/Campaign) and has **zero Operations-Center-specific permissions**;
`Admin.Access` is reused throughout as the only OC-relevant permission that already existed,
matching the pattern already established in the prior Service Governance milestone.

| Role | Own-client OC data (read) | Other-client OC data (read) | Governance/approval actions (enable/disable/confirm/approve/transition/execute) | Admin |
|---|---|---|---|---|
| `super_admin` | ALLOW (cross-client, wildcard permissions) | ALLOW — documented privileged capability, see below | ALLOW | ALLOW |
| `admin` | ALLOW (cross-client) | ALLOW — documented privileged capability, see below | ALLOW (`Admin.Access`) | ALLOW |
| `business_user` | **DENY** (fails closed — no client mapping to grant scoped access) | DENY | DENY | DENY |
| `merchant` | DENY | DENY | DENY | DENY |
| `partner` | DENY | DENY | DENY | DENY |
| `support` | DENY | DENY | DENY | DENY |
| `auditor` | DENY | DENY | DENY | DENY |
| `customer` | DENY | DENY | DENY | DENY |
| No role / unauthenticated | DENY (401 if unauthenticated, 403 if authenticated with no matching role) | DENY | DENY | DENY |

This is **not invented staff behavior** — it is the necessary consequence of the confirmed
absence of a tenant mapping (Phase 4), applied uniformly and fail-closed to every role that
isn't already an established, tested, broad-access role. It does not change any *documented*
product requirement, because no such requirement (customer-scoped or staff-scoped OC access)
exists anywhere in this codebase to begin with.

## Admin cross-tenant access (Phase 15) — explicit, documented, not assumed

**Determination: YES, intentionally.** Evidence:
1. The platform's own operating model (confirmed by the "convert to managed service — remove
   customer auth" commit, `2c288ff`, and reconfirmed this milestone) is an **internal
   consulting-staff console** — AskABD account managers/admins work across many client
   engagements as their actual job function. There is no live customer-facing login at all.
2. `admin`/`super_admin` are already the platform's broad-access roles for every other resource
   type in the existing RBAC catalog (full `Admin.Access`/`*` wildcard).
3. The DEV bypass — used for 100% of real usage today — already grants `super_admin`
   unconditionally, meaning cross-client access is the platform's actual current behavior in
   every environment that has been used so far.

This capability is now **explicit** (enforced in code by
`apps/api/src/platform/rbac/tenant-access.ts`, tested in `apps/api/tests/tenant-access.test.ts`)
rather than an unstated side effect of "nothing checks anything."

## What IS enforced after this milestone

- Every route whose Fastify path declares a `:clientId` parameter (or `:id` under
  `/api/v1/oc/clients/`) now requires `admin`/`super_admin` role for both read and write,
  enforced by `registerTenantAccessMiddleware` in `server.ts`. This covers the large majority of
  client-scoped OC routes: clients, lifecycle, connectors, discovery, assessment,
  recommendations, migration runs, client-services/requirements/documents, problems, gaps,
  transformations, optimization, portal, known-information, notification-preferences,
  escalations, compliance, services, service-bundles/recommended, engagements, payment-methods,
  transactions, reconciliation summary/exceptions, health-score/snapshot, Jira links.
- Governance/approval verbs on resources addressed by an **opaque ID** rather than `:clientId`
  (so not covered by the URL-param mechanism above) are individually gated to `Admin.Access` via
  explicit `COMPARISON_API_RULES` entries, reusing the exact pattern already established for
  service enable/disable: recommendation approve/reject, compliance exception transition,
  engagement transition, proposal transition, payment-method verify/disable, reconciliation
  execute/transition, reconciliation-exception transition.

## What is NOT yet covered (honest, explicit — Remaining P1, see final report)

Routes that mutate a resource addressed only by an opaque ID with **no** `:clientId` in the URL
and were **not** in the explicit high-priority governance-verb list above still fall through to
`defaultPolicy: 'authenticated'` (any valid token, any role). These require a per-resource-type
DB lookup to resolve which client owns the resource before a tenant check is possible — that is
real, non-trivial, per-resource-type work this milestone did not attempt to retrofit across
~15 different resource kinds under time/risk constraints. Known examples: problem/gap status
transitions and financial/effort updates (`:problemId`, `:gapId`), transformation status,
capability CRUD, optimization finding promote/acknowledge/resolve, workflow rule create/toggle,
scheduler job run/toggle, escalation acknowledge/resolve, document validate (this one DOES carry
`clientId` in its own path segment and IS covered), Jira config/test/issue-create,
defect verify. None of these expose cross-tenant *secrets* (see connector-credential finding
below) — the exposure, where it exists, is metadata/business-data visibility, not credential
leakage.

## Connector credential exposure (Phase 9) — investigated, lower severity than assumed

Read `apps/api/src/services/connector-service.ts` directly:
- `saveConfiguration()` **strips real secret values before they are ever persisted** — fields
  named `password`/`secret`/`token`/`clientSecret`/`externalId` are replaced with a masked
  placeholder (`••••••••`) before the `INSERT`/`UPDATE`. The raw value is never written to the
  database.
- `testConnection()` uses the raw field values transiently (in-memory, for the live outbound
  test call only) and explicitly does not pass them to `persistResult()` — confirmed by the
  parameter being prefixed `_fields` (intentionally unused).
- **Conclusion:** `GET /oc/connectors/:clientId` cannot leak an actual credential value for any
  client, because no actual credential value is ever stored. The real, remaining risk is
  **metadata disclosure** (which providers a client uses, connection status, security level,
  last-tested timestamp) — now closed by the tenant-access boundary above, since this route
  carries `:clientId` and is covered.
