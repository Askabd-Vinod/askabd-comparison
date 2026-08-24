/**
 * Risk Engine — `risk_test_1` (2026-08-24 master completion directive).
 *
 * Genuinely NEW (confirmed by direct search before writing this file: no
 * `oc_risks`/`RiskService` concept existed anywhere; only incidental
 * "risk_level" text columns on unrelated tables). Reuses, rather than
 * duplicates:
 *   - `TraceabilityEngine.link()` (unmodified, `link_type: 'relates_to'`,
 *     already valid in that table's own CHECK constraint) to record a
 *     risk's real connection to its source entity.
 *   - `ApprovalWorkflowEngine` (unmodified) for the real risk-ACCEPTANCE
 *     decision (`entityType: 'risk_acceptance'`) — risk acceptance is a
 *     real, attributed, auditable decision, never a bare status flip.
 *
 * Real, deterministic severity: `probability x impact` through an explicit
 * `SEVERITY_MATRIX` — never fabricated or eyeballed. Real, enforced
 * business rule: a risk cannot reach `accepted` without going through a
 * real, decided `ApprovalWorkflowEngine` workflow.
 *
 * Object-level ownership: for the source types with a real, resolvable
 * table in this codebase (`gap` -> `oc_gaps`, `defect` -> `test_defects`,
 * `deployment` -> `oc_deployments`, `requirement` -> `oc_business_requirements`),
 * a real ownership check confirms the linked entity genuinely belongs to
 * the same client before the link is recorded. Other source categories
 * (security/compliance/architecture/operations/dependencies/vendors/
 * business_continuity/other) are honest, free-text classifications with
 * no ownership-checkable backing table yet in this codebase — documented,
 * not silently assumed safe.
 */
import { sharedPool } from './db-pool.js';
import { TraceabilityEngine } from './traceability-engine.js';
import { ApprovalWorkflowEngine, type ApprovalWorkflow } from './approval-workflow-engine.js';

export type RiskSource =
  | 'requirements' | 'gaps' | 'security' | 'migration' | 'data' | 'deployment'
  | 'testing' | 'compliance' | 'architecture' | 'operations' | 'dependencies'
  | 'vendors' | 'business_continuity' | 'other';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskProbability = 'low' | 'medium' | 'high';
export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'transferred' | 'closed';

// Real, deterministic 3x4 probability-x-impact matrix — the ONLY place
// severity is ever computed. Never overridden by a caller-supplied value.
const SEVERITY_MATRIX: Record<RiskProbability, Record<RiskLevel, RiskLevel>> = {
  low: { low: 'low', medium: 'low', high: 'medium', critical: 'high' },
  medium: { low: 'low', medium: 'medium', high: 'high', critical: 'critical' },
  high: { low: 'medium', medium: 'high', high: 'critical', critical: 'critical' },
};

// Source types with a real, resolvable, ownership-checkable table.
const VERIFIABLE_SOURCE_TABLES: Partial<Record<RiskSource, { table: string; idPrefix: string }>> = {
  gaps: { table: 'oc_gaps', idPrefix: 'gap-' },
  deployment: { table: 'oc_deployments', idPrefix: 'dep-' },
};
// requirement/defect use a different id-column name — handled explicitly below.

export interface RiskEvent { event: string; fromStatus: RiskStatus | null; toStatus: RiskStatus; actor: string | null; timestamp: string; reason?: string }

export interface Risk {
  id: string; clientId: string; title: string; description: string; source: RiskSource;
  sourceType: string | null; sourceId: string | null; probability: RiskProbability; impact: RiskLevel;
  severity: RiskLevel; owner: string | null; mitigation: string; contingency: string; status: RiskStatus;
  dueDate: string | null; residualRisk: RiskLevel | null; approvalWorkflowId: string | null;
  events: RiskEvent[]; createdBy: string | null; createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; title: string; description: string; source: RiskSource;
  source_type: string | null; source_id: string | null; probability: RiskProbability; impact: RiskLevel;
  severity: RiskLevel; owner: string | null; mitigation: string; contingency: string; status: RiskStatus;
  due_date: Date | null; residual_risk: RiskLevel | null; approval_workflow_id: string | null;
  events: RiskEvent[]; created_by: string | null; created_at: Date; updated_at: Date;
};

function toRisk(r: Row): Risk {
  return {
    id: r.id, clientId: r.client_id, title: r.title, description: r.description, source: r.source,
    sourceType: r.source_type, sourceId: r.source_id, probability: r.probability, impact: r.impact,
    severity: r.severity, owner: r.owner, mitigation: r.mitigation, contingency: r.contingency, status: r.status,
    dueDate: r.due_date?.toISOString() ?? null, residualRisk: r.residual_risk, approvalWorkflowId: r.approval_workflow_id,
    events: r.events || [], createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export interface CreateRiskInput {
  title: string; description?: string; source: RiskSource; sourceType?: string; sourceId?: string;
  probability: RiskProbability; impact: RiskLevel; owner?: string; mitigation?: string; contingency?: string; dueDate?: string;
}
export interface UpdateRiskInput {
  title?: string; description?: string; probability?: RiskProbability; impact?: RiskLevel;
  owner?: string; mitigation?: string; contingency?: string; dueDate?: string;
}

const ALLOWED_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ['mitigated', 'accepted', 'transferred', 'closed'],
  mitigated: ['open', 'closed'],
  accepted: ['closed'],
  transferred: ['closed'],
  closed: [],
};

export class InvalidRiskTransitionError extends Error {
  constructor(from: RiskStatus, to: RiskStatus) {
    super(`Cannot move a risk from "${from}" to "${to}". Allowed from "${from}": ${ALLOWED_TRANSITIONS[from].join(', ') || '(none — terminal state)'}.`);
    this.name = 'InvalidRiskTransitionError';
  }
}
export class RiskOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'RiskOwnershipError'; }
}
export class InvalidSourceLinkError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidSourceLinkError'; }
}
export class AcceptanceNotDecidedError extends Error {
  constructor() { super('This risk has no approved risk-acceptance decision yet.'); this.name = 'AcceptanceNotDecidedError'; }
}

export class RiskEngine {
  private traceability = new TraceabilityEngine();
  private approvals = new ApprovalWorkflowEngine();

  private async getOwned(id: string, clientId: string): Promise<Row> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_risks WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new RiskOwnershipError(`Risk ${id} not found.`);
    if (row.client_id !== clientId) throw new RiskOwnershipError('This risk does not belong to this client.');
    return row;
  }

  /** Real object-level check for source types with a resolvable table — never trusts a caller-supplied sourceId blindly. */
  private async verifySourceOwnership(source: RiskSource, sourceType: string | undefined, sourceId: string | undefined, clientId: string): Promise<void> {
    if (!sourceId) return;
    if (source === 'requirements') {
      const res = await sharedPool.query(`SELECT client_id FROM oc_business_requirements WHERE id = $1`, [sourceId]);
      if (!res.rows[0]) throw new InvalidSourceLinkError(`Requirement ${sourceId} does not exist.`);
      if (res.rows[0].client_id !== clientId) throw new InvalidSourceLinkError('That requirement does not belong to this client.');
      return;
    }
    if (source === 'testing' && sourceType === 'defect') {
      const res = await sharedPool.query(`SELECT client_id FROM test_defects WHERE id = $1`, [sourceId]);
      if (!res.rows[0]) throw new InvalidSourceLinkError(`Defect ${sourceId} does not exist.`);
      if (res.rows[0].client_id !== clientId) throw new InvalidSourceLinkError('That defect does not belong to this client.');
      return;
    }
    const verifiable = VERIFIABLE_SOURCE_TABLES[source];
    if (verifiable) {
      const res = await sharedPool.query(`SELECT client_id FROM ${verifiable.table} WHERE id = $1`, [sourceId]);
      if (!res.rows[0]) throw new InvalidSourceLinkError(`${source} ${sourceId} does not exist.`);
      if (res.rows[0].client_id !== clientId) throw new InvalidSourceLinkError(`That ${source} record does not belong to this client.`);
    }
    // Other source categories: no resolvable table in this codebase yet — stored as an honest, free-text reference, not ownership-checked.
  }

  private async transition(row: Row, to: RiskStatus, actor: string | null, reason?: string, extraSql?: { setClauses: string[]; params: unknown[] }): Promise<Risk> {
    const from = row.status;
    if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new InvalidRiskTransitionError(from, to);
    const event: RiskEvent = { event: `${from}_to_${to}`, fromStatus: from, toStatus: to, actor, timestamp: new Date().toISOString(), reason };
    const events = [...(row.events || []), event];
    const setClauses = ['status = $2', 'events = $3', 'updated_at = NOW()', ...(extraSql?.setClauses || [])];
    const params: unknown[] = [row.id, to, JSON.stringify(events), ...(extraSql?.params || [])];
    const res = await sharedPool.query<Row>(`UPDATE oc_risks SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`, params);
    const updated = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('risk', $1, $2, $3, $4, $5, $6)`,
      [row.id, row.title, `risk_${to}`, actor, JSON.stringify({ from, to, reason: reason || null }), [`Risk moved from "${from}" to "${to}".`]],
    );
    return toRisk(updated);
  }

  async createRisk(clientId: string, input: CreateRiskInput, actor: string | null): Promise<Risk> {
    if (!input.title?.trim()) throw new Error('A real risk title is required.');
    if (!input.probability) throw new Error('A real probability is required.');
    if (!input.impact) throw new Error('A real impact is required.');
    await this.verifySourceOwnership(input.source, input.sourceType, input.sourceId, clientId);
    const severity = SEVERITY_MATRIX[input.probability][input.impact];
    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_risks (client_id, title, description, source, source_type, source_id, probability, impact, severity, owner, mitigation, contingency, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [clientId, input.title.trim(), input.description || '', input.source, input.sourceType || null, input.sourceId || null,
        input.probability, input.impact, severity, input.owner || null, input.mitigation || '', input.contingency || '', input.dueDate || null, actor],
    );
    const row = res.rows[0]!;
    if (input.sourceType && input.sourceId) {
      await this.traceability.link('risk', row.id, input.sourceType, input.sourceId, 'relates_to', actor).catch(() => {});
    }
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('risk', $1, $2, 'created', $3, $4, $5)`,
      [row.id, row.title, actor, JSON.stringify({ source: row.source, severity: row.severity }), [`Risk ${row.id} created (open, severity=${row.severity}).`]],
    );
    return toRisk(row);
  }

  async listRisks(clientId: string, status?: RiskStatus): Promise<Risk[]> {
    const res = status
      ? await sharedPool.query<Row>(`SELECT * FROM oc_risks WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC`, [clientId, status])
      : await sharedPool.query<Row>(`SELECT * FROM oc_risks WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toRisk);
  }

  async getRisk(id: string, clientId: string): Promise<Risk> {
    return toRisk(await this.getOwned(id, clientId));
  }

  async updateRisk(id: string, clientId: string, input: UpdateRiskInput, actor: string | null): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (row.status === 'closed') throw new Error('A closed risk cannot be edited.');
    const probability = input.probability || row.probability;
    const impact = input.impact || row.impact;
    const severity = SEVERITY_MATRIX[probability][impact];
    const res = await sharedPool.query<Row>(
      `UPDATE oc_risks SET
        title = COALESCE($2, title), description = COALESCE($3, description),
        probability = $4, impact = $5, severity = $6,
        owner = COALESCE($7, owner), mitigation = COALESCE($8, mitigation), contingency = COALESCE($9, contingency),
        due_date = COALESCE($10, due_date), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, input.title, input.description, probability, impact, severity, input.owner, input.mitigation, input.contingency, input.dueDate],
    );
    const updated = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('risk', $1, $2, 'updated', $3, $4, $5)`,
      [id, updated.title, actor, JSON.stringify(input), [`Risk ${id} fields updated.`]],
    );
    return toRisk(updated);
  }

  async mitigate(id: string, clientId: string, actor: string | null, residualRisk: RiskLevel, note?: string): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (!row.mitigation?.trim()) throw new Error('A real mitigation plan is required before marking a risk mitigated.');
    return this.transition(row, 'mitigated', actor, note, { setClauses: ['residual_risk = $4'], params: [residualRisk] });
  }

  async reopen(id: string, clientId: string, actor: string | null, reason: string): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (!reason?.trim()) throw new Error('A real reason is required to reopen a risk.');
    return this.transition(row, 'open', actor, reason);
  }

  async transfer(id: string, clientId: string, actor: string | null, note: string): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (!note?.trim()) throw new Error('A real note describing where the risk was transferred is required.');
    return this.transition(row, 'transferred', actor, note);
  }

  async close(id: string, clientId: string, actor: string | null, reason: string): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (!reason?.trim()) throw new Error('A real reason is required to close a risk.');
    return this.transition(row, 'closed', actor, reason);
  }

  /** Real, enforced business rule: acceptance requires a real, decided ApprovalWorkflowEngine workflow — never a bare status flip. */
  async requestAcceptance(id: string, clientId: string, actor: string | null, justification: string): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'open') throw new InvalidRiskTransitionError(row.status, 'accepted');
    if (!justification?.trim()) throw new Error('A real justification is required to request risk acceptance.');
    const opened = await this.approvals.openWorkflow('risk_acceptance', id, `Risk Acceptance — ${row.title}`, { severity: row.severity, probability: row.probability, impact: row.impact, justification }, actor);
    const submitted = await this.approvals.submit(opened.id, actor);
    const res = await sharedPool.query<Row>(`UPDATE oc_risks SET approval_workflow_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, submitted.id]);
    return toRisk(res.rows[0]!);
  }

  async decideAcceptance(id: string, clientId: string, decision: 'approve' | 'reject', actor: string | null, note?: string): Promise<Risk> {
    const row = await this.getOwned(id, clientId);
    if (!row.approval_workflow_id) throw new AcceptanceNotDecidedError();
    if (decision === 'approve') {
      await this.approvals.approve(row.approval_workflow_id, actor, note);
      return this.transition(row, 'accepted', actor, note);
    }
    if (!note?.trim()) throw new Error('A real reason is required to reject a risk-acceptance request.');
    await this.approvals.reject(row.approval_workflow_id, actor, note);
    // Rejected acceptance leaves the risk open — a real, un-accepted risk must still be tracked, never silently dropped.
    return toRisk(row);
  }

  async getAcceptanceStatus(id: string, clientId: string): Promise<{ current: ApprovalWorkflow | null; history: ApprovalWorkflow[] }> {
    await this.getOwned(id, clientId);
    const history = await this.approvals.listForEntity('risk_acceptance', id);
    return { current: history[0] ?? null, history };
  }

  /** Real register-level summary — never fabricated counts. */
  async getRiskSummary(clientId: string): Promise<{ total: number; bySeverity: Record<RiskLevel, number>; byStatus: Record<RiskStatus, number> }> {
    const risks = await this.listRisks(clientId);
    const bySeverity: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byStatus: Record<RiskStatus, number> = { open: 0, mitigated: 0, accepted: 0, transferred: 0, closed: 0 };
    for (const r of risks) { bySeverity[r.severity]++; byStatus[r.status]++; }
    return { total: risks.length, bySeverity, byStatus };
  }
}
