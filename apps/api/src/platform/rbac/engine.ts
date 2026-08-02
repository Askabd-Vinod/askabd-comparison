/**
 * Re-exports RBAC engine from @askabd/shared-authorization.
 * The comparison platform provides its own ROLE_MAP via roles.ts.
 */
export {
  resolvePermissions,
  hasPermission,
  authorize,
  authorizeAny,
  authorizeAll,
  buildAuthorizationContext,
} from '@askabd/shared-authorization';
