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

  // ─── Client creation/editing (governance-sensitive — admin only) ────────────
  // Found during the staff-workflow investigation pass: these two routes had NO
  // explicit rule at all (falling through to defaultPolicy: 'authenticated'), meaning
  // any authenticated identity — including a real customer — could create an
  // arbitrary client or edit an existing one's core record. `oc_clients` is an
  // AskABD-internal operational record (see docs/client-onboarding-architecture.md's
  // ownership table), not something a customer should be able to create or rewrite
  // wholesale. PUT /oc/clients/:id is ALSO covered by tenant-access.ts (a customer
  // with a real mapping to that exact client would otherwise pass that boundary) —
  // this Admin.Access gate is the independent, additional check that correctly
  // restricts it to staff regardless.
  { method: 'POST', path: '/api/v1/oc/clients', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/clients/:id', permissions: ['Admin.Access'] },

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
  { method: 'GET', path: '/api/v1/oc/search', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/defects', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/migrations', permissions: ['Admin.Access'] },

  // ─── Migration execution & operations — opaque migrationId/operationId, not a
  // real clientId (tenant-access.ts's extractClientId only recognizes `clientId`
  // in params/body/query, by design — see its own docstring). ─────────────────
  // Found during the real-time operations/security audit pass: dry-run, execute,
  // validate, rollback, single-migration-detail, and the new async execution +
  // operation-polling routes all identify their target by an opaque migrationId or
  // operationId, resolved to a real clientId only INSIDE the service layer — meaning
  // tenant-access's generic clientId-sniffing silently no-ops for every one of them.
  // Before this fix, any authenticated identity — including a real customer with a
  // mapping to a completely different client — could execute, validate, or roll back
  // ANY client's migration, or read/cancel any client's operation, just by knowing
  // (or guessing) its ID. Migration execution is inherently an AskABD-staff-operated
  // action (see service-readiness.ts's lifecycle stage ownership — never `owner:
  // 'client'` for these stages), so Admin.Access is the correct, and only currently
  // available, boundary — matching the established pattern for every other
  // opaque-ID-keyed governance route in this file.
  // `preflight` and `validate` (no `:migrationId`) take `clientId` in the
  // BODY, not the URL — found during the 2026-08-22 SDLC-completion audit:
  // exactly the same opaque-target problem as the routes below (tenant-access
  // doesn't sniff clientId out of an arbitrary body shape for these), so
  // without an explicit rule they fell through to defaultPolicy:
  // 'authenticated' — any real customer token could preflight/validate ANY
  // client's environment by putting a different clientId in the body.
  { method: 'POST', path: '/api/v1/oc/migration/preflight', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/validate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/dry-run', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/execute', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/:migrationId/execute-async', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/:migrationId/validate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/:migrationId/rollback', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/migrations/:migrationId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/operations/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/operations/:id/cancel', permissions: ['Admin.Access'] },

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

  // ─── Client invitations — admin-only management ─────────────────────────────
  // Creating/listing/resending/revoking an invitation is how a real identity AND a
  // real client_identity_mapping row get created (see services/invitation-service.ts)
  // — exactly the kind of action Admin.Access already gates elsewhere in this file.
  // `lookup` and `accept` are deliberately NOT listed here — they are public routes
  // (see server.ts's publicRoutes) since a brand-new customer has no token yet.
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/invitations', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/invitations', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/invitations/:id/renew', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/invitations/:id/link', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/invitations/:id/resend', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/invitations/:id/revoke', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/org-contexts', permissions: ['Admin.Access'] },

  // ─── Pending-invitation self-service (any authenticated identity) ───────────
  // Deliberately NOT listed here — falls through to defaultPolicy: 'authenticated'
  // (any valid token, no specific permission), matching the existing /oc/me
  // pattern exactly: GET /api/v1/oc/me/pending-invitations and
  // POST /api/v1/oc/me/pending-invitations/:id/accept both resolve the caller's
  // own org_context server-side from the verified JWT — never a client-supplied
  // value — so there is nothing here for a permission grant to gate.

  // ─── Staff role management — admin-only, with one deliberate exception ──────
  // `POST /oc/staff/roles` is intentionally NOT listed here (falls through to
  // `authenticatedOnly`) — its own handler (routes/staff-role-routes.ts) enforces
  // Admin.Access OR a narrow, one-time bootstrap exception (a genuinely empty
  // staff_role_assignment table, granting only to the caller's own identity) that a
  // static declarative rule cannot express. Every other staff-role route has no such
  // exception and is gated normally here.
  { method: 'GET', path: '/api/v1/oc/staff/roles', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/staff/roles/:identityId', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/staff/roles/:identityId/:role/revoke', permissions: ['Admin.Access'] },

  // ─── Governance mutations keyed by an opaque, non-clientId resource ID ──────
  // Found during the Fortune-500 security audit pass, same root cause and same fix
  // as the earlier migration-routes finding (see the "Migration execution &
  // operations" block above): every route below identifies its target by an opaque
  // gapId/problemId/defectId/escalationId/findingId/engagementId/proposalId/ruleId/
  // jobId/remediationId/capabilityId — never a `clientId` — so tenant-access.ts's
  // generic clientId-sniffing (params/body/query) silently never applies, and
  // without an explicit rule they fell through to `defaultPolicy: 'authenticated'`.
  // Verified against the real route bodies (operations-center-routes.ts) before
  // adding each one — routes that DO carry a real `clientId` in their body (e.g.
  // POST /oc/recommendations/generate, POST /oc/defects when a clientId is
  // supplied) are correctly left OUT of this list; tenant-access already covers
  // them. Every route here mutates governance/financial/operational state that is
  // inherently an AskABD-staff action (gap decisions, problem financial estimates,
  // defect verification, engagement pricing/proposals, the platform capability
  // catalog, the scheduler, workflow automation rules) — never something a real
  // customer should be able to do to their own client, let alone someone else's.
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/target', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/financial', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/effort', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/options', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/decide', permissions: ['Admin.Access'] },
  // Gap Analysis extension (migration 044) — same opaque-ID staff-only
  // pattern as the routes immediately above. The customer-portal
  // equivalents (/oc/portal/:clientId/gaps, /oc/portal/:clientId/gaps/:gapId/evidence)
  // are deliberately NOT listed here — same established pattern as every
  // other customer-portal route in this file: defaultPolicy 'authenticated'
  // + tenant-access.ts's real membership check.
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/compliance', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/evidence', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/customer-visibility', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/:gapId/risk-acceptance/request', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/gaps/risk-acceptance/:workflowId/decide', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/problems/:problemId', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/problems/:problemId/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/problems/:problemId/financial', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/problems/:problemId/effort', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/defects/:defectId/verify', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/defects/detect', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/escalations/:escalationId/acknowledge', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/escalations/:escalationId/resolve', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/optimization/findings/:findingId/promote', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/optimization/findings/:findingId/acknowledge', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/optimization/findings/:findingId/resolve', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/engagements/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/engagements/:id/services', permissions: ['Admin.Access'] },
  { method: 'DELETE', path: '/api/v1/oc/engagements/:id/services/:serviceId', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/engagements/:id/pricing', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/engagements/:id/proposals', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/proposals/:id/generate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/scheduler/jobs/:jobId/run', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/scheduler/jobs/:jobId/toggle', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/scheduler/run-all', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/transformations/:id/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/capabilities', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/capabilities/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/workflow/rules', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/workflow/rules/:ruleId/toggle', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/remediations', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/remediations/find-or-create', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/remediations/:id/phase', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/remediations/:id/close', permissions: ['Admin.Access'] },
  // Added with the real remediation-execution engine (final master completion pass):
  // same opaque-ID pattern as every other remediation route above.
  { method: 'POST', path: '/api/v1/oc/remediations/:id/execute', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/remediations/:id/steps/:stepId/start', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/remediations/:id/steps/:stepId/complete', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/remediations/:id/steps/:stepId/fail', permissions: ['Admin.Access'] },

  // ─── Opaque-ID READS of another client's governance/financial detail ────────
  // Found during the final adversarial audit pass: the write-side gate above closes
  // mutation, but each of these GET routes returns one client's full record by an
  // opaque ID with the same missing tenant boundary — confirmed by reading the real
  // handlers, not assumed. GET /oc/payment-methods/:id is the most severe: it takes
  // `clientId` as an OPTIONAL query param (`clientId || undefined` in
  // paymentService.getPaymentMethod) — tenant-access.ts only enforces a clientId
  // check when the field is actually present, so simply omitting the query param
  // returns any client's real payment method by ID with zero tenant check. The
  // customer portal (apps/web/src/app/client-portal/**) never calls any route in
  // this list — confirmed by search — so gating them Admin.Access breaks no real
  // customer-facing capability; these are internal staff detail views.
  { method: 'GET', path: '/api/v1/oc/problems/:problemId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/problems/:problemId/financial', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/problems/:problemId/effort', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/gaps/:gapId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/gaps/:gapId/priority', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/gaps/:gapId/options', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/gaps/:gapId/compare', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/gaps/:gapId/decision', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/gaps/:gapId/evidence', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/defects/:defectId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/engagements/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/engagements/:id/services', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/engagements/:id/summary', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/engagements/:id/pricing', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/engagements/:id/proposals', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/proposals/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/payment-methods/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/reconciliation/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/reconciliation/:id/items', permissions: ['Admin.Access'] },

  // Found during the route×page enumeration pass of the same final adversarial audit:
  // three more opaque-ID GET routes returning real, client-owned data with the same
  // missing tenant boundary. Confirmed against the real handlers/schema, not assumed —
  // oc_service_actions.entity_id is a client (or client-owned entity) ID for
  // entity_type='client' and exposes real operational history (action/actor/reason/
  // previous_state/new_state); decisionService.getTransformation returns a record with
  // a real .clientId field (see the audit-entry call immediately below its route); and
  // oc_metric_definitions.client_id is NOT NULL — every metric definition belongs to
  // exactly one client. None of the three are called from apps/web today (confirmed by
  // search — getServiceActions/getTransformation/getMetric have no caller in the
  // frontend), so gating them breaks no live capability.
  { method: 'GET', path: '/api/v1/oc/service-actions/:entityId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/transformations/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/optimization/metrics/:metricId', permissions: ['Admin.Access'] },

  // Added with the real remediation-execution engine (final master completion pass):
  // GET /oc/remediations with no clientId filter returns every client's remediations,
  // same cross-client-aggregate pattern as GET /oc/incidents and GET /oc/defects above.
  // GET /oc/remediations/:id is the same opaque-ID-read pattern as every other detail
  // route in this block. GET /oc/incidents/:id is new too (added alongside — the list
  // route already existed and was gated; the single-incident detail route did not
  // exist before this pass).
  { method: 'GET', path: '/api/v1/oc/remediations', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/remediations/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/incidents/:id', permissions: ['Admin.Access'] },

  // ─── CRM: Contacts / Notes / Tasks (migration 030, crm-routes.ts) ───────────
  // Staff-managed only for now — see docs/crm-completeness.md for the real,
  // undecided question of customer-portal visibility of this data. The
  // client-scoped routes (:clientId in the path) are also covered by
  // tenant-access.ts; the entity-scoped routes below (contacts/:id,
  // notes/:id, tasks/:id) carry no clientId param at all, so tenant-access.ts
  // does not apply to them by construction — this Admin.Access gate is what
  // correctly restricts them to staff (same pattern as PUT /oc/clients/:id
  // above, an already-established precedent in this file for opaque-ID
  // mutation routes with no clientId in their own URL).
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/contacts', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/contacts', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/contacts/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/contacts/:id/deactivate', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/notes', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/notes', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/notes/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/notes/:id/archive', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/tasks', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/tasks', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/tasks/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/tasks/:id/status', permissions: ['Admin.Access'] },

  // ─── Business Requirements Intelligence (migration 038,
  // business-requirements-routes.ts) ───────────────────────────────────────
  // Staff-managed only, same as CRM above — this classifies the CLIENT's own
  // stated business/functional/technical requirements (quality/completeness),
  // not a customer self-service surface. The client-scoped routes (:clientId
  // in the path) are also covered by tenant-access.ts; the opaque-ID routes
  // (business-requirements/:id, .../deprecate, .../flag-conflict,
  // .../history) carry no clientId param at all, so this Admin.Access gate
  // is what restricts them to staff — same precedent as the CRM entity-scoped
  // routes immediately below.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/business-requirements', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/business-requirements/summary', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/business-requirements', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/business-requirements/:id', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/business-requirements/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/business-requirements/:id/deprecate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/business-requirements/:id/flag-conflict', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/business-requirements/:id/history', permissions: ['Admin.Access'] },

  // ─── Universal Discovery — free-text intake (migration 042,
  // discovery-intake-routes.ts) ─────────────────────────────────────────────
  // Staff-managed, same precedent as CRM/Business Requirements above.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/discovery-sources', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/discovery-sources', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/discovery-sources/document', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/discovery-sources/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/discovery-sources/:id/review', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/discovery-sources/:id/archive', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/discovery-sources/:id/extractions', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/discovery-sources/:id/extractions', permissions: ['Admin.Access'] },

  // ─── Document Generation Engine (migration 046, document-generation-routes.ts)
  // ───────────────────────────────────────────────────────────────────────────
  // Staff-managed, same opaque-ID pattern as Gap Analysis/Business
  // Requirements above. The customer-portal read route
  // (/oc/portal/:clientId/documents) is deliberately NOT listed here — same
  // established pattern as every other customer-portal route in this file:
  // defaultPolicy 'authenticated' + tenant-access.ts's real membership check.
  { method: 'GET', path: '/api/v1/oc/document-templates', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/document-templates/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/document-templates', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/documents', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/documents', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/documents/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/documents/:id/history', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/documents/:id/quality-check', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/documents/:id/regenerate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/documents/:id/submit-for-approval', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/documents/:id/decide-approval', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/documents/:id/archive', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/documents/:id/customer-visibility', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/documents/:id/export', permissions: ['Admin.Access'] },

  // ─── Universal Comparison Engine (migration 048, universal-comparison-routes.ts)
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/comparisons', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/comparisons/database-schema', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/comparisons/:id', permissions: ['Admin.Access'] },

  // ─── Requirements Traceability Matrix (Phase 3 Part 8, traceability-routes.ts)
  // — surfaces the Traceability Engine's real chains. Not client-scoped in the
  // URL (see the route file's own doc comment); staff-only, same precedent.
  { method: 'GET', path: '/api/v1/oc/traceability/:entityType/:entityId', permissions: ['Admin.Access'] },

  // ─── Universal Testing & Validation Engine (migration 049, testing-engine-routes.ts)
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/test-cases', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/test-cases', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/test-cases/:id', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/test-cases/:id/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/test-cases/generate/:sourceKind/:sourceId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/test-cases/:id/executions', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/test-cases/:id/executions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/test-executions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/test-runs/:runIdA/compare/:runIdB', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/test-defects', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/test-defects/:id', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/test-defects/:id/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/test-defects/:id/retest', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/test-coverage', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/test-report', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/test-report/export', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/test-report/migration-validation', permissions: ['Admin.Access'] },

  // ─── Client Requests — staff management (real customer self-service backend,
  // 2026-08-20) ──────────────────────────────────────────────────────────────
  // Staff review/approve/reject is Admin.Access-gated, same as every other
  // staff-management surface in this file. The customer-facing create/list
  // routes (`/oc/portal/:clientId/requests`) are deliberately NOT listed here
  // — same established pattern as CRM's customer-portal routes above: falls to
  // defaultPolicy 'authenticated' + tenant-access.ts's real membership check.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/requests', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/client-requests/:id/transition', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/database-connections', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/database-connections', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/database-connections/:id', permissions: ['Admin.Access'] },
  { method: 'DELETE', path: '/api/v1/oc/database-connections/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/database-connections/:id/test', permissions: ['Admin.Access'] },

  // ─── Client-scoped search (Part 3, 2026-08-20) ───────────────────────────
  // Staff path is Admin.Access-gated (same as /oc/search). The customer-portal
  // path (/oc/portal/:clientId/search) is deliberately NOT listed — same
  // established pattern as every other /oc/portal/:clientId/* route.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/search', permissions: ['Admin.Access'] },

  // ─── Customer Activity (Phase 2, 2026-08-20) ─────────────────────────────
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/activity', permissions: ['Admin.Access'] },
] as const;
