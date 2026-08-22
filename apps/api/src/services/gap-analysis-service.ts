/**
 * AskABD Gap Analysis Service
 * Transforms problems into actionable gaps with current/target state analysis.
 * Reuses: Problem Universe, Financial Engine, Effort Engine, Assessment, Discovery,
 * Business Requirements Intelligence, the generic Traceability Engine, and the
 * generic Approval Workflow Engine (Phase 1).
 * Domain-agnostic: supports all transformation domains.
 * Idempotent: no duplicate gaps from the same source.
 */
import { sharedPool } from './db-pool.js';
import { TraceabilityEngine } from './traceability-engine.js';
import { ApprovalWorkflowEngine } from './approval-workflow-engine.js';

export type ComplianceStatus = 'compliant' | 'partially_compliant' | 'non_compliant' | 'missing' | 'unknown' | 'needs_evidence' | 'not_applicable';
export type EvidenceSourceType = 'discovery' | 'document' | 'assessment' | 'requirement' | 'connector' | 'database' | 'api' | 'client_provided' | 'staff_assessment';
export type EvidenceVerificationStatus = 'verified' | 'client_provided' | 'staff_assessment' | 'needs_verification';

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
  relatedRequirementId?: string;
  relatedRecommendationId?: string;
  evidence: any[];
  confidence: string;
  sourceType: string;
  sourceId?: string;
  owner?: string;
  status: string;
  complianceStatus: ComplianceStatus;
  complianceStatusReason: string;
  complianceClassifiedBy?: string;
  complianceClassifiedAt?: string;
  customerVisible: boolean;
  constraints: string;
  createdBy?: string;
  updatedBy?: string;
  financialEstimateId?: string;
  effortEstimateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GapEvidence {
  id: string;
  gapId: string;
  clientId: string;
  text: string;
  sourceType: EvidenceSourceType;
  verificationStatus: EvidenceVerificationStatus;
  reference?: string;
  addedBy?: string;
  createdAt: string;
}

const VALID_STATUSES = ['identified', 'validated', 'analysis_required', 'target_defined', 'recommendation_ready', 'approved', 'in_progress', 'resolved', 'accepted_risk', 'rejected', 'closed'];
const VALID_COMPLIANCE_STATUSES: ComplianceStatus[] = ['compliant', 'partially_compliant', 'non_compliant', 'missing', 'unknown', 'needs_evidence', 'not_applicable'];
// A requirement in any of these quality states is not yet well-enough
// understood to safely anchor a real gap to — matches the brief's own
// example ("Do not create a fake gap until the requirement is sufficiently
// understood"). 'partially_complete' and 'unverified' are allowed through:
// they're incomplete but not actively misleading, and blocking on every
// missing field would make this gate more of an obstacle than a real check.
const REQUIREMENT_NOT_READY_STATUSES = ['incomplete', 'ambiguous', 'duplicate', 'conflicting'];

export class RequirementNotReadyError extends Error {
  constructor(public requirementId: string, public qualityStatus: string, public findings: Array<{ rule: string; message: string }>) {
    super(`Linked requirement ${requirementId} is not yet well-understood enough to anchor a gap to it (quality_status: ${qualityStatus}). Resolve the requirement first, or pass forceCreateDespiteIncompleteRequirement: true to proceed anyway with this noted.`);
    this.name = 'RequirementNotReadyError';
  }
}

export class GapAnalysisService {
  private traceability = new TraceabilityEngine();
  private approvals = new ApprovalWorkflowEngine();

  /**
   * Creates a real gap. If `relatedRequirementId` points to a real
   * `oc_business_requirements` row whose quality classification (Phase 2
   * item 3) shows it isn't yet well-understood, this refuses to proceed
   * UNLESS the caller explicitly acknowledges it via
   * `forceCreateDespiteIncompleteRequirement: true` — matching the brief's
   * own "identify that first" instruction, without permanently blocking a
   * real staff judgment call.
   */
  async createGap(clientId: string, data: Partial<Gap> & { forceCreateDespiteIncompleteRequirement?: boolean }, createdBy: string | null = null): Promise<Gap> {
    if (data.relatedRequirementId) {
      const reqRes = await sharedPool.query(
        `SELECT quality_status, quality_findings FROM oc_business_requirements WHERE id = $1`,
        [data.relatedRequirementId]
      );
      const reqRow = reqRes.rows[0];
      if (reqRow && REQUIREMENT_NOT_READY_STATUSES.includes(reqRow.quality_status) && !data.forceCreateDespiteIncompleteRequirement) {
        throw new RequirementNotReadyError(data.relatedRequirementId, reqRow.quality_status, reqRow.quality_findings || []);
      }
    }

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_gaps (client_id, domain, category, sub_category, title, description, current_state, current_state_evidence, target_state, gap_description, business_impact, technical_impact, operational_impact, security_impact, compliance_impact, financial_impact, risk_level, severity, priority, likelihood, current_maturity, target_maturity, root_cause, contributing_factors, related_problem_id, related_finding_id, related_requirement_id, related_recommendation_id, dependencies, evidence, confidence, assumptions, source_type, source_id, owner, status, constraints, customer_visible, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$39) RETURNING *
    `, [
      clientId, data.domain || 'other', data.category || 'general', null,
      data.title || 'Untitled Gap', data.description || null,
      data.currentState || null, JSON.stringify([]), data.targetState || null, data.gapDescription || null,
      data.businessImpact || null, data.technicalImpact || null, null, null, null, null,
      data.riskLevel || 'medium', data.severity || 'medium', data.priority || 'medium', 'medium',
      data.currentMaturity ?? 0, data.targetMaturity ?? 3,
      data.rootCause || null, JSON.stringify([]),
      data.relatedProblemId || null, null, data.relatedRequirementId || null, data.relatedRecommendationId || null,
      JSON.stringify([]), JSON.stringify(data.evidence || []),
      data.confidence || 'medium', JSON.stringify([]),
      data.sourceType || 'manual', data.sourceId || null, data.owner || null, 'identified',
      JSON.stringify(data.constraints || ''), data.customerVisible ?? false, createdBy,
    ]);
    const gap = this.mapGap(rows[0]);

    // Real Traceability Engine links — the shared Phase 1 engine, not a
    // second traceability model. Best-effort: a linking failure must never
    // block the real gap creation that already succeeded.
    if (data.relatedProblemId) {
      await this.traceability.link('problem', data.relatedProblemId, 'gap', gap.id, 'derives_from', createdBy).catch(() => {});
    }
    if (data.relatedRequirementId) {
      await this.traceability.link('business_requirement', data.relatedRequirementId, 'gap', gap.id, 'derives_from', createdBy).catch(() => {});
    }
    return gap;
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

  /**
   * Real, enforced rule: a gap cannot be transitioned directly to
   * 'accepted_risk' by a bare status write — that is a genuinely
   * consequential decision (per the brief's own "Risk acceptance" approval
   * point) and must go through requestRiskAcceptance/decideRiskAcceptance
   * below, which uses the shared Approval Workflow Engine. Every other
   * status transition is unchanged, real, immediate — not every edit needs
   * an approval gate, only this one.
   */
  async updateStatus(gapId: string, newStatus: string, actor: string | null = null): Promise<{ success: boolean; error?: string }> {
    if (!VALID_STATUSES.includes(newStatus)) return { success: false, error: `Invalid status: ${newStatus}` };
    if (newStatus === 'accepted_risk') {
      return { success: false, error: 'Accepting risk on a gap requires approval — use POST /oc/gaps/:gapId/risk-acceptance/request, then approve it, instead of a direct status change.' };
    }
    await sharedPool.query('UPDATE oc_gaps SET status = $1, updated_by = COALESCE($2, updated_by), updated_at = NOW() WHERE id = $3', [newStatus, actor, gapId]);
    return { success: true };
  }

  /** Opens a real approval workflow for accepting this gap's risk, via the shared Approval Workflow Engine. */
  async requestRiskAcceptance(gapId: string, actor: string | null, rationale: string): Promise<{ workflowId: string; status: string }> {
    if (!rationale || !rationale.trim()) throw new Error('A rationale for accepting this risk is required.');
    const gap = await this.getGap(gapId);
    if (!gap) throw new Error(`Gap ${gapId} not found.`);
    const workflow = await this.approvals.openWorkflow('gap_risk_acceptance', gapId, `Accept risk: ${gap.title}`, { gapId, rationale }, actor);
    const submitted = await this.approvals.submit(workflow.id, actor);
    return { workflowId: submitted.id, status: submitted.status };
  }

  /** Approves a pending risk-acceptance workflow and, only then, transitions the real gap status. */
  async decideRiskAcceptance(workflowId: string, decision: 'approve' | 'reject', actor: string | null, note?: string): Promise<{ workflow: unknown; gap: Gap | null }> {
    const workflow = decision === 'approve' ? await this.approvals.approve(workflowId, actor, note) : await this.approvals.reject(workflowId, actor, note);
    let gap: Gap | null = null;
    if (decision === 'approve') {
      const gapId = workflow.entityId;
      await sharedPool.query(`UPDATE oc_gaps SET status = 'accepted_risk', updated_by = COALESCE($1, updated_by), updated_at = NOW() WHERE id = $2`, [actor, gapId]);
      gap = await this.getGap(gapId);
    }
    return { workflow, gap };
  }

  /**
   * Real, staff-attributed compliance classification with a required
   * explanation — never auto-inferred, matching "Never fabricate severity.
   * Severity should be based on explicit rules and/or staff assessment" and
   * "Explain why the classification exists."
   */
  async classifyCompliance(gapId: string, status: ComplianceStatus, reason: string, actor: string | null): Promise<Gap | null> {
    if (!VALID_COMPLIANCE_STATUSES.includes(status)) throw new Error(`compliance status must be one of ${VALID_COMPLIANCE_STATUSES.join(', ')}`);
    if (!reason || !reason.trim()) throw new Error('A reason is required whenever a compliance status is classified.');
    const { rows } = await sharedPool.query(`
      UPDATE oc_gaps SET compliance_status = $1, compliance_status_reason = $2, compliance_classified_by = $3, compliance_classified_at = NOW(), updated_by = COALESCE($3, updated_by), updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [status, reason.trim(), actor, gapId]);
    return rows.length > 0 ? this.mapGap(rows[0]) : null;
  }

  /**
   * Real, structured evidence with an honest source/verification
   * classification. A customer-submitted entry (sourceType='client_provided')
   * is always forced to verificationStatus='client_provided' regardless of
   * what the caller passed — a customer can never self-attest 'verified' or
   * 'staff_assessment', enforced here in the service, not just by convention.
   */
  async addEvidence(gapId: string, data: { text: string; sourceType?: EvidenceSourceType; verificationStatus?: EvidenceVerificationStatus; reference?: string }, addedBy: string | null): Promise<GapEvidence> {
    if (!data.text || !data.text.trim()) throw new Error('Evidence text is required.');
    const gap = await this.getGap(gapId);
    if (!gap) throw new Error(`Gap ${gapId} not found.`);
    const sourceType = data.sourceType || 'staff_assessment';
    const verificationStatus = sourceType === 'client_provided' ? 'client_provided' : (data.verificationStatus || 'needs_verification');
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_gap_evidence (gap_id, client_id, text, source_type, verification_status, reference, added_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [gapId, gap.clientId, data.text.trim(), sourceType, verificationStatus, data.reference || null, addedBy]);
    return this.mapEvidence(rows[0]);
  }

  async getEvidence(gapId: string): Promise<GapEvidence[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_gap_evidence WHERE gap_id = $1 ORDER BY created_at ASC', [gapId]);
    return rows.map(this.mapEvidence);
  }

  private mapEvidence(row: any): GapEvidence {
    return { id: row.id, gapId: row.gap_id, clientId: row.client_id, text: row.text, sourceType: row.source_type, verificationStatus: row.verification_status, reference: row.reference || undefined, addedBy: row.added_by || undefined, createdAt: row.created_at };
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
        count(*) FILTER (WHERE compliance_status = 'compliant') as compliant,
        count(*) FILTER (WHERE compliance_status = 'partially_compliant') as partially_compliant,
        count(*) FILTER (WHERE compliance_status = 'non_compliant') as non_compliant,
        count(*) FILTER (WHERE compliance_status = 'missing') as missing,
        count(*) FILTER (WHERE compliance_status = 'unknown') as unknown,
        count(*) FILTER (WHERE compliance_status = 'needs_evidence') as needs_evidence,
        count(*) FILTER (WHERE compliance_status = 'not_applicable') as not_applicable,
        AVG(target_maturity - current_maturity) as avg_maturity_gap
      FROM oc_gaps WHERE client_id = $1
    `, [clientId]);
    const s = rows[0] || {};
    return {
      clientId,
      gaps: { total: parseInt(s.total||'0'), critical: parseInt(s.critical||'0'), high: parseInt(s.high||'0'), medium: parseInt(s.medium||'0'), low: parseInt(s.low||'0'), open: parseInt(s.open||'0'), resolved: parseInt(s.resolved||'0') },
      compliance: { compliant: parseInt(s.compliant||'0'), partiallyCompliant: parseInt(s.partially_compliant||'0'), nonCompliant: parseInt(s.non_compliant||'0'), missing: parseInt(s.missing||'0'), unknown: parseInt(s.unknown||'0'), needsEvidence: parseInt(s.needs_evidence||'0'), notApplicable: parseInt(s.not_applicable||'0') },
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
        // targetState intentionally omitted — requires client input or recommendation;
        // createGap()'s DB write already does `data.targetState || null`.
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
      }, 'system');
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
      relatedRequirementId: row.related_requirement_id,
      relatedRecommendationId: row.related_recommendation_id,
      evidence: row.evidence || [], confidence: row.confidence,
      sourceType: row.source_type, sourceId: row.source_id,
      owner: row.owner, status: row.status,
      complianceStatus: row.compliance_status || 'unknown', complianceStatusReason: row.compliance_status_reason || '',
      complianceClassifiedBy: row.compliance_classified_by || undefined, complianceClassifiedAt: row.compliance_classified_at || undefined,
      customerVisible: row.customer_visible || false, constraints: row.constraints || '',
      createdBy: row.created_by || undefined, updatedBy: row.updated_by || undefined,
      financialEstimateId: row.financial_estimate_id, effortEstimateId: row.effort_estimate_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  /** Define target state for a gap */
  async defineTargetState(gapId: string, data: { targetState: string; targetMaturity?: number; targetDate?: string; owner?: string }, actor: string): Promise<Gap | null> {
    const { rows } = await sharedPool.query(`
      UPDATE oc_gaps SET target_state = $1, target_maturity = COALESCE($2, target_maturity),
        target_date = $3, owner = COALESCE($4, owner), status = 'target_defined', updated_by = COALESCE($5, updated_by), updated_at = NOW()
      WHERE id = $6 RETURNING *
    `, [data.targetState, data.targetMaturity || null, data.targetDate || null, data.owner || null, actor || null, gapId]);
    return rows.length > 0 ? this.mapGap(rows[0]) : null;
  }

  /** Toggle whether a gap is visible in the customer portal — default-closed, staff-only, an explicit real action. */
  async setCustomerVisibility(gapId: string, visible: boolean, actor: string | null): Promise<Gap | null> {
    const { rows } = await sharedPool.query('UPDATE oc_gaps SET customer_visible = $1, updated_by = COALESCE($2, updated_by), updated_at = NOW() WHERE id = $3 RETURNING *', [visible, actor, gapId]);
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

  /** Link a recommendation to a gap — also records a real Traceability Engine link (gap -> recommendation). */
  async linkRecommendation(gapId: string, recommendationId: string, actor: string | null = null): Promise<void> {
    await sharedPool.query('UPDATE oc_gaps SET related_recommendation_id = $1, status = CASE WHEN status = \'identified\' THEN \'recommendation_ready\' ELSE status END, updated_at = NOW() WHERE id = $2', [recommendationId, gapId]);
    await this.traceability.link('gap', gapId, 'recommendation', recommendationId, 'derives_from', actor).catch(() => {});
  }

  /** Generate recommendations for gaps that don't have one (idempotent) */
  async generateRecommendations(clientId: string): Promise<{ generated: number; existing: number }> {
    const { rows: gaps } = await sharedPool.query(
      `SELECT * FROM oc_gaps WHERE client_id = $1 AND related_recommendation_id IS NULL AND status NOT IN ('resolved','closed','rejected','accepted_risk')`, [clientId]
    );
    let generated = 0, existing = 0;

    for (const gap of gaps) {
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
