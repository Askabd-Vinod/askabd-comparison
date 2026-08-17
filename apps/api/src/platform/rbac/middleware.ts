/**
 * AskABD Platform — Authorization Middleware
 *
 * Fastify preHandler that evaluates route-level RBAC rules.
 * Works with the auth middleware (which provides AuthContext on the request).
 *
 * Designed for extraction to @askabd/shared-middleware.
 *
 * Features:
 * - Declarative route rules (method + path → required permissions)
 * - Configurable default policy (allow/deny authenticated)
 * - Resolves roles to permissions via the RBAC engine
 * - Structured 403 responses using shared-errors format
 * - Dev bypass inherited from auth middleware
 *
 * Three audiences:
 * - User: "You do not have permission to perform this action."
 * - Developer: Decision details in logs (which permission failed, which role)
 * - Admin: Route rules configurable without code changes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RouteRule, AuthorizationContext, Permission } from './types.js';
import { buildAuthorizationContext, authorizeAny } from './engine.js';
import type { AuthContext } from '../../contracts/index.js';
import { ROLE_MAP } from './roles.js';

/**
 * Authorization middleware configuration.
 */
export interface AuthorizationConfig {
  /** Route rules defining required permissions */
  rules: readonly RouteRule[];
  /** Default policy for routes without explicit rules */
  defaultPolicy: 'authenticated' | 'deny' | 'allow';
  /** Routes excluded from authorization (public/health) */
  excludeRoutes?: readonly string[];
  /** Whether to bypass authorization in development mode */
  devBypass?: boolean;
}

const DEFAULT_AUTHORIZATION_CONFIG: AuthorizationConfig = {
  rules: [],
  defaultPolicy: 'authenticated',
  excludeRoutes: ['/health', '/ready'],
  devBypass: true,
};

/**
 * Registers authorization middleware.
 * Must run AFTER auth middleware (depends on request.auth).
 */
export function registerAuthorizationMiddleware(
  server: FastifyInstance,
  userConfig?: Partial<AuthorizationConfig>,
): void {
  const cfg: AuthorizationConfig = { ...DEFAULT_AUTHORIZATION_CONFIG, ...userConfig };

  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0]!;

    // Skip excluded routes
    if (cfg.excludeRoutes?.some(r => path === r || path.startsWith(r + '/'))) {
      return;
    }

    // Get auth context from request (set by auth middleware)
    const auth: AuthContext | null = (request as any).auth ?? null;

    // No auth context — already handled by auth middleware (401)
    if (!auth) return;

    // Dev bypass: if userId is dev-user-000, grant all permissions
    if (cfg.devBypass && auth.userId === 'dev-user-000') {
      (request as any).authorization = buildAuthorizationContext(
        auth.userId,
        auth.tenantId,
        ['super_admin'],
        ROLE_MAP,
      );
      return;
    }

    // Build authorization context from auth
    const roles = extractRoles(auth);
    const authzContext = buildAuthorizationContext(
      auth.userId,
      auth.tenantId,
      roles,
      ROLE_MAP,
    );

    // Attach authorization context to request
    (request as any).authorization = authzContext;

    // Find matching route rule
    const rule = findMatchingRule(request.method, path, cfg.rules);

    if (!rule) {
      // No explicit rule — apply default policy
      if (cfg.defaultPolicy === 'allow') return;
      if (cfg.defaultPolicy === 'authenticated') return; // Already authenticated
      // 'deny' — no explicit rule means denied
      return denyAccess(request, reply, 'No authorization rule found for this route');
    }

    // If rule only requires authentication, we're done
    if (rule.authenticatedOnly) return;

    // Check permissions
    if (rule.permissions.length > 0) {
      const decision = authorizeAny(authzContext, rule.permissions);
      if (!decision.allowed) {
        request.log.warn({
          userId: auth.userId,
          roles,
          requiredPermissions: rule.permissions,
          reason: decision.reason,
        }, 'Authorization denied');
        return denyAccess(request, reply, decision.reason);
      }
    }

    // Check roles (alternative to permissions)
    if (rule.roles && rule.roles.length > 0) {
      const hasRole = rule.roles.some(r => roles.includes(r));
      if (!hasRole) {
        request.log.warn({
          userId: auth.userId,
          userRoles: roles,
          requiredRoles: rule.roles,
        }, 'Authorization denied (role check)');
        return denyAccess(request, reply, `Requires one of roles: ${rule.roles.join(', ')}`);
      }
    }
  });
}

/**
 * Extracts roles from AuthContext.
 * Supports both direct roles array and permissions-based fallback.
 */
function extractRoles(auth: AuthContext): string[] {
  // AuthContext from shared-contracts may have roles in metadata
  const meta = (auth as any).metadata;
  if (meta?.roles && Array.isArray(meta.roles)) {
    return meta.roles;
  }

  // Fallback: treat permissions as roles if they match known role IDs
  if (auth.permissions && auth.permissions.length > 0) {
    return auth.permissions.filter(p => !p.includes('.'));
  }

  // Default: customer role for authenticated users
  return ['customer'];
}

/**
 * Matches a request against route rules.
 */
function findMatchingRule(
  method: string,
  path: string,
  rules: readonly RouteRule[],
): RouteRule | undefined {
  for (const rule of rules) {
    if (rule.method !== '*' && rule.method.toUpperCase() !== method.toUpperCase()) {
      continue;
    }
    if (matchPath(path, rule.path)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Simple path matching with :param and * support.
 */
function matchPath(actual: string, pattern: string): boolean {
  // Exact match
  if (actual === pattern) return true;

  // Prefix match with trailing wildcard
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return actual.startsWith(prefix);
  }

  // Segment-by-segment with :param support
  const actualParts = actual.split('/');
  const patternParts = pattern.split('/');

  if (actualParts.length !== patternParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    if (pp.startsWith(':')) continue; // Parameter — matches anything
    if (pp !== actualParts[i]) return false;
  }

  return true;
}

/**
 * Sends a structured 403 response.
 *
 * `reasonCode: 'forbidden'` is a stable, safe, non-leaking discriminator distinguishing
 * this (a real RBAC permission denial) from `tenant-access.ts`'s `'tenant_not_resolved'`
 * (a client-scope denial) — both are 403s, but a real frontend should be able to render
 * "You don't have permission to access this resource." vs. "Your organization access
 * could not be determined." without guessing from the human-readable `message` alone.
 */
function denyAccess(
  _request: FastifyRequest,
  reply: FastifyReply,
  reason?: string,
): void {
  reply.status(403).send({
    error: {
      category: 'authorization',
      code: 'SHARED.AUTHORIZATION_ERROR',
      reasonCode: 'forbidden',
      message: 'You do not have permission to perform this action.',
      statusCode: 403,
      ...(process.env.NODE_ENV !== 'production' && reason ? { detail: reason } : {}),
    },
  });
}

/**
 * Helper to get AuthorizationContext from request.
 */
export function getAuthorization(request: FastifyRequest): AuthorizationContext | null {
  return (request as any).authorization ?? null;
}

/**
 * Inline permission check for use within route handlers.
 * Useful when a route needs dynamic permission checks beyond static rules.
 */
export function requirePermission(
  request: FastifyRequest,
  permission: Permission,
): boolean {
  const authz: AuthorizationContext | null = (request as any).authorization;
  if (!authz) return false;

  const perms = new Set(authz.permissions);
  if (perms.has('*')) return true;
  if (perms.has(permission)) return true;

  const [resource] = permission.split('.');
  if (resource && perms.has(`${resource}.*`)) return true;

  return false;
}
