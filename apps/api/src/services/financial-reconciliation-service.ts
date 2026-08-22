/**
 * AskABD Financial Reconciliation Service
 *
 * Manages financial transactions and reconciliation.
 * Compares expected vs actual financial activity.
 * Does NOT replace the existing Financial Engine (which answers "what is the expected value?").
 * This service answers "does actual financial activity match what was expected?"
 *
 * All operations are client-scoped, audited, and idempotent where applicable.
 */
import { sharedPool } from './db-pool.js';
import { OperationsCenterService } from './operations-center-service.js';
import { WorkflowAutomationService } from './workflow-automation-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTransactionInput {
  engagementId?: string;
  proposalId?: string;
  paymentMethodId?: string;
  externalTransactionId?: string;
  transactionType: string;
  amount: number;
  currency?: string;
  transactionDate?: string;
  provider?: string;
  reference?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

const VALID_TXN_TYPES = ['invoice', 'payment', 'refund', 'credit', 'adjustment', 'fee'];

const RECON_TRANSITIONS: Record<string, string[]> = {
  draft: ['running'],
  running: ['completed', 'failed'],
  completed: ['reviewed'],
  reviewed: ['approved'],
  failed: ['draft'],
  approved: [],
};

const EXCEPTION_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating'],
  investigating: ['resolved', 'waived'],
  resolved: [],
  waived: [],
};

export class FinancialReconciliationService {
  private audit = new OperationsCenterService();
  private workflow = new WorkflowAutomationService();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createTransaction(clientId: string, data: CreateTransactionInput, actor: string = 'unknown-staff') {
    if (!VALID_TXN_TYPES.includes(data.transactionType)) {
      return { success: false, error: 'invalid_type', message: `Allowed: ${VALID_TXN_TYPES.join(', ')}` };
    }

    // Idempotency by external_transaction_id
    if (data.externalTransactionId) {
      const dup = await sharedPool.query(
        'SELECT id FROM oc_financial_transactions WHERE client_id = $1 AND external_transaction_id = $2',
        [clientId, data.externalTransactionId]
      );
      if (dup.rows.length > 0) {
        return { success: false, error: 'duplicate', existingId: dup.rows[0].id };
      }
    }

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_financial_transactions
        (client_id, engagement_id, proposal_id, payment_method_id, external_transaction_id,
         transaction_type, amount, currency, transaction_date, provider, reference, description, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      clientId, data.engagementId || null, data.proposalId || null,
      data.paymentMethodId || null, data.externalTransactionId || null,
      data.transactionType, data.amount, data.currency || 'USD',
      data.transactionDate || new Date().toISOString(), data.provider || null,
      data.reference || null, data.description || null,
      JSON.stringify(data.metadata || {}),
    ]);

    const txn = rows[0];

    await this.audit.createAuditEntry({
      entityType: 'financial_transaction', entityId: txn.id, entityName: data.reference || txn.id,
      action: 'created', actor,
      details: { type: data.transactionType, amount: data.amount, currency: data.currency || 'USD' },
      evidence: [`Transaction ${data.transactionType} for ${data.currency || 'USD'} ${data.amount} created`],
    });

    await this.workflow.emitEvent({
      eventType: 'TRANSACTION_CREATED', clientId,
      entityType: 'financial_transaction', entityId: txn.id,
      actor, severity: 'info',
      payload: { type: data.transactionType, amount: data.amount },
    });

    return { success: true, transaction: txn };
  }

  async listTransactions(clientId: string, filters?: { engagementId?: string; status?: string }) {
    let query = 'SELECT * FROM oc_financial_transactions WHERE client_id = $1';
    const params: any[] = [clientId];
    if (filters?.engagementId) { params.push(filters.engagementId); query += ` AND engagement_id = $${params.length}`; }
    if (filters?.status) { params.push(filters.status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY transaction_date DESC';
    const { rows } = await sharedPool.query(query, params);
    return rows;
  }

  async getTransaction(id: string, clientId?: string) {
    let query = 'SELECT * FROM oc_financial_transactions WHERE id = $1';
    const params: any[] = [id];
    if (clientId) { query += ' AND client_id = $2'; params.push(clientId); }
    const { rows } = await sharedPool.query(query, params);
    return rows[0] || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECONCILIATION RUNS
  // ═══════════════════════════════════════════════════════════════════════════

  async createReconciliationRun(clientId: string) {
    const { rows } = await sharedPool.query(
      `INSERT INTO oc_reconciliation_runs (client_id) VALUES ($1) RETURNING *`, [clientId]
    );
    return { success: true, run: rows[0] };
  }

  async getReconciliationRun(id: string, clientId?: string) {
    let query = 'SELECT * FROM oc_reconciliation_runs WHERE id = $1';
    const params: any[] = [id];
    if (clientId) { query += ' AND client_id = $2'; params.push(clientId); }
    const { rows } = await sharedPool.query(query, params);
    return rows[0] || null;
  }

  async listReconciliationRuns(clientId: string) {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_reconciliation_runs WHERE client_id = $1 ORDER BY created_at DESC', [clientId]
    );
    return rows;
  }

  async executeReconciliation(runId: string, clientId: string) {
    const run = await this.getReconciliationRun(runId, clientId);
    if (!run) return { success: false, error: 'not_found' };
    if (run.status !== 'draft') return { success: false, error: 'invalid_status', message: 'Run must be in draft status' };

    // Transition to running
    await sharedPool.query(
      `UPDATE oc_reconciliation_runs SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`, [runId]
    );

    await this.workflow.emitEvent({
      eventType: 'RECONCILIATION_STARTED', clientId,
      entityType: 'reconciliation_run', entityId: runId,
      actor: 'system', severity: 'info', payload: {},
    });

    try {
      // Get all transactions for this client
      const txnRes = await sharedPool.query(
        'SELECT * FROM oc_financial_transactions WHERE client_id = $1 ORDER BY transaction_date', [clientId]
      );
      const transactions = txnRes.rows;

      // Get expected values from engagements pricing
      const pricingRes = await sharedPool.query(
        `SELECT ep.*, ce.client_id FROM oc_engagement_pricing ep
         JOIN oc_commercial_engagements ce ON ce.id = ep.engagement_id
         WHERE ce.client_id = $1`, [clientId]
      );

      let matched = 0, unmatched = 0, exceptions = 0;
      let totalExpected = 0, totalActual = 0;

      // Calculate expected from pricing
      for (const p of pricingRes.rows) {
        totalExpected += parseFloat(p.total || '0');
      }

      // Calculate actual from transactions (payments only)
      const payments = transactions.filter((t: any) => t.transaction_type === 'payment' && t.status !== 'failed' && t.status !== 'cancelled');
      for (const t of payments) {
        totalActual += parseFloat(t.amount || '0');
      }

      // Reconcile each transaction
      for (const txn of transactions) {
        const amount = parseFloat(txn.amount || '0');
        let matchStatus = 'unmatched';
        let matchReason = '';
        let confidence = 0;

        // Match by external reference to engagement
        if (txn.engagement_id) {
          const engPricing = pricingRes.rows.find((p: any) => p.engagement_id === txn.engagement_id);
          if (engPricing) {
            const expected = parseFloat(engPricing.total || '0');
            if (Math.abs(amount - expected) < 0.01) {
              matchStatus = 'matched'; matchReason = 'exact_amount_match'; confidence = 100;
              matched++;
            } else if (amount < expected) {
              matchStatus = 'partial'; matchReason = 'underpaid'; confidence = 80;
              exceptions++;
            } else {
              matchStatus = 'partial'; matchReason = 'overpaid'; confidence = 80;
              exceptions++;
            }
          } else {
            matchStatus = 'unmatched'; matchReason = 'no_pricing_found'; unmatched++;
          }
        } else {
          matchStatus = 'unmatched'; matchReason = 'no_engagement_reference'; unmatched++;
        }

        // Insert reconciliation item
        await sharedPool.query(`
          INSERT INTO oc_reconciliation_items (run_id, client_id, transaction_id, external_reference, expected_amount, actual_amount, variance, currency, match_status, match_reason, confidence)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [runId, clientId, txn.id, txn.external_transaction_id || txn.reference, null, amount, null, txn.currency, matchStatus, matchReason, confidence]);

        // Create exception for non-matched
        if (matchStatus === 'partial') {
          await sharedPool.query(`
            INSERT INTO oc_reconciliation_exceptions (run_id, client_id, exception_type, description, actual_amount, status)
            VALUES ($1,$2,$3,$4,$5,'open')
          `, [runId, clientId, matchReason, `Transaction ${txn.id}: ${matchReason}`, amount]);
        }
      }

      const variance = totalActual - totalExpected;

      // Mark completed
      await sharedPool.query(`
        UPDATE oc_reconciliation_runs SET
          status = 'completed', completed_at = NOW(), records_processed = $1,
          matched = $2, unmatched = $3, exceptions = $4,
          total_expected = $5, total_actual = $6, variance = $7, updated_at = NOW()
        WHERE id = $8
      `, [transactions.length, matched, unmatched, exceptions, totalExpected, totalActual, variance, runId]);

      await this.audit.createAuditEntry({
        entityType: 'reconciliation_run', entityId: runId, entityName: runId,
        action: 'completed', actor: 'system',
        details: { matched, unmatched, exceptions, variance },
        evidence: [`Reconciliation completed: ${matched} matched, ${unmatched} unmatched, ${exceptions} exceptions, variance: ${variance}`],
      });

      await this.workflow.emitEvent({
        eventType: 'RECONCILIATION_COMPLETED', clientId,
        entityType: 'reconciliation_run', entityId: runId,
        actor: 'system', severity: variance !== 0 ? 'warning' : 'info',
        payload: { matched, unmatched, exceptions, variance },
      });

      if (Math.abs(variance) > 0) {
        await this.workflow.emitEvent({
          eventType: 'PAYMENT_VARIANCE_DETECTED', clientId,
          entityType: 'reconciliation_run', entityId: runId,
          actor: 'system', severity: 'warning',
          payload: { variance, totalExpected, totalActual },
        });
      }

      return { success: true, summary: { matched, unmatched, exceptions, totalExpected, totalActual, variance } };
    } catch (err) {
      await sharedPool.query(
        `UPDATE oc_reconciliation_runs SET status = 'failed', error = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [(err as Error).message, runId]
      );
      await this.workflow.emitEvent({
        eventType: 'RECONCILIATION_FAILED', clientId,
        entityType: 'reconciliation_run', entityId: runId,
        actor: 'system', severity: 'critical', payload: { error: (err as Error).message },
      });
      return { success: false, error: (err as Error).message };
    }
  }

  async transitionRun(runId: string, clientId: string, newStatus: string) {
    const run = await this.getReconciliationRun(runId, clientId);
    if (!run) return { success: false, error: 'not_found' };
    const allowed = RECON_TRANSITIONS[run.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return { success: false, error: 'invalid_transition', message: `Cannot transition from "${run.status}" to "${newStatus}"` };
    }
    await sharedPool.query('UPDATE oc_reconciliation_runs SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, runId]);
    return { success: true };
  }

  async getReconciliationItems(runId: string, clientId: string) {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_reconciliation_items WHERE run_id = $1 AND client_id = $2 ORDER BY created_at', [runId, clientId]
    );
    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXCEPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async listExceptions(clientId: string, status?: string) {
    let query = 'SELECT * FROM oc_reconciliation_exceptions WHERE client_id = $1';
    const params: any[] = [clientId];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const { rows } = await sharedPool.query(query, params);
    return rows;
  }

  async transitionException(exceptionId: string, clientId: string, newStatus: string, actor?: string, notes?: string) {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_reconciliation_exceptions WHERE id = $1 AND client_id = $2', [exceptionId, clientId]
    );
    if (rows.length === 0) return { success: false, error: 'not_found' };
    const exc = rows[0];

    const allowed = EXCEPTION_TRANSITIONS[exc.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return { success: false, error: 'invalid_transition', message: `Cannot transition from "${exc.status}" to "${newStatus}"` };
    }

    const updates = newStatus === 'resolved' || newStatus === 'waived'
      ? `status = $1, resolved_by = $2, resolved_at = NOW(), resolution_notes = $3, updated_at = NOW()`
      : `status = $1, updated_at = NOW()`;

    const params = newStatus === 'resolved' || newStatus === 'waived'
      ? [newStatus, actor || 'unknown-staff', notes || '', exceptionId]
      : [newStatus, exceptionId];

    const whereIdx = newStatus === 'resolved' || newStatus === 'waived' ? 4 : 2;
    await sharedPool.query(`UPDATE oc_reconciliation_exceptions SET ${updates} WHERE id = $${whereIdx}`, params);

    const eventType = newStatus === 'resolved' ? 'RECONCILIATION_EXCEPTION_RESOLVED' : 'RECONCILIATION_EXCEPTION_CREATED';
    await this.audit.createAuditEntry({
      entityType: 'reconciliation_exception', entityId: exceptionId, entityName: exc.exception_type,
      action: `status_${newStatus}`, actor: actor || 'unknown-staff',
      details: { from: exc.status, to: newStatus, notes },
      evidence: [`Exception ${exceptionId}: ${exc.status} → ${newStatus}`],
    });

    await this.workflow.emitEvent({
      eventType, clientId,
      entityType: 'reconciliation_exception', entityId: exceptionId,
      actor: actor || 'unknown-staff', severity: 'info',
      payload: { from: exc.status, to: newStatus },
    });

    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getReconciliationSummary(clientId: string) {
    const [runsRes, excRes, txnRes] = await Promise.all([
      sharedPool.query(
        `SELECT count(*) as total, count(*) FILTER (WHERE status = 'completed') as completed,
         COALESCE(SUM(matched), 0) as total_matched, COALESCE(SUM(unmatched), 0) as total_unmatched,
         COALESCE(SUM(variance), 0) as total_variance
         FROM oc_reconciliation_runs WHERE client_id = $1`, [clientId]),
      sharedPool.query(
        `SELECT count(*) as total, count(*) FILTER (WHERE status = 'open') as open_exceptions
         FROM oc_reconciliation_exceptions WHERE client_id = $1`, [clientId]),
      sharedPool.query(
        `SELECT count(*) as total, COALESCE(SUM(amount), 0) as total_amount,
         count(*) FILTER (WHERE status = 'settled') as settled
         FROM oc_financial_transactions WHERE client_id = $1`, [clientId]),
    ]);

    const runs = runsRes.rows[0] || {};
    const exc = excRes.rows[0] || {};
    const txn = txnRes.rows[0] || {};

    return {
      transactions: { total: parseInt(txn.total || '0'), totalAmount: parseFloat(txn.total_amount || '0'), settled: parseInt(txn.settled || '0') },
      reconciliation: { totalRuns: parseInt(runs.total || '0'), completed: parseInt(runs.completed || '0'), totalMatched: parseInt(runs.total_matched || '0'), totalUnmatched: parseInt(runs.total_unmatched || '0'), totalVariance: parseFloat(runs.total_variance || '0') },
      exceptions: { total: parseInt(exc.total || '0'), open: parseInt(exc.open_exceptions || '0') },
    };
  }
}
