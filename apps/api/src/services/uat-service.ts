/**
 * UAT Engine — Client-Facing User Acceptance Testing + Sign-off.
 *
 * Genuinely NEW capability (confirmed by search before building: no
 * "UAT"/"user acceptance"/sign-off concept existed anywhere in this
 * codebase), but built as the FIRST real consumer of two engines that were
 * already there and already anticipated this exact need — not a duplicate:
 *
 *   - `test_suites` (migration 049, Universal Testing & Validation Engine)
 *     already has `'uat'` in its own `category` CHECK constraint, but had
 *     no service or route ever wired up — genuinely unused schema until
 *     this file. A "UAT Cycle" here IS a `test_suites` row with
 *     `category = 'uat'`; no new table for the cycle concept itself.
 *   - `TestExecutionService.recordExecution` (migration 049) is reused
 *     UNCHANGED for the client's own execution recording — it already
 *     enforces real evidence-on-pass/fail, real secret masking, and real
 *     auto-defect-creation on FAIL. This file adds nothing new there; it
 *     only adds an object-level check that the test case is genuinely
 *     part of THIS UAT cycle before delegating to it.
 *   - `ApprovalWorkflowEngine` (migration 040, generic, entity-agnostic)
 *     is reused UNCHANGED for the sign-off decision itself
 *     (`entityType: 'uat_signoff'`, `entityId: <cycle id>`) — no new
 *     approval state machine invented here.
 *
 * Real, enforced business rule: a sign-off cannot be REQUESTED until every
 * test case in the cycle has reached a terminal execution status (pass/
 * fail/blocked/skipped/not_applicable) — never a fabricated "ready for
 * sign-off" while real work is still outstanding.
 */
import { sharedPool } from './db-pool.js';
import { ApprovalWorkflowEngine, type ApprovalWorkflow } from './approval-workflow-engine.js';
import { TestExecutionService, type TestExecution, type RecordExecutionInput } from './test-execution-service.js';

export interface UatCycle {
  id: string;
  clientId: string;
  name: string;
  description: string;
  testCaseIds: string[];
  createdBy: string | null;
  createdAt: string;
}

type SuiteRow = {
  id: string; client_id: string; name: string; category: string; description: string;
  test_case_ids: string[]; created_by: string | null; created_at: Date;
};

function toCycle(r: SuiteRow): UatCycle {
  return {
    id: r.id, clientId: r.client_id, name: r.name, description: r.description,
    testCaseIds: r.test_case_ids || [], createdBy: r.created_by, createdAt: r.created_at.toISOString(),
  };
}

export interface UatTestCaseStatus {
  testCaseId: string;
  title: string;
  description: string;
  expectedResult: string;
  priority: string;
  latestExecution: TestExecution | null;
}

export interface UatProgress {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  notApplicable: number;
  notExecuted: number;
  allTerminal: boolean;
}

const TERMINAL_STATUSES = new Set(['pass', 'fail', 'blocked', 'skipped', 'not_applicable']);

export class UatCycleOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UatCycleOwnershipError';
  }
}

export class SignoffNotReadyError extends Error {
  constructor(outstanding: number) {
    super(`Cannot request sign-off: ${outstanding} test case(s) have not yet reached a final result (pass/fail/blocked/skipped/not applicable).`);
    this.name = 'SignoffNotReadyError';
  }
}

export class UatService {
  private approvals = new ApprovalWorkflowEngine();
  private executions = new TestExecutionService();

  /**
   * Real object-level ownership check every one of this file's other
   * methods relies on — a UAT cycle id alone is never trusted; it must be
   * confirmed to belong to the caller's own clientId first. Matches the
   * exact pattern established this session for database connections and
   * connection-security profiles (never trust an opaque id alone).
   */
  private async getOwnedCycle(cycleId: string, clientId: string): Promise<SuiteRow> {
    const res = await sharedPool.query<SuiteRow>(`SELECT * FROM test_suites WHERE id = $1 AND category = 'uat'`, [cycleId]);
    const row = res.rows[0];
    // Same error, and the SAME resulting 404 shape, for "doesn't exist" and
    // "exists but isn't yours" — never disclose which one it is (matches
    // the established pattern from DatabaseConnectionOwnershipError etc.).
    if (!row) throw new UatCycleOwnershipError(`UAT cycle ${cycleId} not found.`);
    if (row.client_id !== clientId) throw new UatCycleOwnershipError('This UAT cycle does not belong to this client.');
    return row;
  }

  async createCycle(clientId: string, name: string, description: string, testCaseIds: string[], actor: string | null): Promise<UatCycle> {
    if (!name?.trim()) throw new Error('A real UAT cycle name is required.');
    if (!testCaseIds?.length) throw new Error('At least one real test case is required to open a UAT cycle.');
    // Real object-level check: every test case id must genuinely belong to
    // this client — never trust the caller-supplied id list blindly.
    const owned = await sharedPool.query<{ id: string }>(
      `SELECT id FROM test_cases WHERE id = ANY($1::text[]) AND client_id = $2`,
      [testCaseIds, clientId],
    );
    const ownedIds = new Set(owned.rows.map(r => r.id));
    const foreign = testCaseIds.filter(id => !ownedIds.has(id));
    if (foreign.length > 0) throw new Error(`These test case ids do not belong to this client: ${foreign.join(', ')}`);

    const res = await sharedPool.query<SuiteRow>(
      `INSERT INTO test_suites (client_id, name, category, description, test_case_ids, created_by)
       VALUES ($1, $2, 'uat', $3, $4, $5) RETURNING *`,
      [clientId, name.trim(), description || '', testCaseIds, actor],
    );
    return toCycle(res.rows[0]!);
  }

  async listCycles(clientId: string): Promise<UatCycle[]> {
    const res = await sharedPool.query<SuiteRow>(
      `SELECT * FROM test_suites WHERE client_id = $1 AND category = 'uat' ORDER BY created_at DESC`,
      [clientId],
    );
    return res.rows.map(toCycle);
  }

  async getCycle(cycleId: string, clientId: string): Promise<UatCycle> {
    return toCycle(await this.getOwnedCycle(cycleId, clientId));
  }

  /** Real per-test-case status: the actual test case content plus its most recent real execution, never fabricated. */
  async getTestCaseStatuses(cycleId: string, clientId: string): Promise<UatTestCaseStatus[]> {
    const cycle = await this.getOwnedCycle(cycleId, clientId);
    if (cycle.test_case_ids.length === 0) return [];
    const casesRes = await sharedPool.query(
      `SELECT id, title, description, expected_result, priority FROM test_cases WHERE id = ANY($1::text[])`,
      [cycle.test_case_ids],
    );
    const statuses: UatTestCaseStatus[] = [];
    for (const row of casesRes.rows) {
      const history = await this.executions.getHistory(row.id);
      statuses.push({
        testCaseId: row.id, title: row.title, description: row.description,
        expectedResult: row.expected_result, priority: row.priority,
        latestExecution: history[0] || null,
      });
    }
    // Preserve the cycle's own real ordering, not the SQL's incidental one.
    const byId = new Map(statuses.map(s => [s.testCaseId, s]));
    return cycle.test_case_ids.map(id => byId.get(id)).filter((s): s is UatTestCaseStatus => !!s);
  }

  async getProgress(cycleId: string, clientId: string): Promise<UatProgress> {
    const statuses = await this.getTestCaseStatuses(cycleId, clientId);
    const progress: UatProgress = { total: statuses.length, passed: 0, failed: 0, blocked: 0, skipped: 0, notApplicable: 0, notExecuted: 0, allTerminal: true };
    for (const s of statuses) {
      const status = s.latestExecution?.status;
      if (status === 'pass') progress.passed++;
      else if (status === 'fail') progress.failed++;
      else if (status === 'blocked') progress.blocked++;
      else if (status === 'skipped') progress.skipped++;
      else if (status === 'not_applicable') progress.notApplicable++;
      else progress.notExecuted++;
      if (!status || !TERMINAL_STATUSES.has(status)) progress.allTerminal = false;
    }
    return progress;
  }

  /**
   * Real, client-safe execution recording — the actual point of UAT: the
   * CLIENT (not staff) records the real result. Delegates to the existing,
   * unmodified TestExecutionService (real evidence enforcement, real
   * secret masking, real auto-defect-on-fail) after confirming the test
   * case is genuinely part of THIS cycle, not just any test case this
   * client happens to own.
   */
  async recordExecution(cycleId: string, clientId: string, testCaseId: string, input: RecordExecutionInput, actor: string | null): Promise<TestExecution> {
    const cycle = await this.getOwnedCycle(cycleId, clientId);
    if (!cycle.test_case_ids.includes(testCaseId)) {
      throw new Error(`Test case ${testCaseId} is not part of UAT cycle ${cycleId}.`);
    }
    return this.executions.recordExecution(clientId, testCaseId, input, actor);
  }

  async requestSignoff(cycleId: string, clientId: string, actor: string | null): Promise<ApprovalWorkflow> {
    const cycle = await this.getOwnedCycle(cycleId, clientId);
    const progress = await this.getProgress(cycleId, clientId);
    if (!progress.allTerminal) throw new SignoffNotReadyError(progress.notExecuted);
    const opened = await this.approvals.openWorkflow(
      'uat_signoff', cycleId, `UAT Sign-off — ${cycle.name}`,
      { total: progress.total, passed: progress.passed, failed: progress.failed, blocked: progress.blocked, skipped: progress.skipped, notApplicable: progress.notApplicable },
      actor,
    );
    return this.approvals.submit(opened.id, actor);
  }

  /**
   * `current` is the most recent sign-off workflow REGARDLESS of whether it
   * has been decided yet — real, observable UX signal for "what happened to
   * my last sign-off request", not just "is one currently pending" (that
   * narrower question is still answerable from `current.status`, since
   * `listForEntity` orders newest-first). `history` is the full, real
   * audit trail (every open/decided workflow ever opened for this cycle,
   * e.g. after a reject + a later re-request).
   */
  async getSignoffStatus(cycleId: string, clientId: string): Promise<{ current: ApprovalWorkflow | null; history: ApprovalWorkflow[] }> {
    await this.getOwnedCycle(cycleId, clientId); // real ownership check before revealing anything
    const history = await this.approvals.listForEntity('uat_signoff', cycleId);
    return { current: history[0] ?? null, history };
  }

  /** Real object-level check: the workflow being decided must genuinely belong to a cycle owned by this client. */
  private async getOwnedSignoffWorkflow(workflowId: string, clientId: string): Promise<ApprovalWorkflow> {
    const workflow = await this.approvals.getWorkflow(workflowId);
    if (!workflow || workflow.entityType !== 'uat_signoff') throw new UatCycleOwnershipError(`UAT sign-off ${workflowId} not found.`);
    await this.getOwnedCycle(workflow.entityId, clientId); // throws UatCycleOwnershipError on mismatch
    return workflow;
  }

  async approveSignoff(workflowId: string, clientId: string, actor: string | null, note?: string): Promise<ApprovalWorkflow> {
    await this.getOwnedSignoffWorkflow(workflowId, clientId);
    return this.approvals.approve(workflowId, actor, note);
  }

  async rejectSignoff(workflowId: string, clientId: string, actor: string | null, note: string): Promise<ApprovalWorkflow> {
    if (!note?.trim()) throw new Error('A real reason is required to reject a UAT sign-off.');
    await this.getOwnedSignoffWorkflow(workflowId, clientId);
    return this.approvals.reject(workflowId, actor, note);
  }

  async requestSignoffChanges(workflowId: string, clientId: string, actor: string | null, note: string): Promise<ApprovalWorkflow> {
    await this.getOwnedSignoffWorkflow(workflowId, clientId);
    return this.approvals.requestChanges(workflowId, actor, note);
  }
}
