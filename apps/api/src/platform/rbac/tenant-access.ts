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
 * application's own database USED TO contain any mapping from an
 * authenticated identity (or its org_context) to a specific `oc_clients.id`.
 * `oc_clients` rows are AskABD's own consulting customers; `org_context` in
 * askabd-identity is the AUTHENTICATED CUSTOMER/STAFF MEMBER's own
 * organization, a different concept. Before this module existed, every
 * `/api/v1/oc/**` route accepted a `:clientId` URL parameter with ZERO check
 * that the caller was entitled to that specific client's data —
 * `defaultPolicy: 'authenticated'` meant any validly-signed token, of any
 * role, could read or write ANY client's operational data just by changing
 * the URL.
 *
 * RESOLVED (real, database-backed mapping — not a convention):
 * `client_identity_mapping` (migration 024) is now the single source of truth
 * for which client(s) an org_context is authorized to access — see
 * `services/client-identity-mapping-service.ts`. Server-side resolution only:
 * this module reads `org_context` from the VERIFIED JWT claim
 * (`auth.tenantId`, set by middleware/auth.ts after real signature/issuer/
 * audience/expiry verification), resolves the authorized client-ID set from
 * that mapping table, and checks the request's client ID for MEMBERSHIP in
 * that server-resolved set. A client ID supplied by the request (URL, body,
 * or query — see `extractClientId` below) is NEVER trusted to expand access;
 * it is only ever checked against what the server already resolved.
 *
 * Two authorization paths, both explicit and both tested:
 *   - admin / super_admin — already the platform's broad-access roles — MAY
 *     cross ALL client boundaries, unconditionally. Matches the platform's
 *     actual operating reality (internal consulting staff work across many
 *     clients) — documented here as an explicit privileged capability, not a
 *     silent assumption (see docs/tenant-authorization-matrix.md).
 *   - every other authenticated identity — resolved via
 *     `client_identity_mapping`: allowed only for client IDs with an
 *     *active* mapping to that identity's org_context. No mapping → denied.
 *     Revoked mapping → denied. A mapping for a DIFFERENT org_context does
 *     not help, no matter what client ID is requested — this is what makes
 *     cross-tenant access denied even when the requester knows a valid
 *     client ID that isn't theirs.
 *
 * DEV bypass (`auth.userId === 'dev-user-000'`) is exempted from this check,
 * mirroring the identical guard already used by the RBAC dev bypass in
 * platform/rbac/middleware.ts — this module invents no new bypass mechanism,
 * and it is never reachable when `NODE_ENV === 'production'` (see
 * middleware/auth.ts's `devBypass` formula).
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuthorization } from './middleware.js';
import { ClientIdentityMappingService } from '../../services/client-identity-mapping-service.js';

export interface TenantAccessConfig {
  /** URL prefix this boundary applies to, e.g. '/api/v1/oc/'. */
  pathPrefix: string;
  /** Roles allowed to cross client boundaries. Defaults to admin/super_admin. */
  crossClientRoles?: readonly string[];
  /** Mirrors the existing DEV-only auth/authorization bypass. Never true in production. */
  devBypass?: boolean;
  /** Injectable for tests — defaults to a real, pool-backed instance. */
  mappingService?: ClientIdentityMappingService;
}

const DEFAULT_CROSS_CLIENT_ROLES: readonly string[] = ['admin', 'super_admin'];

/**
 * Registers the tenant-access preHandler hook. Must run AFTER
 * registerAuthMiddleware and registerAuthorizationMiddleware (depends on
 * request.auth and request.authorization set by those two).
 */
export function registerTenantAccessMiddleware(server: FastifyInstance, cfg: TenantAccessConfig): void {
  const crossClientRoles = new Set(cfg.crossClientRoles ?? DEFAULT_CROSS_CLIENT_ROLES);
  const mappingService = cfg.mappingService ?? new ClientIdentityMappingService();

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
    if (roles.some(r => crossClientRoles.has(r))) return; // admin/super_admin — unconditional cross-client access

    // Every other identity: server-side resolution from the real mapping table, keyed
    // by the VERIFIED org_context claim — never by anything the request itself supplied.
    const orgContext: string | undefined = auth.tenantId;
    const authorized = typeof orgContext === 'string' && orgContext !== 'public'
      ? await mappingService.isAuthorized(orgContext, clientId)
      : false;

    if (!authorized) {
      request.log.warn({ userId: auth.userId, orgContext, roles, clientId }, 'Tenant access denied — no active mapping for this org/client pair');
      reply.status(403).send({
        error: {
          category: 'authorization',
          code: 'SHARED.AUTHORIZATION_ERROR',
          // Distinguishes this (client-scope could not be resolved/authorized for this
          // identity) from platform/rbac/middleware.ts's plain 'forbidden' (a real
          // permission denial) — see that file's denyAccess() for the full rationale.
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
