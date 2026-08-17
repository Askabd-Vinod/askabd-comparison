/**
 * AskABD Platform — Route Authorization Rules
 *
 * Declarative route → permission mappings for the Comparison API.
 * These rules are evaluated by the authorization middleware.
 *
 * Principle: define rules once, enforce everywhere.
 * New routes automatically inherit the default policy (authenticated).
 * Only routes with specific permission requirements need explicit rules.
 */

import type { RouteRule } from './types.js';

/**
 * Comparison API route authorization rules.
 * Pattern: more specific rules first, broader rules last.
 */
export const COMPARISON_API_RULES: readonly RouteRule[] = [
  // ─── Admin Routes (require admin permissions) ───────────────────────────────
  { method: 'POST', path: '/api/v1/admin/templates', permissions: ['Template.Create'] },
  { method: 'GET', path: '/api/v1/admin/templates', permissions: ['Template.Read'] },
  { method: 'POST', path: '/api/v1/admin/templates/:id/attributes', permissions: ['Template.Create'] },
  { method: 'PUT', path: '/api/v1/admin/attributes/:id', permissions: ['Template.Update'] },
  { method: 'DELETE', path: '/api/v1/admin/attributes/:id', permissions: ['Template.Delete'] },

  // ─── Merchant Routes (require merchant permissions) ─────────────────────────
  { method: 'POST', path: '/api/v1/merchants', permissions: ['Merchant.Create'] },
  { method: 'PUT', path: '/api/v1/merchants/:id', permissions: ['Merchant.Manage'] },
  { method: 'POST', path: '/api/v1/merchants/:id/verify', permissions: ['Merchant.Approve'], roles: ['admin', 'super_admin'] },

  // ─── Write Operations (require specific permissions) ────────────────────────
  { method: 'POST', path: '/api/v1/categories', permissions: ['Category.Create'] },
  { method: 'PUT', path: '/api/v1/categories/:id', permissions: ['Category.Update'] },
  { method: 'DELETE', path: '/api/v1/categories/:id', permissions: ['Category.Delete'] },

  { method: 'POST', path: '/api/v1/items', permissions: ['Product.Create'] },
  { method: 'PUT', path: '/api/v1/items/:id', permissions: ['Product.Update'] },
  { method: 'DELETE', path: '/api/v1/items/:id', permissions: ['Product.Delete'] },

  { method: 'POST', path: '/api/v1/comparisons', permissions: ['Comparison.Create'] },

  // ─── Read Operations (authenticated is sufficient) ──────────────────────────
  { method: 'GET', path: '/api/v1/categories*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/items*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/comparisons*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/search*', authenticatedOnly: true, permissions: [] },
  { method: 'POST', path: '/api/v1/compare', authenticatedOnly: true, permissions: [] },

  // ─── Merchant Portal (read: authenticated, write: merchant role) ────────────
  { method: 'GET', path: '/api/v1/brands*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/merchants*', authenticatedOnly: true, permissions: [] },
  { method: 'POST', path: '/api/v1/brands', permissions: ['Merchant.Create', 'Admin.Access'] },

  // ─── Client Service Assignment (governance-sensitive — admin only) ──────────
  // Only admin/super_admin may confirm or remove a client's service assignment.
  // The auth middleware (middleware/auth.ts) now reads real roles/permissions
  // claims from a verified token (fixed in the Identity/RBAC security
  // milestone — see docs/identity-rbac-architecture-audit.md); this rule is
  // fully enforced end-to-end, not just declared.
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/services/:serviceId/enable', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/services/:serviceId/disable', permissions: ['Admin.Access'] },

  // ─── Governance/approval verbs on resources not reachable by clientId URL ───
  // These mutate commercial, financial, or compliance state and use an opaque
  // resource ID (not `:clientId`) in their path, so they fall outside the
  // tenant-access boundary (platform/rbac/tenant-access.ts, which only covers
  // routes with a `:clientId`/`:id`-under-/clients param). Gated here to the
  // same Admin.Access permission already used for service governance above —
  // reusing the established pattern rather than inventing a new one. See
  // docs/tenant-authorization-matrix.md and the final report's "Remaining P1"
  // for the routes NOT yet covered by either mechanism.
  { method: 'POST', path: '/api/v1/oc/recommendations/:id/approve', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/recommendations/:id/reject', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/compliance/exceptions/:exceptionId/transition', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/engagements/:id/transition', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/proposals/:id/transition', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/payment-methods/:id/verify', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/payment-methods/:id/disable', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/payment-methods/:id/default', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/reconciliation/:id/execute', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/reconciliation/:id/transition', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/reconciliation/exceptions/:id/transition', permissions: ['Admin.Access'] },

  // ─── Cross-client aggregate reads (clientId is an OPTIONAL query filter) ────
  // These routes have no `:clientId` URL param — they take an optional
  // `?clientId=` query filter and, when it's omitted, return every client's
  // rows in one response. tenant-access.ts now also protects the filtered
  // case (a non-admin with a specific ?clientId= is denied, same as any other
  // client-scoped route), but the unfiltered "list everything" case needs its
  // own explicit gate — reusing Admin.Access rather than inventing a new
  // per-route mechanism.
  { method: 'GET', path: '/api/v1/oc/incidents', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/defects', permissions: ['Admin.Access'] },

  // ─── Jira integration — global (environment-scoped, not client-scoped) ─────
  // Found during the final QA/UAT pass: these three routes take no `clientId`
  // at all (they configure/exercise ONE org-wide Jira connection per
  // environment), so tenant-access.ts's clientId-based boundary cannot apply
  // to them (by design — see its own docstring on scope) and, before this
  // fix, nothing else gated them either: any authenticated user of any role
  // could overwrite the org's Jira API token (`POST /jira/config`), trigger a
  // real outbound call using the stored token (`POST /jira/test`), or start a
  // bulk sync job (`POST /jira/sync`). `POST /jira/issues` is NOT listed here
  // — it takes a real `clientId` in its body and is therefore already
  // enforced by tenant-access (non-admin roles are already denied there).
  // `GET /jira/config` is intentionally left ungated — it never returns the
  // token (masked at the service layer) and matches the read-only precedent
  // of other ungated GETs. `POST /jira/webhook` is intentionally NOT gated —
  // it is Jira calling AskABD, not a user action; it would never carry an
  // AskABD Admin.Access-permission token.
  { method: 'POST', path: '/api/v1/oc/jira/config', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/jira/test', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/jira/sync', permissions: ['Admin.Access'] },
] as const;
