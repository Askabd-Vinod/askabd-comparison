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
  // RISK-016 (2026-08-24 marketplace RBAC + tenant-isolation audit): this exact
  // path had NO rule at all — every sibling /admin/templates/* route above
  // requires a real Template.* permission, but this one fell through to
  // defaultPolicy:'authenticated', letting any authenticated identity (not
  // just admin/business_user) read a template's attribute list. Same
  // read permission as GET /admin/templates itself.
  { method: 'GET', path: '/api/v1/admin/templates/:id/attributes', permissions: ['Template.Read'] },

  // ─── Merchant Routes (require merchant permissions) ─────────────────────────
  // RISK-016 correction (2026-08-24): the 3 rules previously here
  // (`POST /api/v1/merchants`, `PUT /api/v1/merchants/:id`,
  // `POST /api/v1/merchants/:id/verify`) matched NO real registered route —
  // grep confirms merchant-brand-routes.ts registers `/merchants/register`,
  // never a bare `POST /merchants`; no `PUT /merchants/:id` handler exists at
  // all; and verification review is `/admin/verifications/:id/review`, never
  // `/merchants/:id/verify`. Those 3 dead rules gave a false impression that
  // merchant approval/verification was protected while the REAL routes
  // handling that logic had zero RBAC coverage — any authenticated identity
  // could approve, suspend, reactivate, or verify ANY merchant. Replaced with
  // rules on the routes that actually exist:
  // Self-registration is deliberately `authenticatedOnly`, not
  // `Merchant.Create` — the `merchant` role is the only role holding that
  // permission by default, so requiring it here would make registration
  // impossible for the very identities registering to BECOME a merchant
  // (the real chicken-and-egg case `saveConfig`'s `status:'pending'` already
  // assumes: register while unprivileged, get reviewed, then act as merchant).
  { method: 'POST', path: '/api/v1/merchants/register', authenticatedOnly: true, permissions: [] },
  // Real admin-only merchant lifecycle actions — `Merchant.Approve` (held
  // only by admin/super_admin, see roles.ts) is the exact pre-existing
  // permission the dead `/merchants/:id/verify` rule already intended for
  // this class of action; reused here rather than inventing a new one.
  { method: 'POST', path: '/api/v1/admin/merchants/:id/approve', permissions: ['Merchant.Approve'], roles: ['admin', 'super_admin'] },
  { method: 'POST', path: '/api/v1/admin/merchants/:id/suspend', permissions: ['Merchant.Approve'], roles: ['admin', 'super_admin'] },
  { method: 'POST', path: '/api/v1/admin/merchants/:id/reactivate', permissions: ['Merchant.Approve'], roles: ['admin', 'super_admin'] },
  { method: 'POST', path: '/api/v1/admin/verifications/:id/review', permissions: ['Merchant.Approve'], roles: ['admin', 'super_admin'] },
  // Submitting verification documents and registering a branch are real,
  // authenticated actions with NO ownership model to gate more precisely —
  // this schema has no merchant-owner-user binding at all (no `owner_user_id`
  // column, no merchant self-service frontend exists anywhere in apps/web,
  // confirmed by grep). Left at the honest `authenticatedOnly` level rather
  // than fabricating an ownership check the schema cannot actually support —
  // see docs/security-risk-register.md RISK-017 for the disclosed gap this
  // leaves open (any authenticated identity can submit verification docs or
  // add a branch for a merchant it does not "own", because no such concept
  // exists to check against yet).
  { method: 'POST', path: '/api/v1/merchants/:id/verification', authenticatedOnly: true, permissions: [] },
  { method: 'POST', path: '/api/v1/merchants/:id/branches', authenticatedOnly: true, permissions: [] },

  // ─── Brand admin routes (RISK-016, 2026-08-24) ──────────────────────────────
  // No rule at all previously matched any of these 4 real routes (the ONE
  // brand-related rule further below, `POST /api/v1/brands`, targets a path
  // with no registered handler — `merchant-brand-routes.ts` only ever
  // registers `/admin/brands*`). Any authenticated identity could create,
  // edit, archive, or restore a brand. No dedicated `Brand.*` permission
  // exists in roles.ts (a real, disclosed gap in the permission model
  // itself, not fabricated here) — `Admin.Access` used instead, matching
  // this session's established convention for platform-administrative
  // mutations with no more specific permission defined.
  { method: 'POST', path: '/api/v1/admin/brands', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/admin/brands/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/admin/brands/:id/archive', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/admin/brands/:id/restore', permissions: ['Admin.Access'] },

  // ─── Review moderation (RISK-016, 2026-08-24) ───────────────────────────────
  // Neither route had any rule — any authenticated identity could list the
  // full moderation queue (every pending review platform-wide) or
  // approve/reject ANY review, including bypassing moderation on its own
  // spam/fake reviews. `Admin.Access` — no dedicated moderation permission
  // exists in roles.ts.
  { method: 'GET', path: '/api/v1/admin/reviews/pending', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/admin/reviews/:id/moderate', permissions: ['Admin.Access'] },

  // ─── Write Operations (require specific permissions) ────────────────────────
  { method: 'POST', path: '/api/v1/categories', permissions: ['Category.Create'] },
  { method: 'PUT', path: '/api/v1/categories/:id', permissions: ['Category.Update'] },
  { method: 'DELETE', path: '/api/v1/categories/:id', permissions: ['Category.Delete'] },

  { method: 'POST', path: '/api/v1/items', permissions: ['Product.Create'] },
  { method: 'PUT', path: '/api/v1/items/:id', permissions: ['Product.Update'] },
  { method: 'DELETE', path: '/api/v1/items/:id', permissions: ['Product.Delete'] },

  { method: 'POST', path: '/api/v1/comparisons', permissions: ['Comparison.Create'] },
  // RISK-017 (real IDOR, see security-risk-register.md — NOT fully fixable
  // by an RBAC rule): POST /comparisons and GET /comparisons trust a
  // client-supplied `userId` (body/query) with no verification it matches
  // the caller's real identity — `Comparison.Create`/`authenticatedOnly`
  // correctly require SOME real authenticated identity, but cannot express
  // "and it must be YOUR OWN userId", because this schema's `user_id` has no
  // real binding to askabd-identity's `auth.userId` at all (no User model,
  // no identity-mapping bridge — see RISK-017 for why a shallow
  // auth.userId-substitution would itself be wrong, not just incomplete).

  // Prices/offers — real authenticated actions with the same "no seller
  // -identity model" gap as merchant verification/branches above (RISK-017).
  { method: 'POST', path: '/api/v1/prices', authenticatedOnly: true, permissions: [] },
  { method: 'POST', path: '/api/v1/offers', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/offers*', authenticatedOnly: true, permissions: [] },

  // ─── Read Operations (authenticated is sufficient) ──────────────────────────
  { method: 'GET', path: '/api/v1/categories*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/items*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/comparisons*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/search*', authenticatedOnly: true, permissions: [] },
  { method: 'POST', path: '/api/v1/compare', authenticatedOnly: true, permissions: [] },

  // ─── Merchant Portal (read: authenticated, write: merchant role) ────────────
  { method: 'GET', path: '/api/v1/brands*', authenticatedOnly: true, permissions: [] },
  { method: 'GET', path: '/api/v1/merchants*', authenticatedOnly: true, permissions: [] },
  // RISK-016 correction (2026-08-24): the rule that used to be here,
  // `POST /api/v1/brands`, matched no real route — merchant-brand-routes.ts
  // only ever registers brand writes under `/admin/brands*` (see that
  // section above, which replaces this one with rules on the real paths).

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

  // ─── RISK-014 triage pass (2026-08-24) — same shape as the Portfolio ────────
  // Intelligence gap above: real, platform-wide, cross-client data with zero
  // tenant-scoping backstop and no explicit rule, falling through to
  // defaultPolicy:'authenticated'. Each confirmed by reading its handler in
  // full AND confirmed the customer-facing `(portal)` frontend never calls
  // any of them (only staff `(app)` pages/components do) before gating.
  // GET /oc/clients lists EVERY client on the platform; GET /oc/clients/:id
  // fetches ANY client by id with no ownership check at all (unlike
  // PUT :id above, this route has no tenant-access.ts backstop either).
  { method: 'GET', path: '/api/v1/oc/clients', permissions: ['Admin.Access'] },
  // GET /oc/clients/health-summary computes and returns every client's real
  // health score in one response — a direct cross-client aggregate leak.
  // Listed BEFORE the :id rule below (both require the same permission here,
  // but :id is a single-segment wildcard that would otherwise shadow this
  // exact path first-match-wins — see rules.ts's own "more specific rules
  // first" convention at the top of this file).
  { method: 'GET', path: '/api/v1/oc/clients/health-summary', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:id', permissions: ['Admin.Access'] },
  // GET/POST /oc/audit is the full platform audit log across ALL entities —
  // read exposes every client's audit trail; write allows injecting
  // fabricated audit entries attributed to any actor/entity.
  { method: 'GET', path: '/api/v1/oc/audit', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/audit', permissions: ['Admin.Access'] },
  // GET /oc/notifications with no clientId query param returns every
  // client's notifications; POST creates a notification for an arbitrary
  // clientId with no ownership check.
  { method: 'GET', path: '/api/v1/oc/notifications', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/notifications', permissions: ['Admin.Access'] },
  // OTP send/verify/resend are the staff-driven new-client onboarding
  // identity-verification flow (confirmed: only apps/web's staff-only
  // `(app)/clients/onboard` and `(app)/verify` pages call these — never the
  // customer `(portal)`). A real, more severe finding than the RBAC gap alone:
  // POST /oc/otp/verify's success path WRITES to the target clientId's real
  // `business_owner_email`/`business_owner_name`/`organization_legal_name`
  // requirement fields with no ownership check at all — any authenticated
  // identity, having supplied its own attacker-controlled email to
  // /oc/otp/send for an arbitrary EXISTING clientId, could receive that
  // client's real OTP at an address it chose and use it to overwrite that
  // client's identity-verification fields. Gating all 3 Admin.Access closes
  // this entirely (see risk_014_triage_test_2 evidence for the live proof).
  // A second, independent fix (HTML-escaping the /oc/otp/send email template's
  // caller-supplied fields, in operations-center-routes.ts) closes a related
  // but distinct injection vector for the same route as defense-in-depth.
  { method: 'POST', path: '/api/v1/oc/otp/send', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/otp/verify', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/otp/resend', permissions: ['Admin.Access'] },

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
  // Same exact gap, found this pass while live-verifying migration_validation_test_1:
  // both also take `clientId` in the BODY with no explicit rule, so both fell
  // through to defaultPolicy 'authenticated' — any real customer token could
  // check production readiness for, or create a real migration PLAN against,
  // ANY client by putting a different clientId in the body. Migration planning
  // is inherently an AskABD-staff-operated action (same reasoning as the block
  // above), so Admin.Access is the correct boundary here too.
  { method: 'POST', path: '/api/v1/oc/production/readiness', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/migration/plan', permissions: ['Admin.Access'] },
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
  // of other ungated GETs — independently re-verified true during the
  // 2026-08-24 RISK-014 triage pass (`jira-integration-service.ts`'s
  // `getConfig` does mask `authToken` with `••••••••`; `authEmail`/`baseUrl`
  // remain visible to any authenticated identity — reviewed and accepted as
  // low-severity internal-tooling metadata, not re-gated this pass). `POST
  // /jira/webhook` is intentionally NOT gated — it is Jira calling AskABD,
  // not a user action; it would never carry an AskABD Admin.Access
  // -permission token. UPDATE (2026-08-24, RISK-015 real fix — see
  // `jira-integration-service.ts`'s `verifyWebhookRequest`): this route's
  // authorization is now a real, independent cryptographic HMAC-signature
  // check (fail-closed — an environment with no secret generated accepts
  // nothing), not an RBAC rule, which is why it correctly stays absent from
  // this list rather than gaining a permissions entry — a bearer-token
  // check would still be the wrong mechanism for a non-AskABD-identity
  // caller. `POST /jira/webhook/secret` (generates/rotates that HMAC
  // secret) is a real staff action and IS gated below.
  { method: 'POST', path: '/api/v1/oc/jira/config', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/jira/test', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/jira/sync', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/jira/webhook-secret', permissions: ['Admin.Access'] },

  // ─── Platform commercial summary (RISK-014 triage pass, 2026-08-24) ─────────
  // Same shape and severity as the already-fixed Portfolio Intelligence gap:
  // real, cross-client AskABD commercial/financial data (every engagement's
  // real investment/contracted/realized values, aggregated AND itemized in a
  // `pipeline` of up to 20 real engagements with real client names) with no
  // `:clientId` in the path and, before this fix, no RBAC rule at all —
  // falling through to `defaultPolicy:'authenticated'`. Confirmed via grep
  // that only the staff-only `(app)/platform/commercial/page.tsx` calls it.
  { method: 'GET', path: '/api/v1/oc/platform/commercial/summary', permissions: ['Admin.Access'] },

  // ─── Workflow automation rules/executions (RISK-014 triage, 2026-08-24) ─────
  // Found via a corrected mechanical audit that (unlike the earlier "451
  // routes, all methods covered" pass) actually parses PUT/PATCH/DELETE
  // registrations too — a real completeness gap in this session's own prior
  // audit tooling, not just in the routes it was checking (see the
  // RISK-014 update below for the honest correction to that earlier claim).
  // GET /oc/workflow/executions returns EVERY client's real automation
  // -execution history (event type, rule, status, client_id) when no
  // `?clientId=` filter is supplied — the same unscoped-aggregate-leak shape
  // already fixed for GET /oc/notifications. POST /oc/workflow/rules and
  // PATCH /oc/workflow/rules/:ruleId/toggle are unprotected WRITES to the
  // platform's own automation-rule definitions — any authenticated identity
  // could create arbitrary rules or disable real ones (e.g. escalation/
  // notification automation), an integrity risk distinct from read exposure.
  // GET /oc/workflow/rules (read-only rule DEFINITIONS, no client data) is
  // deliberately left ungated — same reasoning as GET /oc/capabilities and
  // GET /oc/compliance/frameworks below: genuinely global reference/config
  // data, not per-client. Confirmed via grep that only the staff-only
  // `(app)/platform/workflows/page.tsx` calls any of these three.
  { method: 'GET', path: '/api/v1/oc/workflow/executions', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/workflow/rules', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/workflow/rules/:ruleId/toggle', permissions: ['Admin.Access'] },

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
  // Found during transformation_test_1 (real gap, same class as the
  // 2026-08-22 SDLC-completion audit and the production-readiness/
  // migration-plan gap fixed in migration_validation_test_1): every OTHER
  // sibling '/oc/clients/:clientId/<capability>' route in this file has an
  // explicit Admin.Access rule, but these three transformation routes had
  // none — meaning any authenticated customer token (not just staff) could
  // create/list transformation plans for their own client via
  // defaultPolicy:'authenticated', even though the real staff-only UI at
  // /clients/:id/transformations is the only caller (confirmed by search —
  // the customer portal uses the separate, already-scoped
  // GET /oc/portal/:clientId/transformations read endpoint instead).
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/transformations', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/transformations', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/transformations/summary', permissions: ['Admin.Access'] },
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
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/comparisons/configuration', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/configuration-snapshots', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/configuration-snapshots', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/configuration-baselines', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/configuration-baselines', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/configuration-baselines/:id/approve', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/comparisons/:runId/exceptions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/comparisons/:id', permissions: ['Admin.Access'] },

  // ─── Technology Adapter Registry (migration 051, technology-adapter-routes.ts)
  { method: 'GET', path: '/api/v1/oc/technology-adapters', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/technology-adapters/:category/:technology', permissions: ['Admin.Access'] },

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

  // ─── uat_test_1 (2026-08-24) ────────────────────────────────────────────
  // Staff-management side of the UAT Engine (uat-routes.ts). Same
  // Admin.Access precedent as testing-engine-routes.ts above. The customer
  // portal counterparts ('/oc/portal/:clientId/uat/*') are deliberately NOT
  // listed here, matching every other /oc/portal/:clientId/* route — they
  // fall through to defaultPolicy:'authenticated' + tenant-access.ts's real
  // membership check, since the client is the one who executes UAT test
  // cases and requests sign-off.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/uat/cycles', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/uat/cycles', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/uat/cycles/:cycleId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/uat/cycles/:cycleId/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/uat/cycles/:cycleId/signoff/:workflowId/approve', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/uat/cycles/:cycleId/signoff/:workflowId/reject', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/uat/cycles/:cycleId/signoff/:workflowId/request-changes', permissions: ['Admin.Access'] },

  // ─── release_readiness_test_1 (2026-08-24) ──────────────────────────────
  // Staff-only real go/no-go aggregation before a client's go-live
  // transition (release-readiness-routes.ts) — AskABD's own internal
  // decision, not a client-facing flow, same precedent as migration/
  // lifecycle routes above.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/release-readiness', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/release-readiness/signoff', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/release-readiness/signoff/request', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/release-readiness/signoff/:workflowId/:decision', permissions: ['Admin.Access'] },

  // ─── deployment_validation_test_1 / post_delivery_test_1 (2026-08-24) ───
  // Staff-only Deployment + Post-Deployment Validation Engine
  // (deployment-routes.ts) — AskABD's own internal operational action, same
  // Admin.Access precedent as migration/lifecycle/release-readiness routes.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/deployments', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/deployments/:id', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/clients/:clientId/deployments/:id', permissions: ['Admin.Access'] },
  { method: 'DELETE', path: '/api/v1/oc/clients/:clientId/deployments/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/plan', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/check-readiness', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/request-approval', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/deployments/:id/approval', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/approval/:decision', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/start-execution', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/outcome', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/post-deployment/suite', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/deployments/:id/post-deployment/status', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/post-deployment/checks/:testCaseId', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/post-deployment/checks/:testCaseId/auto-db-check', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/post-deployment/finalize', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/rollback/initiate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/rollback/outcome', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/cancel', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/deployments/:id/compare', permissions: ['Admin.Access'] },

  // ─── risk_test_1 (2026-08-24) ────────────────────────────────────────────
  // Staff-only Risk Engine (risk-routes.ts) — same Admin.Access precedent as
  // migration/lifecycle/release-readiness/deployment routes above.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/risks', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/risks/summary', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/risks/:id', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/clients/:clientId/risks/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks/:id/mitigate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks/:id/reopen', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks/:id/transfer', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks/:id/close', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks/:id/acceptance/request', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/risks/:id/acceptance', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/risks/:id/acceptance/:decision', permissions: ['Admin.Access'] },

  // ─── data_mapping_test_1 (2026-08-24) ────────────────────────────────────
  // Staff-only Data Mapping Engine (data-mapping-routes.ts) — same
  // Admin.Access precedent as migration/deployment/risk routes above.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/data-mappings', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/data-mappings', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/data-mappings/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/data-mappings/:id/status/:status', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/data-mappings/:id/completeness', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/data-mappings/:id/fields', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/data-mappings/:id/fields', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/data-mapping-fields/:fieldId', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/clients/:clientId/data-mapping-fields/:fieldId', permissions: ['Admin.Access'] },
  { method: 'DELETE', path: '/api/v1/oc/clients/:clientId/data-mapping-fields/:fieldId', permissions: ['Admin.Access'] },

  // ─── data_reconciliation_test_1 (2026-08-24) ─────────────────────────────
  // Staff-only Data Reconciliation Engine (data-reconciliation-routes.ts) —
  // real database credentials involved via connection ids, same precedent as
  // every other connector-touching route this session.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/reconciliation-runs', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/reconciliation-runs', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/reconciliation-runs/:id', permissions: ['Admin.Access'] },

  // ─── requirements_clarification_test_1 (2026-08-24) ──────────────────────
  // Staff-management side of the Requirements Clarification Engine
  // (requirements-clarification-routes.ts) — same Admin.Access precedent as
  // every other staff-only route above. The customer-portal counterparts
  // ('/oc/portal/:clientId/clarifications*') are deliberately NOT listed
  // here, matching every other /oc/portal/:clientId/* route — they fall
  // through to defaultPolicy:'authenticated' + tenant-access.ts's real
  // membership check, since the CLIENT is the one who answers.
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/requirements/:requirementId/clarifications/generate', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/requirements/:requirementId/clarifications', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/clarifications', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/clarifications/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/clarifications/:id/resolve', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/clarifications/:id/wont-fix', permissions: ['Admin.Access'] },

  // ─── change_management_test_1 (2026-08-24) ───────────────────────────────
  // Staff-only Change Management Engine (change-management-routes.ts) — same
  // Admin.Access precedent as migration/deployment/risk routes above.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/changes', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/changes/:id', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/assess', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/link-risk', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/link-deployment', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/request-approval', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/changes/:id/approval', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/approval/:decision', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/start-implementation', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/validate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/close', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/changes/:id/cancel', permissions: ['Admin.Access'] },

  // ─── executive_reporting_test_1 (2026-08-24) ─────────────────────────────
  // Staff-only Executive Reporting Engine (executive-reporting-routes.ts) —
  // same Admin.Access precedent as every other staff-only route above.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/executive-reports', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/executive-reports', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/executive-reports/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/executive-reports/:id/export/markdown', permissions: ['Admin.Access'] },

  // ─── api_discovery_test_1 (2026-08-24) ───────────────────────────────────
  // Staff-only API Discovery/Validation Engine (api-discovery-routes.ts) —
  // live validation can trigger a real outbound request, same Admin.Access
  // precedent as every other connector-touching route this session.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/api-specs', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/api-specs', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/api-specs/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/api-specs/:id/endpoints', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/api-specs/:id/gap-report', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/api-specs/:id/authorize-live-validation', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/api-endpoints/:endpointId/validate', permissions: ['Admin.Access'] },

  // ─── dependency_analysis_test_1 (2026-08-24) ─────────────────────────────
  // Staff-only Dependency Analysis Engine (dependency-analysis-routes.ts) —
  // same Admin.Access precedent as every other cross-domain analysis route
  // above.
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/dependencies/link', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/dependencies/:entityType/:entityId/cycles', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/dependencies/:entityType/:entityId/impact', permissions: ['Admin.Access'] },
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

  // ─── Secure Client Environment Connectivity Engine (migration 050, connection-security-routes.ts)
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/connection-security', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/connection-security/:sourceType/:sourceId', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/clients/:clientId/connection-security/:sourceType/:sourceId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/integration-allowlist', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/integration-allowlist/:provider', permissions: ['Admin.Access'] },
  { method: 'DELETE', path: '/api/v1/oc/clients/:clientId/integration-allowlist/:provider', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/security-report', permissions: ['Admin.Access'] },

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

  // ─── transformation_test_1 systemic sweep (2026-08-23) ───────────────────
  // While closing the 3 transformation-route gaps above, ran a full mechanical
  // diff of every `server.<method>('/oc/clients/:clientId/...', ...)`
  // registration in operations-center-routes.ts against this file — the same
  // audit technique the file's own pre-existing comments describe doing by
  // hand for narrower slices ("the 2026-08-22 SDLC-completion audit", the
  // opaque-ID sweep above). Found 52 more client-scoped routes with NO
  // explicit rule across Problems, Gap Analysis, Continuous Optimization
  // (incl. Transformation Outcomes), Portfolio Health, Notification
  // Preferences, Escalations, Compliance, Onboarding, Service Bundles,
  // Payment Methods, Transactions, Reconciliation, and Health Score/Snapshot
  // — every one of them fell through to defaultPolicy:'authenticated', so any
  // authenticated identity tenant-mapped to a client (any role, not just
  // staff) could read or write these staff-only engines for that client.
  // Cross-referenced against the real customer-portal source
  // (apps/web/src/app/(portal)/**) call-by-call, not just by path: 4 of the
  // 52 (GET .../services, GET .../services/recommendations,
  // GET .../services/coverage, GET .../engagements) are genuinely called by
  // the portal with a plain GET and are deliberately left OFF this list —
  // same established pattern as /oc/clients/:clientId/requests and
  // /oc/portal/:clientId/* above. POST .../engagements looked like a portal
  // route by a naive path-only grep but the portal only ever GETs that URL
  // (confirmed by reading both real call sites) — creating a commercial
  // engagement is staff-only, so it IS included below.
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/connection-tests', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/problems', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/problems/summary', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/problems', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/problems/import-assessment', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/gaps', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/gaps/summary', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/gaps', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/gaps/generate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/gaps/recommend', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/gaps/aging', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/metrics', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/optimization/metrics', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/optimization/baselines', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/baselines', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/optimization/measurements', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/measurements', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/findings', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/optimization/outcomes', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/outcomes', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/summary', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/optimization/monitoring', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/clients/:clientId/health', permissions: ['Admin.Access'] },
  // ─── executive_reporting_test_1 continuation (2026-08-24): real, severe
  // gap found via this pass's own mechanical audit of PortfolioIntelligenceService's
  // real routes — 7 of its 8 routes carry NO `:clientId` at all (genuine
  // cross-client platform business intelligence: real per-client financial
  // investment/savings/ROI, real cross-client problem/gap/technology
  // patterns, real resource allocation) and had ZERO RBAC rule, falling
  // through to defaultPolicy:'authenticated' — meaning ANY authenticated
  // identity, staff or customer, could read AskABD's own aggregate
  // portfolio-wide financial and cross-client data. Fixed immediately,
  // same Admin.Access precedent as the sibling row above.
  { method: 'GET', path: '/api/v1/oc/portfolio/health', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/clients', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/financial', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/transformations', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/patterns', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/resources', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/portfolio/intelligence', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/known-information', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/notification-preferences', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/clients/:clientId/notification-preferences', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/escalations', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/compliance', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/compliance/summary', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/compliance/initialize', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/compliance/auto-map', permissions: ['Admin.Access'] },
  { method: 'PATCH', path: '/api/v1/oc/clients/:clientId/compliance/:controlId', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/compliance/:controlId/remediate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/compliance/exceptions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/compliance/exceptions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/onboarding/requirements', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/service-bundles/recommended', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/payment-methods', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/payment-methods', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/transactions', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/transactions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/reconciliation', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/reconciliation/run', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/reconciliation/summary', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/reconciliation/exceptions', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/health-score', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/clients/:clientId/health-snapshot', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/clients/:clientId/engagements', permissions: ['Admin.Access'] },

  // ─── security_test_1 systemic sweep (2026-08-23) ──────────────────────────
  // Per the Security Testing Addendum: extended the mechanical route audit
  // beyond '/oc/clients/:clientId/...' to EVERY route carrying a `:clientId`
  // param, any prefix (143 routes checked). Found 17 more real gaps —
  // staff-only capabilities (Lifecycle, Connectors, one Discovery/Assessment
  // detail route each, Recommendations, Migration Runs, the entire
  // client-services/RequirementWorkspace family used by the real Security
  // Validation lifecycle stage, real-time Events, and Jira links) that fell
  // through to defaultPolicy:'authenticated'. Cross-referenced against BOTH
  // apps/web/src/app/(app) (+ its shared components/lib) AND
  // apps/web/src/app/(portal) call sites — 8 of the 17
  // client-services/document routes had zero caller anywhere BUT
  // RequirementWorkspace.tsx, which only (app)/lifecycle/page.tsx and
  // (app)/dynamic-overview.tsx (via client-command-center.tsx) ever mount,
  // confirming staff-only. The sibling base routes '/oc/discovery/:clientId'
  // and '/oc/assessment/:clientId' ARE genuinely portal-called and are
  // deliberately NOT listed here, matching the established pattern.
  { method: 'GET', path: '/api/v1/oc/lifecycle/:clientId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/lifecycle/:clientId/history', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/connectors/:clientId', permissions: ['Admin.Access'] },
  // connector_test_1 (2026-08-24): real gap -- these 3 staff-only connector
  // routes (real credentials in the request body) had no rule at all.
  { method: 'POST', path: '/api/v1/oc/connectors/test', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/connectors/save', permissions: ['Admin.Access'] },
  { method: 'DELETE', path: '/api/v1/oc/connectors/:id', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/discovery/:clientId/:runId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/assessment/:clientId/domain/:domain', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/recommendations/:clientId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/migration/runs/:clientId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/client-services/:clientId/:serviceId/requirements', permissions: ['Admin.Access'] },
  { method: 'PUT', path: '/api/v1/oc/client-services/:clientId/:serviceId/requirements/:requirementKey', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/history', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/client-services/:clientId/:serviceId/readiness', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents/:documentId/validate', permissions: ['Admin.Access'] },
  { method: 'POST', path: '/api/v1/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/events/stream/:clientId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/events/:clientId', permissions: ['Admin.Access'] },
  { method: 'GET', path: '/api/v1/oc/jira/links/:clientId', permissions: ['Admin.Access'] },
] as const;
