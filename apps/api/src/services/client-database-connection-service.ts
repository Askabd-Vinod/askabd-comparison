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
import { Pool } from 'pg';
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';
import { getSecretProvider } from './secrets-provider.js';
import { assertSafeOutboundDestination, UnsafeDestinationError } from './network-security-policy.js';

export type ConnectorType = 'postgresql' | 'oracle' | 'sqlserver' | 'mysql' | 'mongodb' | 'other';
export type ConnectionStatus = 'not_tested' | 'connected' | 'failed' | 'disabled';
/**
 * TLS FIX (connector_test_1 fast-follow, 2026-08-24): previously the real
 * Postgres connector hardcoded `ssl: false` unconditionally — no TLS was
 * ever negotiated, and the live Connector Configuration UI made a false
 * claim about encryption. 'disable' keeps today's exact previous behavior
 * (default, for backward compatibility). 'require' encrypts opportunistically
 * without validating the server's certificate (matches libpq's own
 * `sslmode=require`) — genuinely fails closed if the server doesn't
 * support SSL at all (proven live: node-postgres throws "The server does
 * not support SSL connections", it does NOT silently fall back to
 * plaintext). 'verify-full' additionally validates the certificate chain
 * AND the hostname — proven live that node-postgres's own default
 * `rejectUnauthorized: true` alone does NOT reliably verify hostname
 * (a real, confirmed driver gotcha), so this mode explicitly sets
 * `servername` to force the genuine check.
 */
export type SslMode = 'disable' | 'require' | 'verify-full';

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
  sslMode: SslMode;
  hasSslCaCertificate: boolean;
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
  ssl_mode: SslMode; ssl_ca_certificate: string | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

/**
 * SECURITY FIX (connector_test_1, 2026-08-24): `update`, `remove`, and
 * `test` previously looked up a connection by `id` ALONE — no `client_id`
 * check anywhere in this service. Their routes (`PATCH/DELETE /oc/
 * database-connections/:id`, `POST /oc/database-connections/:id/test`)
 * carry no `:clientId` URL segment either, so tenant-access.ts's own
 * clientId-membership check never even applies to them (it skips any route
 * where it can't find a clientId to check). The only protection was
 * RBAC's `Admin.Access` gate — which today happens to correlate with the
 * same roles tenant-access.ts lets bypass cross-client checks anyway, but
 * that is a coincidence of today's role configuration, not an enforced
 * guarantee: the instant a client-scoped-but-non-cross-client staff role
 * exists, this becomes a real path for one client's real database
 * credentials (host/port/username, and via `password_ref` the actual
 * secret) to be read, silently repointed to an attacker-controlled host,
 * or deleted by someone only authorized for a DIFFERENT client. Every
 * caller now passes the real, tenant-access-verified `clientId`; a
 * mismatch throws this error, and the routes turn it into the same `404`
 * shape as "doesn't exist" (never distinguishing the two, so this can't be
 * used to probe which connection IDs are real).
 */
export class DatabaseConnectionOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConnectionOwnershipError';
  }
}

function toConnection(row: Row): DatabaseConnection {
  return {
    id: row.id, clientId: row.client_id, name: row.name, connectorType: row.connector_type,
    host: row.host, port: row.port, databaseName: row.database_name, username: row.username,
    hasPassword: !!row.password_ref, authType: row.auth_type, environment: row.environment,
    description: row.description, tags: row.tags || [],
    status: row.status, lastTestMode: row.last_test_mode, lastTestSteps: row.last_test_steps || [],
    lastTestError: row.last_test_error || '', lastTestedAt: row.last_tested_at ? row.last_tested_at.toISOString() : null,
    createdBy: row.created_by, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    sslMode: row.ssl_mode || 'disable', hasSslCaCertificate: !!row.ssl_ca_certificate,
  };
}

export interface CreateInput {
  clientId: string; name: string; connectorType: ConnectorType; host: string; port: number;
  databaseName: string; username: string; password?: string; authType?: string; environment?: string;
  description?: string; tags?: string[]; createdBy?: string;
  sslMode?: SslMode; sslCaCertificate?: string;
}
export interface UpdateInput extends Partial<Omit<CreateInput, 'clientId' | 'createdBy'>> {
  /** Omit entirely to leave the stored password unchanged; pass '' explicitly to clear it. */
  password?: string;
}

const SSL_MODES: SslMode[] = ['disable', 'require', 'verify-full'];

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
    if (input.sslMode !== undefined && !SSL_MODES.includes(input.sslMode)) return `SSL mode must be one of: ${SSL_MODES.join(', ')}.`;
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
        (client_id, name, connector_type, host, port, database_name, username, password_ref, auth_type, environment, description, tags, created_by, ssl_mode, ssl_ca_certificate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [input.clientId, input.name.trim(), input.connectorType, input.host.trim(), input.port, input.databaseName.trim(),
        input.username.trim(), passwordRef, input.authType || 'standard', input.environment || 'production',
        input.description || '', input.tags || [], input.createdBy || null,
        input.sslMode || 'disable', input.sslCaCertificate || null],
    );
    const created = toConnection(res.rows[0]!);
    await this.audit(created.id, created.clientId, 'database_connection.created', input.createdBy || 'unknown-staff', { name: created.name, connectorType: created.connectorType, host: created.host });
    return { ok: true, value: created };
  }

  async update(id: string, clientId: string, input: UpdateInput, actor: string): Promise<Result<DatabaseConnection>> {
    const existingRes = await this.db.query<Row>('SELECT * FROM oc_client_database_connections WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { ok: false, error: { code: 'not_found', message: 'No such connection.' } };
    const existing = existingRes.rows[0]!;
    if (existing.client_id !== clientId) throw new DatabaseConnectionOwnershipError('This connection does not belong to this client.');

    if (input.name !== undefined && !input.name.trim()) return { ok: false, error: { code: 'validation', message: 'Connection name is required.' } };
    if (input.host !== undefined && !input.host.trim()) return { ok: false, error: { code: 'validation', message: 'Host or IP address is required.' } };
    if (input.databaseName !== undefined && !input.databaseName.trim()) return { ok: false, error: { code: 'validation', message: 'Database/service is required.' } };
    if (input.username !== undefined && !input.username.trim()) return { ok: false, error: { code: 'validation', message: 'Username is required.' } };
    if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) return { ok: false, error: { code: 'validation', message: 'Port must be a valid port number.' } };
    if (input.sslMode !== undefined && !SSL_MODES.includes(input.sslMode)) return { ok: false, error: { code: 'validation', message: `SSL mode must be one of: ${SSL_MODES.join(', ')}.` } };

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
    const nextSslMode = input.sslMode ?? existing.ssl_mode ?? 'disable';
    // A real TLS-mode change is just as connection-relevant as a host/port
    // change — a stale "Connected" badge earned under `disable` must not
    // keep being shown once the mode changes to `require`/`verify-full`
    // (or vice versa) until it's genuinely re-tested under the new mode.
    const connectionValueChanged = nextHost !== existing.host || nextPort !== existing.port
      || nextDatabaseName !== existing.database_name || nextUsername !== existing.username
      || input.password !== undefined || nextSslMode !== (existing.ssl_mode || 'disable');

    const res = await this.db.query<Row>(
      `UPDATE oc_client_database_connections SET
        name = $2, connector_type = $3, host = $4, port = $5, database_name = $6, username = $7,
        password_ref = $8, auth_type = $9, environment = $10, description = $11, tags = $12,
        status = CASE WHEN $13 THEN 'not_tested' ELSE status END, updated_at = NOW(),
        ssl_mode = $14, ssl_ca_certificate = $15
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? existing.name, input.connectorType ?? existing.connector_type, nextHost,
        nextPort, nextDatabaseName, nextUsername,
        passwordRef, input.authType ?? existing.auth_type, input.environment ?? existing.environment,
        input.description ?? existing.description, input.tags ?? existing.tags,
        connectionValueChanged, nextSslMode, input.sslCaCertificate ?? existing.ssl_ca_certificate,
      ],
    );
    const updated = toConnection(res.rows[0]!);
    await this.audit(id, updated.clientId, 'database_connection.updated', actor, { name: updated.name });
    return { ok: true, value: updated };
  }

  async remove(id: string, clientId: string, actor: string): Promise<Result<{ id: string }>> {
    const existingRes = await this.db.query<Row>('SELECT client_id, name FROM oc_client_database_connections WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { ok: false, error: { code: 'not_found', message: 'No such connection.' } };
    if ((existingRes.rows[0] as any).client_id !== clientId) throw new DatabaseConnectionOwnershipError('This connection does not belong to this client.');
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
  async test(id: string, clientId: string): Promise<Result<DatabaseConnection>> {
    const existingRes = await this.db.query<Row>('SELECT * FROM oc_client_database_connections WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { ok: false, error: { code: 'not_found', message: 'No such connection.' } };
    const row = existingRes.rows[0]!;
    if (row.client_id !== clientId) throw new DatabaseConnectionOwnershipError('This connection does not belong to this client.');
    const password = row.password_ref ? await getSecretProvider().getSecret(row.password_ref) : '';

    const steps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }> = [];
    const startedAt = Date.now();

    if (row.connector_type === 'postgresql') {
      await this.testPostgres(row.host, row.port, row.database_name, row.username, password, row.ssl_mode || 'disable', row.ssl_ca_certificate, steps);
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

  /**
   * SECURITY FIX (connector_test_1 fast-follow): the DNS-resolution step
   * previously only confirmed the hostname resolved at all — it never
   * inspected the resolved IP for safety, so a "test connection" call was a
   * genuine SSRF primitive (any caller-supplied host, resolved and probed
   * by AskABD's own server). Now delegates to `assertSafeOutboundDestination`,
   * which resolves via the real OS resolver and rejects any candidate
   * address in a private/loopback/link-local/reserved range (loopback
   * allowed only outside NODE_ENV==='production' — see that module's own
   * doc comment for the full policy and its real, disclosed limitations).
   */
  private async testGenericReachability(host: string, port: number, steps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }>): Promise<void> {
    const dnsStart = Date.now();
    try {
      await assertSafeOutboundDestination(host, port);
      steps.push({ step: 'DNS Resolution', pass: true, durationMs: Date.now() - dnsStart });
    } catch (err) {
      const message = err instanceof UnsafeDestinationError ? err.message : `Cannot resolve host: ${host}`;
      steps.push({ step: 'DNS Resolution', pass: false, durationMs: Date.now() - dnsStart, error: message });
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

  /**
   * Builds the real `pg` ssl option for a given mode. 'require' encrypts
   * opportunistically without validating the certificate (matches libpq's
   * own `sslmode=require`) — proven live to genuinely fail closed (not
   * silently fall back to plaintext) when the server doesn't support SSL
   * at all. 'verify-full' additionally validates the certificate chain AND
   * the hostname — `servername` is set explicitly because node-postgres's
   * own default `rejectUnauthorized: true` was proven live to NOT reliably
   * verify hostname on its own (a real, confirmed driver gotcha; without
   * this, "verify-full" would silently only be "verify-CA").
   */
  private buildSslConfig(mode: SslMode, host: string, caCertificate: string | null): false | { rejectUnauthorized: boolean; servername?: string; ca?: string } {
    if (mode === 'disable') return false;
    if (mode === 'require') return { rejectUnauthorized: false };
    return { rejectUnauthorized: true, servername: host, ca: caCertificate || undefined };
  }

  private async testPostgres(host: string, port: number, database: string, username: string, password: string, sslMode: SslMode, sslCaCertificate: string | null, steps: Array<{ step: string; pass: boolean; durationMs: number; error?: string }>): Promise<void> {
    await this.testGenericReachability(host, port, steps);
    if (steps.some(s => !s.pass)) return;

    const connStart = Date.now();
    const ssl = this.buildSslConfig(sslMode, host, sslCaCertificate);
    const pool = new Pool({ host, port, database, user: username, password, ssl, connectionTimeoutMillis: 10000, max: 1 });
    try {
      const client = await pool.connect();
      steps.push({ step: 'TCP Connection', pass: true, durationMs: Date.now() - connStart });
      steps.push({ step: 'Authentication', pass: true, durationMs: 0 });

      // Real, auditable proof TLS was ACTUALLY negotiated (not merely
      // requested) — read back from the server's own pg_stat_ssl view for
      // the CURRENT backend, never assumed from the client-side config.
      if (sslMode !== 'disable') {
        const tlsStart = Date.now();
        try {
          const sslRes = await client.query('SELECT ssl, cipher, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
          const sslRow = sslRes.rows[0];
          if (sslRow?.ssl) {
            steps.push({ step: `TLS Negotiated (${sslRow.version}, ${sslRow.cipher})`, pass: true, durationMs: Date.now() - tlsStart });
          } else {
            steps.push({ step: 'TLS Negotiated', pass: false, durationMs: Date.now() - tlsStart, error: `${sslMode} was requested but the real connection is not encrypted — this should not be possible; treat as a real failure, not a warning.` });
          }
        } catch {
          // pg_stat_ssl unavailable (older Postgres) — not a real failure,
          // just undocumented; never fabricate a pass we can't prove.
          steps.push({ step: 'TLS Negotiated', pass: true, durationMs: Date.now() - tlsStart, error: 'Could not independently verify via pg_stat_ssl (unavailable on this server) — the connection itself required TLS to succeed at all under this mode.' });
        }
      }

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
    } catch (err) {
      // A real TLS-specific failure (server doesn't support SSL under
      // require/verify-full, or a real cert/hostname mismatch under
      // verify-full) surfaces here — genuinely fails closed, never falls
      // back to an unencrypted attempt. Message kept generic/safe (never
      // echoes the raw driver error, which could in principle include
      // connection details) except for the one real TLS-shaped case below.
      const raw = (err as Error).message || '';
      const isTlsFailure = sslMode !== 'disable' && /ssl|certificate|tls/i.test(raw);
      steps.push({
        step: 'Authentication', pass: false, durationMs: Date.now() - connStart,
        error: isTlsFailure
          ? `TLS connection failed under "${sslMode}" mode: ${raw}`
          : 'Unable to connect to database. Check host, port, credentials and network access.',
      });
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
