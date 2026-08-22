/**
 * AskABD Operation Service — the single, reusable model for any long-running process
 * (migration execution, discovery scans, assessments, and future imports/exports/
 * synchronization). See migration 027_operations.sql for the full rationale.
 *
 * Every field this service writes is real: completed_units/failed_units/warning_units
 * only ever increment when a real step of real work actually finished; progress_percent
 * is left NULL (never a guessed number) until total_units is known; evidence entries are
 * appended only for things that genuinely happened, each with a real timestamp.
 */
import { sharedPool } from './db-pool.js';

const dbPool = sharedPool;

export type OperationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type OperationType = 'migration' | 'discovery' | 'assessment' | 'remediation';

export interface Operation {
  id: string;
  clientId: string;
  type: OperationType;
  sourceId: string | null;
  status: OperationStatus;
  currentStage: string | null;
  totalUnits: number | null;
  completedUnits: number;
  failedUnits: number;
  warningUnits: number;
  progressPercent: number | null;
  errorSummary: string | null;
  evidence: { at: string; message: string }[];
  result: Record<string, unknown>;
  metadata: Record<string, unknown>;
  cancellable: boolean;
  retryable: boolean;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

function toOperation(row: any): Operation {
  return {
    id: row.id, clientId: row.client_id, type: row.type, sourceId: row.source_id,
    status: row.status, currentStage: row.current_stage,
    totalUnits: row.total_units, completedUnits: row.completed_units,
    failedUnits: row.failed_units, warningUnits: row.warning_units,
    progressPercent: row.progress_percent, errorSummary: row.error_summary,
    evidence: row.evidence || [], result: row.result || {}, metadata: row.metadata || {},
    cancellable: row.cancellable, retryable: row.retryable,
    startedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    createdAt: row.created_at, createdBy: row.created_by,
  };
}

function computePercent(totalUnits: number | null, completedUnits: number): number | null {
  if (!totalUnits || totalUnits <= 0) return null; // Never fabricate — genuinely unknown yet
  return Math.min(100, Math.round((completedUnits / totalUnits) * 100));
}

export class OperationService {

  async create(input: {
    clientId: string; type: OperationType; sourceId?: string | null;
    totalUnits?: number | null; currentStage?: string | null;
    cancellable?: boolean; retryable?: boolean; createdBy?: string | null;
  }): Promise<Operation> {
    const res = await dbPool.query(
      `INSERT INTO oc_operations (client_id, type, source_id, total_units, current_stage, cancellable, retryable, created_by, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        input.clientId, input.type, input.sourceId ?? null, input.totalUnits ?? null,
        input.currentStage ?? null, input.cancellable ?? false, input.retryable ?? false,
        input.createdBy ?? null,
        JSON.stringify([{ at: new Date().toISOString(), message: 'Operation created' }]),
      ]
    );
    return toOperation(res.rows[0]);
  }

  async start(id: string): Promise<Operation | null> {
    const res = await dbPool.query(
      `UPDATE oc_operations SET status = 'running', started_at = NOW(), updated_at = NOW(),
       evidence = evidence || $2::jsonb WHERE id = $1 AND status = 'queued' RETURNING *`,
      [id, JSON.stringify([{ at: new Date().toISOString(), message: 'Operation started' }])]
    );
    return res.rows[0] ? toOperation(res.rows[0]) : null;
  }

  /** Real, incremental progress update — call after each real unit of work completes. */
  async progress(id: string, delta: {
    completedUnitsDelta?: number; failedUnitsDelta?: number; warningUnitsDelta?: number;
    currentStage?: string; evidenceMessage?: string;
  }): Promise<Operation | null> {
    const current = await this.get(id);
    if (!current) return null;
    const completedUnits = current.completedUnits + (delta.completedUnitsDelta ?? 0);
    const failedUnits = current.failedUnits + (delta.failedUnitsDelta ?? 0);
    const warningUnits = current.warningUnits + (delta.warningUnitsDelta ?? 0);
    const progressPercent = computePercent(current.totalUnits, completedUnits);
    const evidenceEntry = delta.evidenceMessage ? [{ at: new Date().toISOString(), message: delta.evidenceMessage }] : [];
    const res = await dbPool.query(
      `UPDATE oc_operations SET completed_units = $2, failed_units = $3, warning_units = $4,
       progress_percent = $5, current_stage = COALESCE($6, current_stage), updated_at = NOW(),
       evidence = evidence || $7::jsonb WHERE id = $1 RETURNING *`,
      [id, completedUnits, failedUnits, warningUnits, progressPercent, delta.currentStage ?? null, JSON.stringify(evidenceEntry)]
    );
    return res.rows[0] ? toOperation(res.rows[0]) : null;
  }

  async complete(id: string, input: { result?: Record<string, unknown>; evidenceMessage?: string } = {}): Promise<Operation | null> {
    const current = await this.get(id);
    if (!current) return null;
    const progressPercent = current.totalUnits ? 100 : current.progressPercent;
    const evidenceEntry = [{ at: new Date().toISOString(), message: input.evidenceMessage ?? 'Operation completed' }];
    const res = await dbPool.query(
      `UPDATE oc_operations SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
       progress_percent = $2, result = COALESCE($3, result), evidence = evidence || $4::jsonb
       WHERE id = $1 RETURNING *`,
      [id, progressPercent, input.result ? JSON.stringify(input.result) : null, JSON.stringify(evidenceEntry)]
    );
    return res.rows[0] ? toOperation(res.rows[0]) : null;
  }

  async fail(id: string, input: { errorSummary: string; evidenceMessage?: string }): Promise<Operation | null> {
    const evidenceEntry = [{ at: new Date().toISOString(), message: input.evidenceMessage ?? `Failed: ${input.errorSummary}` }];
    const res = await dbPool.query(
      `UPDATE oc_operations SET status = 'failed', completed_at = NOW(), updated_at = NOW(),
       error_summary = $2, evidence = evidence || $3::jsonb WHERE id = $1 RETURNING *`,
      [id, input.errorSummary, JSON.stringify(evidenceEntry)]
    );
    return res.rows[0] ? toOperation(res.rows[0]) : null;
  }

  /** Real cancellation — only for operations the caller marked cancellable, and only
   *  while genuinely still queued/running (never overwrites a real completed/failed
   *  result). */
  async cancel(id: string, actor: string | null): Promise<{ ok: boolean; error?: string; value?: Operation }> {
    const current = await this.get(id);
    if (!current) return { ok: false, error: 'Operation not found' };
    if (!current.cancellable) return { ok: false, error: 'This operation type does not support cancellation' };
    if (current.status !== 'queued' && current.status !== 'running') {
      return { ok: false, error: `Cannot cancel — operation is already ${current.status}` };
    }
    const res = await dbPool.query(
      `UPDATE oc_operations SET status = 'cancelled', completed_at = NOW(), updated_at = NOW(),
       evidence = evidence || $2::jsonb WHERE id = $1 RETURNING *`,
      [id, JSON.stringify([{ at: new Date().toISOString(), message: `Cancelled by ${actor ?? 'unknown'}` }])]
    );
    return { ok: true, value: toOperation(res.rows[0]) };
  }

  async get(id: string): Promise<Operation | null> {
    const res = await dbPool.query('SELECT * FROM oc_operations WHERE id = $1', [id]);
    return res.rows[0] ? toOperation(res.rows[0]) : null;
  }

  async listForClient(clientId: string, filters?: { type?: OperationType; status?: OperationStatus }): Promise<Operation[]> {
    let query = 'SELECT * FROM oc_operations WHERE client_id = $1';
    const params: string[] = [clientId];
    if (filters?.type) { params.push(filters.type); query += ` AND type = $${params.length}`; }
    if (filters?.status) { params.push(filters.status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY created_at DESC LIMIT 20';
    const res = await dbPool.query(query, params);
    return res.rows.map(toOperation);
  }

  /**
   * Real crash/restart recovery. Called once at server startup. Any row still marked
   * 'running' at this point is, by definition, real evidence that the process which was
   * executing it no longer exists (this fresh process never started it) — never left
   * silently showing "in progress" forever, and never guessed to have succeeded or
   * failed. Honestly marked 'interrupted' with a real evidence entry explaining why.
   */
  async recoverInterruptedOperations(): Promise<number> {
    const res = await dbPool.query(
      `UPDATE oc_operations SET status = 'interrupted', updated_at = NOW(),
       evidence = evidence || $1::jsonb
       WHERE status = 'running' RETURNING id`,
      [JSON.stringify([{ at: new Date().toISOString(), message: 'Process restarted while this operation was running — it did not complete or fail cleanly. Start a new run to retry.' }])]
    );
    return res.rowCount ?? 0;
  }
}

export const operationService = new OperationService();
