/**
 * AskABD Platform — Feature Flag Framework
 *
 * Configurable feature flags scoped by environment, tenant, organization,
 * user, role, and module. Enables enabling/disabling capabilities without
 * code changes.
 *
 * Designed for extraction to @askabd/shared-feature-flags.
 *
 * Supports:
 * - Environment-based (dev/staging/production)
 * - Tenant-based (per organization)
 * - User-based (per individual)
 * - Role-based (per role)
 * - Module-based (per feature area)
 * - Percentage rollouts
 * - Date-based activation
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  /** Unique flag identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of what this flag controls */
  readonly description: string;
  /** Module this flag belongs to */
  readonly module: string;
  /** Whether the flag is globally enabled */
  readonly enabled: boolean;
  /** Targeting rules (evaluated in order, first match wins) */
  readonly rules?: readonly FeatureFlagRule[];
  /** Activation date (flag disabled before this date) */
  readonly activateAfter?: string;
  /** Deactivation date (flag disabled after this date) */
  readonly deactivateBefore?: string;
}

export interface FeatureFlagRule {
  /** Rule description */
  readonly description?: string;
  /** Environments where this rule applies */
  readonly environments?: readonly string[];
  /** Tenant IDs where this rule applies */
  readonly tenants?: readonly string[];
  /** Organization IDs */
  readonly organizations?: readonly string[];
  /** User IDs */
  readonly users?: readonly string[];
  /** Roles */
  readonly roles?: readonly string[];
  /** Percentage rollout (0-100) */
  readonly percentage?: number;
  /** Whether this rule enables or disables the flag */
  readonly enabled: boolean;
}

export interface FeatureFlagContext {
  readonly environment: string;
  readonly tenantId?: string;
  readonly organizationId?: string;
  readonly userId?: string;
  readonly roles?: readonly string[];
}

// ─── Default Flags ────────────────────────────────────────────────────────────

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    id: 'comparison.enabled',
    name: 'Comparison Engine',
    description: 'Core comparison functionality',
    module: 'comparison',
    enabled: true,
  },
  {
    id: 'marketplace.enabled',
    name: 'Marketplace',
    description: 'Marketplace features for merchant products',
    module: 'marketplace',
    enabled: true,
  },
  {
    id: 'wallet.enabled',
    name: 'Digital Wallet',
    description: 'Digital wallet and payment features',
    module: 'wallet',
    enabled: false, // Not yet implemented
  },
  {
    id: 'assessment.enabled',
    name: 'Enterprise Assessment',
    description: 'Enterprise assessment and diagnostics engine',
    module: 'assessment',
    enabled: false, // Future capability
  },
  {
    id: 'ai.enabled',
    name: 'AI Features',
    description: 'AI-powered recommendations and analysis',
    module: 'ai',
    enabled: false, // Future capability
  },
  {
    id: 'enterprise.enabled',
    name: 'Enterprise Features',
    description: 'Enterprise-grade features (SSO, audit, compliance)',
    module: 'enterprise',
    enabled: true,
    rules: [
      { environments: ['production'], tenants: ['enterprise'], enabled: true },
      { environments: ['development', 'test'], enabled: true },
    ],
  },
  {
    id: 'search.advanced',
    name: 'Advanced Search',
    description: 'Full-text search with faceting and filters',
    module: 'search',
    enabled: true,
  },
  {
    id: 'merchant.portal',
    name: 'Merchant Portal',
    description: 'Merchant self-service portal',
    module: 'merchant',
    enabled: true,
  },
];

// ─── Feature Flag Engine ──────────────────────────────────────────────────────

class FeatureFlagEngine {
  private flags: Map<string, FeatureFlag>;

  constructor(flags: readonly FeatureFlag[] = DEFAULT_FLAGS) {
    this.flags = new Map(flags.map(f => [f.id, f]));
  }

  /**
   * Checks if a feature flag is enabled for the given context.
   */
  isEnabled(flagId: string, context: FeatureFlagContext): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) return false;

    // Check date-based activation
    const now = new Date().toISOString();
    if (flag.activateAfter && now < flag.activateAfter) return false;
    if (flag.deactivateBefore && now > flag.deactivateBefore) return false;

    // If no rules, use global enabled state
    if (!flag.rules || flag.rules.length === 0) {
      return flag.enabled;
    }

    // Evaluate rules in order (first match wins)
    for (const rule of flag.rules) {
      if (matchesRule(rule, context)) {
        return rule.enabled;
      }
    }

    // No rule matched — fall back to global enabled state
    return flag.enabled;
  }

  /**
   * Gets all flags and their status for a context.
   */
  getAllFlags(context: FeatureFlagContext): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [id] of this.flags) {
      result[id] = this.isEnabled(id, context);
    }
    return result;
  }

  /**
   * Registers a new flag dynamically.
   */
  register(flag: FeatureFlag): void {
    this.flags.set(flag.id, flag);
  }

  /**
   * Updates an existing flag.
   */
  update(flagId: string, update: Partial<Omit<FeatureFlag, 'id'>>): void {
    const existing = this.flags.get(flagId);
    if (existing) {
      this.flags.set(flagId, { ...existing, ...update });
    }
  }

  /**
   * Lists all registered flags.
   */
  list(): readonly FeatureFlag[] {
    return Array.from(this.flags.values());
  }
}

function matchesRule(rule: FeatureFlagRule, context: FeatureFlagContext): boolean {
  // Environment check
  if (rule.environments && rule.environments.length > 0) {
    if (!rule.environments.includes(context.environment)) return false;
  }

  // Tenant check
  if (rule.tenants && rule.tenants.length > 0) {
    if (!context.tenantId || !rule.tenants.includes(context.tenantId)) return false;
  }

  // Organization check
  if (rule.organizations && rule.organizations.length > 0) {
    if (!context.organizationId || !rule.organizations.includes(context.organizationId)) return false;
  }

  // User check
  if (rule.users && rule.users.length > 0) {
    if (!context.userId || !rule.users.includes(context.userId)) return false;
  }

  // Role check
  if (rule.roles && rule.roles.length > 0) {
    if (!context.roles || !context.roles.some(r => rule.roles!.includes(r))) return false;
  }

  // Percentage rollout (hash userId for consistent assignment)
  if (rule.percentage !== undefined && rule.percentage < 100) {
    if (!context.userId) return false;
    const hash = simpleHash(context.userId);
    if ((hash % 100) >= rule.percentage) return false;
  }

  return true;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let engineInstance: FeatureFlagEngine | null = null;

export function getFeatureFlags(): FeatureFlagEngine {
  if (!engineInstance) {
    engineInstance = new FeatureFlagEngine();
  }
  return engineInstance;
}

/**
 * Quick check — is a feature enabled for the given context?
 */
export function isFeatureEnabled(flagId: string, context: FeatureFlagContext): boolean {
  return getFeatureFlags().isEnabled(flagId, context);
}
