/**
 * Real, staff-entered configuration snapshots — the "left"/"right" input
 * for the Configuration Comparison type (migration 052), extending the
 * existing Universal Comparison Engine rather than a new engine (see
 * that migration's own doc comment for the full architecture reasoning).
 *
 * v1 scope, stated honestly: manual entry only (a real client provides
 * their own real config key-values, e.g. pasted from a `.env` file or
 * app config) — no live file-import or application-config discovery yet;
 * `source` is a real, checked column so that gap is honest and visible
 * rather than silently implied.
 */
import { sharedPool } from './db-pool.js';

export interface ConfigurationSnapshot {
  id: string; clientId: string; name: string; environment: string;
  config: Record<string, string>; source: 'manual'; createdBy: string | null;
  createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; name: string; environment: string; config: Record<string, string>;
  source: 'manual'; created_by: string | null; created_at: Date; updated_at: Date;
};

function toSnapshot(r: Row): ConfigurationSnapshot {
  return {
    id: r.id, clientId: r.client_id, name: r.name, environment: r.environment, config: r.config || {},
    source: r.source, createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

const VALID_ENVIRONMENTS = new Set(['production', 'staging', 'uat', 'development', 'other']);

export class ConfigurationSnapshotService {
  async create(clientId: string, data: { name: string; environment: string; config: Record<string, string> }, actor: string | null): Promise<ConfigurationSnapshot> {
    if (!data.name?.trim()) throw new Error('A real name is required.');
    if (!VALID_ENVIRONMENTS.has(data.environment)) throw new Error(`environment must be one of: ${Array.from(VALID_ENVIRONMENTS).join(', ')}`);
    if (!data.config || typeof data.config !== 'object' || Array.isArray(data.config)) throw new Error('config must be a real flat key-value object.');
    for (const [k, v] of Object.entries(data.config)) {
      if (typeof v !== 'string') throw new Error(`config value for key "${k}" must be a string — nested objects/arrays are not supported in v1.`);
    }
    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_configuration_snapshots (client_id, name, environment, config, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [clientId, data.name.trim(), data.environment, JSON.stringify(data.config), actor]
    );
    return toSnapshot(res.rows[0]!);
  }

  async get(id: string, clientId: string): Promise<ConfigurationSnapshot | null> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_configuration_snapshots WHERE id = $1 AND client_id = $2`, [id, clientId]);
    const row = res.rows[0];
    return row ? toSnapshot(row) : null;
  }

  async list(clientId: string): Promise<ConfigurationSnapshot[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_configuration_snapshots WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toSnapshot);
  }
}
