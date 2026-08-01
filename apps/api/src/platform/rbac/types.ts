/**
 * AskABD Platform — Authorization Types (RBAC)
 *
 * Reusable type definitions for Role-Based Access Control.
 * Designed for extraction to @askabd/shared-authorization.
 *
 * Supports:
 * - Configurable roles (not hardcoded)
 * - Configurable permissions (resource.action pattern)
 * - Role → permission mappings
 * - Hierarchical role inheritance
 * - Tenant-scoped authorization
 * - Future: attribute-based access control (ABAC) extension
 */

/**
 * A permission follows the pattern: Resource.Action
 * Examples: Product.Create, Merchant.Approve, Assessment.Run
 */
export type Permission = string;

/**
 * A role identifier. Roles are configurable, not enum-based.
 * Built-in roles: super_admin, admin, business_user, merchant,
 * partner, support, auditor, customer
 */
export type Role = string;

/**
 * Role definition with metadata and permissions.
 */
export interface RoleDefinition {
  /** Unique role identifier */
  readonly id: Role;
  /** Human-readable name */
  readonly name: string;
  /** Description of the role's purpose */
  readonly description: string;
  /** Permissions directly assigned to this role */
  readonly permissions: readonly Permission[];
  /** Roles this role inherits from (additive) */
  readonly inherits?: readonly Role[];
  /** Priority for conflict resolution (higher = more privileged) */
  readonly priority: number;
}

/**
 * Permission definition with metadata.
 */
export interface PermissionDefinition {
  /** Permission identifier (Resource.Action) */
  readonly id: Permission;
  /** Resource this permission applies to */
  readonly resource: string;
  /** Action this permission allows */
  readonly action: string;
  /** Human-readable description */
  readonly description: string;
  /** Category for grouping in UI */
  readonly category: string;
}

/**
 * Authorization context attached to a request.
 * Extends AuthContext with resolved roles and permissions.
 */
export interface AuthorizationContext {
  /** User ID from authentication */
  readonly userId: string;
  /** Tenant/organization ID */
  readonly tenantId: string;
  /** Roles assigned to this user */
  readonly roles: readonly Role[];
  /** Effective permissions (resolved from roles + direct grants) */
  readonly permissions: readonly Permission[];
  /** Direct permission grants (bypass role resolution) */
  readonly directGrants?: readonly Permission[];
}

/**
 * Authorization decision result.
 */
export interface AuthorizationDecision {
  /** Whether access is allowed */
  readonly allowed: boolean;
  /** The permission that was checked */
  readonly permission: Permission;
  /** The role that granted access (if allowed) */
  readonly grantedBy?: Role | 'direct';
  /** Reason for denial (if denied) */
  readonly reason?: string;
}

/**
 * Route authorization rule.
 */
export interface RouteRule {
  /** HTTP method (GET, POST, etc.) or '*' for all */
  readonly method: string | '*';
  /** URL path pattern (supports :param and * wildcards) */
  readonly path: string;
  /** Required permission(s) — any one grants access */
  readonly permissions: readonly Permission[];
  /** Required role(s) — any one grants access (alternative to permissions) */
  readonly roles?: readonly Role[];
  /** Whether authenticated-only is sufficient (no specific permission needed) */
  readonly authenticatedOnly?: boolean;
}
