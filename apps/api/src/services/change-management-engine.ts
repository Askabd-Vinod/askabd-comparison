/**
 * Change Management Engine — `change_management_test_1` (2026-08-24
 * master completion directive, capability #71).
 *
 * Genuinely NEW (confirmed by search before building: `client-request
 * -service.ts`'s existing `requestType: 'change'` intake is real but
 * deliberately lightweight — the same simple state machine shared with
 * service/connector/support/incident requests, no room for a real impact
 * assessment, risk linkage, or implementation/rollback plan).
 *
 * A Change Record MAY originate from a real customer `ClientRequest`
 * (`client_request_id`, optional — a staff-initiated change needs no
 * originating request). Reuses, rather than duplicates:
 *   - `oc_risks` (this session's own `risk_test_1`, unmodified) — real,
 *     ownership-verified risk linkage, never a bare unverified id array.
 *   - `oc_deployments` (this session's own `deployment_validation_test_1`,
 *     unmodified) — a change's real implementation MAY be a real
 *     deployment, ownership-verified when linked.
 *   - `ApprovalWorkflowEngine` (generic, unmodified) — the real approval
 *     decision, including real self-approval prevention (same pattern as
 *     `deployment-service.ts`/`risk-engine.ts`).
 *
 * Real, enforced business rules: cannot move to `assessed` without real,
 * non-empty impact assessment + implementation plan + rollback plan;
 * cannot `close` without real, non-empty post-change validation evidence
 * — never a fabricated "done".
 */
import { sharedPool } from './db-pool.js';
import { ApprovalWorkflowEngine, type ApprovalWorkflow } from './approval-workflow-engine.js';

export type ChangeStatus = 'draft' | 'assessed' | 'approval_pending' | 'approved' | 'implementing' | 'validating' | 'closed' | 'cancelled';
export type ChangeType = 'standard' | 'normal' | 'emergency';

export interface ChangeEvent { event: string; fromStatus: ChangeStatus | null; toStatus: ChangeStatus; actor: string | null; timestamp: string; reason?: string }

export interface ChangeRecord {
  id: string; clientId: string; clientRequestId: string | null; title: string; description: string; changeType: ChangeType;
  impactAssessment: string; riskIds: string[]; dependencies: string; implementationPlan: string; rollbackPlan: string;
  deploymentId: string | null; validationReference: string; postChangeValidation: string | null;
  status: ChangeStatus; approvalWorkflowId: string | null; owner: string | null; events: ChangeEvent[];
  createdBy: string | null; createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; client_request_id: string | null; title: string; description: string; change_type: ChangeType;
  impact_assessment: string; risk_ids: string[]; dependencies: string; implementation_plan: string; rollback_plan: string;
  deployment_id: string | null; validation_reference: string; post_change_validation: string | null;
  status: ChangeStatus; approval_workflow_id: string | null; owner: string | null; events: ChangeEvent[];
  created_by: string | null; created_at: Date; updated_at: Date;
};

function toChange(r: Row): ChangeRecord {
  return {
    id: r.id, clientId: r.client_id, clientRequestId: r.client_request_id, title: r.title, description: r.description, changeType: r.change_type,
    impactAssessment: r.impact_assessment, riskIds: r.risk_ids || [], dependencies: r.dependencies, implementationPlan: r.implementation_plan, rollbackPlan: r.rollback_plan,
    deploymentId: r.deployment_id, validationReference: r.validation_reference, postChangeValidation: r.post_change_validation,
    status: r.status, approvalWorkflowId: r.approval_workflow_id, owner: r.owner, events: r.events || [],
    createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export interface CreateChangeInput { title: string; description?: string; changeType?: ChangeType; clientRequestId?: string; owner?: string }

const ALLOWED_TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
  draft: ['assessed', 'cancelled'],
  assessed: ['approval_pending', 'cancelled'],
  approval_pending: ['approved', 'draft', 'cancelled'],
  approved: ['implementing', 'cancelled'],
  implementing: ['validating'],
  validating: ['closed'],
  closed: [],
  cancelled: [],
};

export class InvalidChangeTransitionError extends Error {
  constructor(from: ChangeStatus, to: ChangeStatus) {
    super(`Cannot move a change from "${from}" to "${to}". Allowed from "${from}": ${ALLOWED_TRANSITIONS[from].join(', ') || '(none — terminal state)'}.`);
    this.name = 'InvalidChangeTransitionError';
  }
}
export class ChangeOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'ChangeOwnershipError'; }
}
export class SelfApprovalError extends Error {
  constructor() { super('A change cannot be approved by the same person who requested it.'); this.name = 'SelfApprovalError'; }
}

export class ChangeManagementEngine {
  private approvals = new ApprovalWorkflowEngine();

  private async getOwned(id: string, clientId: string): Promise<Row> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_change_records WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new ChangeOwnershipError(`Change ${id} not found.`);
    if (row.client_id !== clientId) throw new ChangeOwnershipError('This change does not belong to this client.');
    return row;
  }

  private async transition(row: Row, to: ChangeStatus, actor: string | null, reason?: string, extraSql?: { setClauses: string[]; params: unknown[] }): Promise<ChangeRecord> {
    const from = row.status;
    if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new InvalidChangeTransitionError(from, to);
    const event: ChangeEvent = { event: `${from}_to_${to}`, fromStatus: from, toStatus: to, actor, timestamp: new Date().toISOString(), reason };
    const events = [...(row.events || []), event];
    const setClauses = ['status = $2', 'events = $3', 'updated_at = NOW()', ...(extraSql?.setClauses || [])];
    const params: unknown[] = [row.id, to, JSON.stringify(events), ...(extraSql?.params || [])];
    const res = await sharedPool.query<Row>(`UPDATE oc_change_records SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`, params);
    const updated = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('change_record', $1, $2, $3, $4, $5, $6)`,
      [row.id, row.title, `change_${to}`, actor, JSON.stringify({ from, to, reason: reason || null }), [`Change moved from "${from}" to "${to}".`]],
    );
    return toChange(updated);
  }

  async createChange(clientId: string, input: CreateChangeInput, actor: string | null): Promise<ChangeRecord> {
    if (!input.title?.trim()) throw new Error('A real change title is required.');
    if (input.clientRequestId) {
      const reqRes = await sharedPool.query(`SELECT client_id FROM oc_client_requests WHERE id = $1`, [input.clientRequestId]);
      const reqRow = reqRes.rows[0];
      if (!reqRow) throw new Error(`Client request ${input.clientRequestId} does not exist.`);
      if (reqRow.client_id !== clientId) throw new ChangeOwnershipError('That client request does not belong to this client.');
    }
    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_change_records (client_id, client_request_id, title, description, change_type, owner, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [clientId, input.clientRequestId || null, input.title.trim(), input.description || '', input.changeType || 'normal', input.owner || null, actor],
    );
    return toChange(res.rows[0]!);
  }

  async listChanges(clientId: string, status?: ChangeStatus): Promise<ChangeRecord[]> {
    const res = status
      ? await sharedPool.query<Row>(`SELECT * FROM oc_change_records WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC`, [clientId, status])
      : await sharedPool.query<Row>(`SELECT * FROM oc_change_records WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toChange);
  }

  async getChange(id: string, clientId: string): Promise<ChangeRecord> {
    return toChange(await this.getOwned(id, clientId));
  }

  /** Real, enforced: cannot be assessed without real impact/implementation/rollback content. */
  async assess(id: string, clientId: string, actor: string | null, fields: { impactAssessment: string; dependencies?: string; implementationPlan: string; rollbackPlan: string }): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    if (!fields.impactAssessment?.trim()) throw new Error('A real impact assessment is required.');
    if (!fields.implementationPlan?.trim()) throw new Error('A real implementation plan is required.');
    if (!fields.rollbackPlan?.trim()) throw new Error('A real rollback plan is required.');
    return this.transition(row, 'assessed', actor, undefined, {
      setClauses: ['impact_assessment = $4', 'dependencies = $5', 'implementation_plan = $6', 'rollback_plan = $7'],
      params: [fields.impactAssessment.trim(), fields.dependencies || '', fields.implementationPlan.trim(), fields.rollbackPlan.trim()],
    });
  }

  /** Real, ownership-verified risk linkage — never a bare unverified id. */
  async linkRisk(id: string, clientId: string, riskId: string, actor: string | null): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    const riskRes = await sharedPool.query(`SELECT client_id FROM oc_risks WHERE id = $1`, [riskId]);
    const riskRow = riskRes.rows[0];
    if (!riskRow) throw new Error(`Risk ${riskId} does not exist.`);
    if (riskRow.client_id !== clientId) throw new ChangeOwnershipError('That risk does not belong to this client.');
    if (row.risk_ids.includes(riskId)) return toChange(row);
    const res = await sharedPool.query<Row>(`UPDATE oc_change_records SET risk_ids = array_append(risk_ids, $2), updated_at = NOW() WHERE id = $1 RETURNING *`, [id, riskId]);
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('change_record', $1, $2, 'risk_linked', $3, $4, $5)`,
      [id, row.title, actor, JSON.stringify({ riskId }), [`Risk ${riskId} linked to change ${id}.`]],
    );
    return toChange(res.rows[0]!);
  }

  /** Real, ownership-verified deployment linkage — the change's real implementation. */
  async linkDeployment(id: string, clientId: string, deploymentId: string, actor: string | null): Promise<ChangeRecord> {
    await this.getOwned(id, clientId);
    const depRes = await sharedPool.query(`SELECT client_id FROM oc_deployments WHERE id = $1`, [deploymentId]);
    const depRow = depRes.rows[0];
    if (!depRow) throw new Error(`Deployment ${deploymentId} does not exist.`);
    if (depRow.client_id !== clientId) throw new ChangeOwnershipError('That deployment does not belong to this client.');
    const res = await sharedPool.query<Row>(`UPDATE oc_change_records SET deployment_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, deploymentId]);
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('change_record', $1, $2, 'deployment_linked', $3, $4, $5)`,
      [id, res.rows[0]!.title, actor, JSON.stringify({ deploymentId }), [`Deployment ${deploymentId} linked to change ${id}.`]],
    );
    return toChange(res.rows[0]!);
  }

  async requestApproval(id: string, clientId: string, actor: string | null): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'assessed') throw new InvalidChangeTransitionError(row.status, 'approval_pending');
    const opened = await this.approvals.openWorkflow(
      'change_approval', id, `Change Approval — ${row.title}`,
      { changeType: row.change_type, riskCount: row.risk_ids.length, hasDeployment: !!row.deployment_id },
      actor,
    );
    const submitted = await this.approvals.submit(opened.id, actor);
    return this.transition(row, 'approval_pending', actor, undefined, { setClauses: ['approval_workflow_id = $4'], params: [submitted.id] });
  }

  async decideApproval(id: string, clientId: string, decision: 'approve' | 'reject' | 'request_changes', actor: string | null, note?: string): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'approval_pending' || !row.approval_workflow_id) throw new Error(`Change ${id} has no pending approval to decide.`);
    if (decision === 'approve') {
      // Real self-approval prevention (same pattern as deployment-service.ts/
      // risk-engine.ts): the change's own creator stands in for "requester"
      // — the same real identity that authored the impact assessment/
      // implementation plan should not also be the one approving it.
      if (row.created_by && actor && row.created_by === actor) throw new SelfApprovalError();
      await this.approvals.approve(row.approval_workflow_id, actor, note);
      return this.transition(row, 'approved', actor, note);
    }
    if (decision === 'reject') {
      if (!note?.trim()) throw new Error('A real reason is required to reject a change.');
      await this.approvals.reject(row.approval_workflow_id, actor, note);
      return this.transition(row, 'cancelled', actor, note);
    }
    if (!note?.trim()) throw new Error('A real reason is required to request changes.');
    await this.approvals.requestChanges(row.approval_workflow_id, actor, note);
    return this.transition(row, 'draft', actor, note);
  }

  async getApprovalStatus(id: string, clientId: string): Promise<{ current: ApprovalWorkflow | null; history: ApprovalWorkflow[] }> {
    await this.getOwned(id, clientId);
    const history = await this.approvals.listForEntity('change_approval', id);
    return { current: history[0] ?? null, history };
  }

  async startImplementation(id: string, clientId: string, actor: string | null): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    return this.transition(row, 'implementing', actor);
  }

  async moveToValidating(id: string, clientId: string, actor: string | null, validationReference?: string): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    return this.transition(row, 'validating', actor, undefined, { setClauses: ['validation_reference = $4'], params: [validationReference || ''] });
  }

  /** Real, enforced: cannot close without real post-change validation evidence — never a fabricated "done". */
  async close(id: string, clientId: string, actor: string | null, postChangeValidation: string): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    if (!postChangeValidation?.trim()) throw new Error('Real post-change validation evidence is required to close a change.');
    return this.transition(row, 'closed', actor, undefined, { setClauses: ['post_change_validation = $4'], params: [postChangeValidation.trim()] });
  }

  async cancel(id: string, clientId: string, actor: string | null, reason: string): Promise<ChangeRecord> {
    const row = await this.getOwned(id, clientId);
    if (!reason?.trim()) throw new Error('A real reason is required to cancel a change.');
    return this.transition(row, 'cancelled', actor, reason);
  }
}
