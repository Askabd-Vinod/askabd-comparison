/**
 * AskABD Comparison Platform — Shared Contract Adoption
 *
 * Re-exports from @askabd/shared-contracts for internal use.
 * External API response format is preserved (no ApiResponse envelope).
 *
 * These types prepare the platform for:
 * - Identity integration (AuthContext, TenantContext)
 * - Standardized pagination (future API v2)
 * - Structured filtering and sorting
 */

// Pagination (internal use for service layer)
export { parsePaginationParams, parseSortParams, SortDirection } from '@askabd/shared-contracts';
export type { PaginationParams, PaginatedResponse, SortParams } from '@askabd/shared-contracts';

// Auth context (for future identity integration)
export { AuthContextSchema } from '@askabd/shared-contracts';
export type { AuthContext } from '@askabd/shared-contracts';

// Tenant context
export { TenantContextSchema } from '@askabd/shared-contracts';
export type { TenantContext } from '@askabd/shared-contracts';

// Audit (for future audit trail)
export { createAuditEvent, AuditActions } from '@askabd/shared-contracts';
export type { AuditEvent, AuditAction, ResourceRef } from '@askabd/shared-contracts';

// Filtering
export { FilterOperators } from '@askabd/shared-contracts';
export type { FilterOperator, FilterExpression } from '@askabd/shared-contracts';
