/**
 * Test Defect Management — real, enforced state machine, matching this
 * session's own Approval Workflow Engine precedent
 * (`InvalidTransitionError`, an explicit `ALLOWED_TRANSITIONS` table,
 * never a silently-coerced status). See migration 049's doc comment for
 * why this is a NEW table, not a reuse of `oc_defects` (a genuinely
 * different, existing, operational-defect concept).
 *
 * "Do not close a defect simply because code changed. Close only after
 * successful retest" is enforced structurally: CLOSED is only reachable
 * from RETEST_PASSED (a real retest that actually passed), WONT_FIX, or
 * DUPLICATE — never directly from OPEN/IN_PROGRESS/FIXED.
 */
import { sharedPool } from './db-pool.js';

export type DefectStatus = 'open' | 'in_progress' | 'fixed' | 'ready_for_retest' | 'retest_failed' | 'retest_passed' | 'closed' | 'wont_fix' | 'duplicate';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface TestDefect {
  id: string; clientId: string; testCaseId: string; executionId: string; title: string;
  requirementSourceType: string | null; requirementSourceId: string | null;
  environment: string; device: string; browser: string; stepsToReproduce: string;
  expectedResult: string; actualResult: string; severity: Priority; priority: Priority;
  status: DefectStatus; assignedOwner: string | null; createdBy: string | null; createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; test_case_id: string; execution_id: string; title: string;
  requirement_source_type: string | null; requirement_source_id: string | null;
  environment: string; device: string; browser: string; steps_to_reproduce: string;
  expected_result: string; actual_result: string; severity: Priority; priority: Priority;
  status: DefectStatus; assigned_owner: string | null; created_by: string | null; created_at: Date; updated_at: Date;
};

function toDefect(r: Row): TestDefect {
  return {
    id: r.id, clientId: r.client_id, testCaseId: r.test_case_id, executionId: r.execution_id, title: r.title,
    requirementSourceType: r.requirement_source_type, requirementSourceId: r.requirement_source_id,
    environment: r.environment, device: r.device, browser: r.browser, stepsToReproduce: r.steps_to_reproduce,
    expectedResult: r.expected_result, actualResult: r.actual_result, severity: r.severity, priority: r.priority,
    status: r.status, assignedOwner: r.assigned_owner, createdBy: r.created_by,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export class InvalidDefectTransitionError extends Error {
  constructor(from: DefectStatus, to: DefectStatus) {
    super(`Cannot move a defect from "${from}" to "${to}".`);
    this.name = 'InvalidDefectTransitionError';
  }
}

// Real, enforced state machine — CLOSED only reachable from a genuinely
// successful outcome (RETEST_PASSED) or an explicit staff decision
// (WONT_FIX/DUPLICATE), never directly from an unverified state.
const ALLOWED_TRANSITIONS: Record<DefectStatus, DefectStatus[]> = {
  open: ['in_progress', 'wont_fix', 'duplicate'],
  in_progress: ['fixed', 'wont_fix'],
  fixed: ['ready_for_retest'],
  ready_for_retest: [], // only the retest() flow may leave this state — see test-execution-service.ts
  retest_failed: ['in_progress'],
  retest_passed: ['closed'],
  closed: [],
  wont_fix: ['closed'],
  duplicate: ['closed'],
};

export class TestDefectService {
  async get(id: string): Promise<TestDefect | null> {
    const res = await sharedPool.query<Row>(`SELECT * FROM test_defects WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toDefect(row) : null;
  }

  async list(clientId: string): Promise<TestDefect[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM test_defects WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toDefect);
  }

  async create(data: {
    clientId: string; testCaseId: string; executionId: string; title: string;
    requirementSourceType: string | null; requirementSourceId: string | null;
    environment: string; device: string; browser: string; stepsToReproduce: string;
    expectedResult: string; actualResult: string; severity: Priority; priority: Priority;
  }, actor: string | null): Promise<TestDefect> {
    const res = await sharedPool.query<Row>(
      `INSERT INTO test_defects (client_id, test_case_id, execution_id, title, requirement_source_type, requirement_source_id, environment, device, browser, steps_to_reproduce, expected_result, actual_result, severity, priority, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [data.clientId, data.testCaseId, data.executionId, data.title, data.requirementSourceType, data.requirementSourceId,
        data.environment, data.device, data.browser, data.stepsToReproduce, data.expectedResult, data.actualResult,
        data.severity, data.priority, actor]
    );
    const row = res.rows[0];
    if (!row) throw new Error('test_defects insert returned no row');
    return toDefect(row);
  }

  /** Staff-driven manual transitions only — the ready_for_retest -> retest_passed/retest_failed edge is driven exclusively by a real retest, see test-execution-service.ts. */
  async updateStatus(id: string, status: DefectStatus, _actor: string | null, assignedOwner?: string): Promise<TestDefect> {
    const current = await this.get(id);
    if (!current) throw new Error(`Test defect ${id} not found.`);
    if (!ALLOWED_TRANSITIONS[current.status].includes(status)) throw new InvalidDefectTransitionError(current.status, status);
    const res = await sharedPool.query<Row>(
      `UPDATE test_defects SET status = $1, assigned_owner = COALESCE($2, assigned_owner), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, assignedOwner ?? null, id]
    );
    return toDefect(res.rows[0]!);
  }

  /** Used only by the retest flow — bypasses the manual transition table since ready_for_retest -> retest_* is a real, automatic consequence of a retest execution, not a staff click. */
  async applyRetestOutcome(id: string, passed: boolean): Promise<TestDefect> {
    const current = await this.get(id);
    if (!current) throw new Error(`Test defect ${id} not found.`);
    if (current.status !== 'ready_for_retest') {
      throw new Error(`Defect ${id} is "${current.status}", not "ready_for_retest" — mark it ready for retest before retesting.`);
    }
    const res = await sharedPool.query<Row>(
      `UPDATE test_defects SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [passed ? 'retest_passed' : 'retest_failed', id]
    );
    return toDefect(res.rows[0]!);
  }
}
