/**
 * Test Execution recording + the real, enforced retest workflow.
 *
 * "Never mark a test PASS without actual validation evidence" is
 * enforced structurally: a PASS or FAIL execution requires a real,
 * non-empty `actualResult` AND at least one real evidence entry — never
 * silently accepted as a bare status flip.
 *
 * On a real FAIL, a real `test_defects` row is created automatically
 * (via TestDefectService), carrying the test case's own steps/expected
 * result forward so the defect is reproducible without re-deriving it —
 * never a bare "it failed" with no context.
 */
import { sharedPool } from './db-pool.js';
import { TestDefectService, type DefectStatus } from './test-defect-service.js';

export type ExecutionStatus = 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_executed' | 'not_applicable';

export interface EvidenceItem {
  type: 'screenshot' | 'video' | 'console_log' | 'network_log' | 'api_response' | 'database_evidence' | 'note';
  description: string;
  reference?: string;
}

export interface TestExecution {
  id: string; testCaseId: string; clientId: string; runId: string | null; status: ExecutionStatus;
  environment: string; device: string; browser: string; actualResult: string; evidence: EvidenceItem[];
  executedBy: string | null; executedAt: string; durationMs: number | null; defectId: string | null;
  retestOfExecutionId: string | null; createdAt: string;
}

type Row = {
  id: string; test_case_id: string; client_id: string; run_id: string | null; status: ExecutionStatus;
  environment: string; device: string; browser: string; actual_result: string; evidence: EvidenceItem[];
  executed_by: string | null; executed_at: Date; duration_ms: number | null; defect_id: string | null;
  retest_of_execution_id: string | null; created_at: Date;
};

function toExecution(r: Row): TestExecution {
  return {
    id: r.id, testCaseId: r.test_case_id, clientId: r.client_id, runId: r.run_id, status: r.status,
    environment: r.environment, device: r.device, browser: r.browser, actualResult: r.actual_result,
    evidence: r.evidence || [], executedBy: r.executed_by, executedAt: r.executed_at.toISOString(),
    durationMs: r.duration_ms, defectId: r.defect_id, retestOfExecutionId: r.retest_of_execution_id,
    createdAt: r.created_at.toISOString(),
  };
}

export interface RecordExecutionInput {
  status: ExecutionStatus; environment?: string; device?: string; browser?: string; actualResult?: string;
  evidence?: EvidenceItem[]; durationMs?: number; runId?: string; retestOfExecutionId?: string;
}

export class MissingEvidenceError extends Error {
  constructor(status: ExecutionStatus) {
    super(`A "${status}" result requires both a real actualResult and at least one real evidence entry — never a bare status flip.`);
    this.name = 'MissingEvidenceError';
  }
}

export class TestExecutionService {
  private defects = new TestDefectService();

  async recordExecution(clientId: string, testCaseId: string, input: RecordExecutionInput, actor: string | null): Promise<TestExecution> {
    const caseRes = await sharedPool.query(`SELECT * FROM test_cases WHERE id = $1 AND client_id = $2`, [testCaseId, clientId]);
    const testCase = caseRes.rows[0];
    if (!testCase) throw new Error(`Test case ${testCaseId} not found for this client.`);

    if (['pass', 'fail'].includes(input.status)) {
      if (!input.actualResult?.trim() || !input.evidence?.length) throw new MissingEvidenceError(input.status);
    }

    const res = await sharedPool.query<Row>(
      `INSERT INTO test_executions (test_case_id, client_id, run_id, status, environment, device, browser, actual_result, evidence, executed_by, duration_ms, retest_of_execution_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [testCaseId, clientId, input.runId ?? null, input.status, input.environment || testCase.environment || '',
        input.device || testCase.device || '', input.browser || testCase.browser || '', input.actualResult || '',
        JSON.stringify(input.evidence || []), actor, input.durationMs ?? null, input.retestOfExecutionId ?? null]
    );
    let execution = toExecution(res.rows[0]!);

    if (input.status === 'fail') {
      const defect = await this.defects.create({
        clientId, testCaseId, executionId: execution.id, title: `FAILED: ${testCase.title}`,
        requirementSourceType: testCase.source_type === 'manual' ? null : testCase.source_type,
        requirementSourceId: testCase.source_id, environment: execution.environment, device: execution.device,
        browser: execution.browser, stepsToReproduce: (testCase.steps || []).join('\n') || 'See test case for steps.',
        expectedResult: testCase.expected_result || '', actualResult: execution.actualResult,
        severity: testCase.severity, priority: testCase.priority,
      }, actor);
      const updated = await sharedPool.query<Row>(`UPDATE test_executions SET defect_id = $1 WHERE id = $2 RETURNING *`, [defect.id, execution.id]);
      execution = toExecution(updated.rows[0]!);
    }
    return execution;
  }

  /** The real, enforced retest flow — requires the defect to genuinely be READY_FOR_RETEST first. */
  async retest(defectId: string, input: RecordExecutionInput, actor: string | null): Promise<{ execution: TestExecution; defectStatus: DefectStatus }> {
    const defect = await this.defects.get(defectId);
    if (!defect) throw new Error(`Test defect ${defectId} not found.`);
    if (defect.status !== 'ready_for_retest') {
      throw new Error(`Defect ${defectId} is "${defect.status}", not "ready_for_retest" — mark it ready for retest first.`);
    }
    const execution = await this.recordExecution(defect.clientId, defect.testCaseId, { ...input, retestOfExecutionId: defect.executionId }, actor);
    const updatedDefect = await this.defects.applyRetestOutcome(defectId, execution.status === 'pass');
    return { execution, defectStatus: updatedDefect.status };
  }

  async getHistory(testCaseId: string): Promise<TestExecution[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM test_executions WHERE test_case_id = $1 ORDER BY executed_at DESC`, [testCaseId]);
    return res.rows.map(toExecution);
  }

  async listForClient(clientId: string): Promise<TestExecution[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM test_executions WHERE client_id = $1 ORDER BY executed_at DESC`, [clientId]);
    return res.rows.map(toExecution);
  }

  /** Real run-to-run comparison — identifies genuine regressions and fixes, never inferred. */
  async compareRuns(runIdA: string, runIdB: string): Promise<{ regressed: string[]; fixed: string[]; unchanged: string[] }> {
    const [a, b] = await Promise.all([
      sharedPool.query<Row>(`SELECT DISTINCT ON (test_case_id) * FROM test_executions WHERE run_id = $1 ORDER BY test_case_id, executed_at DESC`, [runIdA]),
      sharedPool.query<Row>(`SELECT DISTINCT ON (test_case_id) * FROM test_executions WHERE run_id = $1 ORDER BY test_case_id, executed_at DESC`, [runIdB]),
    ]);
    const mapA = new Map(a.rows.map(r => [r.test_case_id, r.status]));
    const mapB = new Map(b.rows.map(r => [r.test_case_id, r.status]));
    const regressed: string[] = []; const fixed: string[] = []; const unchanged: string[] = [];
    const allCaseIds = new Set([...mapA.keys(), ...mapB.keys()]);
    for (const caseId of allCaseIds) {
      const statusA = mapA.get(caseId); const statusB = mapB.get(caseId);
      if (statusA === 'pass' && statusB === 'fail') regressed.push(caseId);
      else if (statusA === 'fail' && statusB === 'pass') fixed.push(caseId);
      else unchanged.push(caseId);
    }
    return { regressed, fixed, unchanged };
  }
}
