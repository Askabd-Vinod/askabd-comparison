/**
 * AskABD Platform — Tenant/Client Access Boundary
 *
 * This is the THIRD independent security decision, distinct from the other two
 * already enforced elsewhere in this pipeline:
 *   1. Authentication ("who are you")        → middleware/auth.ts
 *   2. Authorization/RBAC ("what can you do") → platform/rbac/middleware.ts
 *   3. Tenant access ("which client's data")  → THIS FILE
 *
 * Why this exists (see docs/identity-token-contract.md and
 * docs/tenant-authorization-matrix.md for the full evidence trail):
 *
 * Neither the real askabd-identity token (verified directly against that
 * service's source — it carries only sub/org/sid/iat/exp/jti) NOR this
 * application's own database contains any mapping from an authenticated
 * identity (or its org_context) to a specific `oc_clients.client_id`.
 * `oc_clients` rows are AskABD's own consulting customers; `org_context` in
 * askabd-identity is the AUTHENTICATED STAFF MEMBER's own organization, a
 * different concept. Before this milestone, every `/api/v1/oc/**` route
 * accepted a `:clientId` URL parameter with ZERO check that the caller was
 * entitled to that specific client's data — `defaultPolicy: 'authenticated'`
 * meant any validly-signed token, of any role, could read or write ANY
 * client's operational data (services, connectors, requirements, commercial
 * engagements, documents, audit history) just by changing the URL.
 *
 * Inventing a fake user→client mapping to "solve" this would be fabricated
 * identity architecture — explicitly prohibited. Instead, this module applies
 * the one SAFE, evidence-based rule available today, reusing roles that
 * already exist and are already tested (`admin`, `super_admin` — see
 * platform/rbac/roles.ts):
 *
 *   - admin / super_admin — already the platform's broad-access roles — MAY
 *     cross client boundaries. This matches the platform's actual current
 *     operating reality (an internal consulting-staff console where account
 *     managers/admins work across many clients as their job function) and is
 *     documented here as an explicit privileged capability, not a silent
 *     assumption (see docs/tenant-authorization-matrix.md, "Admin cross-tenant
 *     access").
 *   - every other role (customer, business_user, merchant, partner, support,
 *     auditor, or no role at all) is DENIED by default. This is a fail-closed
 *     default, not a regression: no live path issues those roles a token
 *     today (the frontend sends no Authorization header at all — see
 *     docs/identity-rbac-architecture-audit.md), so no legitimate traffic is
 *     broken. When a real per-client mapping is designed, this module is the
 *     single place to extend it (see "Remaining P1" in the final report).
 *
 * DEV bypass (`auth.userId === 'dev-user-000'`) is exempted from this check,
 * mirroring the identical guard already used by the RBAC dev bypass in
 * platform/rbac/middleware.ts — this module invents no new bypass mechanism.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuthorization } from './middleware.js';

export interface TenantAccessConfig {
  /** URL prefix this boundary applies to, e.g. '/api/v1/oc/'. */
  pathPrefix: string;
  /** Roles allowed to cross client boundaries. Defaults to admin/super_admin. */
  crossClientRoles?: readonly string[];
  /** Mirrors the existing DEV-only auth/authorization bypass. Never true in production. */
  devBypass?: boolean;
}

const DEFAULT_CROSS_CLIENT_ROLES: readonly string[] = ['admin', 'super_admin'];

/**
 * Registers the tenant-access preHandler hook. Must run AFTER
 * registerAuthMiddleware and registerAuthorizationMiddleware (depends on
 * request.auth and request.authorization set by those two).
 */
export function registerTenantAccessMiddleware(server: FastifyInstance, cfg: TenantAccessConfig): void {
  const crossClientRoles = new Set(cfg.crossClientRoles ?? DEFAULT_CROSS_CLIENT_ROLES);

  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0]!;
    if (!path.startsWith(cfg.pathPrefix)) return;

    const auth = (request as any).auth ?? null;
    if (!auth) return; // No auth context — already rejected with 401 upstream.

    // DEV bypass — identical guard to the existing RBAC dev bypass, not a new mechanism.
    if (cfg.devBypass && auth.userId === 'dev-user-000') return;

    const clientId = extractClientId(request, path);
    if (!clientId) return; // Route is not client-scoped by URL param — outside this boundary.

    const authz = getAuthorization(request);
    const roles = authz?.roles ?? [];
    const allowed = roles.some(r => crossClientRoles.has(r));

    if (!allowed) {
      request.log.warn({ userId: auth.userId, roles, clientId }, 'Tenant access denied');
      reply.status(403).send({
        error: {
          category: 'authorization',
          code: 'SHARED.AUTHORIZATION_ERROR',
          // Distinguishes this (client-scope could not be resolved for this identity)
          // from platform/rbac/middleware.ts's plain 'forbidden' (a real permission
          // denial) — see that file's denyAccess() for the full rationale.
          reasonCode: 'tenant_not_resolved',
          message: 'Your organization access could not be determined.',
          statusCode: 403,
        },
      });
    }
  });
}

/**
 * Reads the client identifier from wherever the request actually carries it —
 * URL param, request body, or query string — since a route that only checks
 * one of these can be trivially bypassed by moving `clientId` to another.
 * Covers:
 *   - every route whose Fastify path pattern includes `:clientId`
 *   - the one route where the client's own resource uses `:id`
 *     (`/api/v1/oc/clients/:id`)
 *   - POST/PUT/PATCH bodies carrying a `clientId` field (e.g.
 *     `/oc/connectors/test`, `/oc/connectors/save`, `/oc/jira/issues` — all
 *     take `clientId` in the body, not the URL)
 *   - GET query strings carrying a `?clientId=` filter (e.g. `/oc/incidents`)
 *
 * Routes that reference a client only indirectly through an opaque resource
 * ID (e.g. `:problemId`, `:gapId`, `:reconciliationId` — requiring a DB
 * lookup to resolve ownership) remain NOT covered here; see "Remaining P1" in
 * the final report for the explicit, honest list.
 */
function extractClientId(request: FastifyRequest, path: string): string | undefined {
  const params = request.params as Record<string, string> | undefined;
  if (params?.clientId) return params.clientId;
  if (params?.id && /^\/api\/v1\/oc\/clients\/[^/]+$/.test(path)) return params.id;

  const body = request.body as Record<string, unknown> | undefined;
  if (body && typeof body.clientId === 'string' && body.clientId) return body.clientId;

  const query = request.query as Record<string, unknown> | undefined;
  if (query && typeof query.clientId === 'string' && query.clientId) return query.clientId;

  return undefined;
}
