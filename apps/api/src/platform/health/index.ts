/**
 * AskABD Comparison Platform — Health Engine Adapter
 *
 * Re-exports from @askabd/shared-health and adds comparison-specific
 * health dimensions (security, API, platform middleware).
 */

// Re-export the shared health engine (source of truth)
export { collectPlatformHealth } from '@askabd/shared-health';
export type { HealthStatus, HealthCheck, HealthDimension, PlatformHealthReport, HealthCheckProviders } from '@askabd/shared-health';
