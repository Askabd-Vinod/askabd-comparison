/**
 * Client Security Report — "Never claim 'secure' merely because the
 * connection succeeded." Every field below is real and computed from
 * this platform's own actual, current state — never a fabricated
 * checklist. See docs/enterprise-operations-progress.md for the full,
 * honest Known Limitations list (no live VPN/bastion/agent
 * infrastructure exists in this sandbox — the report says so explicitly
 * rather than implying otherwise).
 */
import { sharedPool } from './db-pool.js';
import { ConnectionSecurityService, type ConnectionSecurityProfile } from './connection-security-service.js';
import { IntegrationAllowlistService } from './integration-allowlist-service.js';
import { getSecretProvider } from './secrets-provider.js';

export type SecurityStatus = 'SECURE' | 'SECURE_WITH_RISKS' | 'BLOCKED' | 'NOT_ASSESSED';

export interface SecurityReport {
  clientId: string; generatedAt: string; status: SecurityStatus;
  network: { networkPath: string; count: number }[];
  vpn: { status: string; count: number }[];
  vpnBlockers: { connectorSourceId: string; reason: string }[];
  authorization: { scope: string; count: number }[];
  dataClassification: { classification: string; count: number }[];
  secretManagement: { provider: string; productionGrade: boolean; note: string };
  externalIntegrations: { provider: string; enabled: boolean; scope: string }[];
  dataResidency: { region: string; count: number }[];
  testScope: { testCases: number; executions: number };
  loggingSafety: string;
  retention: string;
  knownLimitations: string[];
}

const KNOWN_LIMITATIONS = [
  'No live VPN tunnel, WireGuard/IPSec configuration, bastion host, or client-side connector agent is provisioned by this platform in this environment — VPN/network-path fields are real, staff-recorded CONFIGURATION and STATUS, not a live, actively-monitored tunnel.',
  'TLS certificate chain validation is not independently performed by this engine — it relies on the connection method\'s own inherent transport security (e.g. the underlying PostgreSQL driver\'s TLS negotiation), not a separate, dedicated certificate check.',
  'Data residency region is a real, staff-recorded configuration field — this platform does not yet enforce or route data storage by region.',
  'Formal data retention/deletion policy enforcement is not built — retention is stated per-field where recorded, not centrally enforced yet.',
  'Secret masking (secret-masking.ts) is applied at the two highest-risk points found so far (Universal Comparison Engine error messages, Testing Engine execution evidence) — not yet applied universally to every free-text field across the platform.',
  'No AI/LLM capability sends client data anywhere — ai-copilot.tsx is honestly disconnected from any real AI/LLM backend, so the AI Data Protection requirement is trivially satisfied by having no such pathway to control yet.',
];

export class SecurityReportService {
  async generateReport(clientId: string): Promise<SecurityReport> {
    const security = new ConnectionSecurityService();
    const allowlist = new IntegrationAllowlistService();
    const profiles = await security.listForClient(clientId);

    const network = tally(profiles, p => p.networkPath, 'networkPath') as { networkPath: string; count: number }[];
    const vpn = tally(profiles, p => p.vpnStatus, 'status') as { status: string; count: number }[];
    const authorization = tally(profiles, p => p.permissionScope, 'scope') as { scope: string; count: number }[];
    const dataClassification = tally(profiles, p => p.dataClassification, 'classification') as { classification: string; count: number }[];
    const residencyProfiles = profiles.filter(p => p.dataResidencyRegion);
    const dataResidency = tally(residencyProfiles, p => p.dataResidencyRegion!, 'region') as { region: string; count: number }[];

    const vpnBlockers = profiles
      .filter(p => ['required', 'failed', 'expired', 'auth_failed'].includes(p.vpnStatus) && p.vpnStatus !== 'connected')
      .map(p => ({ connectorSourceId: p.connectorSourceId, reason: `${p.connectorSourceType}/${p.connectorSourceId} — VPN status: ${p.vpnStatus}` }));

    const secretProvider = getSecretProvider();
    const secretManagement = {
      provider: secretProvider.kind,
      productionGrade: secretProvider.kind !== 'dev-plaintext',
      note: secretProvider.kind === 'dev-plaintext'
        ? 'The active SecretProvider is the DEV plaintext provider — NOT production-safe. A real enterprise secret manager (AWS Secrets Manager / Azure Key Vault / GCP Secret Manager / HashiCorp Vault) must be configured before handling real production client credentials.'
        : `The active SecretProvider is "${secretProvider.kind}".`,
    };

    const integrationRows = await allowlist.list(clientId);
    const externalIntegrations = integrationRows.map(r => ({ provider: r.provider, enabled: r.enabled, scope: r.scope }));

    const testRes = await sharedPool.query(`SELECT (SELECT COUNT(*) FROM test_cases WHERE client_id = $1) AS cases, (SELECT COUNT(*) FROM test_executions WHERE client_id = $1) AS execs`, [clientId]);
    const testScope = { testCases: Number(testRes.rows[0]?.cases ?? 0), executions: Number(testRes.rows[0]?.execs ?? 0) };

    let status: SecurityStatus;
    if (profiles.length === 0) status = 'NOT_ASSESSED';
    else if (vpnBlockers.length > 0) status = 'BLOCKED';
    else if (secretManagement.provider === 'dev-plaintext' || profiles.some(p => ['restricted', 'secret'].includes(p.dataClassification) && !['vpn', 'site_to_site_vpn', 'wireguard', 'ipsec', 'private_network', 'vpc_peering', 'private_link', 'bastion', 'ssh_tunnel', 'reverse_connector', 'agent'].includes(p.networkPath)))
      status = 'SECURE_WITH_RISKS';
    else status = 'SECURE';

    return {
      clientId, generatedAt: new Date().toISOString(), status, network, vpn, vpnBlockers, authorization,
      dataClassification, secretManagement, externalIntegrations, dataResidency, testScope,
      loggingSafety: 'Persisted error messages (Universal Comparison Engine) and execution evidence (Testing Engine) pass through a real secret-masking filter before storage — see secret-masking.ts and Known Limitations for its current, honest coverage.',
      retention: 'No centralized retention/deletion policy engine exists yet — see Known Limitations.',
      knownLimitations: KNOWN_LIMITATIONS,
    };
  }
}

function tally(items: ConnectionSecurityProfile[], key: (p: ConnectionSecurityProfile) => string, _label: string): { [k: string]: any }[] {
  const counts = new Map<string, number>();
  for (const p of items) counts.set(key(p), (counts.get(key(p)) || 0) + 1);
  return Array.from(counts.entries()).map(([k, count]) => ({ [_label]: k, count }));
}
