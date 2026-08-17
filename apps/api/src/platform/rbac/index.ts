/**
 * AskABD Platform — RBAC Module
 *
 * Reusable Role-Based Access Control framework.
 * Import from 'platform/rbac' for authorization capabilities.
 */

// Types
export type {
  Permission,
  Role,
  RoleDefinition,
  PermissionDefinition,
  AuthorizationContext,
  AuthorizationDecision,
  RouteRule,
} from './types.js';

// Engine
export {
  resolvePermissions,
  hasPermission,
  authorize,
  authorizeAny,
  authorizeAll,
  buildAuthorizationContext,
} from './engine.js';

// Middleware
export {
  registerAuthorizationMiddleware,
  getAuthorization,
  requirePermission,
} from './middleware.js';
export type { AuthorizationConfig } from './middleware.js';

// Tenant/client access boundary (the third security question — see tenant-access.ts)
export { registerTenantAccessMiddleware } from './tenant-access.js';
export type { TenantAccessConfig } from './tenant-access.js';

// Configuration
export { PERMISSIONS, ROLES, PERMISSION_IDS, ROLE_MAP } from './roles.js';
export { COMPARISON_API_RULES } from './rules.js';
