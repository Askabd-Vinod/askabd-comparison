/**
 * AskABD Jira Integration Service
 *
 * Manages Jira Cloud connectivity, issue creation, status synchronization.
 * Idempotent: will not create duplicate issues for the same AskABD finding.
 * Graceful: AskABD remains fully operational if Jira is unavailable.
 *
 * Token handling — current state (verified 2026-08-16, do not assume otherwise):
 *  - The token is NEVER returned via any API response (getConfig always masks it — see below).
 *  - The token is NEVER logged (no code path in this service or its routes logs config/token values).
 *  - The token is NEVER sent to the frontend in any form other than the fixed '••••••••' mask.
 *  - Storage/retrieval goes through the SecretProvider abstraction (./secrets-provider.ts) —
 *    DEV: current environment (test/local credential handling — the value round-trips as-is,
 *    same as before). PRODUCTION: requires secure secret storage; the AWS Secrets Manager
 *    provider exists as a correctly-shaped integration point but is NOT implemented against
 *    real AWS in this environment and fails loudly if selected without real infrastructure.
 *  - The token IS therefore currently stored in PLAINTEXT in `oc_jira_integrations.auth_token_encrypted`
 *    in this DEV environment. Do not call this "encrypted" — it is not, and the column name is
 *    misleading; corrected here rather than left to mislead the next reader.
 *
 * ⚠ PRODUCTION SECURITY BLOCKER — do not configure real Jira credentials against this service
 * until real production secret storage is provided and verified. No encryption/key-management
 * mechanism (KMS, vault, or an application-level envelope-encryption utility) exists anywhere in
 * this codebase today to reuse — confirmed by inspection, not assumed. No homemade encryption was
 * added — a hardcoded or env-sourced encryption key in this environment would be a false sense of
 * security, not a fix. Exact production requirement: docs/jira-secret-production-requirements.md.
 * This integration is NOT READY UNTIL SECRET STORAGE IS PROVIDED — do not describe it as
 * "production ready" without that evidence.
 */

import { sharedPool } from './db-pool.js';
import { getSecretProvider } from './secrets-provider.js';

const dbPool = sharedPool;

export type JiraStatus = 'not_configured' | 'configured' | 'authenticated' | 'healthy' | 'degraded' | 'failed';

export interface JiraConfig {
  id?: string;
  environment: string;
  baseUrl: string;
  projectKey: string;
  authMethod: string;
  authEmail: string;
  authToken: string; // plaintext only during configuration — encrypted at rest
  defaultIssueType?: string;
  defaultPriority?: string;
  defaultAssignee?: string;
  defaultLabels?: string[];
  defaultComponents?: string[];
}

export interface JiraIssuePayload {
  clientId: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  summary: string;
  description: string;
  issueType?: string;
  priority?: string;
  labels?: string[];
  components?: string[];
}

export interface JiraIssueResult {
  success: boolean;
  issueKey?: string;
  issueUrl?: string;
  error?: string;
  duplicate?: boolean;
}

export interface JiraHealthResult {
  status: JiraStatus;
  responseMs?: number;
  projectAccessible?: boolean;
  error?: string;
  lastChecked: string;
}

export class JiraIntegrationService {

  // ─── CONFIGURATION ──────────────────────────────────────────────────────────

  /**
   * Save or update Jira configuration for an environment.
   *
   * Token storage goes through the SecretProvider abstraction (secrets-provider.ts) rather
   * than being written to `auth_token_encrypted` directly — but the active provider today
   * (DevSecretProvider) still stores the raw value as-is, so this column remains plaintext
   * in practice. See the production security blocker noted at the top of this file: setting
   * SECRETS_PROVIDER=aws-secrets-manager routes through the same seam without touching this
   * method again, once that provider is actually implemented against real AWS.
   */
  async saveConfig(config: JiraConfig): Promise<{ success: boolean; status: JiraStatus }> {
    const secrets = getSecretProvider();
    const tokenForStorage = config.authToken ? await secrets.putSecret(`jira/${config.environment}/token`, config.authToken) : '';

    await dbPool.query(`
      INSERT INTO oc_jira_integrations (environment, base_url, project_key, auth_method, auth_email, auth_token_encrypted, default_issue_type, default_priority, default_assignee, default_labels, default_components, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'configured', NOW())
      ON CONFLICT (environment) DO UPDATE SET
        base_url = $2, project_key = $3, auth_method = $4, auth_email = $5, auth_token_encrypted = $6,
        default_issue_type = $7, default_priority = $8, default_assignee = $9, default_labels = $10, default_components = $11,
        status = 'configured', updated_at = NOW()
    `, [
      config.environment, config.baseUrl, config.projectKey, config.authMethod,
      config.authEmail, tokenForStorage,
      config.defaultIssueType || 'Task', config.defaultPriority || 'Medium',
      config.defaultAssignee || '', config.defaultLabels || [], config.defaultComponents || [],
    ]);

    return { success: true, status: 'configured' };
  }

  /**
   * Get Jira configuration (token MASKED — never exposed via API).
   */
  async getConfig(environment: string): Promise<any | null> {
    const res = await dbPool.query('SELECT * FROM oc_jira_integrations WHERE environment = $1', [environment]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      environment: row.environment,
      baseUrl: row.base_url,
      projectKey: row.project_key,
      authMethod: row.auth_method,
      authEmail: row.auth_email,
      authToken: row.auth_token_encrypted ? '••••••••' : '', // NEVER expose token
      defaultIssueType: row.default_issue_type,
      defaultPriority: row.default_priority,
      defaultAssignee: row.default_assignee,
      defaultLabels: row.default_labels,
      defaultComponents: row.default_components,
      status: row.status,
      lastHealthCheck: row.last_health_check,
      lastHealthStatus: row.last_health_status,
      lastHealthError: row.last_health_error,
    };
  }

  // ─── HEALTH CHECK ───────────────────────────────────────────────────────────

  /**
   * Test Jira connectivity and project access.
   */
  async checkHealth(environment: string): Promise<JiraHealthResult> {
    const config = await this.getConfigInternal(environment);
    if (!config) {
      return { status: 'not_configured', error: 'Jira not configured for this environment', lastChecked: new Date().toISOString() };
    }

    const start = Date.now();
    try {
      // Test authentication by fetching current user
      const authRes = await fetch(`${config.base_url}/rest/api/3/myself`, {
        headers: await this.buildHeaders(config),
      });

      if (!authRes.ok) {
        const status: JiraStatus = authRes.status === 401 ? 'configured' : 'failed';
        const error = authRes.status === 401 ? 'Authentication failed — check API token' : `HTTP ${authRes.status}`;
        await this.updateHealthStatus(environment, status, error);
        return { status, responseMs: Date.now() - start, error, lastChecked: new Date().toISOString() };
      }

      // Test project access
      const projRes = await fetch(`${config.base_url}/rest/api/3/project/${config.project_key}`, {
        headers: await this.buildHeaders(config),
      });

      const projectAccessible = projRes.ok;
      const status: JiraStatus = projectAccessible ? 'healthy' : 'degraded';
      const error = projectAccessible ? undefined : `Project ${config.project_key} not accessible`;

      await this.updateHealthStatus(environment, status, error || '');
      return { status, responseMs: Date.now() - start, projectAccessible, error, lastChecked: new Date().toISOString() };
    } catch (err) {
      const error = (err as Error).message;
      await this.updateHealthStatus(environment, 'failed', error);
      return { status: 'failed', responseMs: Date.now() - start, error, lastChecked: new Date().toISOString() };
    }
  }

  // ─── ISSUE CREATION ─────────────────────────────────────────────────────────

  /**
   * Create a Jira issue from an AskABD entity.
   * IDEMPOTENT: checks for existing link before creating.
   */
  async createIssue(payload: JiraIssuePayload): Promise<JiraIssueResult> {
    const environment = 'development'; // In production, derive from context

    // Idempotency check: does a link already exist?
    const existing = await dbPool.query(
      'SELECT jira_issue_key, jira_issue_url FROM oc_jira_issue_links WHERE source_type = $1 AND source_id = $2 AND environment = $3',
      [payload.sourceType, payload.sourceId, environment]
    );
    if (existing.rows.length > 0) {
      return { success: true, issueKey: existing.rows[0].jira_issue_key, issueUrl: existing.rows[0].jira_issue_url, duplicate: true };
    }

    // Get configuration
    const config = await this.getConfigInternal(environment);
    if (!config) {
      return { success: false, error: 'Jira not configured' };
    }

    // Build Jira issue payload
    const jiraPayload = {
      fields: {
        project: { key: config.project_key },
        summary: payload.summary,
        description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: payload.description }] }] },
        issuetype: { name: payload.issueType || config.default_issue_type || 'Task' },
        priority: { name: payload.priority || config.default_priority || 'Medium' },
        labels: [...(config.default_labels || []), ...(payload.labels || []), 'askabd', `client:${payload.clientId}`],
      },
    };

    try {
      const res = await fetch(`${config.base_url}/rest/api/3/issue`, {
        method: 'POST',
        headers: { ...(await this.buildHeaders(config)), 'Content-Type': 'application/json' },
        body: JSON.stringify(jiraPayload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { success: false, error: `Jira API ${res.status}: ${JSON.stringify(errBody.errors || errBody.errorMessages || 'Unknown error')}` };
      }

      const issue = await res.json() as any;
      const issueKey = issue.key;
      const issueUrl = `${config.base_url}/browse/${issueKey}`;

      // Store link
      await dbPool.query(`
        INSERT INTO oc_jira_issue_links (client_id, environment, source_type, source_id, source_title, jira_issue_key, jira_issue_url, jira_issue_type, jira_priority, askabd_status, sync_status, last_synced_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', 'created', NOW(), 'system')
      `, [payload.clientId, environment, payload.sourceType, payload.sourceId, payload.sourceTitle, issueKey, issueUrl, payload.issueType || 'Task', payload.priority || 'Medium']);

      return { success: true, issueKey, issueUrl };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // ─── ISSUE LINKS ────────────────────────────────────────────────────────────

  /**
   * Get all Jira issue links for a client.
   */
  async getIssueLinks(clientId: string): Promise<any[]> {
    const res = await dbPool.query(
      'SELECT * FROM oc_jira_issue_links WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
    return res.rows.map(r => ({
      id: r.id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceTitle: r.source_title,
      jiraIssueKey: r.jira_issue_key,
      jiraIssueUrl: r.jira_issue_url,
      jiraStatus: r.jira_status,
      askabdStatus: r.askabd_status,
      syncStatus: r.sync_status,
      verificationStatus: r.verification_status,
      createdAt: r.created_at,
      lastSyncedAt: r.last_synced_at,
    }));
  }

  /**
   * Update AskABD status for an issue link (e.g., when Jira transitions to Done).
   */
  async updateLinkStatus(linkId: string, jiraStatus: string, askabdStatus?: string): Promise<void> {
    const updates = ['jira_status = $2', 'last_synced_at = NOW()', 'sync_status = $4', 'updated_at = NOW()'];
    const params: any[] = [linkId, jiraStatus, askabdStatus || undefined, 'synced'];

    if (askabdStatus) {
      updates.push('askabd_status = $3');
    }

    await dbPool.query(
      `UPDATE oc_jira_issue_links SET ${updates.join(', ')} WHERE id = $1`,
      askabdStatus ? [linkId, jiraStatus, askabdStatus, 'synced'] : [linkId, jiraStatus, 'synced', 'synced']
    );
  }

  // ─── DEFECTS ────────────────────────────────────────────────────────────────

  /**
   * Record a defect (deduplicated by fingerprint).
   * If the same defect already exists, increments occurrence count.
   */
  async recordDefect(defect: {
    clientId?: string;
    category: string;
    severity: string;
    title: string;
    description?: string;
    affectedService?: string;
    affectedEndpoint?: string;
    rootCause?: string;
    rootCauseConfidence?: string;
    businessImpact?: string;
    technicalImpact?: string;
    recommendedFix?: string;
    evidence?: string[];
  }): Promise<{ id: string; isNew: boolean; occurrenceCount: number }> {
    // Generate fingerprint for deduplication
    const fingerprint = this.generateFingerprint(defect.clientId || '', defect.category, defect.affectedService || '', defect.title);

    // Try insert (idempotent via fingerprint uniqueness)
    const existing = await dbPool.query('SELECT id, occurrence_count FROM oc_defects WHERE fingerprint = $1', [fingerprint]);

    if (existing.rows.length > 0) {
      // Increment occurrence
      await dbPool.query(
        'UPDATE oc_defects SET occurrence_count = occurrence_count + 1, last_seen_at = NOW(), updated_at = NOW() WHERE fingerprint = $1',
        [fingerprint]
      );
      return { id: existing.rows[0].id, isNew: false, occurrenceCount: existing.rows[0].occurrence_count + 1 };
    }

    // Create new defect
    const res = await dbPool.query(`
      INSERT INTO oc_defects (client_id, environment, category, severity, title, description, affected_service, affected_endpoint, fingerprint, root_cause, root_cause_confidence, business_impact, technical_impact, recommended_fix, evidence)
      VALUES ($1, 'development', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      defect.clientId || null, defect.category, defect.severity, defect.title,
      defect.description || '', defect.affectedService || '', defect.affectedEndpoint || '',
      fingerprint, defect.rootCause || '', defect.rootCauseConfidence || 'unknown',
      defect.businessImpact || '', defect.technicalImpact || '',
      defect.recommendedFix || '', defect.evidence || [],
    ]);

    return { id: res.rows[0].id, isNew: true, occurrenceCount: 1 };
  }

  /**
   * Get defects for a client (or platform-wide if clientId is null).
   */
  async getDefects(clientId?: string, filters?: { status?: string; severity?: string }): Promise<any[]> {
    let query = 'SELECT * FROM oc_defects WHERE 1=1';
    const params: any[] = [];

    if (clientId) { params.push(clientId); query += ` AND client_id = $${params.length}`; }
    if (filters?.status) { params.push(filters.status); query += ` AND status = $${params.length}`; }
    if (filters?.severity) { params.push(filters.severity); query += ` AND severity = $${params.length}`; }

    query += ' ORDER BY severity DESC, occurrence_count DESC, last_seen_at DESC LIMIT 100';
    const res = await dbPool.query(query, params);
    return res.rows;
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  private async getConfigInternal(environment: string): Promise<any | null> {
    const res = await dbPool.query('SELECT * FROM oc_jira_integrations WHERE environment = $1', [environment]);
    return res.rows[0] || null;
  }

  private async buildHeaders(config: any): Promise<Record<string, string>> {
    const token = await getSecretProvider().getSecret(config.auth_token_encrypted);
    const email = config.auth_email;
    // Jira Cloud API token authentication
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    return { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  }

  private async updateHealthStatus(environment: string, status: JiraStatus, error: string): Promise<void> {
    await dbPool.query(
      'UPDATE oc_jira_integrations SET status = $1, last_health_check = NOW(), last_health_status = $1, last_health_error = $2, updated_at = NOW() WHERE environment = $3',
      [status, error, environment]
    ).catch(() => {});
  }

  private generateFingerprint(clientId: string, category: string, service: string, title: string): string {
    // Simple hash-like fingerprint for deduplication
    const input = `${clientId}|${category}|${service}|${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return `fp-${Math.abs(hash).toString(36)}`;
  }
}
