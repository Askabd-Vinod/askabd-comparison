/**
 * AskABD Problem Universe Service
 * Reusable enterprise problem discovery, classification, and impact assessment.
 * Domain-agnostic: supports legacy, cloud, security, FinOps, etc.
 * Every problem must be evidence-based and traceable to its source.
 */
import { sharedPool } from './db-pool.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Problem {
  id: string;
  clientId: string;
  domain: string;
  category: string;
  subCategory?: string;
  title: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  priority: 'critical' | 'high' | 'medium' | 'low';
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  confidence: 'high' | 'medium' | 'low';
  sourceType: string;
  sourceId?: string;
  businessImpact?: string;
  technicalImpact?: string;
  operationalImpact?: string;
  securityImpact?: string;
  complianceImpact?: string;
  financialImpactSummary?: string;
  affectedResources: any[];
  evidence: any[];
  rootCause?: string;
  owner?: string;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialEstimate {
  id: string;
  clientId: string;
  problemId?: string;
  currentCost?: number;
  futureCost?: number;
  implementationCost?: number;
  annualSavings?: number;
  roiPercentage?: number;
  paybackMonths?: number;
  currency: string;
  confidence: string;
  calculationMethod: string;
  assumptions: any[];
}

export interface EffortEstimate {
  id: string;
  clientId: string;
  problemId?: string;
  estimatedDuration?: string;
  personDays?: number;
  teamSize?: number;
  roles: any[];
  complexity: string;
  confidence: string;
  assumptions: any[];
}

// ─── Valid Transitions ────────────────────────────────────────────────────────

const VALID_STATUSES = ['identified', 'validated', 'accepted', 'in_analysis', 'recommended', 'planned', 'in_progress', 'resolved', 'rejected', 'deferred', 'monitored'];

// ─── Service ──────────────────────────────────────────────────────────────────

export class ProblemUniverseService {

  async createProblem(clientId: string, data: Partial<Problem>): Promise<Problem> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_problems (client_id, domain, category, sub_category, title, description, severity, priority, risk_level, status, confidence, source_type, source_id, business_impact, technical_impact, operational_impact, security_impact, compliance_impact, affected_resources, evidence, root_cause, owner)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `, [
      clientId, data.domain || 'other', data.category || 'general', data.subCategory || null,
      data.title || 'Untitled Problem', data.description || null,
      data.severity || 'medium', data.priority || 'medium', data.riskLevel || 'medium',
      'identified', data.confidence || 'medium',
      data.sourceType || 'manual', data.sourceId || null,
      data.businessImpact || null, data.technicalImpact || null,
      data.operationalImpact || null, data.securityImpact || null, data.complianceImpact || null,
      JSON.stringify(data.affectedResources || []), JSON.stringify(data.evidence || []),
      data.rootCause || null, data.owner || null,
    ]);
    return this.mapProblem(rows[0]);
  }

  async getProblems(clientId: string, filters?: { domain?: string; status?: string; severity?: string; priority?: string; limit?: number; offset?: number }): Promise<{ problems: Problem[]; total: number }> {
    let where = 'WHERE client_id = $1';
    const params: any[] = [clientId];
    let paramIdx = 2;

    if (filters?.domain) { where += ` AND domain = $${paramIdx++}`; params.push(filters.domain); }
    if (filters?.status) { where += ` AND status = $${paramIdx++}`; params.push(filters.status); }
    if (filters?.severity) { where += ` AND severity = $${paramIdx++}`; params.push(filters.severity); }
    if (filters?.priority) { where += ` AND priority = $${paramIdx++}`; params.push(filters.priority); }

    const countRes = await sharedPool.query(`SELECT count(*) as total FROM oc_problems ${where}`, params);
    const total = parseInt(countRes.rows[0]?.total || '0');

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const { rows } = await sharedPool.query(`SELECT * FROM oc_problems ${where} ORDER BY severity DESC, priority DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);

    return { problems: rows.map(this.mapProblem), total };
  }

  async getProblem(problemId: string): Promise<Problem | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_problems WHERE id = $1', [problemId]);
    return rows.length > 0 ? this.mapProblem(rows[0]) : null;
  }

  async updateProblem(problemId: string, data: Partial<Problem>, _actor: string): Promise<Problem | null> {
    const existing = await this.getProblem(problemId);
    if (!existing) return null;

    const { rows } = await sharedPool.query(`
      UPDATE oc_problems SET
        domain = COALESCE($2, domain), category = COALESCE($3, category), title = COALESCE($4, title),
        description = COALESCE($5, description), severity = COALESCE($6, severity), priority = COALESCE($7, priority),
        risk_level = COALESCE($8, risk_level), business_impact = COALESCE($9, business_impact),
        technical_impact = COALESCE($10, technical_impact), root_cause = COALESCE($11, root_cause),
        owner = COALESCE($12, owner), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [problemId, data.domain, data.category, data.title, data.description, data.severity, data.priority, data.riskLevel, data.businessImpact, data.technicalImpact, data.rootCause, data.owner]);

    return rows.length > 0 ? this.mapProblem(rows[0]) : null;
  }

  async updateStatus(problemId: string, newStatus: string, _actor: string): Promise<{ success: boolean; error?: string }> {
    if (!VALID_STATUSES.includes(newStatus)) return { success: false, error: `Invalid status: ${newStatus}` };
    await sharedPool.query('UPDATE oc_problems SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, problemId]);
    return { success: true };
  }

  async getClientSummary(clientId: string): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE severity = 'critical') as critical,
        count(*) FILTER (WHERE severity = 'high') as high,
        count(*) FILTER (WHERE severity = 'medium') as medium,
        count(*) FILTER (WHERE severity = 'low') as low,
        count(*) FILTER (WHERE status = 'identified') as identified,
        count(*) FILTER (WHERE status = 'resolved') as resolved
      FROM oc_problems WHERE client_id = $1
    `, [clientId]);

    const financials = await sharedPool.query(`
      SELECT
        COALESCE(SUM(annual_savings), 0) as total_annual_savings,
        COALESCE(SUM(implementation_cost), 0) as total_implementation_cost,
        COALESCE(AVG(roi_percentage), 0) as avg_roi
      FROM oc_financial_estimates WHERE client_id = $1
    `, [clientId]);

    const stats = rows[0] || {};
    const fin = financials.rows[0] || {};
    return {
      clientId, problems: { total: parseInt(stats.total || '0'), critical: parseInt(stats.critical || '0'), high: parseInt(stats.high || '0'), medium: parseInt(stats.medium || '0'), low: parseInt(stats.low || '0'), identified: parseInt(stats.identified || '0'), resolved: parseInt(stats.resolved || '0') },
      financial: { totalAnnualSavings: parseFloat(fin.total_annual_savings || '0'), totalImplementationCost: parseFloat(fin.total_implementation_cost || '0'), avgRoi: parseFloat(fin.avg_roi || '0') },
    };
  }

  /** Convert assessment findings into problems — IDEMPOTENT (no duplicates on re-import) */
  async importFromAssessment(clientId: string, assessmentId: string): Promise<{ created: Problem[]; existing: number; total: number }> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_assessments WHERE id = $1 AND client_id = $2', [assessmentId, clientId]);
    if (rows.length === 0) return { created: [], existing: 0, total: 0 };
    const assessment = rows[0];
    const findings = Array.isArray(assessment.findings) ? assessment.findings : [];
    const created: Problem[] = [];
    let existing = 0;

    for (const finding of findings) {
      // Deduplication: check if a problem from this assessment+finding already exists
      const title = finding.title || 'Assessment Finding';
      const dupCheck = await sharedPool.query(
        `SELECT id FROM oc_problems WHERE client_id = $1 AND source_type = 'assessment' AND source_id = $2 AND title = $3 LIMIT 1`,
        [clientId, assessmentId, title]
      );
      if (dupCheck.rows.length > 0) { existing++; continue; }

      const problem = await this.createProblem(clientId, {
        domain: finding.category || 'other',
        category: finding.category || 'general',
        title,
        description: finding.description || '',
        severity: finding.severity || 'medium',
        priority: finding.severity === 'critical' ? 'critical' : finding.severity === 'high' ? 'high' : 'medium',
        riskLevel: finding.severity || 'medium',
        sourceType: 'assessment',
        sourceId: assessmentId,
        technicalImpact: finding.description || '',
        evidence: [{ source: 'assessment', assessmentId, finding: finding.title, timestamp: new Date().toISOString() }],
      });
      created.push(problem);
    }
    return { created, existing, total: findings.length };
  }

  /** Auto-detect problems from discovery results (technology lifecycle, architecture, performance) */
  async detectFromDiscovery(clientId: string, run: any): Promise<{ created: Problem[]; existing: number }> {
    const resources = run.results?.resources || [];
    const created: Problem[] = [];
    let existing = 0;

    // Detect: Large table count (complexity risk)
    const tables = resources.filter((r: any) => r.type === 'table');
    if (tables.length > 50) {
      const title = `High database complexity: ${tables.length} tables`;
      const dup = await sharedPool.query(`SELECT id FROM oc_problems WHERE client_id = $1 AND source_type = 'discovery' AND title = $2 LIMIT 1`, [clientId, title]);
      if (dup.rows.length === 0) {
        created.push(await this.createProblem(clientId, { domain: 'database', category: 'complexity', title, description: `${tables.length} tables discovered. Complex schemas increase migration risk and require careful dependency mapping.`, severity: 'medium', priority: 'medium', riskLevel: 'medium', sourceType: 'discovery', sourceId: run.id, technicalImpact: 'Migration complexity, dependency risk', evidence: [{ source: 'discovery', runId: run.id, observation: `${tables.length} tables`, timestamp: new Date().toISOString() }] }));
      } else { existing++; }
    }

    // Detect: Multiple schemas (architecture complexity)
    const schemas = resources.filter((r: any) => r.type === 'schema');
    if (schemas.length > 3) {
      const title = `Multiple database schemas: ${schemas.length}`;
      const dup = await sharedPool.query(`SELECT id FROM oc_problems WHERE client_id = $1 AND source_type = 'discovery' AND title = $2 LIMIT 1`, [clientId, title]);
      if (dup.rows.length === 0) {
        created.push(await this.createProblem(clientId, { domain: 'database', category: 'architecture', title, description: `${schemas.length} schemas detected. Multi-schema databases require schema-aware migration and careful dependency ordering.`, severity: 'low', priority: 'low', riskLevel: 'low', sourceType: 'discovery', sourceId: run.id, evidence: [{ source: 'discovery', runId: run.id, observation: `${schemas.length} schemas`, timestamp: new Date().toISOString() }] }));
      } else { existing++; }
    }

    // Detect: Large resource count (infrastructure scale)
    if (run.resourcesFound > 100) {
      const title = `Large environment: ${run.resourcesFound} resources`;
      const dup = await sharedPool.query(`SELECT id FROM oc_problems WHERE client_id = $1 AND source_type = 'discovery' AND title = $2 LIMIT 1`, [clientId, title]);
      if (dup.rows.length === 0) {
        created.push(await this.createProblem(clientId, { domain: 'infrastructure', category: 'scale', title, description: `${run.resourcesFound} resources discovered across the environment. Large environments require phased transformation approaches.`, severity: 'low', priority: 'low', riskLevel: 'medium', sourceType: 'discovery', sourceId: run.id, operationalImpact: 'Transformation planning must account for scale', evidence: [{ source: 'discovery', runId: run.id, resourceCount: run.resourcesFound, timestamp: new Date().toISOString() }] }));
      } else { existing++; }
    }

    return { created, existing };
  }

  // ─── Financial Estimates ────────────────────────────────────────────────────

  async createFinancialEstimate(clientId: string, data: Partial<FinancialEstimate>): Promise<FinancialEstimate> {
    const roi = (data.annualSavings && data.implementationCost && data.implementationCost > 0) ? ((data.annualSavings - data.implementationCost) / data.implementationCost) * 100 : null;
    const payback = (data.annualSavings && data.implementationCost && data.annualSavings > 0) ? (data.implementationCost / (data.annualSavings / 12)) : null;

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_financial_estimates (client_id, problem_id, recommendation_id, current_cost, future_cost, implementation_cost, migration_cost, operational_cost, license_cost, infrastructure_cost, annual_savings, one_time_savings, recurring_savings, cost_of_delay, roi_percentage, payback_months, currency, confidence, calculation_method, assumptions, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *
    `, [clientId, data.problemId || null, null, data.currentCost || null, data.futureCost || null, data.implementationCost || null, null, null, null, null, data.annualSavings || null, null, null, null, roi, payback, data.currency || 'USD', data.confidence || 'medium', data.calculationMethod || 'estimated', JSON.stringify(data.assumptions || []), 'system']);

    return this.mapFinancial(rows[0]);
  }

  async getFinancialEstimate(problemId: string): Promise<FinancialEstimate | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_financial_estimates WHERE problem_id = $1 ORDER BY created_at DESC LIMIT 1', [problemId]);
    return rows.length > 0 ? this.mapFinancial(rows[0]) : null;
  }

  // ─── Effort Estimates ────────────────────────────────────────────────────────

  async createEffortEstimate(clientId: string, data: Partial<EffortEstimate>): Promise<EffortEstimate> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_effort_estimates (client_id, problem_id, recommendation_id, estimated_duration, duration_unit, person_days, team_size, roles, skills, complexity, confidence, assumptions, dependencies, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [clientId, data.problemId || null, null, data.estimatedDuration || null, 'days', data.personDays || null, data.teamSize || null, JSON.stringify(data.roles || []), JSON.stringify([]), data.complexity || 'medium', data.confidence || 'medium', JSON.stringify(data.assumptions || []), JSON.stringify([]), 'system']);

    return this.mapEffort(rows[0]);
  }

  async getEffortEstimate(problemId: string): Promise<EffortEstimate | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_effort_estimates WHERE problem_id = $1 ORDER BY created_at DESC LIMIT 1', [problemId]);
    return rows.length > 0 ? this.mapEffort(rows[0]) : null;
  }

  // ─── Mappers ──────────────────────────────────────────────────────────────────

  private mapProblem(row: any): Problem {
    return {
      id: row.id, clientId: row.client_id, domain: row.domain, category: row.category,
      subCategory: row.sub_category, title: row.title, description: row.description,
      severity: row.severity, priority: row.priority, riskLevel: row.risk_level,
      status: row.status, confidence: row.confidence, sourceType: row.source_type, sourceId: row.source_id,
      businessImpact: row.business_impact, technicalImpact: row.technical_impact,
      operationalImpact: row.operational_impact, securityImpact: row.security_impact,
      complianceImpact: row.compliance_impact, financialImpactSummary: row.financial_impact_summary,
      affectedResources: row.affected_resources || [], evidence: row.evidence || [],
      rootCause: row.root_cause, owner: row.owner,
      discoveredAt: row.discovered_at, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapFinancial(row: any): FinancialEstimate {
    return {
      id: row.id, clientId: row.client_id, problemId: row.problem_id,
      currentCost: parseFloat(row.current_cost) || undefined, futureCost: parseFloat(row.future_cost) || undefined,
      implementationCost: parseFloat(row.implementation_cost) || undefined,
      annualSavings: parseFloat(row.annual_savings) || undefined,
      roiPercentage: parseFloat(row.roi_percentage) || undefined, paybackMonths: parseFloat(row.payback_months) || undefined,
      currency: row.currency, confidence: row.confidence, calculationMethod: row.calculation_method,
      assumptions: row.assumptions || [],
    };
  }

  private mapEffort(row: any): EffortEstimate {
    return {
      id: row.id, clientId: row.client_id, problemId: row.problem_id,
      estimatedDuration: row.estimated_duration, personDays: parseFloat(row.person_days) || undefined,
      teamSize: row.team_size, roles: row.roles || [], complexity: row.complexity,
      confidence: row.confidence, assumptions: row.assumptions || [],
    };
  }
}
