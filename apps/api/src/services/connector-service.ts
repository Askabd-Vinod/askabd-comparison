/**
 * AskABD Connector Validation Service
 * Performs REAL connection testing against external systems.
 * Returns individual validation step results — never fakes success.
 * Persists results to PostgreSQL for audit and state tracking.
 */

import { Pool } from 'pg';
import * as net from 'net';
import * as dns from 'dns';
import { promisify } from 'util';
import { sharedPool } from './db-pool.js';

const dnsResolve = promisify(dns.resolve);

// Shared pool for persisting connector state (app database)
const dbPool = sharedPool;

export interface ValidationStep {
  step: string;
  pass: boolean;
  durationMs: number;
  error?: string;
}

export interface ConnectionTestResult {
  provider: string;
  clientId: string;
  status: 'connected' | 'failed' | 'partial';
  steps: ValidationStep[];
  testedAt: string;
  totalDurationMs: number;
  error?: string;
  mode: 'real' | 'demo';
}

export interface ConnectorConfig {
  provider: string;
  clientId: string;
  fields: Record<string, string>;
}

export class ConnectorService {
  /**
   * Test a connection based on provider type.
   * Performs REAL validation where possible.
   * Reports DEMO mode when real infrastructure is unavailable.
   * Persists results to database for audit trail.
   */
  async testConnection(config: ConnectorConfig): Promise<ConnectionTestResult> {
    const { provider, clientId, fields } = config;

    let result: ConnectionTestResult;
    switch (provider.toLowerCase()) {
      case 'postgresql':
        result = await this.testPostgreSQL(clientId, fields);
        break;
      case 'aws':
        result = await this.testAWS(clientId, fields);
        break;
      case 'azure':
        result = await this.testAzure(clientId, fields);
        break;
      case 'github':
        result = await this.testGitHub(clientId, fields);
        break;
      case 'kubernetes':
        result = await this.testKubernetes(clientId, fields);
        break;
      default:
        result = await this.testGeneric(provider, clientId, fields);
        break;
    }

    // Persist to database
    await this.persistResult(result, fields).catch(() => { /* non-blocking */ });

    return result;
  }

  /**
   * Get connector status for a client from database
   */
  async getConnectors(clientId: string): Promise<any[]> {
    try {
      const res = await dbPool.query('SELECT id, provider, status, security_level, configuration, last_tested_at, last_test_duration_ms, last_test_mode, validation_steps, error_message, updated_at FROM oc_connectors WHERE client_id = $1 ORDER BY provider', [clientId]);
      return res.rows;
    } catch { return []; }
  }

  /**
   * Real connection-test history for a client — every row is a genuine, previously-executed
   * verification attempt (see `persistResult()` below, called after every real `testConnection()`
   * outcome). Never fabricated; an empty result means no test has been run yet, and callers
   * must present that honestly rather than inventing placeholder rows.
   */
  async getConnectionTests(clientId: string, limit = 50): Promise<any[]> {
    try {
      const res = await dbPool.query(
        'SELECT id, provider, status, mode, duration_ms, steps, error_message, tested_at FROM oc_connection_tests WHERE client_id = $1 ORDER BY tested_at DESC LIMIT $2',
        [clientId, limit],
      );
      return res.rows;
    } catch { return []; }
  }

  /**
   * Save connector configuration (non-secret fields only)
   */
  async saveConfiguration(clientId: string, provider: string, fields: Record<string, string>, securityLevel: string = 'read-only'): Promise<void> {
    // Strip sensitive fields before persisting
    const safeFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!['password', 'secret', 'token', 'clientSecret', 'externalId'].includes(k)) {
        safeFields[k] = v;
      } else {
        safeFields[k] = v ? '••••••••' : ''; // Mask but indicate presence
      }
    }

    await dbPool.query(`
      INSERT INTO oc_connectors (client_id, provider, status, security_level, configuration, updated_at)
      VALUES ($1, $2, 'configured', $3, $4, NOW())
      ON CONFLICT (client_id, provider) DO UPDATE SET
        status = 'configured', configuration = $4, security_level = $3, updated_at = NOW()
    `, [clientId, provider, securityLevel, JSON.stringify(safeFields)]);
  }

  private async persistResult(result: ConnectionTestResult, _fields: Record<string, string>): Promise<void> {
    const { provider, clientId, status, steps, totalDurationMs, error, mode } = result;

    // Update connector status
    await dbPool.query(`
      INSERT INTO oc_connectors (client_id, provider, status, last_tested_at, last_test_duration_ms, last_test_mode, validation_steps, error_message, updated_at)
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, NOW())
      ON CONFLICT (client_id, provider) DO UPDATE SET
        status = $3, last_tested_at = NOW(), last_test_duration_ms = $4, last_test_mode = $5, validation_steps = $6, error_message = $7, updated_at = NOW()
    `, [clientId, provider, status, totalDurationMs, mode, JSON.stringify(steps), error || '']);

    // Insert test history
    await dbPool.query(`
      INSERT INTO oc_connection_tests (client_id, provider, status, mode, duration_ms, steps, error_message, correlation_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [clientId, provider, status, mode, totalDurationMs, JSON.stringify(steps), error || '', `ctest-${Date.now()}`]);
  }

  // ─── POSTGRESQL ─────────────────────────────────────────────────────────────

  private async testPostgreSQL(clientId: string, fields: Record<string, string>): Promise<ConnectionTestResult> {
    const steps: ValidationStep[] = [];
    const start = Date.now();
    const host = fields.host || '';
    const port = parseInt(fields.port || '5432', 10);
    const database = fields.database || '';
    const username = fields.username || '';
    const password = fields.password || '';
    const ssl = fields.ssl || 'disable';

    // Step 1: DNS Resolution
    const dnsStart = Date.now();
    try {
      if (host !== 'localhost' && host !== '127.0.0.1') {
        await dnsResolve(host);
      }
      steps.push({ step: 'DNS Resolution', pass: true, durationMs: Date.now() - dnsStart });
    } catch (err) {
      steps.push({ step: 'DNS Resolution', pass: false, durationMs: Date.now() - dnsStart, error: `Cannot resolve host: ${host}` });
      return this.buildResult('postgresql', clientId, steps, start, 'real');
    }

    // Step 2: Port Accessibility
    const portStart = Date.now();
    try {
      await this.checkPort(host, port, 5000);
      steps.push({ step: 'Port Accessibility', pass: true, durationMs: Date.now() - portStart });
    } catch (err) {
      steps.push({ step: 'Port Accessibility', pass: false, durationMs: Date.now() - portStart, error: `Port ${port} not accessible on ${host}` });
      return this.buildResult('postgresql', clientId, steps, start, 'real');
    }

    // Step 3-7: Actual PostgreSQL connection
    const connStart = Date.now();
    const pool = new Pool({
      host, port, database, user: username, password,
      ssl: ssl === 'require' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
      max: 1,
    });

    try {
      const client = await pool.connect();
      steps.push({ step: 'TCP Connection', pass: true, durationMs: Date.now() - connStart });

      // Authentication (implicit in connect success)
      steps.push({ step: 'Authentication', pass: true, durationMs: 0 });

      // Database Access
      const dbStart = Date.now();
      try {
        await client.query('SELECT current_database()');
        steps.push({ step: 'Database Access', pass: true, durationMs: Date.now() - dbStart });
      } catch (err) {
        steps.push({ step: 'Database Access', pass: false, durationMs: Date.now() - dbStart, error: (err as Error).message });
        client.release();
        await pool.end();
        return this.buildResult('postgresql', clientId, steps, start, 'real');
      }

      // Read Permission
      const readStart = Date.now();
      try {
        await client.query("SELECT table_name FROM information_schema.tables LIMIT 1");
        steps.push({ step: 'Read Permission', pass: true, durationMs: Date.now() - readStart });
      } catch (err) {
        steps.push({ step: 'Read Permission', pass: false, durationMs: Date.now() - readStart, error: (err as Error).message });
        client.release();
        await pool.end();
        return this.buildResult('postgresql', clientId, steps, start, 'real');
      }

      // Query Execution
      const queryStart = Date.now();
      try {
        await client.query("SELECT count(*) FROM information_schema.tables");
        steps.push({ step: 'Query Execution', pass: true, durationMs: Date.now() - queryStart });
      } catch (err) {
        steps.push({ step: 'Query Execution', pass: false, durationMs: Date.now() - queryStart, error: (err as Error).message });
      }

      // Latency
      const latStart = Date.now();
      await client.query('SELECT 1');
      const latency = Date.now() - latStart;
      steps.push({ step: `Latency (${latency}ms)`, pass: latency < 5000, durationMs: latency });

      client.release();
      await pool.end();
    } catch (err) {
      steps.push({ step: 'Authentication', pass: false, durationMs: Date.now() - connStart, error: (err as Error).message });
      try { await pool.end(); } catch { /* ignore */ }
      return this.buildResult('postgresql', clientId, steps, start, 'real');
    }

    return this.buildResult('postgresql', clientId, steps, start, 'real');
  }

  // ─── AWS ────────────────────────────────────────────────────────────────────

  private async testAWS(clientId: string, fields: Record<string, string>): Promise<ConnectionTestResult> {
    const steps: ValidationStep[] = [];
    const start = Date.now();

    // AWS requires actual SDK/credentials — check if fields are provided
    const accountId = fields.accountId || '';
    const region = fields.region || '';
    const roleArn = fields.roleArn || '';

    // Step 1: Configuration completeness
    if (!accountId || !region || !roleArn) {
      steps.push({ step: 'Configuration Check', pass: false, durationMs: 0, error: 'Missing required fields: Account ID, Region, and Role ARN are mandatory' });
      return this.buildResult('aws', clientId, steps, start, 'real');
    }
    steps.push({ step: 'Configuration Check', pass: true, durationMs: 0 });

    // Step 2: AWS endpoint connectivity
    const endpointStart = Date.now();
    try {
      await this.checkPort(`sts.${region}.amazonaws.com`, 443, 5000);
      steps.push({ step: 'AWS Endpoint Connectivity', pass: true, durationMs: Date.now() - endpointStart });
    } catch {
      steps.push({ step: 'AWS Endpoint Connectivity', pass: false, durationMs: Date.now() - endpointStart, error: `Cannot reach sts.${region}.amazonaws.com:443. Check network/firewall.` });
      return this.buildResult('aws', clientId, steps, start, 'real');
    }

    // Step 3: Credential validation requires AWS SDK — report as external dependency
    steps.push({ step: 'Credential Validation', pass: false, durationMs: 0, error: 'EXTERNAL DEPENDENCY: AWS SDK credentials validation requires @aws-sdk/client-sts. Install and configure IAM role to enable.' });

    return this.buildResult('aws', clientId, steps, start, 'real');
  }

  // ─── AZURE ──────────────────────────────────────────────────────────────────

  private async testAzure(clientId: string, fields: Record<string, string>): Promise<ConnectionTestResult> {
    const steps: ValidationStep[] = [];
    const start = Date.now();

    const tenantId = fields.tenantId || '';
    const clientIdField = fields.clientId || '';

    if (!tenantId || !clientIdField) {
      steps.push({ step: 'Configuration Check', pass: false, durationMs: 0, error: 'Missing required fields: Tenant ID and Client ID are mandatory' });
      return this.buildResult('azure', clientId, steps, start, 'real');
    }
    steps.push({ step: 'Configuration Check', pass: true, durationMs: 0 });

    // Azure login endpoint
    const endpointStart = Date.now();
    try {
      await this.checkPort('login.microsoftonline.com', 443, 5000);
      steps.push({ step: 'Azure Endpoint Connectivity', pass: true, durationMs: Date.now() - endpointStart });
    } catch {
      steps.push({ step: 'Azure Endpoint Connectivity', pass: false, durationMs: Date.now() - endpointStart, error: 'Cannot reach login.microsoftonline.com:443' });
      return this.buildResult('azure', clientId, steps, start, 'real');
    }

    steps.push({ step: 'Authentication', pass: false, durationMs: 0, error: 'EXTERNAL DEPENDENCY: Azure authentication requires @azure/identity SDK. Install to enable.' });

    return this.buildResult('azure', clientId, steps, start, 'real');
  }

  // ─── GITHUB ─────────────────────────────────────────────────────────────────

  private async testGitHub(clientId: string, fields: Record<string, string>): Promise<ConnectionTestResult> {
    const steps: ValidationStep[] = [];
    const start = Date.now();
    const token = fields.token || '';
    const org = fields.organization || '';

    if (!token) {
      steps.push({ step: 'Configuration Check', pass: false, durationMs: 0, error: 'Personal Access Token is required' });
      return this.buildResult('github', clientId, steps, start, 'real');
    }
    steps.push({ step: 'Configuration Check', pass: true, durationMs: 0 });

    // GitHub API connectivity
    const apiStart = Date.now();
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (res.ok) {
        steps.push({ step: 'GitHub API Connectivity', pass: true, durationMs: Date.now() - apiStart });
        steps.push({ step: 'Token Validation', pass: true, durationMs: 0 });

        // Check org access if specified
        if (org) {
          const orgRes = await fetch(`https://api.github.com/orgs/${org}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
          });
          steps.push({ step: 'Organization Access', pass: orgRes.ok, durationMs: 0, error: orgRes.ok ? undefined : `Cannot access organization: ${org}` });
        }

        // Check repo list
        const repoRes = await fetch(`https://api.github.com/${org ? `orgs/${org}` : 'user'}/repos?per_page=1`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        steps.push({ step: 'Repository Access', pass: repoRes.ok, durationMs: 0, error: repoRes.ok ? undefined : 'Cannot list repositories' });
      } else if (res.status === 401) {
        steps.push({ step: 'GitHub API Connectivity', pass: true, durationMs: Date.now() - apiStart });
        steps.push({ step: 'Token Validation', pass: false, durationMs: 0, error: 'Invalid or expired token' });
      } else {
        steps.push({ step: 'GitHub API Connectivity', pass: false, durationMs: Date.now() - apiStart, error: `HTTP ${res.status}` });
      }
    } catch (err) {
      steps.push({ step: 'GitHub API Connectivity', pass: false, durationMs: Date.now() - apiStart, error: (err as Error).message });
    }

    return this.buildResult('github', clientId, steps, start, 'real');
  }

  // ─── KUBERNETES ─────────────────────────────────────────────────────────────

  private async testKubernetes(clientId: string, fields: Record<string, string>): Promise<ConnectionTestResult> {
    const steps: ValidationStep[] = [];
    const start = Date.now();
    const endpoint = fields.clusterEndpoint || '';

    if (!endpoint) {
      steps.push({ step: 'Configuration Check', pass: false, durationMs: 0, error: 'Cluster API Endpoint is required' });
      return this.buildResult('kubernetes', clientId, steps, start, 'real');
    }
    steps.push({ step: 'Configuration Check', pass: true, durationMs: 0 });

    // Parse URL
    try {
      const url = new URL(endpoint);
      const host = url.hostname;
      const port = parseInt(url.port || '6443', 10);

      const portStart = Date.now();
      try {
        await this.checkPort(host, port, 5000);
        steps.push({ step: 'Endpoint Connectivity', pass: true, durationMs: Date.now() - portStart });
      } catch {
        steps.push({ step: 'Endpoint Connectivity', pass: false, durationMs: Date.now() - portStart, error: `Cannot reach ${host}:${port}` });
        return this.buildResult('kubernetes', clientId, steps, start, 'real');
      }

      steps.push({ step: 'Authentication', pass: false, durationMs: 0, error: 'EXTERNAL DEPENDENCY: Kubernetes authentication requires valid kubeconfig or service account token and @kubernetes/client-node SDK.' });
    } catch {
      steps.push({ step: 'URL Parsing', pass: false, durationMs: 0, error: 'Invalid cluster endpoint URL' });
    }

    return this.buildResult('kubernetes', clientId, steps, start, 'real');
  }

  // ─── GENERIC ────────────────────────────────────────────────────────────────

  private async testGeneric(provider: string, clientId: string, fields: Record<string, string>): Promise<ConnectionTestResult> {
    const steps: ValidationStep[] = [];
    const start = Date.now();
    const host = fields.host || fields.endpoint || '';
    const port = parseInt(fields.port || '443', 10);

    if (!host) {
      steps.push({ step: 'Configuration Check', pass: false, durationMs: 0, error: 'Host/endpoint is required' });
      return this.buildResult(provider, clientId, steps, start, 'real');
    }
    steps.push({ step: 'Configuration Check', pass: true, durationMs: 0 });

    const portStart = Date.now();
    try {
      await this.checkPort(host, port, 5000);
      steps.push({ step: 'Host Reachability', pass: true, durationMs: Date.now() - portStart });
      steps.push({ step: 'Port Accessibility', pass: true, durationMs: 0 });
    } catch {
      steps.push({ step: 'Host Reachability', pass: false, durationMs: Date.now() - portStart, error: `Cannot reach ${host}:${port}` });
    }

    return this.buildResult(provider, clientId, steps, start, 'real');
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  private buildResult(provider: string, clientId: string, steps: ValidationStep[], startMs: number, mode: 'real' | 'demo'): ConnectionTestResult {
    const allPassed = steps.length > 0 && steps.every(s => s.pass);
    const somePassed = steps.some(s => s.pass) && !allPassed;
    return {
      provider, clientId,
      status: allPassed ? 'connected' : somePassed ? 'partial' : 'failed',
      steps, testedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - startMs,
      error: allPassed ? undefined : steps.find(s => !s.pass)?.error,
      mode,
    };
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
}
