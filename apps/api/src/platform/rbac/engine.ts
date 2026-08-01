/**
 * AskABD Platform — Authorization Engine
 *
 * Resolves permissions from roles (including inheritance) and evaluates
 * access decisions. Stateless — all state comes from configuration.
 *
 * Designed for extraction to @askabd/shared-authorization.
 *
 * Features:
 * - Role inheritance resolution (recursive)
 * - Wildcard permission support ('*')
 * - Resource.* pattern matching (e.g., 'Product.*' grants all Product actions)
 * - Cached resolution for performance
 * - Decision audit trail
 */

import type {
  Role,
  Permission,
  RoleDefinition,
  AuthorizationContext,
  AuthorizationDecision,
} from './types.js';
import { ROLE_MAP } from './roles.js';

/**
 * Resolves all effective permissions for a set of roles.
 * Handles inheritance recursively with cycle detection.
 */
export function resolvePermissions(
  roles: readonly Role[],
  roleMap: ReadonlyMap<string, RoleDefinition> = ROLE_MAP,
): Set<Permission> {
  const resolved = new Set<Permission>();
  const visited = new Set<Role>();

  function resolve(roleId: Role): void {
    if (visited.has(roleId)) return; // Cycle protection
    visited.add(roleId);

    const role = roleMap.get(roleId);
    if (!role) return;

    for (const perm of role.permissions) {
      resolved.add(perm);
    }

    if (role.inherits) {
      for (const parentRole of role.inherits) {
        resolve(parentRole);
      }
    }
  }

  for (const role of roles) {
    resolve(role);
  }

  return resolved;
}

/**
 * Checks if a permission set grants a specific permission.
 * Supports:
 * - Exact match: 'Product.Create'
 * - Wildcard: '*' grants everything
 * - Resource wildcard: 'Product.*' grants all Product actions
 */
export function hasPermission(
  effectivePermissions: ReadonlySet<Permission>,
  requiredPermission: Permission,
): boolean {
  // Superuser wildcard
  if (effectivePermissions.has('*')) return true;

  // Exact match
  if (effectivePermissions.has(requiredPermission)) return true;

  // Resource wildcard (e.g., 'Product.*' matches 'Product.Create')
  const [resource] = requiredPermission.split('.');
  if (resource && effectivePermissions.has(`${resource}.*`)) return true;

  return false;
}

/**
 * Evaluates an authorization decision for a given context and permission.
 */
export function authorize(
  context: AuthorizationContext,
  requiredPermission: Permission,
): AuthorizationDecision {
  // Check direct grants first
  if (context.directGrants?.includes(requiredPermission)) {
    return { allowed: true, permission: requiredPermission, grantedBy: 'direct' };
  }

  // Check effective permissions (from role resolution)
  const effectivePermissions = new Set(context.permissions);

  if (hasPermission(effectivePermissions, requiredPermission)) {
    // Determine which role granted access
    const grantingRole = findGrantingRole(context.roles, requiredPermission);
    return { allowed: true, permission: requiredPermission, grantedBy: grantingRole ?? 'direct' };
  }

  return {
    allowed: false,
    permission: requiredPermission,
    reason: `Permission '${requiredPermission}' not granted to roles [${context.roles.join(', ')}]`,
  };
}

/**
 * Checks multiple permissions — returns true if ANY is granted (OR logic).
 */
export function authorizeAny(
  context: AuthorizationContext,
  permissions: readonly Permission[],
): AuthorizationDecision {
  for (const perm of permissions) {
    const decision = authorize(context, perm);
    if (decision.allowed) return decision;
  }

  return {
    allowed: false,
    permission: permissions[0] ?? 'unknown',
    reason: `None of [${permissions.join(', ')}] granted to roles [${context.roles.join(', ')}]`,
  };
}

/**
 * Checks multiple permissions — returns true if ALL are granted (AND logic).
 */
export function authorizeAll(
  context: AuthorizationContext,
  permissions: readonly Permission[],
): AuthorizationDecision {
  for (const perm of permissions) {
    const decision = authorize(context, perm);
    if (!decision.allowed) return decision;
  }

  return {
    allowed: true,
    permission: permissions.join(' + '),
    grantedBy: context.roles[0],
  };
}

/**
 * Finds which role grants a specific permission.
 */
function findGrantingRole(
  roles: readonly Role[],
  permission: Permission,
  roleMap: ReadonlyMap<string, RoleDefinition> = ROLE_MAP,
): Role | undefined {
  for (const roleId of roles) {
    const rolePerms = resolvePermissions([roleId], roleMap);
    if (hasPermission(rolePerms, permission)) {
      return roleId;
    }
  }
  return undefined;
}

/**
 * Builds an AuthorizationContext from roles.
 * Resolves all inherited permissions.
 */
export function buildAuthorizationContext(
  userId: string,
  tenantId: string,
  roles: readonly Role[],
  directGrants?: readonly Permission[],
): AuthorizationContext {
  const resolved = resolvePermissions(roles);
  if (directGrants) {
    for (const grant of directGrants) {
      resolved.add(grant);
    }
  }

  return {
    userId,
    tenantId,
    roles,
    permissions: Array.from(resolved),
    directGrants,
  };
}
