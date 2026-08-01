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
] as const;
