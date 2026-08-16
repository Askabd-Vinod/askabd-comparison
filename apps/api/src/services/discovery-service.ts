/**
 * AskABD Discovery Service
 * Performs REAL read-only discovery using validated connectors.
 * Persists results to PostgreSQL. Never modifies source systems.
 */

import { sharedPool } from './db-pool.js';

const dbPool = sharedPool;

export interface DiscoveredResource {
  type: string; // database, schema, table, view, index, extension, server
  name: string;
  metadata: Record<string, any>;
  connector: string;
  discoveredAt: string;
}

export interface DiscoveryRun {
  id: string;
  clientId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  connectorsUsed: string[];
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  resourcesFound: number;
  warnings: number;
  errors: number;
  results: { resources: DiscoveredResource[]; summary: Record<string, number> };
  evidence: string[];
}

export class DiscoveryService {

  /**
   * Check if a client has the prerequisites for discovery
   */
  async checkPrerequisites(clientId: string): Promise<{ ready: boolean; missing: string[] }> {
    const missing: string[] = [];
    try {
      const res = await dbPool.query(
        "SELECT provider, status FROM oc_connectors WHERE client_id = $1 AND status = 'connected'",
        [clientId]
      );
      if (res.rows.length === 0) {
        missing.push('No connected connectors. At least one validated connector is required.');
      }
    } catch {
      missing.push('Cannot verify connector status — database unavailable');
    }
    return { ready: missing.length === 0, missing };
  }

  /**
   * Start a discovery run for a client.
   * Uses ONLY connectors with status='connected' in the database.
   */
  async startDiscovery(clientId: string): Promise<DiscoveryRun> {
    const runId = `disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();

    // Get connected connectors from database
    const connRes = await dbPool.query(
      "SELECT provider, configuration FROM oc_connectors WHERE client_id = $1 AND status = 'connected'",
      [clientId]
    );

    if (connRes.rows.length === 0) {
      const failedRun: DiscoveryRun = {
        id: runId, clientId, status: 'failed', connectorsUsed: [],
        startedAt, completedAt: startedAt, durationMs: 0,
        resourcesFound: 0, warnings: 0, errors: 1,
        results: { resources: [], summary: {} },
        evidence: ['Discovery failed: No connected connectors available'],
      };
      await this.persistRun(failedRun);
      return failedRun;
    }

    const connectorsUsed = connRes.rows.map((r: any) => r.provider);
    const resources: DiscoveredResource[] = [];
    const evidence: string[] = [`Discovery started at ${startedAt}`, `Connectors: ${connectorsUsed.join(', ')}`];
    let warnings = 0;
    let errors = 0;

    // Execute discovery for each connected provider
    for (const row of connRes.rows) {
      try {
        const providerResources = await this.discoverProvider(row.provider, row.configuration, clientId);
        resources.push(...providerResources);
        evidence.push(`${row.provider}: ${providerResources.length} resources discovered`);
      } catch (err) {
        errors++;
        evidence.push(`${row.provider}: Discovery failed — ${(err as Error).message}`);
      }
    }

    const completedAt = new Date().toISOString();
    const summary: Record<string, number> = {};
    for (const r of resources) {
      summary[r.type] = (summary[r.type] || 0) + 1;
    }

    const run: DiscoveryRun = {
      id: runId, clientId,
      status: errors > 0 && resources.length === 0 ? 'failed' : 'completed',
      connectorsUsed, startedAt, completedAt,
      durationMs: Date.now() - new Date(startedAt).getTime(),
      resourcesFound: resources.length, warnings, errors,
      results: { resources, summary },
      evidence,
    };

    await this.persistRun(run);
    return run;
  }

  /**
   * Discover resources from a specific provider.
   * READ-ONLY operations only.
   */
  private async discoverProvider(provider: string, config: any, _clientId: string): Promise<DiscoveredResource[]> {
    switch (provider.toLowerCase()) {
      case 'postgresql': return this.discoverPostgreSQL(config);
      case 'github': return this.discoverGitHub(config);
      default: return [];
    }
  }

  /**
   * REAL PostgreSQL Discovery — reads schemas, tables, views, indexes
   * Uses the CLIENT's connector credentials, NOT the platform database pool.
   * Falls back to platform pool only if the stored config matches platform DB (DEV self-discovery).
   */
  private async discoverPostgreSQL(config: any): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];
    const parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;

    const host = parsedConfig.host || 'localhost';
    const port = parseInt(parsedConfig.port || '5432', 10);
    const database = parsedConfig.database || 'comparison';
    const username = parsedConfig.username || 'comp_user';
    const password = parsedConfig.password || '';

    const now = new Date().toISOString();

    // Determine if we should use the client's own connection or platform pool
    // If password is masked (stored securely), we cannot create a separate connection
    // In that case, fall back to platform pool for DEV self-discovery only
    const isMaskedPassword = !password || password === '••••••••';
    const isPlatformDb = host === 'localhost' && (port === 5442 || port === 5432) && database === 'comparison';

    let discoveryPool: import('pg').Pool;
    let ownedPool = false;

    if (isMaskedPassword && isPlatformDb) {
      // DEV self-discovery: safe to use platform pool (discovering our own DB)
      discoveryPool = dbPool;
    } else if (isMaskedPassword) {
      // Cannot discover external DB without credentials — report as blocked
      resources.push({ type: 'warning', name: 'Credentials masked', metadata: { reason: 'Connector password is stored securely. Re-enter credentials or configure secure vault to enable live discovery of external databases.' }, connector: 'postgresql', discoveredAt: now });
      return resources;
    } else {
      // Create a SEPARATE read-only connection to the CLIENT's database
      const { Pool } = await import('pg');
      discoveryPool = new Pool({
        host, port, database, user: username, password,
        max: 2,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 10000,
        ssl: undefined, // Client connector should specify SSL if needed
      });
      ownedPool = true;
    }

    try {
      // Server info
      try {
        const verRes = await discoveryPool.query('SELECT version()');
        resources.push({ type: 'server', name: `${host}:${port}`, metadata: { version: verRes.rows[0]?.version, host, port, database }, connector: 'postgresql', discoveredAt: now });
      } catch { /* skip */ }

      // Databases
      try {
        const dbRes = await discoveryPool.query("SELECT datname FROM pg_database WHERE datistemplate = false");
        for (const row of dbRes.rows) {
          resources.push({ type: 'database', name: row.datname, metadata: { host, port }, connector: 'postgresql', discoveredAt: now });
        }
      } catch { /* skip */ }

      // Schemas
      try {
        const schRes = await discoveryPool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')");
        for (const row of schRes.rows) {
          resources.push({ type: 'schema', name: row.schema_name, metadata: { database }, connector: 'postgresql', discoveredAt: now });
        }
      } catch { /* skip */ }

      // Tables with sizes
      try {
        const tabRes = await discoveryPool.query(`
          SELECT schemaname, tablename, 
                 pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
          FROM pg_tables 
          WHERE schemaname NOT IN ('pg_catalog','information_schema')
          ORDER BY schemaname, tablename
        `);
        for (const row of tabRes.rows) {
          resources.push({ type: 'table', name: `${row.schemaname}.${row.tablename}`, metadata: { schema: row.schemaname, size: row.size }, connector: 'postgresql', discoveredAt: now });
        }
      } catch { /* skip */ }

      // Views
      try {
        const viewRes = await discoveryPool.query("SELECT schemaname, viewname FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema')");
        for (const row of viewRes.rows) {
          resources.push({ type: 'view', name: `${row.schemaname}.${row.viewname}`, metadata: { schema: row.schemaname }, connector: 'postgresql', discoveredAt: now });
        }
      } catch { /* skip */ }

      // Indexes
      try {
        const idxRes = await discoveryPool.query("SELECT schemaname, indexname, tablename FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 50");
        for (const row of idxRes.rows) {
          resources.push({ type: 'index', name: row.indexname, metadata: { schema: row.schemaname, table: row.tablename }, connector: 'postgresql', discoveredAt: now });
        }
      } catch { /* skip */ }

      // Extensions
      try {
        const extRes = await discoveryPool.query("SELECT extname, extversion FROM pg_extension");
        for (const row of extRes.rows) {
          resources.push({ type: 'extension', name: row.extname, metadata: { version: row.extversion }, connector: 'postgresql', discoveredAt: now });
        }
      } catch { /* skip */ }
    } finally {
      // Always close owned pools to prevent connection leaks
      if (ownedPool) {
        await discoveryPool.end().catch(() => {});
      }
    }

    return resources;
  }

  /**
   * REAL GitHub Discovery — reads org/repos via API
   */
  private async discoverGitHub(config: any): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];
    const parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;
    const token = parsedConfig.token;
    const org = parsedConfig.organization;
    const now = new Date().toISOString();

    if (!token || token === '••••••••') {
      // Token is masked in DB — cannot perform real GitHub discovery without secure vault
      return [{ type: 'warning', name: 'GitHub token masked', metadata: { reason: 'Token stored securely. Re-enter to enable live discovery.' }, connector: 'github', discoveredAt: now }];
    }

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' };

    // Organization info
    if (org) {
      try {
        const res = await fetch(`https://api.github.com/orgs/${org}`, { headers });
        if (res.ok) {
          const data = await res.json() as Record<string, any>;
          resources.push({ type: 'organization', name: org, metadata: { publicRepos: data.public_repos, totalPrivateRepos: data.total_private_repos, plan: data.plan?.name }, connector: 'github', discoveredAt: now });
        }
      } catch { /* skip */ }
    }

    // Repositories
    try {
      const repoUrl = org ? `https://api.github.com/orgs/${org}/repos?per_page=30` : 'https://api.github.com/user/repos?per_page=30';
      const res = await fetch(repoUrl, { headers });
      if (res.ok) {
        const repos = await res.json() as any[];
        for (const repo of repos) {
          resources.push({ type: 'repository', name: repo.full_name, metadata: { language: repo.language, size: repo.size, defaultBranch: repo.default_branch, private: repo.private, updatedAt: repo.updated_at }, connector: 'github', discoveredAt: now });
        }
      }
    } catch { /* skip */ }

    return resources;
  }

  /**
   * Get discovery runs for a client
   */
  async getDiscoveryRuns(clientId: string): Promise<any[]> {
    try {
      const res = await dbPool.query('SELECT * FROM oc_discovery_runs WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10', [clientId]);
      return res.rows;
    } catch { return []; }
  }

  /**
   * Get a specific discovery run
   */
  async getDiscoveryRun(runId: string): Promise<any | null> {
    try {
      const res = await dbPool.query('SELECT * FROM oc_discovery_runs WHERE id = $1', [runId]);
      return res.rows[0] || null;
    } catch { return null; }
  }

  private async persistRun(run: DiscoveryRun): Promise<void> {
    try {
      await dbPool.query(`
        INSERT INTO oc_discovery_runs (id, client_id, status, connectors_used, started_at, completed_at, duration_ms, resources_found, warnings, errors, results, evidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [run.id, run.clientId, run.status, run.connectorsUsed, run.startedAt, run.completedAt, run.durationMs, run.resourcesFound, run.warnings, run.errors, JSON.stringify(run.results), run.evidence]);
    } catch (err) {
      console.error('Failed to persist discovery run:', (err as Error).message);
    }
  }
}
