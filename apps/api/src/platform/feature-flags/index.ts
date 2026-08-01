/**
 * Re-exports from @askabd/shared-feature-flags + comparison-specific default flags.
 */
export { FeatureFlagEngine, isFeatureEnabled } from '@askabd/shared-feature-flags';
export type { FeatureFlag, FeatureFlagRule, FeatureFlagContext } from '@askabd/shared-feature-flags';
import { getFeatureFlags as sharedGetFeatureFlags } from '@askabd/shared-feature-flags';
import type { FeatureFlag } from '@askabd/shared-feature-flags';

/** Comparison-specific default flags */
const COMPARISON_FLAGS: FeatureFlag[] = [
  { id: 'comparison.enabled', name: 'Comparison Engine', description: 'Core comparison', module: 'comparison', enabled: true },
  { id: 'marketplace.enabled', name: 'Marketplace', description: 'Merchant products', module: 'marketplace', enabled: true },
  { id: 'wallet.enabled', name: 'Digital Wallet', description: 'Payment features', module: 'wallet', enabled: false },
  { id: 'assessment.enabled', name: 'Enterprise Assessment', description: 'Assessment engine', module: 'assessment', enabled: false },
  { id: 'ai.enabled', name: 'AI Features', description: 'AI recommendations', module: 'ai', enabled: false },
  { id: 'enterprise.enabled', name: 'Enterprise Features', description: 'SSO, audit, compliance', module: 'enterprise', enabled: true, rules: [{ environments: ['production'], tenants: ['enterprise'], enabled: true }, { environments: ['development', 'test'], enabled: true }] },
  { id: 'search.advanced', name: 'Advanced Search', description: 'Full-text search', module: 'search', enabled: true },
  { id: 'merchant.portal', name: 'Merchant Portal', description: 'Merchant self-service', module: 'merchant', enabled: true },
];

export function getFeatureFlags() { return sharedGetFeatureFlags(COMPARISON_FLAGS); }
