/**
 * Release Readiness Engine — real go/no-go aggregation for a client's
 * go-live transition (uat_test_1's follow-on feature, 2026-08-24).
 *
 * Explicitly a DISTINCT capability from the per-client "Readiness" tab
 * (`apps/web/.../readiness/page.tsx`, which reframes the generic
 * client-health-score for lifecycle-progression UX) — this engine answers
 * a narrower, release-specific question: "is it honest to flip this
 * client to go-live right now", aggregating REAL signals from engines
 * that already exist, never recomputing or fabricating them:
 *
 *   - Lifecycle stage (`lifecycle-service.ts`, unmodified) — has the
 *     client's real lifecycle actually reached the `audit-passed` gate.
 *   - Migration Validation (`migration-validation-service.ts`, unmodified)
 *     — reads the most recently PERSISTED `oc_audit_log` validation
 *     result for this client. Deliberately does NOT call
 *     `runValidation()` itself (that mutates state and is a real,
 *     disclosed self-referential check — RISK-007 — triggered by its own
 *     dedicated route/button); a read-only readiness check must not have
 *     a side effect of writing new audit rows on every poll.
 *   - Testing Engine (`testing-engine.ts` + `test-execution-service.ts`,
 *     unmodified) — every `critical`-priority test case for the client
 *     must have a real, terminal `pass` execution.
 *   - Defect Engine (`test-defect-service.ts`, unmodified) — zero open
 *     critical/high-severity defects.
 *   - UAT Engine (`uat-service.ts`, THIS session's own prior feature,
 *     unmodified) — if the client has any UAT cycle at all, its most
 *     recent sign-off decision must be `approved`. If no UAT cycle
 *     exists, this is surfaced as a distinct, honest "not verified via
 *     UAT" informational dimension — never silently treated as pass
 *     (Universal Discovery principle: never assume missing info).
 *
 * No new table for "release readiness" itself — it is a real-time
 * computation over existing, already-persisted signals, not a cached or
 * stored verdict (so it can never go stale relative to its own inputs).
 *
 * The actual release sign-off decision reuses the generic, unmodified
 * `ApprovalWorkflowEngine` (`entityType: 'release_signoff'`, `entityId:
 * clientId` — no separate two-level ownership check needed the way UAT's
 * opaque cycle id required, since the entity IS the client id, already
 * fully protected by RBAC + tenant-access.ts on every route). Real,
 * enforced business rule: a release sign-off cannot be requested unless
 * the real aggregate computation says GO.
 */
import { sharedPool } from './db-pool.js';
import { LifecycleService } from './lifecycle-service.js';
import { TestCaseService } from './testing-engine.js';
import { TestExecutionService } from './test-execution-service.js';
import { TestDefectService } from './test-defect-service.js';
import { UatService } from './uat-service.js';
import { ApprovalWorkflowEngine, type ApprovalWorkflow } from './approval-workflow-engine.js';

// Canonical lifecycle stage order — mirrors validTransitions in
// lifecycle-service.ts (single source of truth for the transitions
// themselves; this is only the read-only ordering needed to ask "has the
// client reached at least X").
const LIFECYCLE_ORDER = [
  'organization-created', 'otp-sent', 'otp-verified', 'identity-verified', 'security-validated',
  'environment-registered', 'connectors-configured', 'discovery-running', 'discovery-complete',
  'assessment-running', 'assessment-complete', 'recommendations-generated', 'migration-planning',
  'migration-approved', 'migration-running', 'migration-complete', 'validation-running',
  'validation-passed', 'audit-running', 'audit-passed', 'go-live', 'hyper-care',
  'managed-services', 'continuous-monitoring', 'engineering-intelligence',
];
const GO_LIVE_GATE_STAGE = 'audit-passed';

export type DimensionStatus = 'pass' | 'fail' | 'not_determined';

export interface ReadinessDimension {
  name: string;
  status: DimensionStatus;
  detail: string;
  blocking: boolean; // whether a non-pass status here blocks GO
}

export interface ReleaseReadiness {
  clientId: string;
  overall: 'go' | 'no_go';
  dimensions: ReadinessDimension[];
  computedAt: string;
}

export class ReleaseReadinessService {
  private lifecycle = new LifecycleService();
  private cases = new TestCaseService();
  private executions = new TestExecutionService();
  private defects = new TestDefectService();
  private uat = new UatService();
  private approvals = new ApprovalWorkflowEngine();

  async getReadiness(clientId: string): Promise<ReleaseReadiness> {
    const dimensions: ReadinessDimension[] = await Promise.all([
      this.checkLifecycleStage(clientId),
      this.checkMigrationValidation(clientId),
      this.checkTesting(clientId),
      this.checkDefects(clientId),
      this.checkUat(clientId),
    ]);

    const overall: 'go' | 'no_go' = dimensions.some(d => d.blocking && d.status !== 'pass') ? 'no_go' : 'go';
    return { clientId, overall, dimensions, computedAt: new Date().toISOString() };
  }

  private async checkLifecycleStage(clientId: string): Promise<ReadinessDimension> {
    const record = await this.lifecycle.getLifecycle(clientId);
    if (!record) {
      return { name: 'Lifecycle Stage', status: 'not_determined', detail: 'No lifecycle record exists for this client.', blocking: true };
    }
    const currentIdx = LIFECYCLE_ORDER.indexOf(record.status);
    const gateIdx = LIFECYCLE_ORDER.indexOf(GO_LIVE_GATE_STAGE);
    const reached = currentIdx >= 0 && currentIdx >= gateIdx;
    return {
      name: 'Lifecycle Stage', status: reached ? 'pass' : 'fail',
      detail: reached ? `Real lifecycle status: "${record.status}" (has reached "${GO_LIVE_GATE_STAGE}").` : `Real lifecycle status: "${record.status}" — has not yet reached the "${GO_LIVE_GATE_STAGE}" gate.`,
      blocking: true,
    };
  }

  /** Read-only — reads the most recently PERSISTED validation result, never re-triggers one (see this file's own doc comment). */
  private async checkMigrationValidation(clientId: string): Promise<ReadinessDimension> {
    const res = await sharedPool.query<{ action: string; created_at: Date }>(
      `SELECT action, created_at FROM oc_audit_log WHERE entity_type = 'validation' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );
    const row = res.rows[0];
    if (!row) return { name: 'Migration Validation', status: 'not_determined', detail: 'No migration validation has ever been run for this client.', blocking: true };
    const passed = row.action === 'validation_passed';
    return {
      name: 'Migration Validation', status: passed ? 'pass' : 'fail',
      detail: `Most recent real result: "${row.action.replace('validation_', '')}" (${row.created_at.toISOString()}).`,
      blocking: true,
    };
  }

  private async checkTesting(clientId: string): Promise<ReadinessDimension> {
    const cases = await this.cases.list(clientId);
    const critical = cases.filter(c => c.priority === 'critical');
    if (critical.length === 0) {
      return { name: 'Testing (Critical Cases)', status: 'not_determined', detail: 'No critical-priority test cases exist for this client.', blocking: false };
    }
    let notPassed = 0;
    for (const c of critical) {
      const history = await this.executions.getHistory(c.id);
      if (history[0]?.status !== 'pass') notPassed++;
    }
    const allPass = notPassed === 0;
    return {
      name: 'Testing (Critical Cases)', status: allPass ? 'pass' : 'fail',
      detail: allPass ? `All ${critical.length} critical-priority test case(s) have a real PASS execution.` : `${notPassed} of ${critical.length} critical-priority test case(s) do not have a real PASS execution.`,
      blocking: true,
    };
  }

  private async checkDefects(clientId: string): Promise<ReadinessDimension> {
    const all = await this.defects.list(clientId);
    const openSevere = all.filter(d => ['critical', 'high'].includes(d.severity) && !['fixed', 'retest_passed', 'closed', 'wont_fix', 'duplicate'].includes(d.status));
    return {
      name: 'Open Critical/High Defects', status: openSevere.length === 0 ? 'pass' : 'fail',
      detail: openSevere.length === 0 ? 'No open critical or high-severity defects.' : `${openSevere.length} open critical/high-severity defect(s): ${openSevere.map(d => d.id).join(', ')}.`,
      blocking: true,
    };
  }

  private async checkUat(clientId: string): Promise<ReadinessDimension> {
    const cycles = await this.uat.listCycles(clientId);
    if (cycles.length === 0) {
      return { name: 'UAT Sign-off', status: 'not_determined', detail: 'No UAT cycle has been created for this client.', blocking: false };
    }
    // cycles are ordered newest-first (listCycles: ORDER BY created_at DESC)
    const latest = cycles[0]!;
    const signoff = await this.uat.getSignoffStatus(latest.id, clientId);
    const decided = signoff.current;
    if (!decided) return { name: 'UAT Sign-off', status: 'fail', detail: `The most recent UAT cycle ("${latest.name}") has no sign-off request yet.`, blocking: true };
    const approved = decided.status === 'approved';
    return {
      name: 'UAT Sign-off', status: approved ? 'pass' : 'fail',
      detail: `The most recent UAT cycle's ("${latest.name}") sign-off status is real: "${decided.status}".`,
      blocking: true,
    };
  }

  async requestReleaseSignoff(clientId: string, actor: string | null): Promise<ApprovalWorkflow> {
    const readiness = await this.getReadiness(clientId);
    if (readiness.overall !== 'go') {
      const blockers = readiness.dimensions.filter(d => d.blocking && d.status !== 'pass').map(d => d.name);
      throw new ReleaseNotReadyError(blockers);
    }
    const opened = await this.approvals.openWorkflow(
      'release_signoff', clientId, `Release Sign-off`,
      { dimensions: readiness.dimensions.map(d => ({ name: d.name, status: d.status })) },
      actor,
    );
    return this.approvals.submit(opened.id, actor);
  }

  async getSignoffStatus(clientId: string): Promise<{ current: ApprovalWorkflow | null; history: ApprovalWorkflow[] }> {
    const history = await this.approvals.listForEntity('release_signoff', clientId);
    return { current: history[0] ?? null, history };
  }

  async decideSignoff(workflowId: string, clientId: string, decision: 'approve' | 'reject' | 'request_changes', actor: string | null, note?: string): Promise<ApprovalWorkflow> {
    const workflow = await this.approvals.getWorkflow(workflowId);
    if (!workflow || workflow.entityType !== 'release_signoff' || workflow.entityId !== clientId) {
      throw new Error(`Release sign-off ${workflowId} not found for this client.`);
    }
    if (decision === 'approve') return this.approvals.approve(workflowId, actor, note);
    if (decision === 'reject') {
      if (!note?.trim()) throw new Error('A real reason is required to reject a release sign-off.');
      return this.approvals.reject(workflowId, actor, note);
    }
    if (!note?.trim()) throw new Error('A real reason is required to request changes on a release sign-off.');
    return this.approvals.requestChanges(workflowId, actor, note);
  }
}

export class ReleaseNotReadyError extends Error {
  constructor(public readonly blockers: string[]) {
    super(`Cannot request release sign-off: the following gate(s) are not real, verified passes: ${blockers.join(', ')}.`);
    this.name = 'ReleaseNotReadyError';
  }
}
