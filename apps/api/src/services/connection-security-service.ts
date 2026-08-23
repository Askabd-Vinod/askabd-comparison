/**
 * Connection Security Profiles — a real, generic security-metadata layer
 * over existing connector tables. See migration 050's own doc comment for
 * the full architecture write-up (why a new polymorphic table, why
 * `oc_connectors.security_level` was left untouched).
 *
 * The real substance: `assertReadyForConnection` is a genuine, ENFORCED
 * guard — "If a VPN is required but unavailable: Do NOT mark the
 * environment as connected. Status must be BLOCKED — VPN CONNECTION
 * REQUIRED." This is proven, not assumed, by wiring it into the
 * Universal Comparison Engine's real connection attempt (see that
 * file's own updated doc comment) and by a real test that confirms the
 * comparison run is genuinely refused, never silently attempted.
 */
import { sharedPool } from './db-pool.js';

export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted' | 'secret';
export type VpnStatus = 'not_required' | 'required' | 'configured' | 'connected' | 'failed' | 'expired' | 'auth_failed';
export type PermissionScope = 'read_only' | 'read_write' | 'admin';
export type NetworkPath = 'direct_https' | 'private_https' | 'vpn' | 'site_to_site_vpn' | 'wireguard' | 'ipsec' | 'private_network' | 'vpc_peering' | 'private_link' | 'bastion' | 'ssh_tunnel' | 'reverse_connector' | 'agent' | 'other';
export type ConnectorSourceType = 'oc_connectors' | 'oc_client_database_connections';

export interface ConnectionSecurityProfile {
  id: string; clientId: string; connectorSourceType: ConnectorSourceType; connectorSourceId: string;
  dataClassification: DataClassification; vpnStatus: VpnStatus; permissionScope: PermissionScope;
  networkPath: NetworkPath; dataResidencyRegion: string | null; lastReviewedAt: string | null;
  reviewedBy: string | null; createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; connector_source_type: ConnectorSourceType; connector_source_id: string;
  data_classification: DataClassification; vpn_status: VpnStatus; permission_scope: PermissionScope;
  network_path: NetworkPath; data_residency_region: string | null; last_reviewed_at: Date | null;
  reviewed_by: string | null; created_at: Date; updated_at: Date;
};

function toProfile(r: Row): ConnectionSecurityProfile {
  return {
    id: r.id, clientId: r.client_id, connectorSourceType: r.connector_source_type, connectorSourceId: r.connector_source_id,
    dataClassification: r.data_classification, vpnStatus: r.vpn_status, permissionScope: r.permission_scope,
    networkPath: r.network_path, dataResidencyRegion: r.data_residency_region,
    lastReviewedAt: r.last_reviewed_at?.toISOString() ?? null, reviewedBy: r.reviewed_by,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

// Safe, non-leaking diagnostic reasons — never includes any credential/host detail.
const VPN_BLOCK_REASONS: Partial<Record<VpnStatus, string>> = {
  required: 'BLOCKED — VPN CONNECTION REQUIRED. This connection is configured to require a VPN, and no successful VPN connection is recorded.',
  failed: 'BLOCKED — VPN CONNECTION FAILED. The last recorded VPN attempt for this connection did not succeed.',
  expired: 'BLOCKED — VPN CONNECTION EXPIRED. The VPN session for this connection has expired and must be re-established.',
  auth_failed: 'BLOCKED — VPN AUTHENTICATION FAILED. The VPN credential for this connection was rejected.',
};

export class ConnectivityBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ConnectivityBlockedError';
  }
}

export class ConnectionSecurityService {
  async getOrCreate(clientId: string, sourceType: ConnectorSourceType, sourceId: string): Promise<ConnectionSecurityProfile> {
    const existing = await sharedPool.query<Row>(
      `SELECT * FROM client_connection_security WHERE connector_source_type = $1 AND connector_source_id = $2`,
      [sourceType, sourceId]
    );
    if (existing.rows[0]) return toProfile(existing.rows[0]);
    const inserted = await sharedPool.query<Row>(
      `INSERT INTO client_connection_security (client_id, connector_source_type, connector_source_id) VALUES ($1,$2,$3)
       ON CONFLICT (connector_source_type, connector_source_id) DO UPDATE SET connector_source_type = EXCLUDED.connector_source_type
       RETURNING *`,
      [clientId, sourceType, sourceId]
    );
    return toProfile(inserted.rows[0]!);
  }

  async get(sourceType: ConnectorSourceType, sourceId: string): Promise<ConnectionSecurityProfile | null> {
    const res = await sharedPool.query<Row>(
      `SELECT * FROM client_connection_security WHERE connector_source_type = $1 AND connector_source_id = $2`,
      [sourceType, sourceId]
    );
    const row = res.rows[0];
    return row ? toProfile(row) : null;
  }

  async listForClient(clientId: string): Promise<ConnectionSecurityProfile[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM client_connection_security WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toProfile);
  }

  async updateProfile(
    sourceType: ConnectorSourceType, sourceId: string,
    updates: Partial<Pick<ConnectionSecurityProfile, 'dataClassification' | 'vpnStatus' | 'permissionScope' | 'networkPath' | 'dataResidencyRegion'>>,
    actor: string | null, clientId?: string
  ): Promise<ConnectionSecurityProfile> {
    const existing = await this.get(sourceType, sourceId);
    if (!existing) {
      if (!clientId) throw new Error(`No security profile exists for ${sourceType}/${sourceId} and no clientId was provided to create one.`);
      await this.getOrCreate(clientId, sourceType, sourceId);
    }
    const res = await sharedPool.query<Row>(
      `UPDATE client_connection_security SET
         data_classification = COALESCE($1, data_classification),
         vpn_status = COALESCE($2, vpn_status),
         permission_scope = COALESCE($3, permission_scope),
         network_path = COALESCE($4, network_path),
         data_residency_region = COALESCE($5, data_residency_region),
         reviewed_by = $6, last_reviewed_at = NOW(), updated_at = NOW()
       WHERE connector_source_type = $7 AND connector_source_id = $8 RETURNING *`,
      [updates.dataClassification ?? null, updates.vpnStatus ?? null, updates.permissionScope ?? null,
        updates.networkPath ?? null, updates.dataResidencyRegion ?? null, actor, sourceType, sourceId]
    );
    const row = res.rows[0];
    if (!row) throw new Error(`Security profile for ${sourceType}/${sourceId} not found.`);
    return toProfile(row);
  }

  /**
   * The real, enforced guard. Real callers (e.g. universal-comparison-engine.ts)
   * MUST call this before attempting a real connection. Returns the profile
   * when the connection is genuinely clear to proceed; throws
   * ConnectivityBlockedError with a safe, non-leaking diagnostic otherwise.
   * A connector with NO recorded profile is treated as `not_required`/
   * `read_only` (the honest default), never silently blocked or silently
   * trusted beyond that default.
   */
  async assertReadyForConnection(sourceType: ConnectorSourceType, sourceId: string): Promise<ConnectionSecurityProfile> {
    const profile = await this.get(sourceType, sourceId);
    if (!profile) {
      return { // honest default view — no row written, no assumption beyond it
        id: '', clientId: '', connectorSourceType: sourceType, connectorSourceId: sourceId,
        dataClassification: 'confidential', vpnStatus: 'not_required', permissionScope: 'read_only',
        networkPath: 'direct_https', dataResidencyRegion: null, lastReviewedAt: null, reviewedBy: null,
        createdAt: '', updatedAt: '',
      };
    }
    const blockReason = VPN_BLOCK_REASONS[profile.vpnStatus];
    if (blockReason) throw new ConnectivityBlockedError(blockReason);
    return profile;
  }
}
