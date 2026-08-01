/**
 * AskABD Platform — Default Role & Permission Definitions
 *
 * Configurable role-permission mappings. These are defaults that can be
 * overridden per-tenant or per-environment via configuration.
 *
 * Role hierarchy (inheritance):
 *   customer → business_user → admin → super_admin
 *   merchant (standalone, no inheritance)
 *   partner (standalone)
 *   support → auditor permissions
 *   auditor (read-only)
 */

import type { RoleDefinition, PermissionDefinition } from './types.js';

// ─── Permission Definitions ───────────────────────────────────────────────────

export const PERMISSIONS: readonly PermissionDefinition[] = [
  // Product / Item
  { id: 'Product.Read', resource: 'Product', action: 'Read', description: 'View products and items', category: 'catalog' },
  { id: 'Product.Create', resource: 'Product', action: 'Create', description: 'Create new products', category: 'catalog' },
  { id: 'Product.Update', resource: 'Product', action: 'Update', description: 'Update existing products', category: 'catalog' },
  { id: 'Product.Delete', resource: 'Product', action: 'Delete', description: 'Delete products', category: 'catalog' },

  // Category
  { id: 'Category.Read', resource: 'Category', action: 'Read', description: 'View categories', category: 'catalog' },
  { id: 'Category.Create', resource: 'Category', action: 'Create', description: 'Create categories', category: 'catalog' },
  { id: 'Category.Update', resource: 'Category', action: 'Update', description: 'Update categories', category: 'catalog' },
  { id: 'Category.Delete', resource: 'Category', action: 'Delete', description: 'Delete categories', category: 'catalog' },

  // Comparison
  { id: 'Comparison.Read', resource: 'Comparison', action: 'Read', description: 'View comparisons', category: 'comparison' },
  { id: 'Comparison.Create', resource: 'Comparison', action: 'Create', description: 'Create comparisons', category: 'comparison' },
  { id: 'Comparison.Share', resource: 'Comparison', action: 'Share', description: 'Share comparisons publicly', category: 'comparison' },

  // Template
  { id: 'Template.Read', resource: 'Template', action: 'Read', description: 'View templates', category: 'admin' },
  { id: 'Template.Create', resource: 'Template', action: 'Create', description: 'Create templates', category: 'admin' },
  { id: 'Template.Update', resource: 'Template', action: 'Update', description: 'Update templates', category: 'admin' },
  { id: 'Template.Delete', resource: 'Template', action: 'Delete', description: 'Delete templates', category: 'admin' },

  // Merchant
  { id: 'Merchant.Read', resource: 'Merchant', action: 'Read', description: 'View merchant profiles', category: 'merchant' },
  { id: 'Merchant.Create', resource: 'Merchant', action: 'Create', description: 'Register as merchant', category: 'merchant' },
  { id: 'Merchant.Approve', resource: 'Merchant', action: 'Approve', description: 'Approve merchant applications', category: 'merchant' },
  { id: 'Merchant.Manage', resource: 'Merchant', action: 'Manage', description: 'Full merchant management', category: 'merchant' },

  // Campaign
  { id: 'Campaign.Read', resource: 'Campaign', action: 'Read', description: 'View campaigns', category: 'merchant' },
  { id: 'Campaign.Create', resource: 'Campaign', action: 'Create', description: 'Create campaigns', category: 'merchant' },
  { id: 'Campaign.Manage', resource: 'Campaign', action: 'Manage', description: 'Full campaign management', category: 'merchant' },

  // Assessment (future)
  { id: 'Assessment.Read', resource: 'Assessment', action: 'Read', description: 'View assessments', category: 'assessment' },
  { id: 'Assessment.Run', resource: 'Assessment', action: 'Run', description: 'Execute assessments', category: 'assessment' },
  { id: 'Assessment.Configure', resource: 'Assessment', action: 'Configure', description: 'Configure assessment rules', category: 'assessment' },

  // Admin
  { id: 'Admin.Access', resource: 'Admin', action: 'Access', description: 'Access admin panel', category: 'system' },
  { id: 'Admin.Users', resource: 'Admin', action: 'Users', description: 'Manage users', category: 'system' },
  { id: 'Admin.Roles', resource: 'Admin', action: 'Roles', description: 'Manage roles and permissions', category: 'system' },
  { id: 'Admin.Config', resource: 'Admin', action: 'Config', description: 'Manage system configuration', category: 'system' },

  // Workflow (future)
  { id: 'Workflow.Read', resource: 'Workflow', action: 'Read', description: 'View workflows', category: 'workflow' },
  { id: 'Workflow.Execute', resource: 'Workflow', action: 'Execute', description: 'Execute workflows', category: 'workflow' },
  { id: 'Workflow.Design', resource: 'Workflow', action: 'Design', description: 'Design workflow rules', category: 'workflow' },

  // Audit
  { id: 'Audit.Read', resource: 'Audit', action: 'Read', description: 'View audit logs', category: 'system' },
  { id: 'Audit.Export', resource: 'Audit', action: 'Export', description: 'Export audit data', category: 'system' },

  // Search
  { id: 'Search.Execute', resource: 'Search', action: 'Execute', description: 'Execute searches', category: 'catalog' },
] as const;

// ─── Role Definitions ─────────────────────────────────────────────────────────

export const ROLES: readonly RoleDefinition[] = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Full platform access with all permissions',
    permissions: ['*'], // Wildcard — all permissions
    priority: 100,
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Organization administrator with broad access',
    permissions: [
      'Admin.Access', 'Admin.Users', 'Admin.Config',
      'Template.Read', 'Template.Create', 'Template.Update', 'Template.Delete',
      'Merchant.Approve', 'Merchant.Manage',
      'Assessment.Run', 'Assessment.Configure',
      'Workflow.Design', 'Workflow.Execute',
      'Audit.Read',
    ],
    inherits: ['business_user'],
    priority: 90,
  },
  {
    id: 'business_user',
    name: 'Business User',
    description: 'Standard business user with read/write access to business data',
    permissions: [
      'Product.Read', 'Product.Create', 'Product.Update',
      'Category.Read',
      'Comparison.Read', 'Comparison.Create', 'Comparison.Share',
      'Campaign.Read', 'Campaign.Create', 'Campaign.Manage',
      'Assessment.Read', 'Assessment.Run',
      'Workflow.Read', 'Workflow.Execute',
      'Search.Execute',
    ],
    inherits: ['customer'],
    priority: 50,
  },
  {
    id: 'merchant',
    name: 'Merchant',
    description: 'Verified merchant with product and campaign management',
    permissions: [
      'Product.Read', 'Product.Create', 'Product.Update', 'Product.Delete',
      'Category.Read',
      'Merchant.Read', 'Merchant.Create',
      'Campaign.Read', 'Campaign.Create', 'Campaign.Manage',
      'Search.Execute',
    ],
    priority: 40,
  },
  {
    id: 'partner',
    name: 'Partner',
    description: 'External integration partner with API access',
    permissions: [
      'Product.Read',
      'Category.Read',
      'Comparison.Read',
      'Search.Execute',
      'Assessment.Read',
    ],
    priority: 30,
  },
  {
    id: 'support',
    name: 'Support',
    description: 'Customer support with read access and audit visibility',
    permissions: [
      'Product.Read',
      'Category.Read',
      'Comparison.Read',
      'Merchant.Read',
      'Campaign.Read',
      'Audit.Read',
      'Search.Execute',
    ],
    priority: 35,
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description: 'Read-only access to all data and audit logs',
    permissions: [
      'Product.Read',
      'Category.Read',
      'Comparison.Read',
      'Merchant.Read',
      'Campaign.Read',
      'Template.Read',
      'Assessment.Read',
      'Workflow.Read',
      'Audit.Read', 'Audit.Export',
      'Search.Execute',
    ],
    priority: 25,
  },
  {
    id: 'customer',
    name: 'Customer',
    description: 'End user with basic read and comparison access',
    permissions: [
      'Product.Read',
      'Category.Read',
      'Comparison.Read', 'Comparison.Create',
      'Search.Execute',
    ],
    priority: 10,
  },
] as const;

/**
 * Permission lookup set for fast checking.
 */
export const PERMISSION_IDS = new Set(PERMISSIONS.map(p => p.id));

/**
 * Role lookup map for fast access.
 */
export const ROLE_MAP = new Map(ROLES.map(r => [r.id, r]));
