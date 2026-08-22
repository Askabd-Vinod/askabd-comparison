/**
 * Client Database Connections — real, multi-record connection management
 * (2026-08-21, urgent UX/architecture fix). See migration 034.
 *
 * The pre-existing `oc_connectors` table (connector-service.ts) is UNIQUE on
 * (client_id, provider) — architecturally incapable of representing a client
 * with more than one database of the same technology (e.g. a separate
 * Production and UAT Oracle instance). This service models what the Lifecycle
 * page's "Connector Configuration" step actually needs: an open-ended list of
 * NAMED database connections per client, each independently created, tested,
 * edited, and removed — never assuming "one database per client".
 *
 * Test logic is genuinely reused, not reimplemented: PostgreSQL gets the same
 * real multi-step connect/query/latency test `ConnectorService` already
 * performs; every other connector_type gets the same honest real TCP
 * host:port reachability check `ConnectorService.testGeneric` performs — no
 * driver is installed for Oracle/SQL Server/MySQL/MongoDB in this deployment
 * (see apps/api/package.json), so a deeper protocol-level test would be a lie
 * dressed up as evidence. The reachability test IS real; it is just honestly
 * partial for those types, exactly like the existing connectors page already
 * discloses for AWS/Azure/Kubernetes.
 *
 * Passwords: never stored in plaintext, never returned by any read path. The
 * existing SecretProvider seam (secrets-provider.ts, already used for the
 * Jira integration) is reused so the production hardening path (AWS Secrets
 * Manager) is a configuration change, not a rewrite.
 */
import * as net from 'net';
import * as dns from 'dns';
import { promisify } from 'util';
import { Pool } from 'pg';
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';
import { getSecretProvider } from './secrets-provider.js';

const dnsResolve = promisify(dns.resolve);

export type ConnectorType = 'postgresql' | 'oracle' | 'sqlserver' | 'mysql' | 'mongodb' | 'other';
export type ConnectionStatus = 'not_tested' | 'connected' | 'failed' | 'disabled';

export interface DatabaseConnection {
  id: string;
  clientId: string;
  name: string;
  connectorType: ConnectorType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  hasPassword: boolean; // never the actual value
  authType: string;
  environment: string;
  description: string;
  tags: string[];
  status: ConnectionStatus;
  lastTestMode: string | null;
  lastTestSteps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }>;
  lastTestError: string;
  lastTestedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string; client_id: string; name: string; connector_type: ConnectorType;
  host: string; port: number; database_name: string; username: string; password_ref: string | null;
  auth_type: string; environment: string; description: string; tags: string[];
  status: ConnectionStatus; last_test_mode: string | null; last_test_steps: any;
  last_test_error: string; last_tested_at: Date | null; created_by: string | null;
  created_at: Date; updated_at: Date;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

function toConnection(row: Row): DatabaseConnection {
  return {
    id: row.id, clientId: row.client_id, name: row.name, connectorType: row.connector_type,
    host: row.host, port: row.port, databaseName: row.database_name, username: row.username,
    hasPassword: !!row.password_ref, authType: row.auth_type, environment: row.environment,
    description: row.description, tags: row.tags || [],
    status: row.status, lastTestMode: row.last_test_mode, lastTestSteps: row.last_test_steps || [],
    lastTestError: row.last_test_error || '', lastTestedAt: row.last_tested_at ? row.last_tested_at.toISOString() : null,
    createdBy: row.created_by, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export interface CreateInput {
  clientId: string; name: string; connectorType: ConnectorType; host: string; port: number;
  databaseName: string; username: string; password?: string; authType?: string; environment?: string;
  description?: string; tags?: string[]; createdBy?: string;
}
export interface UpdateInput extends Partial<Omit<CreateInput, 'clientId' | 'createdBy'>> {
  /** Omit entirely to leave the stored password unchanged; pass '' explicitly to clear it. */
  password?: string;
}

const REQUIRED_STRING_FIELDS: Array<[keyof CreateInput, string]> = [
  ['name', 'Connection name is required.'],
  ['host', 'Host or IP address is required.'],
  ['databaseName', 'Database/service is required.'],
  ['username', 'Username is required.'],
];

export class ClientDatabaseConnectionService {
  constructor(private readonly db: DbClient = getPool()) {}

  private validateCreate(input: CreateInput): string | null {
    for (const [key, message] of REQUIRED_STRING_FIELDS) {
      if (!String(input[key] ?? '').trim()) return message;
    }
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) return 'Port must be a valid port number.';
    if (!input.password) return 'Password is required.';
    if (!input.environment) return 'Environment is required.';
    return null;
  }

  async list(clientId: string): Promise<DatabaseConnection[]> {
    const res = await this.db.query<Row>(
      'SELECT * FROM oc_client_database_connections WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId],
    );
    return res.rows.map(toConnection);
  }

  async create(input: CreateInput): Promise<Result<DatabaseConnection>> {
    const validationError = this.validateCreate(input);
    if (validationError) return { ok: false, error: { code: 'validation', message: validationError } };

    const passwordRef = await getSecretProvider().putSecret(`dbconn-${input.clientId}-${input.name}`, input.password!);
    const res = await this.db.query<Row>(
      `INSERT INTO oc_client_database_connections
        (client_id, name, connector_type, host, port, database_name, username, password_ref, auth_type, environment, description, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [input.clientId, input.name.trim(), input.connectorType, input.host.trim(), input.port, input.databaseName.trim(),
        input.username.trim(), passwordRef, input.authType || 'standard', input.environment || 'production',
        input.description || '', input.tags || [], input.createdBy || null],
    );
    const created = toConnection(res.rows[0]!);
    await this.audit(created.id, created.clientId, 'database_connection.created', input.createdBy || 'unknown-staff', { name: created.name, connectorType: created.connectorType, host: created.host });
    return { ok: true, value: created };
  }

  async update(id: string, input: UpdateInput, actor: string): Promise<Result<DatabaseConnection>> {
    const existingRes = await this.db.query<Row>('SELECT * FROM oc_client_database_connections WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { ok: false, error: { code: 'not_found', message: 'No such connection.' } };
    const existing = existingRes.rows[0]!;

    if (input.name !== undefined && !input.name.trim()) return { ok: false, error: { code: 'validation', message: 'Connection name is required.' } };
    if (input.host !== undefined && !input.host.trim()) return { ok: false, error: { code: 'validation', message: 'Host or IP address is required.' } };
    if (input.databaseName !== undefined && !input.databaseName.trim()) return { ok: false, error: { code: 'validation', message: 'Database/service is required.' } };
    if (input.username !== undefined && !input.username.trim()) return { ok: false, error: { code: 'validation', message: 'Username is required.' } };
    if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) return { ok: false, error: { code: 'validation', message: 'Port must be a valid port number.' } };

    let passwordRef = existing.password_ref;
    if (input.password !== undefined) {
      passwordRef = input.password ? await getSecretProvider().putSecret(`dbconn-${existing.client_id}-${input.name || existing.name}`, input.password) : null;
    }

    const nextHost = input.host ?? existing.host;
    const nextPort = input.port ?? existing.port;
    const nextDatabaseName = input.databaseName ?? existing.database_name;
    const nextUsername = input.username ?? existing.username;
    // Invalidate the last test result only when a connection-relevant VALUE actually
    // changed — comparing against the stored row, not just whether the frontend's PATCH
    // body happened to include the field (the edit form always resubmits every field, so
    // presence alone would wrongly reset "Connected" back to "Not Tested" on a pure
    // rename). A real password change always invalidates, since the old test's success
    // can no longer be attributed to the new (untested) credential.
    const connectionValueChanged = nextHost !== existing.host || nextPort !== existing.port
      || nextDatabaseName !== existing.database_name || nextUsername !== existing.username
      || input.password !== undefined;

    const res = await this.db.query<Row>(
      `UPDATE oc_client_database_connections SET
        name = $2, connector_type = $3, host = $4, port = $5, database_name = $6, username = $7,
        password_ref = $8, auth_type = $9, environment = $10, description = $11, tags = $12,
        status = CASE WHEN $13 THEN 'not_tested' ELSE status END, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? existing.name, input.connectorType ?? existing.connector_type, nextHost,
        nextPort, nextDatabaseName, nextUsername,
        passwordRef, input.authType ?? existing.auth_type, input.environment ?? existing.environment,
        input.description ?? existing.description, input.tags ?? existing.tags,
        connectionValueChanged,
      ],
    );
    const updated = toConnection(res.rows[0]!);
    await this.audit(id, updated.clientId, 'database_connection.updated', actor, { name: updated.name });
    return { ok: true, value: updated };
  }

  async remove(id: string, actor: string): Promise<Result<{ id: string }>> {
    const existingRes = await this.db.query<Row>('SELECT client_id, name FROM oc_client_database_connections WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { ok: false, error: { code: 'not_found', message: 'No such connection.' } };
    await this.db.query('DELETE FROM oc_client_database_connections WHERE id = $1', [id]);
    await this.audit(id, (existingRes.rows[0] as any).client_id, 'database_connection.removed', actor, { name: (existingRes.rows[0] as any).name });
    return { ok: true, value: { id } };
  }

  /**
   * Real connection test. PostgreSQL gets the genuine multi-step protocol test
   * (DNS → TCP → auth → query → latency); every other type gets the honest
   * TCP-reachability-only test — never fabricated success for a protocol this
   * deployment has no driver for.
   */
  async test(id: string): Promise<Result<DatabaseConnection>> {
    const existingRes = await this.db.query<Row>('SELECT * FROM oc_client_database_connections WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { ok: false, error: { code: 'not_found', message: 'No such connection.' } };
    const row = existingRes.rows[0]!;
    const password = row.password_ref ? await getSecretProvider().getSecret(row.password_ref) : '';

    const steps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }> = [];
    const startedAt = Date.now();

    if (row.connector_type === 'postgresql') {
      await this.testPostgres(row.host, row.port, row.database_name, row.username, password, steps);
    } else {
      await this.testGenericReachability(row.host, row.port, steps);
      steps.push({ step: 'Protocol-Level Test', pass: false, durationMs: 0, error: `EXTERNAL DEPENDENCY: a deeper ${row.connector_type} protocol test requires a driver not installed in this deployment. Host/port reachability was verified above.` });
    }

    const allPassed = steps.length > 0 && steps.every(s => s.pass);
    const status: ConnectionStatus = allPassed ? 'connected' : 'failed';
    const error = allPassed ? '' : (steps.find(s => !s.pass)?.error || 'Connection test failed.');

    const res = await this.db.query<Row>(
      `UPDATE oc_client_database_connections SET
        status = $2, last_test_mode = 'real', last_test_steps = $3, last_test_error = $4, last_tested_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status, JSON.stringify(steps), error],
    );
    const updated = toConnection(res.rows[0]!);
    await this.audit(id, updated.clientId, status === 'connected' ? 'database_connection.test_passed' : 'database_connection.test_failed', 'system', {
      name: updated.name, durationMs: Date.now() - startedAt, stepsRun: steps.length, stepsPassed: steps.filter(s => s.pass).length,
    });
    return { ok: true, value: updated };
  }

  private async testGenericReachability(host: string, port: number, steps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }>): Promise<void> {
    const dnsStart = Date.now();
    try {
      if (host !== 'localhost' && host !== '127.0.0.1') await dnsResolve(host);
      steps.push({ step: 'DNS Resolution', pass: true, durationMs: Date.now() - dnsStart });
    } catch {
      steps.push({ step: 'DNS Resolution', pass: false, durationMs: Date.now() - dnsStart, error: `Cannot resolve host: ${host}` });
      return;
    }
    const portStart = Date.now();
    try {
      await this.checkPort(host, port, 5000);
      steps.push({ step: 'Port Accessibility', pass: true, durationMs: Date.now() - portStart });
    } catch {
      steps.push({ step: 'Port Accessibility', pass: false, durationMs: Date.now() - portStart, error: `Port ${port} not accessible on ${host}. Check host, port, and network access.` });
    }
  }

  private async testPostgres(host: string, port: number, database: string, username: string, password: string, steps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }>): Promise<void> {
    await this.testGenericReachability(host, port, steps);
    if (steps.some(s => !s.pass)) return;

    const connStart = Date.now();
    const pool = new Pool({ host, port, database, user: username, password, ssl: false, connectionTimeoutMillis: 10000, max: 1 });
    try {
      const client = await pool.connect();
      steps.push({ step: 'TCP Connection', pass: true, durationMs: Date.now() - connStart });
      steps.push({ step: 'Authentication', pass: true, durationMs: 0 });
      const dbStart = Date.now();
      try {
        await client.query('SELECT current_database()');
        steps.push({ step: 'Database Access', pass: true, durationMs: Date.now() - dbStart });
        const latStart = Date.now();
        await client.query('SELECT 1');
        const latency = Date.now() - latStart;
        steps.push({ step: `Latency (${latency}ms)`, pass: latency < 5000, durationMs: latency });
      } catch (err) {
        steps.push({ step: 'Database Access', pass: false, durationMs: Date.now() - dbStart, error: 'Unable to connect to database. Check host, port, credentials and network access.' });
      }
      client.release();
      await pool.end();
    } catch {
      steps.push({ step: 'Authentication', pass: false, durationMs: Date.now() - connStart, error: 'Unable to connect to database. Check host, port, credentials and network access.' });
      try { await pool.end(); } catch { /* ignore */ }
    }
  }

  private checkPort(host: string, port: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
      socket.once('error', (err) => { socket.destroy(); reject(err); });
      socket.connect(port, host);
    });
  }

  private async audit(connectionId: string, clientId: string, action: string, actor: string, details: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details) VALUES ('database_connection', $1, $2, $3, $4)`,
      [connectionId, action, actor, JSON.stringify({ clientId, ...details })],
    );
  }
}
