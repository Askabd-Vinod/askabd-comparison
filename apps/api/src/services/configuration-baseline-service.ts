/**
 * Real Approved Baselines, Environment Overrides, and Exceptions
 * (migration 053) — the reusable "is this difference intentional?"
 * layer over the Configuration Comparison type (migration 052). Core
 * principle: a difference is not automatically a defect — "DIFFERENT"
 * and "WRONG" are not the same. See `universal-comparison-engine.ts`'s
 * `classifyConfigFinding()` for the real, reusable decision tree this
 * data feeds.
 */
import { sharedPool } from './db-pool.js';

export interface BaselineOverride { value: string; reason: string; approvedBy: string; approvedAt: string; expiryDate?: string }
export interface BaselineRule { approvedValue?: string; expectedToVaryByEnvironment?: boolean; overrides?: Record<string, BaselineOverride> }
export type BaselineRules = Record<string, BaselineRule>;

export interface ConfigurationBaseline {
  id: string; clientId: string; name: string; version: string; description: string; owner: string | null;
  status: 'draft' | 'approved' | 'deprecated'; approvedBy: string | null; approvedAt: string | null;
  effectiveDate: string | null; expiryDate: string | null;
  classification: string; environmentScope: string[]; applicationScope: string;
  rules: BaselineRules; createdBy: string | null; createdAt: string; updatedAt: string;
}

type BaselineRow = {
  id: string; client_id: string; name: string; version: string; description: string; owner: string | null;
  status: 'draft' | 'approved' | 'deprecated'; approved_by: string | null; approved_at: Date | null;
  effective_date: Date | null; expiry_date: Date | null;
  classification: string; environment_scope: string[]; application_scope: string;
  rules: BaselineRules; created_by: string | null; created_at: Date; updated_at: Date;
};

function toBaseline(r: BaselineRow): ConfigurationBaseline {
  return {
    id: r.id, clientId: r.client_id, name: r.name, version: r.version, description: r.description, owner: r.owner,
    status: r.status, approvedBy: r.approved_by, approvedAt: r.approved_at?.toISOString() ?? null,
    effectiveDate: r.effective_date?.toISOString().slice(0, 10) ?? null, expiryDate: r.expiry_date?.toISOString().slice(0, 10) ?? null,
    classification: r.classification, environmentScope: r.environment_scope || [], applicationScope: r.application_scope,
    rules: r.rules || {}, createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export interface ConfigurationException {
  id: string; clientId: string; comparisonRunId: string; configKey: string; reason: string;
  businessJustification: string; riskAcceptance: string; owner: string | null; approver: string | null;
  status: 'approved' | 'expired' | 'revoked'; mitigation: string; evidence: string;
  expiresAt: string | null; reviewDate: string | null; createdBy: string | null; createdAt: string;
}
type ExceptionRow = {
  id: string; client_id: string; comparison_run_id: string; config_key: string; reason: string;
  business_justification: string; risk_acceptance: string; owner: string | null; approver: string | null;
  status: 'approved' | 'expired' | 'revoked'; mitigation: string; evidence: string;
  expires_at: Date | null; review_date: Date | null; created_by: string | null; created_at: Date;
};
function toException(r: ExceptionRow): ConfigurationException {
  return {
    id: r.id, clientId: r.client_id, comparisonRunId: r.comparison_run_id, configKey: r.config_key, reason: r.reason,
    businessJustification: r.business_justification, riskAcceptance: r.risk_acceptance, owner: r.owner, approver: r.approver,
    status: r.status, mitigation: r.mitigation, evidence: r.evidence,
    expiresAt: r.expires_at?.toISOString() ?? null, reviewDate: r.review_date?.toISOString().slice(0, 10) ?? null,
    createdBy: r.created_by, createdAt: r.created_at.toISOString(),
  };
}

const VALID_CLASSIFICATIONS = new Set(['application', 'database', 'security', 'integration', 'infrastructure', 'other']);

export class ConfigurationBaselineService {
  async create(clientId: string, data: {
    name: string; version?: string; description?: string; owner?: string; classification?: string;
    environmentScope?: string[]; applicationScope?: string; rules?: BaselineRules;
  }, actor: string | null): Promise<ConfigurationBaseline> {
    if (!data.name?.trim()) throw new Error('A real name is required.');
    const classification = data.classification || 'application';
    if (!VALID_CLASSIFICATIONS.has(classification)) throw new Error(`classification must be one of: ${Array.from(VALID_CLASSIFICATIONS).join(', ')}`);
    const res = await sharedPool.query<BaselineRow>(
      `INSERT INTO oc_configuration_baselines (client_id, name, version, description, owner, classification, environment_scope, application_scope, rules, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [clientId, data.name.trim(), data.version || '1.0', data.description || '', data.owner || null, classification,
        data.environmentScope || [], data.applicationScope || '', JSON.stringify(data.rules || {}), actor]
    );
    return toBaseline(res.rows[0]!);
  }

  async approve(id: string, clientId: string, actor: string | null): Promise<ConfigurationBaseline> {
    const res = await sharedPool.query<BaselineRow>(
      `UPDATE oc_configuration_baselines SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND client_id = $3 RETURNING *`,
      [actor, id, clientId]
    );
    if (!res.rows[0]) throw new Error('Baseline not found for this client.');
    return toBaseline(res.rows[0]);
  }

  async get(id: string, clientId: string): Promise<ConfigurationBaseline | null> {
    const res = await sharedPool.query<BaselineRow>(`SELECT * FROM oc_configuration_baselines WHERE id = $1 AND client_id = $2`, [id, clientId]);
    const row = res.rows[0];
    return row ? toBaseline(row) : null;
  }

  async list(clientId: string): Promise<ConfigurationBaseline[]> {
    const res = await sharedPool.query<BaselineRow>(`SELECT * FROM oc_configuration_baselines WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toBaseline);
  }

  /** Real "Mark as Intentional" / "Request Exception" action — creates a real, traceable exception against one specific finding. */
  async createException(clientId: string, data: {
    comparisonRunId: string; configKey: string; reason: string; businessJustification?: string; riskAcceptance?: string;
    owner?: string; approver?: string; mitigation?: string; evidence?: string; expiresAt?: string; reviewDate?: string;
  }, actor: string | null): Promise<ConfigurationException> {
    if (!data.comparisonRunId || !data.configKey) throw new Error('comparisonRunId and configKey are required.');
    if (!data.reason?.trim()) throw new Error('A real reason is required — never a silent exception.');
    const runCheck = await sharedPool.query(`SELECT id FROM comparison_runs WHERE id = $1 AND client_id = $2`, [data.comparisonRunId, clientId]);
    if (runCheck.rows.length === 0) throw new Error('That comparison run does not belong to this client.');
    const res = await sharedPool.query<ExceptionRow>(
      `INSERT INTO oc_configuration_exceptions (client_id, comparison_run_id, config_key, reason, business_justification, risk_acceptance, owner, approver, mitigation, evidence, expires_at, review_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (comparison_run_id, config_key) DO UPDATE SET reason = $4, business_justification = $5, risk_acceptance = $6, owner = $7, approver = $8, mitigation = $9, evidence = $10, expires_at = $11, review_date = $12, status = 'approved'
       RETURNING *`,
      [clientId, data.comparisonRunId, data.configKey, data.reason.trim(), data.businessJustification || '', data.riskAcceptance || '',
        data.owner || null, data.approver || null, data.mitigation || '', data.evidence || '', data.expiresAt || null, data.reviewDate || null, actor]
    );
    return toException(res.rows[0]!);
  }

  async listExceptionsForRun(comparisonRunId: string): Promise<ConfigurationException[]> {
    const res = await sharedPool.query<ExceptionRow>(`SELECT * FROM oc_configuration_exceptions WHERE comparison_run_id = $1`, [comparisonRunId]);
    return res.rows.map(toException);
  }
}
