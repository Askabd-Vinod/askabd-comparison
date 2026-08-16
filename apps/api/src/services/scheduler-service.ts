/**
 * AskABD Scheduler Service
 * Centralized job execution engine. Idempotent, bounded, observable.
 * Reuses: Workflow Automation, Notification, Problem Universe, Gap Analysis.
 * Does NOT use uncontrolled setInterval — jobs are triggered on-demand or via controlled timer.
 */
import { sharedPool } from './db-pool.js';

export interface ScheduledJob {
  id: string; jobType: string; name: string; description?: string;
  status: string; enabled: boolean; frequency: string;
  lastRunAt?: string; nextRunAt?: string; startedAt?: string; completedAt?: string;
  durationMs?: number; successCount: number; failureCount: number;
  lastError?: string; lastResult: any;
}

export class SchedulerService {

  async getJobs(): Promise<ScheduledJob[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_scheduled_jobs ORDER BY job_type');
    return rows.map(this.mapJob);
  }

  async getJob(jobId: string): Promise<ScheduledJob | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_scheduled_jobs WHERE id = $1', [jobId]);
    return rows.length > 0 ? this.mapJob(rows[0]) : null;
  }

  async runJob(jobId: string): Promise<{ success: boolean; result: any; error?: string }> {
    const job = await this.getJob(jobId);
    if (!job) return { success: false, result: null, error: 'Job not found' };
    if (!job.enabled) return { success: false, result: null, error: 'Job is disabled' };
    if (job.status === 'running') return { success: false, result: null, error: 'Job already running' };

    // Mark running
    await sharedPool.query(`UPDATE oc_scheduled_jobs SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`, [jobId]);
    const start = Date.now();

    try {
      const result = await this.executeJobType(job.jobType);
      const duration = Date.now() - start;
      await sharedPool.query(`UPDATE oc_scheduled_jobs SET status = 'idle', completed_at = NOW(), last_run_at = NOW(), duration_ms = $1, success_count = success_count + 1, last_result = $2, last_error = NULL, updated_at = NOW() WHERE id = $3`,
        [duration, JSON.stringify(result), jobId]);
      return { success: true, result };
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = (err as Error).message;
      await sharedPool.query(`UPDATE oc_scheduled_jobs SET status = 'idle', completed_at = NOW(), last_run_at = NOW(), duration_ms = $1, failure_count = failure_count + 1, last_error = $2, updated_at = NOW() WHERE id = $3`,
        [duration, errMsg, jobId]);
      return { success: false, result: null, error: errMsg };
    }
  }

  private async executeJobType(jobType: string): Promise<any> {
    switch (jobType) {
      case 'OVERDUE_REQUIREMENTS': return this.checkOverdueRequirements();
      case 'OVERDUE_DOCUMENTS': return this.checkOverdueDocuments();
      case 'OVERDUE_GAPS': return this.checkOverdueGaps();
      case 'OVERDUE_TRANSFORMATIONS': return this.checkOverdueTransformations();
      case 'BENEFIT_REALIZATION_CHECK': return this.checkBenefitRealization();
      case 'COMPLIANCE_EVIDENCE_CHECK': return this.checkComplianceEvidence();
      case 'OVERDUE_APPROVALS': return this.checkOverdueApprovals();
      case 'FINANCIAL_RECONCILIATION': return this.runFinancialReconciliation();
      case 'DIGEST_PROCESSOR': return { status: 'skipped', reason: 'Digest processing deferred to batch delivery implementation' };
      default: return { status: 'unknown_job_type', jobType };
    }
  }

  private async checkOverdueRequirements(): Promise<any> {
    // Find requirements that are incomplete and client is past identity stage
    const { rows } = await sharedPool.query(`
      SELECT DISTINCT r.client_id, count(*) as overdue_count
      FROM oc_client_service_requirements r
      JOIN oc_lifecycle l ON l.client_id = r.client_id
      WHERE (r.status IS NULL OR r.status IN ('pending','not_started'))
      AND l.status NOT IN ('organization-created','otp-sent')
      AND r.created_at < NOW() - INTERVAL '48 hours'
      GROUP BY r.client_id
    `);
    let notified = 0;
    for (const r of rows) {
      await this.emitJobEvent('OVERDUE_REQUIREMENTS', r.client_id, { count: parseInt(r.overdue_count) });
      notified++;
    }
    return { checked: rows.length, notified };
  }

  private async checkOverdueDocuments(): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT client_id, count(*) as expired_count
      FROM oc_client_service_documents
      WHERE status = 'uploaded' AND expiry_date IS NOT NULL AND expiry_date < NOW()
      GROUP BY client_id
    `);
    let notified = 0;
    for (const r of rows) {
      await this.emitJobEvent('DOCUMENT_EXPIRED', r.client_id, { count: parseInt(r.expired_count) });
      notified++;
    }
    return { checked: rows.length, notified };
  }

  private async checkOverdueGaps(): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT client_id, count(*) as overdue_count
      FROM oc_gaps
      WHERE target_date IS NOT NULL AND target_date < CURRENT_DATE
      AND status NOT IN ('resolved','closed','rejected','accepted_risk')
      GROUP BY client_id
    `);
    let notified = 0;
    for (const r of rows) {
      await this.emitJobEvent('GAP_ESCALATED', r.client_id, { count: parseInt(r.overdue_count) });
      notified++;
    }
    return { checked: rows.length, notified };
  }

  private async checkOverdueTransformations(): Promise<any> {
    // Transformations planned for >30 days without starting, or in_progress >90 days
    const { rows } = await sharedPool.query(`
      SELECT client_id, id, title, status, created_at FROM oc_transformations
      WHERE (status = 'planned' AND created_at < NOW() - INTERVAL '30 days')
      OR (status = 'in_progress' AND started_at < NOW() - INTERVAL '90 days')
    `);
    let notified = 0;
    for (const r of rows) {
      await this.emitJobEvent('TRANSFORMATION_DELAYED', r.client_id, { transformationId: r.id, title: r.title, status: r.status });
      notified++;
    }
    return { checked: rows.length, notified };
  }

  private async checkBenefitRealization(): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT client_id, transformation_id, benefit_realization_pct, health
      FROM oc_transformation_outcomes
      WHERE benefit_realization_pct IS NOT NULL AND benefit_realization_pct < 70
      AND health != 'critical'
    `);
    let notified = 0;
    for (const r of rows) {
      await this.emitJobEvent('BENEFIT_BELOW_TARGET', r.client_id, { transformationId: r.transformation_id, benefitPct: parseFloat(r.benefit_realization_pct) });
      notified++;
    }
    return { checked: rows.length, notified };
  }

  private async checkComplianceEvidence(): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT client_id, count(*) as missing
      FROM oc_client_compliance
      WHERE evidence_status IN ('missing','expired')
      GROUP BY client_id
    `);
    return { clientsWithIssues: rows.length, details: rows.map((r: any) => ({ clientId: r.client_id, missing: parseInt(r.missing) })) };
  }

  private async checkOverdueApprovals(): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT client_id, count(*) as pending
      FROM oc_recommendations
      WHERE status = 'ready' AND created_at < NOW() - INTERVAL '7 days'
      GROUP BY client_id
    `);
    let notified = 0;
    for (const r of rows) {
      await this.emitJobEvent('RECOMMENDATION_APPROVAL_REQUIRED', r.client_id, { pendingCount: parseInt(r.pending) });
      notified++;
    }
    return { checked: rows.length, notified };
  }

  private async runFinancialReconciliation(): Promise<any> {
    // Find clients with unreconciled transactions
    const { rows: clients } = await sharedPool.query(`
      SELECT DISTINCT client_id FROM oc_financial_transactions
      WHERE status NOT IN ('cancelled','refunded')
      AND client_id NOT IN (
        SELECT client_id FROM oc_reconciliation_runs
        WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 day'
      )
    `);

    let reconciled = 0;
    for (const { client_id } of clients) {
      try {
        const { FinancialReconciliationService } = await import('./financial-reconciliation-service.js');
        const svc = new FinancialReconciliationService();
        const { run } = await svc.createReconciliationRun(client_id);
        await svc.executeReconciliation(run.id, client_id);
        reconciled++;
      } catch { /* non-fatal per client */ }
    }
    return { clientsChecked: clients.length, reconciled };
  }

  private async emitJobEvent(eventType: string, clientId: string, payload: any): Promise<void> {
    // Idempotent: use jobType+clientId+date as dedup key
    const dedupKey = `${eventType}-${clientId}-${new Date().toISOString().split('T')[0]}`;
    const dup = await sharedPool.query(`SELECT id FROM oc_events WHERE idempotency_key = $1`, [dedupKey]);
    if (dup.rows.length > 0) return; // Already emitted today

    const { WorkflowAutomationService } = await import('./workflow-automation-service.js');
    const wf = new WorkflowAutomationService();
    await wf.emitEvent({ eventType, clientId, actor: 'scheduler', actorType: 'system', severity: 'warning', payload, source: 'scheduler', idempotencyKey: dedupKey });
  }

  async toggleJob(jobId: string, enabled: boolean): Promise<ScheduledJob | null> {
    const { rows } = await sharedPool.query(`UPDATE oc_scheduled_jobs SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [enabled, jobId]);
    return rows.length > 0 ? this.mapJob(rows[0]) : null;
  }

  /** Run all due jobs with DB-level advisory lock to prevent concurrent execution */
  async runAllDue(): Promise<{ executed: string[]; skipped: string[]; errors: string[] }> {
    const executed: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // Acquire advisory lock (prevents multiple scheduler instances)
    const lockResult = await sharedPool.query(`SELECT pg_try_advisory_lock(42424242) as acquired`);
    if (!lockResult.rows[0]?.acquired) {
      return { executed: [], skipped: ['all — lock held by another process'], errors: [] };
    }

    try {
      const { rows: jobs } = await sharedPool.query(`SELECT * FROM oc_scheduled_jobs WHERE enabled = true AND status = 'idle'`);

      for (const job of jobs) {
        // Check frequency: only run if enough time has passed since last run
        if (job.last_run_at) {
          const freqMs = this.frequencyToMs(job.frequency);
          if (Date.now() - new Date(job.last_run_at).getTime() < freqMs) {
            skipped.push(job.id);
            continue;
          }
        }

        const result = await this.runJob(job.id);
        if (result.success) { executed.push(job.id); }
        else { errors.push(`${job.id}: ${result.error}`); }
      }
    } finally {
      // Release advisory lock
      await sharedPool.query(`SELECT pg_advisory_unlock(42424242)`);
    }

    return { executed, skipped, errors };
  }

  private frequencyToMs(freq: string): number {
    switch (freq) {
      case 'hourly': return 3600000;
      case 'daily': return 86400000;
      case 'weekly': return 604800000;
      case 'monthly': return 2592000000;
      default: return 86400000;
    }
  }

  private mapJob(row: any): ScheduledJob {
    return { id: row.id, jobType: row.job_type, name: row.name, description: row.description, status: row.status, enabled: row.enabled, frequency: row.frequency, lastRunAt: row.last_run_at, nextRunAt: row.next_run_at, startedAt: row.started_at, completedAt: row.completed_at, durationMs: row.duration_ms, successCount: row.success_count, failureCount: row.failure_count, lastError: row.last_error, lastResult: row.last_result || {} };
  }
}
