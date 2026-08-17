# AskABD Enterprise Architecture — Cross-Repository Map

**Date:** 2026-08-17. Every relationship below is verified from source (imports, vendored
package manifests, docker-compose files, direct grep) — the assumed
website → identity → shared → comparison → workflow chain from this milestone's brief was
**not** taken as given; it was checked.

## What each repository actually is

| Repository | Purpose (verified) | Runtime | Database | Consumers |
|---|---|---|---|---|
| `askabd-website` | Public marketing site — static HTML pages (about, solutions, e-commerce feature pages, contact) | Cloudflare Pages (no server) | None | Public visitors |
| `askabd-identity` | Standalone identity/auth platform: identity CRUD, Argon2id credentials, TOTP MFA, sessions, its own RBAC (roles/permissions/policy-check), audit, webhooks, event publishing, typed SDK | Fastify API, `dev` on port 3100 | Its own PostgreSQL (`identity` DB, port 5432) + Redis | Intended to be called by other AskABD services (SDK exists for this) — **not currently called by any of them, verified by repo-wide grep, see below** |
| `askabd-shared` | Turborepo monorepo of small, generic, reusable TypeScript packages (contracts, errors, logging, validation, utilities, result, configuration, authorization engine, audit, health, monitoring, feature-flags, service-utils, config-validator, diagnostics) | Library only — no server | None | Vendored as pre-built `.tgz` files into `askabd-comparison` (15 packages) and `askabd-website`'s build tooling |
| `askabd-comparison` | The actual product: an Operations Center for AskABD's consulting engagements (clients, services, connectors, requirements, commercial engagements, migrations, engineering intelligence) plus a legacy e-commerce product-comparison catalog | Fastify API (port 4200) + Next.js web app (port 3001) | Its own PostgreSQL (`comparison` DB, port 5442) | The only repository with a real, currently-used web frontend |
| `askabd-workflow` | A standalone, dormant `RulesEngine` class (condition/rule-group evaluation, transition resolution) | Library skeleton — no server, no routes, no database, not even a git repository | None | Not imported by any other repository (verified by grep) |

## Verified integration reality — NOT the assumed chain

The brief's assumed chain (`website → identity → shared → comparison → workflow`) does **not**
match what exists:

```
askabd-website        [static, no backend calls to anything]

askabd-shared         [vendored .tgz packages] ──────┐
                                                       ├──► askabd-comparison (API + web)
askabd-identity        [NOT currently called by       │     (the only live, integrated product)
                         anything — see below]  ╌╌╌╌╌╌┘
                         (would connect here IF the
                         Phase 2/3 blockers in
                         docs/identity-token-contract.md
                         were resolved)

askabd-workflow        [isolated, not imported anywhere]
```

Evidence:
- `grep -rn "identity\.askabd\|login\|signin\|/auth" askabd-website/*.html` → **no matches**. The
  marketing site has no link into any login flow.
- `grep -rn "Membership|OrganizationContext|belongsToOrganization"` across `askabd-identity/src`,
  `askabd-comparison/apps/api/src`, and `askabd-workflow/src` → **no matches anywhere**. The
  shared org/membership contract type (`askabd-shared/packages/contracts/src/organization.ts`)
  is defined and tested (11 tests) but consumed by nothing.
- `askabd-comparison/apps/api` sends no request to `askabd-identity` anywhere in its source (no
  `fetch`/`IdentitySdk` usage found) — confirmed in the prior milestone and re-confirmed this
  one. `askabd-comparison`'s own `middleware/auth.ts` verifies JWTs locally; it has never called
  `askabd-identity`'s `/tokens/validate` or `/policy/check` endpoints.
- `askabd-comparison` DOES vendor and use two real `askabd-shared` packages meaningfully:
  `@askabd/shared-authorization` (the RBAC engine powering every authorization decision in this
  session's prior milestones) and `@askabd/shared-contracts` (defines the `AuthContext`
  interface) — so the shared-library layer IS real and load-bearing, just not for the
  organization/membership piece.
- `askabd-workflow` has zero consumers anywhere in the workspace (grep for
  `workflow-platform`/`RulesEngine` outside its own repo returns nothing) and is not even under
  version control.

## Authoritative ownership (Phase 1 requirement)

| Domain | Authoritative owner | Evidence |
|---|---|---|
| Authentication (login, credentials, sessions, MFA) | `askabd-identity` | Only repository with credential storage, TOTP, Argon2id |
| Token issuance/verification | `askabd-identity` issues; `askabd-comparison` verifies locally (see identity-token-contract.md for why this is currently broken) | `token-service.ts` vs `middleware/auth.ts` |
| Authorization (roles/permissions) | **Split, unresolved** — `askabd-identity` has its own RBAC tables and a remote policy-check contract; `askabd-comparison` has a completely separate, static, in-code RBAC catalog (`platform/rbac/roles.ts`) with zero overlap | See `docs/identity-token-contract.md` |
| Users/Identities | `askabd-identity` | `identities` table |
| Organizations | `askabd-identity` (`org_context` scalar field on each identity) — but no organization ENTITY table exists, only the string value; `@askabd/shared-contracts` defines a fuller `OrganizationContext`/`Membership` model that nothing implements yet | `001_create_identities.sql`; `organization.ts` |
| Tenants/Clients | `askabd-comparison` (`oc_clients` table) — a completely different concept from `askabd-identity`'s `org_context`, see `docs/askabd-tenant-model.md` | `oc_clients` schema |
| Services/Capabilities | `askabd-comparison` (`oc_capabilities`, `oc_client_services`) | Confirmed across 4 prior milestones this session |
| Connectors | `askabd-comparison` (`oc_connectors`) | `connector-service.ts` |
| Requirements | `askabd-comparison` (`oc_client_service_documents`, requirements service) | |
| Workflow | **Unowned in practice** — `askabd-workflow`'s `RulesEngine` exists but is not wired into anything; `askabd-comparison` has its own inline `oc_workflow_rules` concept (`/oc/workflow/rules` routes) that does not use `askabd-workflow`'s engine | Confirmed by zero cross-repo imports |
| Notifications | `askabd-comparison` (`oc_notifications`, `/oc/notifications`) | |
| Audit | Both, separately: `askabd-identity` has its own `audit_events` table (identity-domain events only); `askabd-comparison` has its own `oc_audit_log` (operations-domain events only) — no shared audit store | Confirmed by separate migrations in each repo |
| Payments/Commercial Engagements | `askabd-comparison` (`oc_payment_methods`, `oc_commercial_engagements`) | |
| Migration/Engineering/Reporting | `askabd-comparison` | |

**No ownership is duplicated** across repositories for any domain — each table/concept has
exactly one authoritative source. The only genuine ambiguity is **authorization**, where two
independent, non-communicating RBAC systems exist (see `docs/identity-token-contract.md`'s
"Compatibility conclusion" for the full analysis) — not duplication, but a real integration gap.
