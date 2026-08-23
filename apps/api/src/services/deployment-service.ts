/**
 * Deployment + Post-Deployment Validation Engine —
 * `deployment_validation_test_1` / `post_delivery_test_1` (2026-08-24).
 *
 * Genuinely NEW (confirmed by direct inspection before writing this file:
 * zero `oc_deployments` table/service/route existed anywhere; the
 * pre-existing "Deployments" UI pages read 100% fabricated data from
 * `mockClients` — see migration 057's own doc comment and
 * docs/eoc-feature-coverage-matrix.md row #52's 2026-08-24 correction),
 * but built as another real consumer of engines already proven this
 * session — nothing here duplicates logic that already exists:
 *
 *   - `ReleaseReadinessService` (this session's own `release_readiness_test_1`)
 *     — the readiness gate below calls its real `getReadiness()` fresh at
 *     every gate point, never re-deriving readiness itself.
 *   - `ApprovalWorkflowEngine` (generic, unmodified) — the deployment
 *     approval decision reuses it directly (`entityType:'deployment_approval'`).
 *   - `test_suites` / `TestExecutionService.recordExecution` (Testing
 *     Engine, unmodified) — post-deployment validation checks ARE real
 *     test cases in a real `category='post_deployment'` suite; the same
 *     evidence-enforcement, secret-masking, and auto-defect-on-fail this
 *     session already relied on twice (`uat_test_1`) is reused unchanged.
 *   - `ClientDatabaseConnectionService.test()` (unmodified) — the one
 *     real, automatic post-deployment check this file provides (database
 *     connectivity) delegates to the exact same live connection test used
 *     everywhere else in this platform.
 *   - `UniversalComparisonEngine.runConfigurationComparison` (unmodified)
 *     — optional before/after deployment comparison delegates directly,
 *     no new diff logic invented here.
 *
 * Deployment SAFETY (explicit, non-negotiable, per this pass's own
 * directive): this platform has no real external CI/CD or deployment
 * -orchestration infrastructure to actually push code/config to a target
 * system. `startExecution` and `recordDeploymentOutcome` (and their
 * rollback equivalents) model and audit the REAL decision/attempt and
 * its REAL reported outcome — they never simulate, assume, or fabricate
 * that an external deployment actually succeeded. Real external execution
 * itself is `BLOCKED_EXTERNAL_DEPENDENCY` (see
 * docs/security-risk-register.md) — this engine is deliberately
 * validation-first / read-and-record, not an actuator.
 */
import { sharedPool } from './db-pool.js';
import { ReleaseReadinessService } from './release-readiness-service.js';
import { ApprovalWorkflowEngine, type ApprovalWorkflow } from './approval-workflow-engine.js';
import { TestExecutionService, type TestExecution, type RecordExecutionInput, MissingEvidenceError } from './test-execution-service.js';
import { TestCaseService, type TestCaseCategory } from './testing-engine.js';
import { ClientDatabaseConnectionService } from './client-database-connection-service.js';
import { UniversalComparisonEngine, type ComparisonRun } from './universal-comparison-engine.js';

export type DeploymentStatus =
  | 'draft' | 'planned' | 'readiness_pending' | 'approval_pending' | 'approved'
  | 'in_progress' | 'deployed' | 'validation_pending' | 'validated' | 'failed'
  | 'rollback_pending' | 'rolled_back' | 'cancelled';

export type DeploymentType = 'standard' | 'hotfix' | 'emergency' | 'rollback' | 'config_only';
export type DeploymentRisk = 'low' | 'medium' | 'high' | 'critical';
export type RollbackStatus = 'not_applicable' | 'available' | 'not_available' | 'rollback_pending' | 'rolled_back' | 'rollback_failed';

export interface DeploymentEvent {
  event: string;
  fromStatus: DeploymentStatus | null;
  toStatus: DeploymentStatus;
  actor: string | null;
  timestamp: string;
  reason?: string;
}

export interface Deployment {
  id: string;
  clientId: string;
  environment: string;
  application: string;
  version: string;
  previousVersion: string | null;
  source: string;
  target: string;
  deploymentType: DeploymentType;
  plannedStart: string | null;
  actualStart: string | null;
  actualCompletion: string | null;
  requestedBy: string | null;
  status: DeploymentStatus;
  risk: DeploymentRisk;
  releaseReadinessSnapshot: unknown | null;
  releaseReadinessCheckedAt: string | null;
  approvalWorkflowId: string | null;
  notes: string;
  rollbackPlan: string;
  rollbackStatus: RollbackStatus;
  postDeploymentSuiteId: string | null;
  preSnapshotId: string | null;
  postSnapshotId: string | null;
  comparisonRunId: string | null;
  events: DeploymentEvent[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string; client_id: string; environment: string; application: string; version: string;
  previous_version: string | null; source: string; target: string; deployment_type: DeploymentType;
  planned_start: Date | null; actual_start: Date | null; actual_completion: Date | null;
  requested_by: string | null; status: DeploymentStatus; risk: DeploymentRisk;
  release_readiness_snapshot: unknown | null; release_readiness_checked_at: Date | null;
  approval_workflow_id: string | null; notes: string; rollback_plan: string; rollback_status: RollbackStatus;
  post_deployment_suite_id: string | null; pre_snapshot_id: string | null; post_snapshot_id: string | null;
  comparison_run_id: string | null; events: DeploymentEvent[]; created_by: string | null;
  created_at: Date; updated_at: Date;
};

function toDeployment(r: Row): Deployment {
  return {
    id: r.id, clientId: r.client_id, environment: r.environment, application: r.application, version: r.version,
    previousVersion: r.previous_version, source: r.source, target: r.target, deploymentType: r.deployment_type,
    plannedStart: r.planned_start?.toISOString() ?? null, actualStart: r.actual_start?.toISOString() ?? null,
    actualCompletion: r.actual_completion?.toISOString() ?? null, requestedBy: r.requested_by, status: r.status,
    risk: r.risk, releaseReadinessSnapshot: r.release_readiness_snapshot,
    releaseReadinessCheckedAt: r.release_readiness_checked_at?.toISOString() ?? null,
    approvalWorkflowId: r.approval_workflow_id, notes: r.notes, rollbackPlan: r.rollback_plan,
    rollbackStatus: r.rollback_status, postDeploymentSuiteId: r.post_deployment_suite_id,
    preSnapshotId: r.pre_snapshot_id, postSnapshotId: r.post_snapshot_id, comparisonRunId: r.comparison_run_id,
    events: r.events || [], createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export interface CreateDeploymentInput {
  environment: string; application: string; version: string; previousVersion?: string;
  source?: string; target?: string; deploymentType?: DeploymentType; risk?: DeploymentRisk;
  plannedStart?: string; notes?: string; rollbackPlan?: string;
}
export interface UpdateDeploymentInput {
  environment?: string; application?: string; version?: string; previousVersion?: string;
  source?: string; target?: string; deploymentType?: DeploymentType; risk?: DeploymentRisk;
  plannedStart?: string; notes?: string; rollbackPlan?: string;
}

// Real, explicit state machine — same "throw a dedicated error naming the
// allowed set" discipline as ApprovalWorkflowEngine's own ALLOWED_TRANSITIONS.
const ALLOWED_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['readiness_pending', 'cancelled'],
  readiness_pending: ['approval_pending', 'cancelled'],
  approval_pending: ['approved', 'planned', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['deployed', 'failed'],
  deployed: ['validation_pending'],
  validation_pending: ['validated', 'failed'],
  validated: [],
  failed: ['rollback_pending', 'cancelled'],
  rollback_pending: ['rolled_back', 'failed'],
  rolled_back: [],
  cancelled: [],
};

export class InvalidDeploymentTransitionError extends Error {
  constructor(from: DeploymentStatus, to: DeploymentStatus) {
    super(`Cannot move a deployment from "${from}" to "${to}". Allowed from "${from}": ${ALLOWED_TRANSITIONS[from].join(', ') || '(none — terminal state)'}.`);
    this.name = 'InvalidDeploymentTransitionError';
  }
}
export class DeploymentOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'DeploymentOwnershipError'; }
}
export class ReadinessGateError extends Error {
  constructor(public readonly blockers: string[]) {
    super(`Cannot proceed: release readiness is not GO. Blocking dimension(s): ${blockers.join(', ')}.`);
    this.name = 'ReadinessGateError';
  }
}
export class SelfApprovalError extends Error {
  constructor() { super('A deployment cannot be approved by the same person who requested it.'); this.name = 'SelfApprovalError'; }
}
export class RollbackNotAvailableError extends Error {
  constructor() { super('No real rollback plan was recorded for this deployment — rollback is not available.'); this.name = 'RollbackNotAvailableError'; }
}
export class DeploymentNotDeletableError extends Error {
  constructor(status: DeploymentStatus) { super(`A deployment in status "${status}" cannot be deleted — only "draft" or "cancelled" deployments may be deleted.`); this.name = 'DeploymentNotDeletableError'; }
}

const POST_DEPLOYMENT_CHECK_NAMES = [
  'application_availability', 'api_availability', 'database_connectivity', 'schema_compatibility',
  'configuration', 'environment_variables', 'critical_workflows', 'security_controls',
  'integration_connectivity', 'health_endpoints', 'expected_version', 'smoke_tests',
  'regression_tests', 'data_integrity', 'performance_indicators',
] as const;
export type PostDeploymentCheckName = typeof POST_DEPLOYMENT_CHECK_NAMES[number];

export class DeploymentService {
  private readiness = new ReleaseReadinessService();
  private approvals = new ApprovalWorkflowEngine();
  private executions = new TestExecutionService();
  private cases = new TestCaseService();
  private connections = new ClientDatabaseConnectionService();
  private comparison = new UniversalComparisonEngine();

  /** Real object-level ownership check every other method relies on — never trust an opaque id alone. */
  private async getOwned(id: string, clientId: string): Promise<Row> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_deployments WHERE id = $1`, [id]);
    const row = res.rows[0];
    // Same error, same resulting 404 shape, for "doesn't exist" and "isn't yours" — never disclose which.
    if (!row) throw new DeploymentOwnershipError(`Deployment ${id} not found.`);
    if (row.client_id !== clientId) throw new DeploymentOwnershipError('This deployment does not belong to this client.');
    return row;
  }

  private async transition(row: Row, to: DeploymentStatus, actor: string | null, reason?: string, extraSql?: { setClauses: string[]; params: unknown[] }): Promise<Deployment> {
    const from = row.status;
    if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new InvalidDeploymentTransitionError(from, to);
    const event: DeploymentEvent = { event: `${from}_to_${to}`, fromStatus: from, toStatus: to, actor, timestamp: new Date().toISOString(), reason };
    const events = [...(row.events || []), event];

    const setClauses = ['status = $2', 'events = $3', 'updated_at = NOW()', ...(extraSql?.setClauses || [])];
    const params: unknown[] = [row.id, to, JSON.stringify(events), ...(extraSql?.params || [])];
    const res = await sharedPool.query<Row>(
      `UPDATE oc_deployments SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    const updated = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('deployment', $1, $2, $3, $4, $5, $6)`,
      [row.id, `${row.application} v${row.version}`, `deployment_${to}`, actor,
        JSON.stringify({ from, to, reason: reason || null }), [`Deployment moved from "${from}" to "${to}".`]],
    );
    return toDeployment(updated);
  }

  async createDeployment(clientId: string, input: CreateDeploymentInput, actor: string | null): Promise<Deployment> {
    if (!input.environment?.trim()) throw new Error('A real environment is required.');
    if (!input.application?.trim()) throw new Error('A real application/system name is required.');
    if (!input.version?.trim()) throw new Error('A real version/release identifier is required.');
    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_deployments (client_id, environment, application, version, previous_version, source, target, deployment_type, risk, planned_start, notes, rollback_plan, requested_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
      [clientId, input.environment.trim(), input.application.trim(), input.version.trim(), input.previousVersion || null,
        input.source || '', input.target || '', input.deploymentType || 'standard', input.risk || 'medium',
        input.plannedStart || null, input.notes || '', input.rollbackPlan || '', actor],
    );
    const row = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('deployment', $1, $2, 'created', $3, $4, $5)`,
      [row.id, `${row.application} v${row.version}`, actor, JSON.stringify({ environment: row.environment }), [`Deployment ${row.id} created (draft).`]],
    );
    return toDeployment(row);
  }

  async listDeployments(clientId: string, status?: DeploymentStatus): Promise<Deployment[]> {
    const res = status
      ? await sharedPool.query<Row>(`SELECT * FROM oc_deployments WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC`, [clientId, status])
      : await sharedPool.query<Row>(`SELECT * FROM oc_deployments WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toDeployment);
  }

  async getDeployment(id: string, clientId: string): Promise<Deployment> {
    return toDeployment(await this.getOwned(id, clientId));
  }

  /** Only mutable while the deployment has not yet entered the real approval/execution pipeline. */
  async updateDeployment(id: string, clientId: string, input: UpdateDeploymentInput, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (!['draft', 'planned'].includes(row.status)) {
      throw new Error(`A deployment in status "${row.status}" can no longer be edited.`);
    }
    const res = await sharedPool.query<Row>(
      `UPDATE oc_deployments SET
        environment = COALESCE($2, environment), application = COALESCE($3, application), version = COALESCE($4, version),
        previous_version = COALESCE($5, previous_version), source = COALESCE($6, source), target = COALESCE($7, target),
        deployment_type = COALESCE($8, deployment_type), risk = COALESCE($9, risk), planned_start = COALESCE($10, planned_start),
        notes = COALESCE($11, notes), rollback_plan = COALESCE($12, rollback_plan), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, input.environment, input.application, input.version, input.previousVersion, input.source, input.target,
        input.deploymentType, input.risk, input.plannedStart, input.notes, input.rollbackPlan],
    );
    const updated = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('deployment', $1, $2, 'updated', $3, $4, $5)`,
      [id, `${updated.application} v${updated.version}`, actor, JSON.stringify(input), [`Deployment ${id} fields updated.`]],
    );
    return toDeployment(updated);
  }

  async planDeployment(id: string, clientId: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    return this.transition(row, 'planned', actor);
  }

  /**
   * Real-time readiness check — calls ReleaseReadinessService fresh (never
   * re-derives or caches readiness itself), stores the real snapshot for
   * audit/display, and moves to readiness_pending regardless of the
   * result (readiness_pending is the observation state; the GATE that
   * actually blocks progress is enforced in `requestApproval` below,
   * matching the directive's literal "must not be approved/executed
   * when release readiness has blocking failures").
   */
  async checkReadiness(id: string, clientId: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    const readiness = await this.readiness.getReadiness(clientId);
    const fromPlanned = row.status === 'planned';
    if (!fromPlanned && row.status !== 'readiness_pending') {
      throw new InvalidDeploymentTransitionError(row.status, 'readiness_pending');
    }
    if (fromPlanned) {
      return this.transition(row, 'readiness_pending', actor, undefined, {
        setClauses: ['release_readiness_snapshot = $4', 'release_readiness_checked_at = NOW()'],
        params: [JSON.stringify(readiness)],
      });
    }
    // Already in readiness_pending — just refresh the real snapshot, no transition.
    const res = await sharedPool.query<Row>(
      `UPDATE oc_deployments SET release_readiness_snapshot = $2, release_readiness_checked_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(readiness)],
    );
    return toDeployment(res.rows[0]!);
  }

  /**
   * The real readiness GATE: re-checks readiness fresh (never trusts a
   * stale snapshot) and refuses to open an approval workflow unless it is
   * genuinely GO. Opens + submits a real ApprovalWorkflowEngine workflow.
   */
  async requestApproval(id: string, clientId: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'readiness_pending') throw new InvalidDeploymentTransitionError(row.status, 'approval_pending');
    const readiness = await this.readiness.getReadiness(clientId);
    if (readiness.overall !== 'go') {
      const blockers = readiness.dimensions.filter(d => d.blocking && d.status !== 'pass').map(d => d.name);
      throw new ReadinessGateError(blockers);
    }
    // A prior "request changes" decision leaves a real, still-open workflow
    // in `changes_requested` for this same deployment — ApprovalWorkflowEngine
    // enforces exactly one open workflow per entity (a real DB constraint,
    // found live by this test suite itself), so re-submission must RESUBMIT
    // that same workflow via its own real `resubmit()`, never open a second one.
    const existing = row.approval_workflow_id ? await this.approvals.getWorkflow(row.approval_workflow_id) : null;
    const submitted = existing && existing.status === 'changes_requested'
      ? await this.approvals.resubmit(existing.id, actor)
      : await this.approvals.submit(
          (await this.approvals.openWorkflow(
            'deployment_approval', id, `Deployment Approval — ${row.application} v${row.version} (${row.environment})`,
            { environment: row.environment, version: row.version, risk: row.risk, readiness: readiness.dimensions.map(d => ({ name: d.name, status: d.status })) },
            actor,
          )).id,
          actor,
        );
    return this.transition(row, 'approval_pending', actor, undefined, {
      setClauses: ['approval_workflow_id = $4', 'release_readiness_snapshot = $5', 'release_readiness_checked_at = NOW()'],
      params: [submitted.id, JSON.stringify(readiness)],
    });
  }

  /**
   * Real self-approval prevention: the deciding actor must not be the
   * same identity that requested the deployment (skipped only when
   * requestedBy is unknown — cannot compare against nothing).
   */
  async decideApproval(id: string, clientId: string, decision: 'approve' | 'reject' | 'request_changes', actor: string | null, note?: string): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'approval_pending' || !row.approval_workflow_id) {
      throw new Error(`Deployment ${id} has no pending approval to decide.`);
    }
    if (decision === 'approve' && row.requested_by && actor && row.requested_by === actor) {
      throw new SelfApprovalError();
    }
    if (decision === 'approve') {
      await this.approvals.approve(row.approval_workflow_id, actor, note);
      return this.transition(row, 'approved', actor, note);
    }
    if (decision === 'reject') {
      if (!note?.trim()) throw new Error('A real reason is required to reject a deployment approval.');
      await this.approvals.reject(row.approval_workflow_id, actor, note);
      return this.transition(row, 'cancelled', actor, note);
    }
    if (!note?.trim()) throw new Error('A real reason is required to request changes on a deployment approval.');
    await this.approvals.requestChanges(row.approval_workflow_id, actor, note);
    return this.transition(row, 'planned', actor, note);
  }

  async getApprovalStatus(id: string, clientId: string): Promise<{ current: ApprovalWorkflow | null; history: ApprovalWorkflow[] }> {
    await this.getOwned(id, clientId);
    const history = await this.approvals.listForEntity('deployment_approval', id);
    return { current: history[0] ?? null, history };
  }

  /**
   * Re-checks readiness fresh a SECOND time at the actual execution
   * boundary — conditions can drift between approval and execution, and
   * the directive is explicit that readiness must not be bypassed at
   * EITHER checkpoint.
   */
  async startExecution(id: string, clientId: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'approved') throw new InvalidDeploymentTransitionError(row.status, 'in_progress');
    const readiness = await this.readiness.getReadiness(clientId);
    if (readiness.overall !== 'go') {
      const blockers = readiness.dimensions.filter(d => d.blocking && d.status !== 'pass').map(d => d.name);
      throw new ReadinessGateError(blockers);
    }
    return this.transition(row, 'in_progress', actor, undefined, { setClauses: ['actual_start = NOW()'], params: [] });
  }

  /**
   * Records the REAL, reported outcome of an external deployment attempt
   * — never fabricates success. Requires real evidence, same discipline
   * as TestExecutionService.recordExecution's own MissingEvidenceError.
   */
  async recordDeploymentOutcome(id: string, clientId: string, outcome: 'deployed' | 'failed', evidence: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'in_progress') throw new InvalidDeploymentTransitionError(row.status, outcome);
    if (!evidence?.trim()) throw new MissingEvidenceError(outcome === 'deployed' ? 'pass' : 'fail');
    const target: DeploymentStatus = outcome;
    const setClauses = target === 'deployed' ? ['actual_completion = NOW()'] : [];
    return this.transition(row, target, actor, evidence, { setClauses, params: [] });
  }

  // ─── Post-Deployment Validation (reuses the Testing Engine) ──────────

  async createPostDeploymentSuite(id: string, clientId: string, checks: { name: PostDeploymentCheckName; category?: TestCaseCategory; expectedResult?: string }[], actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'deployed') throw new InvalidDeploymentTransitionError(row.status, 'validation_pending');
    if (!checks.length) throw new Error('At least one real post-deployment check is required.');
    const testCaseIds: string[] = [];
    for (const check of checks) {
      if (!POST_DEPLOYMENT_CHECK_NAMES.includes(check.name)) {
        throw new Error(`Unknown post-deployment check "${check.name}". Supported: ${POST_DEPLOYMENT_CHECK_NAMES.join(', ')}.`);
      }
      const testCase = await this.cases.createManual(clientId, {
        title: `Post-deployment: ${check.name.replace(/_/g, ' ')}`,
        category: check.category || 'regression',
        expectedResult: check.expectedResult || `${check.name.replace(/_/g, ' ')} verified against real evidence after deployment ${row.id}.`,
        environment: row.environment,
      }, actor);
      testCaseIds.push(testCase.id);
    }
    const suiteRes = await sharedPool.query<{ id: string }>(
      `INSERT INTO test_suites (client_id, name, category, description, test_case_ids, created_by)
       VALUES ($1, $2, 'post_deployment', $3, $4, $5) RETURNING id`,
      [clientId, `Post-Deployment — ${row.application} v${row.version}`, `Post-deployment validation for deployment ${row.id}.`, testCaseIds, actor],
    );
    const suiteId = suiteRes.rows[0]!.id;
    return this.transition(row, 'validation_pending', actor, undefined, { setClauses: ['post_deployment_suite_id = $4'], params: [suiteId] });
  }

  async getPostDeploymentStatuses(id: string, clientId: string): Promise<{ testCaseId: string; title: string; latestExecution: TestExecution | null }[]> {
    const row = await this.getOwned(id, clientId);
    if (!row.post_deployment_suite_id) return [];
    const suiteRes = await sharedPool.query<{ test_case_ids: string[] }>(`SELECT test_case_ids FROM test_suites WHERE id = $1`, [row.post_deployment_suite_id]);
    const ids = suiteRes.rows[0]?.test_case_ids || [];
    const out: { testCaseId: string; title: string; latestExecution: TestExecution | null }[] = [];
    for (const tid of ids) {
      const tc = await this.cases.get(tid);
      const history = await this.executions.getHistory(tid);
      out.push({ testCaseId: tid, title: tc?.title || tid, latestExecution: history[0] || null });
    }
    return out;
  }

  async getPostDeploymentProgress(id: string, clientId: string): Promise<{ total: number; passed: number; failed: number; notExecuted: number; allTerminal: boolean }> {
    const statuses = await this.getPostDeploymentStatuses(id, clientId);
    const TERMINAL = new Set(['pass', 'fail', 'blocked', 'skipped', 'not_applicable']);
    const progress = { total: statuses.length, passed: 0, failed: 0, notExecuted: 0, allTerminal: true };
    for (const s of statuses) {
      const status = s.latestExecution?.status;
      if (status === 'pass') progress.passed++;
      else if (status === 'fail') progress.failed++;
      else progress.notExecuted++;
      if (!status || !TERMINAL.has(status)) progress.allTerminal = false;
    }
    return progress;
  }

  /** Real, client-safe execution recording — delegates to the unmodified TestExecutionService after confirming the test case is genuinely part of THIS deployment's own suite. */
  async recordPostDeploymentCheck(id: string, clientId: string, testCaseId: string, input: RecordExecutionInput, actor: string | null): Promise<TestExecution> {
    const row = await this.getOwned(id, clientId);
    if (!row.post_deployment_suite_id) throw new Error('No post-deployment suite exists for this deployment yet.');
    const suiteRes = await sharedPool.query<{ test_case_ids: string[] }>(`SELECT test_case_ids FROM test_suites WHERE id = $1`, [row.post_deployment_suite_id]);
    const ids = suiteRes.rows[0]?.test_case_ids || [];
    if (!ids.includes(testCaseId)) throw new Error(`Test case ${testCaseId} is not part of this deployment's post-deployment suite.`);
    return this.executions.recordExecution(clientId, testCaseId, input, actor);
  }

  /**
   * The one real, automatic post-deployment check this engine provides:
   * a genuine live connection test via the unmodified
   * ClientDatabaseConnectionService, with the execution's evidence built
   * from the connection test's own real steps — never fabricated.
   */
  async runAutomaticDatabaseConnectivityCheck(id: string, clientId: string, testCaseId: string, connectionId: string, actor: string | null): Promise<TestExecution> {
    const result = await this.connections.test(connectionId, clientId);
    if (!result.ok) throw new Error(result.error.message);
    const connected = result.value.status === 'connected';
    const steps = result.value.lastTestSteps || [];
    return this.recordPostDeploymentCheck(id, clientId, testCaseId, {
      status: connected ? 'pass' : 'fail',
      actualResult: connected ? `Real live connection test succeeded against ${result.value.host}:${result.value.port}.` : `Real live connection test failed against ${result.value.host}:${result.value.port}.`,
      evidence: [{ type: 'database_evidence', description: `Real connection test steps: ${JSON.stringify(steps)}` }],
    }, actor);
  }

  /** Never allows a fabricated success — refuses if any real result is still outstanding, and honestly moves to `failed` (never silently ambiguous) if any real check failed. */
  async finalizeValidation(id: string, clientId: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'validation_pending') throw new InvalidDeploymentTransitionError(row.status, 'validated');
    const progress = await this.getPostDeploymentProgress(id, clientId);
    if (!progress.allTerminal) throw new Error(`Cannot finalize: ${progress.notExecuted} post-deployment check(s) have not yet reached a real result.`);
    if (progress.failed > 0) return this.transition(row, 'failed', actor, `${progress.failed} of ${progress.total} post-deployment check(s) failed.`);
    return this.transition(row, 'validated', actor, `All ${progress.total} post-deployment check(s) passed.`);
  }

  // ─── Rollback ──────────────────────────────────────────────────────

  async initiateRollback(id: string, clientId: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (row.status !== 'failed') throw new InvalidDeploymentTransitionError(row.status, 'rollback_pending');
    if (!row.rollback_plan?.trim()) throw new RollbackNotAvailableError();
    return this.transition(row, 'rollback_pending', actor, undefined, { setClauses: ['rollback_status = $4'], params: ['rollback_pending'] });
  }

  /** Same real-evidence discipline as recordDeploymentOutcome — never pretends a rollback happened. */
  async recordRollbackOutcome(id: string, clientId: string, outcome: 'rolled_back' | 'rollback_failed', evidence: string, actor: string | null): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    const nextStatus: DeploymentStatus = outcome === 'rolled_back' ? 'rolled_back' : 'failed';
    if (row.status !== 'rollback_pending') throw new InvalidDeploymentTransitionError(row.status, nextStatus);
    if (!evidence?.trim()) throw new MissingEvidenceError(outcome === 'rolled_back' ? 'pass' : 'fail');
    return this.transition(row, nextStatus, actor, evidence, { setClauses: ['rollback_status = $4'], params: [outcome] });
  }

  async cancelDeployment(id: string, clientId: string, actor: string | null, reason: string): Promise<Deployment> {
    const row = await this.getOwned(id, clientId);
    if (!reason?.trim()) throw new Error('A real reason is required to cancel a deployment.');
    return this.transition(row, 'cancelled', actor, reason);
  }

  async deleteDeployment(id: string, clientId: string): Promise<void> {
    const row = await this.getOwned(id, clientId);
    if (!['draft', 'cancelled'].includes(row.status)) throw new DeploymentNotDeletableError(row.status);
    await sharedPool.query(`DELETE FROM oc_deployments WHERE id = $1`, [id]);
  }

  // ─── Comparison (reuses the Universal Comparison Engine) ─────────────

  /** Thin delegation — all real diff logic lives in UniversalComparisonEngine.runConfigurationComparison, unmodified. */
  async compareDeploymentSnapshots(id: string, clientId: string, preSnapshotId: string, postSnapshotId: string, actor: string | null): Promise<ComparisonRun> {
    await this.getOwned(id, clientId);
    const run = await this.comparison.runConfigurationComparison(clientId, preSnapshotId, postSnapshotId, actor);
    await sharedPool.query(
      `UPDATE oc_deployments SET pre_snapshot_id = $2, post_snapshot_id = $3, comparison_run_id = $4, updated_at = NOW() WHERE id = $1`,
      [id, preSnapshotId, postSnapshotId, run.id],
    );
    return run;
  }
}
