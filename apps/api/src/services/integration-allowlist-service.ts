/**
 * External Integration Allowlist — "Before sending client information
 * externally: verify Integration configured / Authorization exists /
 * Data scope allowed / Destination allowed / Audit enabled." Closed by
 * default for every provider (same convention as CRM's `customer_visible`
 * flags this session) — a provider is only reachable once a client has
 * been explicitly, staff-attributed enabled for it.
 */
import { sharedPool } from './db-pool.js';

export interface AllowlistEntry {
  id: string; clientId: string; provider: string; enabled: boolean; scope: string;
  enabledBy: string | null; enabledAt: string | null; createdAt: string;
}

type Row = { id: string; client_id: string; provider: string; enabled: boolean; scope: string; enabled_by: string | null; enabled_at: Date | null; created_at: Date };

function toEntry(r: Row): AllowlistEntry {
  return {
    id: r.id, clientId: r.client_id, provider: r.provider, enabled: r.enabled, scope: r.scope,
    enabledBy: r.enabled_by, enabledAt: r.enabled_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
  };
}

export class IntegrationAllowlistService {
  async list(clientId: string): Promise<AllowlistEntry[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM client_integration_allowlist WHERE client_id = $1 ORDER BY provider`, [clientId]);
    return res.rows.map(toEntry);
  }

  /** No row at all = not configured = not allowed. Never assume "allowed" for an unconfigured provider. */
  async isAllowed(clientId: string, provider: string): Promise<boolean> {
    const res = await sharedPool.query<Row>(`SELECT enabled FROM client_integration_allowlist WHERE client_id = $1 AND provider = $2`, [clientId, provider]);
    return res.rows[0]?.enabled === true;
  }

  async enable(clientId: string, provider: string, scope: string, actor: string | null): Promise<AllowlistEntry> {
    const res = await sharedPool.query<Row>(
      `INSERT INTO client_integration_allowlist (client_id, provider, enabled, scope, enabled_by, enabled_at)
       VALUES ($1,$2,true,$3,$4,NOW())
       ON CONFLICT (client_id, provider) DO UPDATE SET enabled = true, scope = $3, enabled_by = $4, enabled_at = NOW()
       RETURNING *`,
      [clientId, provider, scope, actor]
    );
    return toEntry(res.rows[0]!);
  }

  async disable(clientId: string, provider: string): Promise<AllowlistEntry | null> {
    const res = await sharedPool.query<Row>(
      `UPDATE client_integration_allowlist SET enabled = false WHERE client_id = $1 AND provider = $2 RETURNING *`,
      [clientId, provider]
    );
    return res.rows[0] ? toEntry(res.rows[0]) : null;
  }
}
