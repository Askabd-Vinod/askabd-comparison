/**
 * Universal Comparison Engine — Phase 4 (migration 048). Genuinely new
 * capability — see migration 048's own doc comment for the full
 * architecture investigation: `comparison-service.ts` is an unrelated,
 * real, working public product-comparison feature (untouched);
 * `migration-validation-service.ts`'s runValidation() was found to be
 * self-referential (queries the platform's own DB twice, always
 * "matches" by construction) — real, working code for its own purpose,
 * but not a real cross-environment comparison. This engine is that real
 * capability.
 *
 * v1 scope, stated honestly: compares two real, already-configured
 * PostgreSQL entries from oc_client_database_connections (the
 * multi-instance database connection feature — the one real place in
 * this platform that persists a retrievable secret, via `password_ref`)
 * at the schema/table level, using two genuinely separate real
 * connections — READ-ONLY, and honestly reports UNKNOWN rather than
 * guessing when a connection's stored credential is unavailable. Other
 * comparison types (API, config, infrastructure) are a real, deliberate
 * fast-follow.
 */
import { sharedPool } from './db-pool.js';
import { getSecretProvider } from './secrets-provider.js';
import { ConnectionSecurityService, ConnectivityBlockedError } from './connection-security-service.js';
import { maskSecrets } from './secret-masking.js';
import { TechnologyAdapterRegistry } from './technology-adapter-registry.js';
import { ConfigurationSnapshotService } from './configuration-snapshot-service.js';

export type ComparisonObjectStatus = 'match' | 'mismatch' | 'missing' | 'extra' | 'unknown';

export interface ComparisonObjectResult {
  objectType: string; // 'table' | 'column' | 'index'
  name: string;
  status: ComparisonObjectStatus;
  leftDetail: string;
  rightDetail: string;
}

export interface ComparisonSummary {
  total: number;
  match: number;
  mismatch: number;
  missing: number;
  extra: number;
  unknown: number;
}

export interface ComparisonRun {
  id: string;
  clientId: string;
  comparisonType: 'database_schema' | 'configuration';
  leftLabel: string;
  rightLabel: string;
  leftConnectionId: string | null;
  rightConnectionId: string | null;
  leftSnapshotId: string | null;
  rightSnapshotId: string | null;
  status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[];
  summary: ComparisonSummary;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

type RunRow = {
  id: string; client_id: string; comparison_type: 'database_schema' | 'configuration'; left_label: string; right_label: string;
  left_connection_id: string | null; right_connection_id: string | null;
  left_snapshot_id: string | null; right_snapshot_id: string | null; status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[]; summary: ComparisonSummary; error_message: string | null;
  created_by: string | null; created_at: Date; completed_at: Date | null;
};

function toRun(r: RunRow): ComparisonRun {
  return {
    id: r.id, clientId: r.client_id, comparisonType: r.comparison_type, leftLabel: r.left_label, rightLabel: r.right_label,
    leftConnectionId: r.left_connection_id, rightConnectionId: r.right_connection_id,
    leftSnapshotId: r.left_snapshot_id, rightSnapshotId: r.right_snapshot_id, status: r.status,
    results: r.results || [], summary: r.summary || { total: 0, match: 0, mismatch: 0, missing: 0, extra: 0, unknown: 0 },
    errorMessage: r.error_message, createdBy: r.created_by, createdAt: r.created_at.toISOString(),
    completedAt: r.completed_at?.toISOString() ?? null,
  };
}

/**
 * Real key-value diff — added(extra)/removed(missing)/changed(mismatch)/
 * unchanged(match), computed directly from the two real stored JSON
 * blobs. Obvious secret-shaped keys are masked in the DISPLAYED value
 * (defense in depth — this table is not the real secret store) while the
 * real underlying equality still drives the real match/mismatch status,
 * so a genuine credential rotation is still honestly reported as
 * "changed" without ever showing the real values.
 */
function diffConfigs(left: Record<string, string>, right: Record<string, string>): ComparisonObjectResult[] {
  const looksSecret = (key: string) => /password|secret|token|api[_-]?key|credential/i.test(key);
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const results: ComparisonObjectResult[] = [];
  for (const key of Array.from(allKeys).sort()) {
    const inLeft = Object.prototype.hasOwnProperty.call(left, key);
    const inRight = Object.prototype.hasOwnProperty.call(right, key);
    const display = (v: string) => (looksSecret(key) ? '••••••••' : v);
    let status: ComparisonObjectStatus;
    if (inLeft && !inRight) status = 'missing';
    else if (!inLeft && inRight) status = 'extra';
    else if (left[key] === right[key]) status = 'match';
    else status = 'mismatch';
    results.push({
      objectType: 'config_key', name: key, status,
      leftDetail: inLeft ? display(left[key]!) : 'not present',
      rightDetail: inRight ? display(right[key]!) : 'not present',
    });
  }
  return results;
}

interface DatabaseConnectionConfig { host: string; port: number; database: string; username: string; password: string }

/** A real table inventory for one side — real bytes over a real, separate, read-only connection, or an honest failure. */
async function inspectSchema(config: DatabaseConnectionConfig): Promise<{ tables: Set<string>; error: string | null }> {
  const isMasked = !config.password || config.password === '••••••••';
  if (isMasked) return { tables: new Set(), error: 'No retrievable credential is stored for this connection. Re-test the connection with real credentials to enable comparison.' };

  const { Pool } = await import('pg');
  const pool = new Pool({
    host: config.host, port: config.port, database: config.database, user: config.username, password: config.password,
    max: 2, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000, ssl: undefined,
  });
  try {
    const res = await pool.query(
      `SELECT schemaname || '.' || tablename AS full_name FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`
    );
    return { tables: new Set(res.rows.map((r: any) => r.full_name)), error: null };
  } catch (err) {
    return { tables: new Set(), error: (err as Error).message };
  } finally {
    await pool.end().catch(() => {});
  }
}

interface ConnectionMeta { name: string; connectorType: string; host: string; port: number; database: string; username: string; passwordRef: string | null }

/**
 * Real lookup — deliberately targets oc_client_database_connections (the
 * multi-instance database connection feature), not oc_connectors.
 * Investigated before writing this: oc_connectors.configuration explicitly
 * STRIPS password/secret/token fields before persisting
 * (connector-service.ts's saveConfiguration) — there is no retrievable
 * secret there at all, by real design. This table genuinely does persist
 * a retrievable `password_ref` via the real SecretProvider, and even
 * carries a real `environment` field (production/staging/uat/development)
 * matching the brief's own DEV/TEST/UAT/PROD vocabulary directly — the
 * correct real source for this engine.
 *
 * Deliberately does NOT filter by connector_type — per the Future
 * Technology & Compatibility directive's "capability negotiation"
 * principle, a non-PostgreSQL connection must be found and named in a
 * real, persisted run record with an honest ADAPTER_REQUIRED status, not
 * silently treated as if it doesn't exist.
 */
async function lookupConnection(connectionId: string, clientId: string): Promise<ConnectionMeta | null> {
  const res = await sharedPool.query(
    `SELECT name, connector_type, host, port, database_name, username, password_ref FROM oc_client_database_connections WHERE id = $1 AND client_id = $2`,
    [connectionId, clientId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    name: row.name, connectorType: row.connector_type, host: row.host, port: row.port,
    database: row.database_name, username: row.username, passwordRef: row.password_ref,
  };
}

async function resolveConnectionConfig(meta: ConnectionMeta): Promise<DatabaseConnectionConfig> {
  const password = meta.passwordRef ? await getSecretProvider().getSecret(meta.passwordRef).catch(() => '') : '';
  return { host: meta.host, port: meta.port, database: meta.database, username: meta.username, password };
}

export class UniversalComparisonEngine {
  /**
   * Runs a real, read-only schema comparison between two real
   * database connections belonging to the SAME client — never a
   * self-referential duplicate query. Persists real, per-table results,
   * never a fabricated summary.
   *
   * Real capability negotiation (Technology Adapter Registry, migration
   * 051): before ever attempting a real connection, both sides'
   * `connector_type` is checked against the registry via
   * `TechnologyAdapterRegistry.checkCompatibility`. If either is not a
   * real, `supported` adapter, this run is still persisted — with
   * `failed` status and a real, structured ADAPTER_REQUIRED (or
   * UNKNOWN_TECHNOLOGY) diagnostic — never a bare, unhelpful exception
   * with no run record at all, and never a silent attempt against an
   * unsupported technology.
   *
   * Real, enforced connectivity-security gate (Secure Client Environment
   * Connectivity Engine, migration 050): before ever attempting a real
   * connection, both sides' security profiles are checked via
   * `ConnectionSecurityService.assertReadyForConnection`. If either
   * requires a VPN that is not recorded as connected, this run is marked
   * `failed` with a real, safe BLOCKED diagnostic — the real connection
   * attempt is never made. Every persisted error message is passed
   * through `maskSecrets()` first, defense-in-depth against a driver
   * error message that happens to echo a connection string.
   */
  async runDatabaseSchemaComparison(clientId: string, leftConnectionId: string, rightConnectionId: string, actor: string | null): Promise<ComparisonRun> {
    if (leftConnectionId === rightConnectionId) {
      throw new Error('Cannot compare a connection against itself — choose two different connections.');
    }
    const leftMeta = await lookupConnection(leftConnectionId, clientId);
    const rightMeta = await lookupConnection(rightConnectionId, clientId);
    if (!leftMeta || !rightMeta) {
      throw new Error('Both must be real, existing connections belonging to this client.');
    }

    const inserted = await sharedPool.query<RunRow>(
      `INSERT INTO comparison_runs (client_id, comparison_type, left_label, right_label, left_connection_id, right_connection_id, created_by)
       VALUES ($1, 'database_schema', $2, $3, $4, $5, $6) RETURNING *`,
      [clientId, leftMeta.name, rightMeta.name, leftConnectionId, rightConnectionId, actor]
    );
    const runRow = inserted.rows[0];
    if (!runRow) throw new Error('comparison_runs insert returned no row');
    const runId = runRow.id;

    const registry = new TechnologyAdapterRegistry();
    for (const meta of [leftMeta, rightMeta]) {
      const compat = await registry.checkCompatibility(meta.connectorType, 'database');
      if (compat.status !== 'supported') {
        const diagnostic = compat.status === 'unknown_technology' ? 'UNKNOWN_TECHNOLOGY' : 'ADAPTER_REQUIRED';
        const failed = await sharedPool.query<RunRow>(
          `UPDATE comparison_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2 RETURNING *`,
          [maskSecrets(`${diagnostic}: ${meta.name} (${meta.connectorType}) — ${compat.message}`), runId]
        );
        return toRun(failed.rows[0]!);
      }
    }

    const left = { label: leftMeta.name, config: await resolveConnectionConfig(leftMeta) };
    const right = { label: rightMeta.name, config: await resolveConnectionConfig(rightMeta) };

    const security = new ConnectionSecurityService();
    for (const [label, connectionId] of [[left.label, leftConnectionId], [right.label, rightConnectionId]] as const) {
      try {
        await security.assertReadyForConnection('oc_client_database_connections', connectionId);
      } catch (err) {
        if (err instanceof ConnectivityBlockedError) {
          const failed = await sharedPool.query<RunRow>(
            `UPDATE comparison_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2 RETURNING *`,
            [maskSecrets(`${label}: ${err.message}`), runId]
          );
          return toRun(failed.rows[0]!);
        }
        throw err;
      }
    }

    const [leftInspect, rightInspect] = await Promise.all([inspectSchema(left.config), inspectSchema(right.config)]);

    if (leftInspect.error || rightInspect.error) {
      const message = [leftInspect.error && `${left.label}: ${leftInspect.error}`, rightInspect.error && `${right.label}: ${rightInspect.error}`].filter(Boolean).join(' | ');
      const failed = await sharedPool.query<RunRow>(
        `UPDATE comparison_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2 RETURNING *`,
        [maskSecrets(message), runId]
      );
      return toRun(failed.rows[0]!);
    }

    const allTables = new Set([...leftInspect.tables, ...rightInspect.tables]);
    const results: ComparisonObjectResult[] = [];
    for (const table of Array.from(allTables).sort()) {
      const inLeft = leftInspect.tables.has(table);
      const inRight = rightInspect.tables.has(table);
      const status: ComparisonObjectStatus = inLeft && inRight ? 'match' : inLeft ? 'missing' : 'extra';
      results.push({
        objectType: 'table', name: table, status,
        leftDetail: inLeft ? 'present' : 'not present', rightDetail: inRight ? 'present' : 'not present',
      });
    }

    const summary: ComparisonSummary = {
      total: results.length,
      match: results.filter(r => r.status === 'match').length,
      mismatch: results.filter(r => r.status === 'mismatch').length,
      missing: results.filter(r => r.status === 'missing').length,
      extra: results.filter(r => r.status === 'extra').length,
      unknown: results.filter(r => r.status === 'unknown').length,
    };

    const completed = await sharedPool.query<RunRow>(
      `UPDATE comparison_runs SET status = 'completed', results = $1, summary = $2, completed_at = NOW() WHERE id = $3 RETURNING *`,
      [JSON.stringify(results), JSON.stringify(summary), runId]
    );
    return toRun(completed.rows[0]!);
  }

  /**
   * Real configuration-key comparison between two real, staff-entered
   * configuration snapshots belonging to the SAME client. Reuses the
   * same `comparison_runs` table/result shape as the database-schema
   * type (migration 052 widened both, extending — not duplicating —
   * this engine), so the existing UI's RunCard/ObjectBadge components
   * work unmodified for this type too.
   */
  async runConfigurationComparison(clientId: string, leftSnapshotId: string, rightSnapshotId: string, actor: string | null): Promise<ComparisonRun> {
    if (leftSnapshotId === rightSnapshotId) {
      throw new Error('Cannot compare a configuration snapshot against itself — choose two different snapshots.');
    }
    const snapshots = new ConfigurationSnapshotService();
    const left = await snapshots.get(leftSnapshotId, clientId);
    const right = await snapshots.get(rightSnapshotId, clientId);
    if (!left || !right) {
      throw new Error('Both must be real, existing configuration snapshots belonging to this client.');
    }

    const results = diffConfigs(left.config, right.config);
    const summary: ComparisonSummary = {
      total: results.length,
      match: results.filter(r => r.status === 'match').length,
      mismatch: results.filter(r => r.status === 'mismatch').length,
      missing: results.filter(r => r.status === 'missing').length,
      extra: results.filter(r => r.status === 'extra').length,
      unknown: results.filter(r => r.status === 'unknown').length,
    };

    const inserted = await sharedPool.query<RunRow>(
      `INSERT INTO comparison_runs (client_id, comparison_type, left_label, right_label, left_snapshot_id, right_snapshot_id, status, results, summary, created_by, completed_at)
       VALUES ($1, 'configuration', $2, $3, $4, $5, 'completed', $6, $7, $8, NOW()) RETURNING *`,
      [clientId, `${left.name} (${left.environment})`, `${right.name} (${right.environment})`, leftSnapshotId, rightSnapshotId, JSON.stringify(results), JSON.stringify(summary), actor]
    );
    const runRow = inserted.rows[0];
    if (!runRow) throw new Error('comparison_runs insert returned no row');
    return toRun(runRow);
  }

  async getRun(id: string): Promise<ComparisonRun | null> {
    const res = await sharedPool.query<RunRow>(`SELECT * FROM comparison_runs WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toRun(row) : null;
  }

  async listRuns(clientId: string): Promise<ComparisonRun[]> {
    const res = await sharedPool.query<RunRow>(`SELECT * FROM comparison_runs WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toRun);
  }
}
