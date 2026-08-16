/**
 * AskABD Decision & Transformation Service
 * Manages: Gap Options → Comparison → Decision → Transformation Plan → Outcome
 * Reuses: Financial Engine, Effort Engine, Audit, shared DB pool.
 * Domain-agnostic: supports all transformation types.
 */
import { sharedPool } from './db-pool.js';

export interface GapOption {
  id: string; gapId: string; clientId: string; name: string; description?: string;
  solutionType: string; technology?: string; benefits: string[]; risks: string[];
  investment?: number; annualSavings?: number; roiPercentage?: number; paybackMonths?: number;
  personDays?: number; duration?: string; teamSize?: number; roles: any[];
  complexity: string; strategicFit: string; confidence: string; score?: number;
  selected: boolean; status: string; createdAt: string;
}

export interface Decision {
  id: string; gapId: string; clientId: string; selectedOptionId?: string;
  decisionMaker?: string; decisionDate: string; rationale?: string;
  alternativesConsidered: any[]; risksAccepted: any[]; status: string; createdAt: string;
}

export interface Transformation {
  id: string; gapId?: string; decisionId?: string; clientId: string; domain: string;
  title: string; description?: string; transformationType: string;
  phases: any[]; tasks: any[]; dependencies: any[]; milestones: any[];
  investment?: number; expectedSavings?: number; expectedRoi?: number;
  personDays?: number; duration?: string; teamSize?: number; roles: any[];
  risks: any[]; successCriteria: any[]; rollbackStrategy?: string;
  expectedOutcome?: string; actualOutcome?: string; status: string;
  owner?: string; startedAt?: string; completedAt?: string; createdAt: string;
}

export class DecisionTransformationService {

  // ─── OPTIONS ────────────────────────────────────────────────────────────────

  async createOption(gapId: string, clientId: string, data: Partial<GapOption>): Promise<GapOption> {
    const roi = (data.annualSavings && data.investment && data.investment > 0) ? ((data.annualSavings - data.investment) / data.investment) * 100 : null;
    const payback = (data.annualSavings && data.investment && data.annualSavings > 0) ? (data.investment / (data.annualSavings / 12)) : null;
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_gap_options (gap_id, client_id, name, description, solution_type, technology, benefits, risks, dependencies, investment, annual_savings, annual_operating_cost, roi_percentage, payback_months, person_days, duration, team_size, roles, complexity, strategic_fit, confidence, assumptions, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *
    `, [gapId, clientId, data.name || 'Option', data.description, data.solutionType || 'general', data.technology,
      JSON.stringify(data.benefits || []), JSON.stringify(data.risks || []), JSON.stringify([]),
      data.investment, data.annualSavings, null, roi, payback,
      data.personDays, data.duration, data.teamSize, JSON.stringify(data.roles || []),
      data.complexity || 'medium', data.strategicFit || 'medium', data.confidence || 'medium', JSON.stringify([]), 'draft']);
    return this.mapOption(rows[0]);
  }

  async getOptions(gapId: string): Promise<GapOption[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_gap_options WHERE gap_id = $1 ORDER BY score DESC NULLS LAST, created_at', [gapId]);
    return rows.map(this.mapOption);
  }

  async compareOptions(gapId: string): Promise<{ options: GapOption[]; ranking: any[]; recommendation: string }> {
    const options = await this.getOptions(gapId);
    if (options.length === 0) return { options: [], ranking: [], recommendation: 'No options defined yet.' };

    // Score each option using weighted factors
    const scored = options.map(opt => {
      const factors: Record<string, number> = {};
      factors.roi = opt.roiPercentage ? Math.min(30, opt.roiPercentage / 3) : 0;
      factors.savings = opt.annualSavings ? Math.min(20, opt.annualSavings / 10000) : 0;
      factors.effort = opt.personDays ? Math.max(0, 20 - (opt.personDays / 10)) : 10;
      factors.risk = opt.risks.length === 0 ? 15 : Math.max(0, 15 - opt.risks.length * 3);
      factors.strategic = opt.strategicFit === 'high' ? 15 : opt.strategicFit === 'medium' ? 10 : 5;
      const score = Math.round(Object.values(factors).reduce((a, b) => a + b, 0));
      return { ...opt, score, factors };
    });

    // Sort by score descending
    scored.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Update scores in DB
    for (const opt of scored) {
      await sharedPool.query('UPDATE oc_gap_options SET score = $1, updated_at = NOW() WHERE id = $2', [opt.score, opt.id]);
    }

    const top = scored[0];
    const recommendation = top ? `Recommended: "${top.name}" (score: ${top.score}/100). ${top.roiPercentage ? `ROI: ${top.roiPercentage.toFixed(0)}%.` : ''} ${top.annualSavings ? `Savings: $${top.annualSavings.toLocaleString()}/yr.` : ''}` : 'Insufficient data for recommendation.';

    return { options: scored, ranking: scored.map((o, i) => ({ rank: i + 1, id: o.id, name: o.name, score: o.score, roi: o.roiPercentage, savings: o.annualSavings })), recommendation };
  }

  async selectOption(gapId: string, optionId: string): Promise<void> {
    await sharedPool.query('UPDATE oc_gap_options SET selected = false WHERE gap_id = $1', [gapId]);
    await sharedPool.query('UPDATE oc_gap_options SET selected = true, status = $1, updated_at = NOW() WHERE id = $2', ['selected', optionId]);
  }

  // ─── DECISIONS ──────────────────────────────────────────────────────────────

  async createDecision(gapId: string, clientId: string, data: Partial<Decision>): Promise<Decision> {
    if (data.selectedOptionId) await this.selectOption(gapId, data.selectedOptionId);
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_decisions (gap_id, client_id, selected_option_id, decision_maker, rationale, alternatives_considered, risks_accepted, assumptions, evidence, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [gapId, clientId, data.selectedOptionId, data.decisionMaker || 'admin', data.rationale,
      JSON.stringify(data.alternativesConsidered || []), JSON.stringify(data.risksAccepted || []),
      JSON.stringify([]), JSON.stringify([]), data.status || 'approved']);
    return this.mapDecision(rows[0]);
  }

  async getDecision(gapId: string): Promise<Decision | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_decisions WHERE gap_id = $1 ORDER BY created_at DESC LIMIT 1', [gapId]);
    return rows.length > 0 ? this.mapDecision(rows[0]) : null;
  }

  // ─── TRANSFORMATIONS ────────────────────────────────────────────────────────

  async createTransformation(clientId: string, data: Partial<Transformation>): Promise<Transformation> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_transformations (gap_id, decision_id, client_id, domain, title, description, transformation_type, phases, tasks, dependencies, milestones, investment, expected_savings, expected_roi, person_days, duration, team_size, roles, risks, success_criteria, rollback_strategy, expected_outcome, status, owner)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *
    `, [data.gapId, data.decisionId, clientId, data.domain || 'other', data.title || 'Transformation',
      data.description, data.transformationType || 'general',
      JSON.stringify(data.phases || []), JSON.stringify(data.tasks || []),
      JSON.stringify(data.dependencies || []), JSON.stringify(data.milestones || []),
      data.investment, data.expectedSavings, data.expectedRoi,
      data.personDays, data.duration, data.teamSize, JSON.stringify(data.roles || []),
      JSON.stringify(data.risks || []), JSON.stringify(data.successCriteria || []),
      data.rollbackStrategy, data.expectedOutcome, 'planned', data.owner]);
    return this.mapTransformation(rows[0]);
  }

  async getTransformations(clientId: string): Promise<Transformation[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_transformations WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
    return rows.map(this.mapTransformation);
  }

  async getTransformation(id: string): Promise<Transformation | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_transformations WHERE id = $1', [id]);
    return rows.length > 0 ? this.mapTransformation(rows[0]) : null;
  }

  async updateTransformationStatus(id: string, status: string, outcome?: string): Promise<Transformation | null> {
    const updates = status === 'completed' ? 'status = $1, actual_outcome = $2, completed_at = NOW(), updated_at = NOW()' : status === 'in_progress' ? 'status = $1, started_at = COALESCE(started_at, NOW()), updated_at = NOW()' : 'status = $1, updated_at = NOW()';
    const { rows } = await sharedPool.query(`UPDATE oc_transformations SET ${updates} WHERE id = $3 RETURNING *`, [status, outcome || null, id]);
    return rows.length > 0 ? this.mapTransformation(rows[0]) : null;
  }

  async getClientTransformationSummary(clientId: string): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT count(*) as total,
        count(*) FILTER (WHERE status = 'planned') as planned,
        count(*) FILTER (WHERE status = 'in_progress') as in_progress,
        count(*) FILTER (WHERE status = 'completed') as completed,
        COALESCE(SUM(expected_savings), 0) as total_savings,
        COALESCE(SUM(investment), 0) as total_investment,
        COALESCE(SUM(person_days), 0) as total_person_days
      FROM oc_transformations WHERE client_id = $1
    `, [clientId]);
    return rows[0] || {};
  }

  // ─── MAPPERS ────────────────────────────────────────────────────────────────

  private mapOption(row: any): GapOption {
    return { id: row.id, gapId: row.gap_id, clientId: row.client_id, name: row.name, description: row.description, solutionType: row.solution_type, technology: row.technology, benefits: row.benefits || [], risks: row.risks || [], investment: parseFloat(row.investment) || undefined, annualSavings: parseFloat(row.annual_savings) || undefined, roiPercentage: parseFloat(row.roi_percentage) || undefined, paybackMonths: parseFloat(row.payback_months) || undefined, personDays: parseFloat(row.person_days) || undefined, duration: row.duration, teamSize: row.team_size, roles: row.roles || [], complexity: row.complexity, strategicFit: row.strategic_fit, confidence: row.confidence, score: parseFloat(row.score) || undefined, selected: row.selected, status: row.status, createdAt: row.created_at };
  }

  private mapDecision(row: any): Decision {
    return { id: row.id, gapId: row.gap_id, clientId: row.client_id, selectedOptionId: row.selected_option_id, decisionMaker: row.decision_maker, decisionDate: row.decision_date, rationale: row.rationale, alternativesConsidered: row.alternatives_considered || [], risksAccepted: row.risks_accepted || [], status: row.status, createdAt: row.created_at };
  }

  private mapTransformation(row: any): Transformation {
    return { id: row.id, gapId: row.gap_id, decisionId: row.decision_id, clientId: row.client_id, domain: row.domain, title: row.title, description: row.description, transformationType: row.transformation_type, phases: row.phases || [], tasks: row.tasks || [], dependencies: row.dependencies || [], milestones: row.milestones || [], investment: parseFloat(row.investment) || undefined, expectedSavings: parseFloat(row.expected_savings) || undefined, expectedRoi: parseFloat(row.expected_roi) || undefined, personDays: parseFloat(row.person_days) || undefined, duration: row.duration, teamSize: row.team_size, roles: row.roles || [], risks: row.risks || [], successCriteria: row.success_criteria || [], rollbackStrategy: row.rollback_strategy, expectedOutcome: row.expected_outcome, actualOutcome: row.actual_outcome, status: row.status, owner: row.owner, startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at };
  }
}
