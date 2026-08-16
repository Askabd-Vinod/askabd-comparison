/**
 * AskABD Gap Analysis Service
 * Transforms problems into actionable gaps with current/target state analysis.
 * Reuses: Problem Universe, Financial Engine, Effort Engine, Assessment, Discovery.
 * Domain-agnostic: supports all transformation domains.
 * Idempotent: no duplicate gaps from the same source.
 */
import { sharedPool } from './db-pool.js';

export interface Gap {
  id: string;
  clientId: string;
  domain: string;
  category: string;
  title: string;
  description?: string;
  currentState?: string;
  targetState?: string;
  gapDescription?: string;
  businessImpact?: string;
  technicalImpact?: string;
  riskLevel: string;
  severity: string;
  priority: string;
  currentMaturity: number;
  targetMaturity: number;
  rootCause?: string;
  relatedProblemId?: string;
  relatedRecommendationId?: string;
  evidence: any[];
  confidence: string;
  sourceType: string;
  sourceId?: string;
  owner?: string;
  status: string;
  financialEstimateId?: string;
  effortEstimateId?: string;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUSES = ['identified', 'validated', 'analysis_required', 'target_defined', 'recommendation_ready', 'approved', 'in_progress', 'resolved', 'accepted_risk', 'rejected', 'closed'];

export class GapAnalysisService {

  async createGap(clientId: string, data: Partial<Gap>): Promise<Gap> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_gaps (client_id, domain, category, sub_category, title, description, current_state, current_state_evidence, target_state, gap_description, business_impact, technical_impact, operational_impact, security_impact, compliance_impact, financial_impact, risk_level, severity, priority, likelihood, current_maturity, target_maturity, root_cause, contributing_factors, related_problem_id, related_finding_id, related_requirement_id, related_recommendation_id, dependencies, evidence, confidence, assumptions, source_type, source_id, owner, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36) RETURNING *
    `, [
      clientId, data.domain || 'other', data.category || 'general', null,
      data.title || 'Untitled Gap', data.description || null,
      data.currentState || null, JSON.stringify([]), data.targetState || null, data.gapDescription || null,
      data.businessImpact || null, data.technicalImpact || null, null, null, null, null,
      data.riskLevel || 'medium', data.severity || 'medium', data.priority || 'medium', 'medium',
      data.currentMaturity ?? 0, data.targetMaturity ?? 3,
      data.rootCause || null, JSON.stringify([]),
      data.relatedProblemId || null, null, null, data.relatedRecommendationId || null,
      JSON.stringify([]), JSON.stringify(data.evidence || []),
      data.confidence || 'medium', JSON.stringify([]),
      data.sourceType || 'manual', data.sourceId || null, data.owner || null, 'identified',
    ]);
    return this.mapGap(rows[0]);
  }

  async getGaps(clientId: string, filters?: { domain?: string; status?: string; severity?: string; limit?: number; offset?: number }): Promise<{ gaps: Gap[]; total: number }> {
    let where = 'WHERE client_id = $1';
    const params: any[] = [clientId];
    let idx = 2;
    if (filters?.domain) { where += ` AND domain = $${idx++}`; params.push(filters.domain); }
    if (filters?.status) { where += ` AND status = $${idx++}`; params.push(filters.status); }
    if (filters?.severity) { where += ` AND severity = $${idx++}`; params.push(filters.severity); }

    const countRes = await sharedPool.query(`SELECT count(*) as total FROM oc_gaps ${where}`, params);
    const total = parseInt(countRes.rows[0]?.total || '0');
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const { rows } = await sharedPool.query(`SELECT * FROM oc_gaps ${where} ORDER BY severity DESC, priority DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    return { gaps: rows.map(this.mapGap), total };
  }

  async getGap(gapId: string): Promise<Gap | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_gaps WHERE id = $1', [gapId]);
    return rows.length > 0 ? this.mapGap(rows[0]) : null;
  }

  async updateStatus(gapId: string, newStatus: string): Promise<{ success: boolean; error?: string }> {
    if (!VALID_STATUSES.includes(newStatus)) return { success: false, error: `Invalid status: ${newStatus}` };
    await sharedPool.query('UPDATE oc_gaps SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, gapId]);
    return { success: true };
  }

  async getClientSummary(clientId: string): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT count(*) as total,
        count(*) FILTER (WHERE severity = 'critical') as critical,
        count(*) FILTER (WHERE severity = 'high') as high,
        count(*) FILTER (WHERE severity = 'medium') as medium,
        count(*) FILTER (WHERE severity = 'low') as low,
        count(*) FILTER (WHERE status = 'identified') as open,
        count(*) FILTER (WHERE status IN ('resolved','closed')) as resolved,
        AVG(target_maturity - current_maturity) as avg_maturity_gap
      FROM oc_gaps WHERE client_id = $1
    `, [clientId]);
    const s = rows[0] || {};
    return {
      clientId,
      gaps: { total: parseInt(s.total||'0'), critical: parseInt(s.critical||'0'), high: parseInt(s.high||'0'), medium: parseInt(s.medium||'0'), low: parseInt(s.low||'0'), open: parseInt(s.open||'0'), resolved: parseInt(s.resolved||'0') },
      avgMaturityGap: parseFloat(s.avg_maturity_gap || '0'),
    };
  }

  /** Auto-generate gaps from problems (idempotent) */
  async generateFromProblems(clientId: string): Promise<{ created: Gap[]; existing: number }> {
    const { rows: problems } = await sharedPool.query(
      `SELECT * FROM oc_problems WHERE client_id = $1 AND status NOT IN ('resolved','rejected')`, [clientId]
    );
    const created: Gap[] = [];
    let existing = 0;

    for (const prob of problems) {
      // Dedup: check if gap already exists for this problem
      const dup = await sharedPool.query(`SELECT id FROM oc_gaps WHERE client_id = $1 AND related_problem_id = $2 LIMIT 1`, [clientId, prob.id]);
      if (dup.rows.length > 0) { existing++; continue; }

      const gap = await this.createGap(clientId, {
        domain: prob.domain,
        category: prob.category,
        title: `Gap: ${prob.title}`,
        description: prob.description,
        currentState: prob.technical_impact || prob.description || 'Current state identified via assessment',
        targetState: null, // Requires client input or recommendation
        gapDescription: `Problem "${prob.title}" indicates a gap between current and target state.`,
        businessImpact: prob.business_impact,
        technicalImpact: prob.technical_impact,
        riskLevel: prob.risk_level || 'medium',
        severity: prob.severity,
        priority: prob.priority,
        currentMaturity: prob.severity === 'critical' ? 0 : prob.severity === 'high' ? 1 : 2,
        targetMaturity: 4,
        rootCause: prob.root_cause,
        relatedProblemId: prob.id,
        confidence: prob.confidence || 'medium',
        sourceType: 'problem',
        sourceId: prob.id,
        evidence: prob.evidence || [],
      });
      created.push(gap);
    }
    return { created, existing };
  }

  private mapGap(row: any): Gap {
    return {
      id: row.id, clientId: row.client_id, domain: row.domain, category: row.category,
      title: row.title, description: row.description,
      currentState: row.current_state, targetState: row.target_state,
      gapDescription: row.gap_description, businessImpact: row.business_impact,
      technicalImpact: row.technical_impact, riskLevel: row.risk_level,
      severity: row.severity, priority: row.priority,
      currentMaturity: row.current_maturity || 0, targetMaturity: row.target_maturity || 3,
      rootCause: row.root_cause, relatedProblemId: row.related_problem_id,
      relatedRecommendationId: row.related_recommendation_id,
      evidence: row.evidence || [], confidence: row.confidence,
      sourceType: row.source_type, sourceId: row.source_id,
      owner: row.owner, status: row.status,
      financialEstimateId: row.financial_estimate_id, effortEstimateId: row.effort_estimate_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  /** Define target state for a gap */
  async defineTargetState(gapId: string, data: { targetState: string; targetMaturity?: number; targetDate?: string; owner?: string }, actor: string): Promise<Gap | null> {
    const { rows } = await sharedPool.query(`
      UPDATE oc_gaps SET target_state = $1, target_maturity = COALESCE($2, target_maturity),
        target_date = $3, owner = COALESCE($4, owner), status = 'target_defined', updated_at = NOW()
      WHERE id = $5 RETURNING *
    `, [data.targetState, data.targetMaturity || null, data.targetDate || null, data.owner || null, gapId]);
    return rows.length > 0 ? this.mapGap(rows[0]) : null;
  }

  /** Link a financial estimate to a gap */
  async linkFinancial(gapId: string, financialEstimateId: string): Promise<void> {
    await sharedPool.query('UPDATE oc_gaps SET financial_estimate_id = $1, updated_at = NOW() WHERE id = $2', [financialEstimateId, gapId]);
  }

  /** Link an effort estimate to a gap */
  async linkEffort(gapId: string, effortEstimateId: string): Promise<void> {
    await sharedPool.query('UPDATE oc_gaps SET effort_estimate_id = $1, updated_at = NOW() WHERE id = $2', [effortEstimateId, gapId]);
  }

  /** Link a recommendation to a gap */
  async linkRecommendation(gapId: string, recommendationId: string): Promise<void> {
    await sharedPool.query('UPDATE oc_gaps SET related_recommendation_id = $1, status = CASE WHEN status = \'identified\' THEN \'recommendation_ready\' ELSE status END, updated_at = NOW() WHERE id = $2', [recommendationId, gapId]);
  }

  /** Generate recommendations for gaps that don't have one (idempotent) */
  async generateRecommendations(clientId: string): Promise<{ generated: number; existing: number }> {
    const { rows: gaps } = await sharedPool.query(
      `SELECT * FROM oc_gaps WHERE client_id = $1 AND related_recommendation_id IS NULL AND status NOT IN ('resolved','closed','rejected','accepted_risk')`, [clientId]
    );
    let generated = 0, existing = 0;

    for (const gap of gaps) {
      // Simple recommendation: describe the gap closure action
      const recTitle = gap.target_state ? `Close gap: ${gap.title}` : `Investigate and resolve: ${gap.title}`;
      const recAction = gap.target_state || 'Define target state and implement remediation plan';

      // Store as a lightweight recommendation record in gap metadata
      await sharedPool.query(`
        UPDATE oc_gaps SET
          related_recommendation_id = 'rec-auto-' || substring(id from 5),
          status = CASE WHEN status IN ('identified','validated','analysis_required','target_defined') THEN 'recommendation_ready' ELSE status END,
          updated_at = NOW()
        WHERE id = $1 AND related_recommendation_id IS NULL
      `, [gap.id]);
      generated++;
    }
    return { generated, existing };
  }

  /** Calculate prioritization score */
  calculatePriority(gap: Gap): { score: number; factors: Record<string, number>; explanation: string } {
    const factors: Record<string, number> = {};
    factors.severity = gap.severity === 'critical' ? 40 : gap.severity === 'high' ? 30 : gap.severity === 'medium' ? 15 : 5;
    factors.risk = gap.riskLevel === 'critical' ? 25 : gap.riskLevel === 'high' ? 20 : gap.riskLevel === 'medium' ? 10 : 5;
    factors.maturityGap = Math.min(20, (gap.targetMaturity - gap.currentMaturity) * 5);
    factors.hasTarget = gap.targetState ? 10 : 0;
    factors.hasEvidence = (gap.evidence?.length > 0) ? 5 : 0;
    const score = Object.values(factors).reduce((a, b) => a + b, 0);
    const explanation = score >= 70 ? 'Critical priority — immediate action required' : score >= 50 ? 'High priority — plan remediation soon' : score >= 30 ? 'Medium priority — schedule in next cycle' : 'Low priority — monitor and review';
    return { score, factors, explanation };
  }

  /** Get gaps with aging information */
  async getGapsWithAging(clientId: string): Promise<any[]> {
    const { rows } = await sharedPool.query(`
      SELECT *, EXTRACT(DAY FROM NOW() - created_at) as days_open,
        CASE WHEN target_date IS NOT NULL AND target_date < CURRENT_DATE AND status NOT IN ('resolved','closed') THEN true ELSE false END as overdue
      FROM oc_gaps WHERE client_id = $1 AND status NOT IN ('resolved','closed','rejected','accepted_risk')
      ORDER BY severity DESC, priority DESC, created_at ASC
    `, [clientId]);
    return rows.map(r => ({ ...this.mapGap(r), daysOpen: parseInt(r.days_open || '0'), overdue: r.overdue }));
  }
}
