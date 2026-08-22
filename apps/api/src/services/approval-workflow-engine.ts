/**
 * Generic Approval Workflow Engine — Phase 1 shared foundation (migration
 * 040, see docs/enterprise-operations-roadmap.md Phase 1).
 *
 * A reusable, entity-agnostic approval state machine for future work
 * (Document Generation approval, Gap Resolution sign-off, Change
 * Management, ...) so those phases reach for this instead of each
 * inventing its own status enum. No existing "approval workflow" concept
 * was found anywhere in this codebase before this — genuinely new
 * capability, not a retrofit.
 *
 * State machine: DRAFT -> IN_REVIEW -> APPROVED | REJECTED
 *                          IN_REVIEW -> CHANGES_REQUESTED -> IN_REVIEW (loop)
 * APPROVED transitions to SUPERSEDED automatically when a new workflow is
 * opened for the same entity (an entity can only have one *current*
 * approved decision). Every transition is a real, attributed, timestamped
 * row in `approval_workflow_steps` — never inferred, never silent.
 */
import { sharedPool } from './db-pool.js';

export type ApprovalStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded';

export interface ApprovalWorkflow {
  id: string;
  entityType: string;
  entityId: string;
  status: ApprovalStatus;
  title: string;
  context: Record<string, unknown>;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStep {
  id: string;
  workflowId: string;
  fromStatus: ApprovalStatus | null;
  toStatus: ApprovalStatus;
  actor: string | null;
  note: string | null;
  createdAt: string;
}

type WorkflowRow = {
  id: string; entity_type: string; entity_id: string; status: ApprovalStatus; title: string;
  context: Record<string, unknown>; submitted_by: string | null; submitted_at: Date | null;
  decided_by: string | null; decided_at: Date | null; decision_note: string | null;
  created_at: Date; updated_at: Date;
};
type StepRow = {
  id: string; workflow_id: string; from_status: ApprovalStatus | null; to_status: ApprovalStatus;
  actor: string | null; note: string | null; created_at: Date;
};

function toWorkflow(r: WorkflowRow): ApprovalWorkflow {
  return {
    id: r.id, entityType: r.entity_type, entityId: r.entity_id, status: r.status, title: r.title,
    context: r.context, submittedBy: r.submitted_by, submittedAt: r.submitted_at?.toISOString() ?? null,
    decidedBy: r.decided_by, decidedAt: r.decided_at?.toISOString() ?? null, decisionNote: r.decision_note,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}
function toStep(r: StepRow): ApprovalStep {
  return {
    id: r.id, workflowId: r.workflow_id, fromStatus: r.from_status, toStatus: r.to_status,
    actor: r.actor, note: r.note, createdAt: r.created_at.toISOString(),
  };
}

// The real, enforced transition table — an attempted transition not listed
// here is rejected with a clear error, never silently coerced.
const ALLOWED_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'rejected', 'changes_requested'],
  changes_requested: ['in_review'],
  approved: ['superseded'],
  rejected: [],
  superseded: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: ApprovalStatus, to: ApprovalStatus) {
    super(`Cannot transition an approval workflow from "${from}" to "${to}". Allowed from "${from}": ${ALLOWED_TRANSITIONS[from].join(', ') || '(none — terminal state)'}.`);
    this.name = 'InvalidTransitionError';
  }
}

export class ApprovalWorkflowEngine {
  /**
   * Opens a new DRAFT workflow for an entity. If a currently-APPROVED
   * workflow already exists for this exact entity, it is transitioned to
   * SUPERSEDED first (a real, logged step) — an entity has at most one
   * current approved decision. The DB's own unique index additionally
   * guarantees at most one open (non-terminal) workflow per entity at a
   * time, so calling this while one is already in_review/changes_requested
   * fails with a real constraint error rather than silently duplicating.
   */
  async openWorkflow(entityType: string, entityId: string, title: string, context: Record<string, unknown>, submittedBy: string | null): Promise<ApprovalWorkflow> {
    const client = await sharedPool.connect();
    try {
      await client.query('BEGIN');
      const existingApproved = await client.query<WorkflowRow>(
        `SELECT * FROM approval_workflows WHERE entity_type = $1 AND entity_id = $2 AND status = 'approved'`,
        [entityType, entityId]
      );
      for (const row of existingApproved.rows) {
        await this.transition(client, row.id, 'approved', 'superseded', submittedBy, 'Superseded by a new approval workflow for this entity');
      }
      const inserted = await client.query<WorkflowRow>(
        `INSERT INTO approval_workflows (entity_type, entity_id, title, context, status)
         VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
        [entityType, entityId, title, JSON.stringify(context)]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error('approval_workflows insert returned no row');
      await client.query(
        `INSERT INTO approval_workflow_steps (workflow_id, from_status, to_status, actor) VALUES ($1, NULL, 'draft', $2)`,
        [row.id, submittedBy]
      );
      await client.query('COMMIT');
      return toWorkflow(row);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async submit(workflowId: string, actor: string | null): Promise<ApprovalWorkflow> {
    return this.doTransition(workflowId, 'in_review', actor, null, { submitted: true });
  }

  async approve(workflowId: string, actor: string | null, note?: string): Promise<ApprovalWorkflow> {
    return this.doTransition(workflowId, 'approved', actor, note ?? null, { decided: true });
  }

  async reject(workflowId: string, actor: string | null, note?: string): Promise<ApprovalWorkflow> {
    return this.doTransition(workflowId, 'rejected', actor, note ?? null, { decided: true });
  }

  /** A real note explaining what needs to change is required — never a silent bounce-back. */
  async requestChanges(workflowId: string, actor: string | null, note: string): Promise<ApprovalWorkflow> {
    if (!note || !note.trim()) throw new Error('A note explaining what changes are needed is required.');
    return this.doTransition(workflowId, 'changes_requested', actor, note, {});
  }

  async resubmit(workflowId: string, actor: string | null): Promise<ApprovalWorkflow> {
    return this.doTransition(workflowId, 'in_review', actor, null, { submitted: true });
  }

  private async doTransition(workflowId: string, to: ApprovalStatus, actor: string | null, note: string | null, decisionFields: { submitted?: boolean; decided?: boolean }): Promise<ApprovalWorkflow> {
    const client = await sharedPool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<WorkflowRow>(`SELECT * FROM approval_workflows WHERE id = $1 FOR UPDATE`, [workflowId]);
      const row = current.rows[0];
      if (!row) throw new Error(`Approval workflow ${workflowId} not found.`);
      const updated = await this.transition(client, workflowId, row.status, to, actor, note, decisionFields);
      await client.query('COMMIT');
      return updated;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Internal — assumes it is already running inside the caller's transaction. */
  private async transition(client: { query: typeof sharedPool.query }, workflowId: string, from: ApprovalStatus, to: ApprovalStatus, actor: string | null, note: string | null, decisionFields?: { submitted?: boolean; decided?: boolean }): Promise<ApprovalWorkflow> {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new InvalidTransitionError(from, to);
    }
    const setParts = ['status = $1', 'updated_at = NOW()'];
    const params: unknown[] = [to];
    let idx = 2;
    if (decisionFields?.submitted) {
      setParts.push(`submitted_by = $${idx}`, `submitted_at = NOW()`);
      params.push(actor); idx++;
    }
    if (decisionFields?.decided) {
      setParts.push(`decided_by = $${idx}`, `decided_at = NOW()`, `decision_note = $${idx + 1}`);
      params.push(actor, note); idx += 2;
    }
    params.push(workflowId);
    const updated = await client.query<WorkflowRow>(
      `UPDATE approval_workflows SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw new Error(`Approval workflow ${workflowId} not found during update.`);
    await client.query(
      `INSERT INTO approval_workflow_steps (workflow_id, from_status, to_status, actor, note) VALUES ($1, $2, $3, $4, $5)`,
      [workflowId, from, to, actor, note]
    );
    return toWorkflow(updatedRow);
  }

  async getWorkflow(id: string): Promise<ApprovalWorkflow | null> {
    const res = await sharedPool.query<WorkflowRow>(`SELECT * FROM approval_workflows WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toWorkflow(row) : null;
  }

  async getSteps(workflowId: string): Promise<ApprovalStep[]> {
    const res = await sharedPool.query<StepRow>(
      `SELECT * FROM approval_workflow_steps WHERE workflow_id = $1 ORDER BY created_at ASC`,
      [workflowId]
    );
    return res.rows.map(toStep);
  }

  /** All workflows (any status) ever opened for an entity, newest first. */
  async listForEntity(entityType: string, entityId: string): Promise<ApprovalWorkflow[]> {
    const res = await sharedPool.query<WorkflowRow>(
      `SELECT * FROM approval_workflows WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    return res.rows.map(toWorkflow);
  }

  /** The one currently-open (non-terminal) workflow for an entity, if any — real, not inferred. */
  async getOpenForEntity(entityType: string, entityId: string): Promise<ApprovalWorkflow | null> {
    const res = await sharedPool.query<WorkflowRow>(
      `SELECT * FROM approval_workflows WHERE entity_type = $1 AND entity_id = $2 AND status IN ('draft', 'in_review', 'changes_requested')`,
      [entityType, entityId]
    );
    const row = res.rows[0];
    return row ? toWorkflow(row) : null;
  }
}
