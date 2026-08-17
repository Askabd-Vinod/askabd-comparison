/**
 * AskABD Service Requirement Matrix — makes connector requirements SERVICE-DRIVEN,
 * not connector-driven.
 *
 * Evidence sources reused (nothing invented):
 * - `oc_capabilities.external_dependencies` — real, human-curated text per platform
 *   capability (e.g. "Database connectivity", "GitHub Actions", "Prometheus"),
 *   already persisted, previously never exposed by any route.
 * - `oc_client_services` — real per-client capability enablement (written by the
 *   existing `POST /oc/clients/:clientId/services/:serviceId/enable` endpoint).
 * - `RequirementsService` (requirements-service.ts) — the existing, real onboarding
 *   information-collection engine (identity → security → environment → connector
 *   configuration → discovery). Reused as-is, not duplicated.
 * - `ConnectorService` (connector-service.ts) — the existing, real connection-testing
 *   engine. Reused as-is for actual per-connector status.
 *
 * IMPORTANT — an honest limitation, not silently worked around: as of this milestone,
 * `oc_client_services` has zero explicit rows for any real (non-demo) client. The
 * existing `/oc/clients/:clientId/services` route's `clientStatus` therefore falls back
 * to "enabled" for every *platform-operational* capability when no explicit row exists —
 * that fallback is a reasonable default for *listing what the platform can do*, but it is
 * NOT genuine evidence that a specific client actually needs a specific connector. This
 * service deliberately uses ONLY explicit `oc_client_services` rows (status='enabled') as
 * evidence for "this connector is relevant to this client" — never the operational
 * fallback — so a client with no services explicitly selected yet gets an honest "no
 * service-specific requirements identified yet" rather than a fabricated list built from
 * every operational capability's dependencies.
 */

import { sharedPool } from './db-pool.js';
import { RequirementsService, serviceDefinitions } from './requirements-service.js';
import { ConnectorService } from './connector-service.js';

const dbPool = sharedPool;
const requirementsService = new RequirementsService();
const connectorService = new ConnectorService();

/**
 * Maps known `oc_capabilities.external_dependencies` phrases (verified present in the
 * seeded data — see docs/service-driven-client-onboarding-report.md section B for the
 * exact query) to a real connector-catalog entry. Substring match, case-insensitive.
 * Phrases with no real connector-catalog representation (payment providers, SMTP,
 * message brokers, compliance framework definitions) are deliberately left unmapped —
 * they are reported as "not represented in the connector catalog" rather than forced
 * onto an unrelated connector.
 */
const DEPENDENCY_TO_CONNECTOR: Array<{ match: string; connectorId: string; connectorName: string; category: string }> = [
  { match: 'database connectivity', connectorId: 'postgresql', connectorName: 'PostgreSQL', category: 'databases' },
  { match: 'target database access', connectorId: 'postgresql', connectorName: 'PostgreSQL', category: 'databases' },
  { match: 'target database write access', connectorId: 'postgresql', connectorName: 'PostgreSQL', category: 'databases' },
  { match: 'cloud provider sdks', connectorId: 'aws', connectorName: 'AWS', category: 'cloud' },
  { match: 'cloud storage (s3)', connectorId: 'aws', connectorName: 'AWS', category: 'cloud' },
  { match: 'ml infrastructure', connectorId: 'aws', connectorName: 'AWS', category: 'cloud' },
  { match: 'docker socket access', connectorId: 'docker', connectorName: 'Docker', category: 'containers' },
  { match: 'prometheus', connectorId: 'prometheus', connectorName: 'Prometheus', category: 'monitoring' },
  { match: 'grafana', connectorId: 'grafana', connectorName: 'Grafana', category: 'monitoring' },
  { match: 'github actions', connectorId: 'github-actions', connectorName: 'GitHub Actions', category: 'ci-cd' },
  { match: 'metrics provider (cloudwatch/datadog)', connectorId: 'datadog', connectorName: 'Datadog', category: 'monitoring' },
];

export interface RelevantConnector {
  connectorId: string;
  connectorName: string;
  category: string;
  classification: 'required' | 'optional';
  requiredBy: Array<{ capabilityId: string; capabilityName: string }>;
  status: string; // real ConnectorService status, or 'not_configured'
  lastTestedAt: string | null;
}

export interface UnmappedDependency {
  capabilityId: string;
  capabilityName: string;
  dependency: string; // the raw external_dependencies phrase — honestly surfaced, not silently dropped
}

export interface ClientOnboardingRequirements {
  clientId: string;
  services: Array<{ capabilityId: string; capabilityName: string; category: string; domain: string }>;
  relevantConnectors: RelevantConnector[];
  hiddenConnectorCount: number; // connectors in the full catalog not relevant to any selected service
  unmappedDependencies: UnmappedDependency[]; // real dependencies with no connector-catalog equivalent
  requiredInformation: Array<{ serviceId: string; serviceName: string; requirementKey: string; requirementName: string; whyRequired: string; status: string }>;
  onboardingReadiness: { total: number; provided: number; required: number; requiredProvided: number; status: string } | null;
  nextActions: string[];
}

export class ServiceRequirementMatrixService {

  /**
   * The real per-client requirement summary: "What do we need from this client?"
   * Combines explicit service selection (oc_client_services), the real connector
   * catalog mapping above, real connector test status, and the existing onboarding
   * requirement engine — nothing here is a second, competing calculation of any of
   * those; each piece is read from its one authoritative source.
   */
  async getClientOnboardingRequirements(clientId: string): Promise<ClientOnboardingRequirements> {
    // Explicit, real per-client service selection only — never the operational fallback.
    const enabledRes = await dbPool.query(
      `SELECT cs.service_id, c.name, c.category, c.domain, c.external_dependencies
       FROM oc_client_services cs
       JOIN oc_capabilities c ON c.id = cs.service_id
       WHERE cs.client_id = $1 AND cs.status = 'enabled'
       ORDER BY c.category, c.name`,
      [clientId]
    );

    const services = enabledRes.rows.map(r => ({ capabilityId: r.service_id, capabilityName: r.name, category: r.category, domain: r.domain }));

    // Map each enabled capability's real external_dependencies to real connector-catalog entries.
    const relevantByConnector = new Map<string, RelevantConnector>();
    const unmappedDependencies: UnmappedDependency[] = [];

    for (const row of enabledRes.rows) {
      const deps: string[] = Array.isArray(row.external_dependencies) ? row.external_dependencies : [];
      for (const dep of deps) {
        const depLower = dep.toLowerCase();
        const mapping = DEPENDENCY_TO_CONNECTOR.find(m => depLower.includes(m.match));
        if (!mapping) {
          unmappedDependencies.push({ capabilityId: row.service_id, capabilityName: row.name, dependency: dep });
          continue;
        }
        const existing = relevantByConnector.get(mapping.connectorId);
        if (existing) {
          existing.requiredBy.push({ capabilityId: row.service_id, capabilityName: row.name });
        } else {
          relevantByConnector.set(mapping.connectorId, {
            connectorId: mapping.connectorId, connectorName: mapping.connectorName, category: mapping.category,
            // The database connector is classified required — every capability whose real
            // external_dependencies text maps to it is discovery/connector-framework/migration,
            // i.e. capabilities that cannot function at all without client database access.
            // Everything else is optional (relevant, but the client's service can still
            // operate in a degraded/manual mode without it).
            classification: mapping.connectorId === 'postgresql' ? 'required' : 'optional',
            requiredBy: [{ capabilityId: row.service_id, capabilityName: row.name }],
            status: 'not_configured', lastTestedAt: null,
          });
        }
      }
    }

    // Attach real connector status (never fabricated) for each relevant connector.
    const realConnectors = await connectorService.getConnectors(clientId);
    for (const rc of relevantByConnector.values()) {
      const real = realConnectors.find(c => c.provider === rc.connectorId);
      if (real) { rc.status = real.status; rc.lastTestedAt = real.last_tested_at || null; }
    }

    const relevantConnectors = [...relevantByConnector.values()].sort((a, b) => (a.classification === b.classification ? 0 : a.classification === 'required' ? -1 : 1));

    // Total catalog size is owned by the frontend's connectorCatalog (33 entries across 11
    // categories) — this service doesn't duplicate that list, it only reports how many of
    // them are NOT relevant so the UI can say "N other connectors hidden" honestly.
    const TOTAL_CATALOG_SIZE = 33;
    const hiddenConnectorCount = Math.max(0, TOTAL_CATALOG_SIZE - relevantConnectors.length);

    // Reuse the existing onboarding requirement engine as-is — aggregate across all its
    // defined stages rather than duplicating its readiness logic.
    const requiredInformation: ClientOnboardingRequirements['requiredInformation'] = [];
    let onboardingReadiness: ClientOnboardingRequirements['onboardingReadiness'] = null;
    let totals = { total: 0, provided: 0, required: 0, requiredProvided: 0 };
    for (const def of serviceDefinitions) {
      const reqs = await requirementsService.getRequirements(clientId, def.serviceId);
      for (const r of reqs) {
        if (r.required && r.status !== 'provided' && r.status !== 'valid') {
          requiredInformation.push({ serviceId: def.serviceId, serviceName: def.serviceName, requirementKey: r.requirementKey, requirementName: r.requirementName, whyRequired: r.whyRequired || r.description, status: r.status });
        }
      }
      const readiness = await requirementsService.getReadiness(clientId, def.serviceId);
      totals.total += readiness.total; totals.provided += readiness.provided;
      totals.required += readiness.required; totals.requiredProvided += readiness.requiredProvided;
    }
    if (totals.required > 0) {
      onboardingReadiness = { ...totals, status: totals.requiredProvided === totals.required ? 'ready' : totals.requiredProvided > 0 ? 'partially_ready' : 'blocked' };
    }

    const nextActions: string[] = [];
    for (const info of requiredInformation.slice(0, 5)) nextActions.push(`Provide ${info.requirementName} (${info.serviceName})`);
    for (const rc of relevantConnectors.filter(c => c.classification === 'required' && c.status !== 'connected')) {
      nextActions.push(`Configure and test ${rc.connectorName} connection`);
    }

    return { clientId, services, relevantConnectors, hiddenConnectorCount, unmappedDependencies, requiredInformation, onboardingReadiness, nextActions };
  }
}
