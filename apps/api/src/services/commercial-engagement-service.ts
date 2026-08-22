/**
 * AskABD Commercial Engagement & Proposal Service
 *
 * Manages engagement lifecycle, service selection, pricing, and proposal generation.
 * Reuses existing platform intelligence (problems, gaps, financial, effort, recommendations).
 * All operations are client-scoped and audited.
 */
import type { PoolClient } from 'pg';
import { sharedPool } from './db-pool.js';
import { OperationsCenterService } from './operations-center-service.js';
import { WorkflowAutomationService } from './workflow-automation-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateEngagementInput {
  name: string;
  description?: string;
  engagementType?: string;
  currency?: string;
  startDate?: string;
  targetEndDate?: string;
  owner?: string;
  createdBy?: string;
}

export interface EngagementTransition {
  newStatus: string;
  actor?: string;
  reason?: string;
}

export interface AddServiceInput {
  serviceId: string;
  bundleId?: string;
  scopeDescription?: string;
  assumptions?: string[];
  exclusions?: string[];
}

export interface PricingInput {
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  billingModel?: string;
  paymentTerms?: string;
  pricingAssumptions?: string[];
}

export interface CreateProposalInput {
  title?: string;
  createdBy?: string;
  validUntil?: string;
}

// ─── Engagement Status Machine ────────────────────────────────────────────────

const ENGAGEMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['proposed'],
  proposed: ['approved', 'draft'],
  approved: ['contracted', 'draft'],
  contracted: ['active'],
  active: ['completed'],
  completed: [],
};

const PROPOSAL_TRANSITIONS: Record<string, string[]> = {
  draft: ['ready'],
  ready: ['sent', 'draft'],
  sent: ['accepted', 'draft'],
  accepted: [],
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class CommercialEngagementService {
  private audit = new OperationsCenterService();
  private workflow = new WorkflowAutomationService();

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async createEngagement(clientId: string, data: CreateEngagementInput) {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_commercial_engagements
        (client_id, name, description, engagement_type, currency, start_date, target_end_date, owner, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      clientId, data.name, data.description || null,
      data.engagementType || 'transformation', data.currency || 'USD',
      data.startDate || null, data.targetEndDate || null,
      data.owner || null, data.createdBy || 'unknown-staff',
    ]);
    const engagement = rows[0];

    await this.audit.createAuditEntry({
      entityType: 'engagement', entityId: engagement.id, entityName: data.name,
      action: 'created', actor: data.createdBy || 'unknown-staff',
      details: { clientId, engagementType: data.engagementType || 'transformation' },
      evidence: [`Engagement "${data.name}" created for client ${clientId}`],
    });

    await this.workflow.emitEvent({
      eventType: 'ENGAGEMENT_CREATED', clientId,
      entityType: 'engagement', entityId: engagement.id, entityName: data.name,
      actor: data.createdBy || 'unknown-staff', severity: 'info',
      payload: { engagementType: data.engagementType || 'transformation' },
    });

    return engagement;
  }

  async getEngagement(engagementId: string, clientId?: string) {
    let query = 'SELECT * FROM oc_commercial_engagements WHERE id = $1';
    const params: any[] = [engagementId];
    if (clientId) {
      query += ' AND client_id = $2';
      params.push(clientId);
    }
    const { rows } = await sharedPool.query(query, params);
    return rows[0] || null;
  }

  async listEngagements(clientId: string) {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_commercial_engagements WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
    return rows;
  }

  async updateEngagement(engagementId: string, clientId: string, data: Partial<CreateEngagementInput>) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.name) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (data.engagementType) { sets.push(`engagement_type = $${idx++}`); params.push(data.engagementType); }
    if (data.currency) { sets.push(`currency = $${idx++}`); params.push(data.currency); }
    if (data.startDate) { sets.push(`start_date = $${idx++}`); params.push(data.startDate); }
    if (data.targetEndDate) { sets.push(`target_end_date = $${idx++}`); params.push(data.targetEndDate); }
    if (data.owner) { sets.push(`owner = $${idx++}`); params.push(data.owner); }

    if (sets.length === 0) return this.getEngagement(engagementId, clientId);

    sets.push('updated_at = NOW()');
    params.push(engagementId);
    params.push(clientId);

    const { rows } = await sharedPool.query(
      `UPDATE oc_commercial_engagements SET ${sets.join(', ')} WHERE id = $${idx++} AND client_id = $${idx} RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT STATUS TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async transitionEngagement(engagementId: string, clientId: string, transition: EngagementTransition) {
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return { success: false, error: 'engagement_not_found' };

    const currentStatus = engagement.status;
    const allowed = ENGAGEMENT_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(transition.newStatus)) {
      return {
        success: false,
        error: 'invalid_transition',
        message: `Cannot transition from "${currentStatus}" to "${transition.newStatus}". Allowed: [${(allowed || []).join(', ')}]`,
      };
    }

    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const params: any[] = [transition.newStatus];

    if (transition.newStatus === 'approved') {
      updates.push(`approved_by = $${params.length + 1}`);
      params.push(transition.actor || 'unknown-staff');
      updates.push(`approved_at = NOW()`);
    }

    params.push(engagementId);
    params.push(clientId);

    const { rows } = await sharedPool.query(
      `UPDATE oc_commercial_engagements SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND client_id = $${params.length} RETURNING *`,
      params
    );

    const updated = rows[0];

    await this.audit.createAuditEntry({
      entityType: 'engagement', entityId: engagementId, entityName: engagement.name,
      action: 'status_changed', actor: transition.actor || 'unknown-staff',
      details: { from: currentStatus, to: transition.newStatus, reason: transition.reason },
      evidence: [`Engagement status: ${currentStatus} → ${transition.newStatus}`],
    });

    await this.workflow.emitEvent({
      eventType: 'ENGAGEMENT_STATUS_CHANGED', clientId,
      entityType: 'engagement', entityId: engagementId, entityName: engagement.name,
      actor: transition.actor || 'unknown-staff', severity: 'info',
      payload: { from: currentStatus, to: transition.newStatus },
    });

    return { success: true, engagement: updated };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE SELECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async addService(engagementId: string, clientId: string, data: AddServiceInput, actor: string = 'unknown-staff') {
    // Verify engagement exists and belongs to client
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return { success: false, error: 'engagement_not_found' };

    // Verify service exists in oc_capabilities
    const capRes = await sharedPool.query(
      'SELECT id, name, status, dependencies FROM oc_capabilities WHERE id = $1', [data.serviceId]
    );
    if (capRes.rows.length === 0) {
      return { success: false, error: 'service_not_found', message: `Service "${data.serviceId}" does not exist in the capability registry` };
    }
    const capability = capRes.rows[0];

    if (capability.status === 'deprecated') {
      return { success: false, error: 'service_unavailable', message: `Service "${capability.name}" is deprecated` };
    }

    // Check if service already added to this engagement
    const dupRes = await sharedPool.query(
      'SELECT id FROM oc_engagement_services WHERE engagement_id = $1 AND service_id = $2',
      [engagementId, data.serviceId]
    );
    if (dupRes.rows.length > 0) {
      return { success: false, error: 'service_already_added', message: `Service "${capability.name}" is already in this engagement` };
    }

    // Check mandatory dependencies — all dependencies must also be in engagement
    const deps = capability.dependencies || [];
    if (deps.length > 0) {
      const existingRes = await sharedPool.query(
        'SELECT service_id FROM oc_engagement_services WHERE engagement_id = $1 AND service_id = ANY($2)',
        [engagementId, deps]
      );
      const existingIds = new Set(existingRes.rows.map((r: any) => r.service_id));
      const missing = deps.filter((d: string) => !existingIds.has(d));
      if (missing.length > 0) {
        return { success: false, error: 'dependency_not_met', message: `Missing dependencies: ${missing.join(', ')}`, missingDependencies: missing };
      }
    }

    // Retrieve financial/effort estimates for this service if available
    let estimatedInvestment = null;
    let expectedValue = null;
    let estimatedEffort = null;
    try {
      const finRes = await sharedPool.query(
        `SELECT implementation_cost, annual_savings FROM oc_financial_estimates WHERE client_id = $1 LIMIT 1`, [clientId]
      );
      estimatedInvestment = finRes.rows[0]?.implementation_cost || null;
      expectedValue = finRes.rows[0]?.annual_savings || null;
    } catch { /* table may not exist */ }
    try {
      const effRes = await sharedPool.query(
        `SELECT person_days FROM oc_effort_estimates WHERE client_id = $1 LIMIT 1`, [clientId]
      );
      estimatedEffort = effRes.rows[0]?.person_days || null;
    } catch { /* table may not exist */ }

    // Add the service and recalculate engagement totals atomically — either both
    // commit or neither does. A crash between the two would otherwise leave a real
    // engagement_service row backed by stale (or missing) totals on the engagement.
    const client = await sharedPool.connect();
    let service: any;
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(`
        INSERT INTO oc_engagement_services
          (engagement_id, client_id, service_id, bundle_id, scope_description, assumptions, exclusions, estimated_effort, estimated_investment, expected_value)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
      `, [
        engagementId, clientId, data.serviceId, data.bundleId || null,
        data.scopeDescription || null,
        JSON.stringify(data.assumptions || []),
        JSON.stringify(data.exclusions || []),
        estimatedEffort, estimatedInvestment, expectedValue,
      ]);
      service = rows[0];

      await this.recalculateEngagementTotals(engagementId, client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Audit and workflow notification are best-effort — a hiccup here must not report
    // the commercial write (already committed above) as a failure to the caller.
    this.audit.createAuditEntry({
      entityType: 'engagement_service', entityId: service.id, entityName: capability.name,
      action: 'service_selected', actor,
      details: { engagementId, serviceId: data.serviceId, bundleId: data.bundleId },
      evidence: [`Service "${capability.name}" added to engagement ${engagement.name}`],
    }).catch(() => {});

    this.workflow.emitEvent({
      eventType: 'ENGAGEMENT_SERVICE_SELECTED', clientId,
      entityType: 'engagement_service', entityId: service.id, entityName: capability.name,
      actor, severity: 'info',
      payload: { engagementId, serviceId: data.serviceId },
    }).catch(() => {});

    return { success: true, service };
  }

  async removeService(engagementId: string, clientId: string, serviceId: string, actor: string = 'unknown-staff') {
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return { success: false, error: 'engagement_not_found' };

    // Check if other services in this engagement depend on this one
    const capRes = await sharedPool.query(
      `SELECT es.id, c.name FROM oc_engagement_services es
       JOIN oc_capabilities c ON c.id = es.service_id
       WHERE es.engagement_id = $1 AND c.dependencies @> $2::jsonb`,
      [engagementId, JSON.stringify([serviceId])]
    );
    if (capRes.rows.length > 0) {
      return {
        success: false, error: 'dependency_conflict',
        message: `Cannot remove: other services depend on this one`,
        dependentServices: capRes.rows.map((r: any) => r.name),
      };
    }

    // Delete + recalculate atomically — same rationale as addService().
    const client = await sharedPool.connect();
    let rowCount = 0;
    try {
      await client.query('BEGIN');

      const deleteResult = await client.query(
        'DELETE FROM oc_engagement_services WHERE engagement_id = $1 AND service_id = $2 AND client_id = $3',
        [engagementId, serviceId, clientId]
      );
      rowCount = deleteResult.rowCount ?? 0;

      if (rowCount === 0) {
        await client.query('ROLLBACK');
        client.release();
        return { success: false, error: 'service_not_in_engagement' };
      }

      await this.recalculateEngagementTotals(engagementId, client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      throw err;
    }
    client.release();

    this.audit.createAuditEntry({
      entityType: 'engagement_service', entityId: serviceId, entityName: serviceId,
      action: 'service_removed', actor,
      details: { engagementId, serviceId },
      evidence: [`Service "${serviceId}" removed from engagement ${engagement.name}`],
    }).catch(() => {});

    this.workflow.emitEvent({
      eventType: 'ENGAGEMENT_SERVICE_REMOVED', clientId,
      entityType: 'engagement_service', entityId: serviceId,
      actor, severity: 'info',
      payload: { engagementId, serviceId },
    }).catch(() => {});

    return { success: true };
  }

  async getEngagementServices(engagementId: string, clientId: string) {
    const { rows } = await sharedPool.query(
      `SELECT es.*, c.name as service_name, c.category, c.description as service_description
       FROM oc_engagement_services es
       LEFT JOIN oc_capabilities c ON c.id = es.service_id
       WHERE es.engagement_id = $1 AND es.client_id = $2
       ORDER BY es.created_at`,
      [engagementId, clientId]
    );
    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICING
  // ═══════════════════════════════════════════════════════════════════════════

  async getPricing(engagementId: string, clientId: string) {
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return null;

    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_engagement_pricing WHERE engagement_id = $1 ORDER BY created_at DESC LIMIT 1',
      [engagementId]
    );
    return rows[0] || null;
  }

  async setPricing(engagementId: string, clientId: string, data: PricingInput, actor: string = 'unknown-staff') {
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return { success: false, error: 'engagement_not_found' };

    const total = data.total ?? ((data.subtotal || 0) - (data.discount || 0) + (data.tax || 0));

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_engagement_pricing
        (engagement_id, subtotal, discount, tax, total, currency, billing_model, payment_terms, pricing_assumptions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      engagementId, data.subtotal || 0, data.discount || 0, data.tax || 0, total,
      engagement.currency || 'USD', data.billingModel || 'FIXED_PRICE',
      data.paymentTerms || null, JSON.stringify(data.pricingAssumptions || []),
    ]);

    await this.audit.createAuditEntry({
      entityType: 'engagement_pricing', entityId: rows[0].id, entityName: engagement.name,
      action: 'pricing_updated', actor,
      details: { engagementId, total, billingModel: data.billingModel || 'FIXED_PRICE' },
      evidence: [`Pricing set for engagement ${engagement.name}: ${engagement.currency} ${total}`],
    });

    await this.workflow.emitEvent({
      eventType: 'PRICING_UPDATED', clientId,
      entityType: 'engagement_pricing', entityId: rows[0].id, entityName: engagement.name,
      actor, severity: 'info',
      payload: { engagementId, total, currency: engagement.currency },
    });

    return { success: true, pricing: rows[0] };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT SUMMARY (reuses existing AskABD data)
  // ═══════════════════════════════════════════════════════════════════════════

  async getEngagementSummary(engagementId: string, clientId: string) {
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return null;

    // Query each table safely — tables may not have data for this client
    const servicesRes = await sharedPool.query(
      `SELECT es.*, c.name as service_name, c.category FROM oc_engagement_services es
       LEFT JOIN oc_capabilities c ON c.id = es.service_id
       WHERE es.engagement_id = $1 AND es.client_id = $2`, [engagementId, clientId]);
    const pricingRes = await sharedPool.query(
      'SELECT * FROM oc_engagement_pricing WHERE engagement_id = $1 ORDER BY created_at DESC LIMIT 1', [engagementId]);

    let financialRes: { rows: any[] } = { rows: [{ investment: '0', expected_savings: '0', avg_roi: '0', avg_payback: '0' }] };
    try {
      financialRes = await sharedPool.query(
        `SELECT COALESCE(SUM(implementation_cost), 0) as investment, COALESCE(SUM(annual_savings), 0) as expected_savings,
         COALESCE(AVG(roi_percentage), 0) as avg_roi, COALESCE(AVG(payback_months), 0) as avg_payback
         FROM oc_financial_estimates WHERE client_id = $1`, [clientId]);
    } catch { /* table may not exist or no data */ }

    let effortRes: { rows: any[] } = { rows: [{ total_person_days: '0', max_team_size: '0', max_duration: '0' }] };
    try {
      effortRes = await sharedPool.query(
        `SELECT COALESCE(SUM(person_days), 0) as total_person_days, MAX(team_size) as max_team_size,
         COALESCE(MAX(estimated_duration), 0) as max_duration
         FROM oc_effort_estimates WHERE client_id = $1`, [clientId]);
    } catch { /* table may not exist or no data */ }

    let problemsRes: { rows: any[] } = { rows: [{ total: '0', critical: '0', high: '0' }] };
    try {
      problemsRes = await sharedPool.query(
        `SELECT count(*) as total, count(*) FILTER (WHERE severity = 'critical') as critical,
         count(*) FILTER (WHERE severity = 'high') as high
         FROM oc_problems WHERE client_id = $1 AND status NOT IN ('resolved','closed')`, [clientId]);
    } catch { /* table may not exist */ }

    let gapsRes: { rows: any[] } = { rows: [{ total: '0' }] };
    try {
      gapsRes = await sharedPool.query(
        `SELECT count(*) as total FROM oc_gaps WHERE client_id = $1 AND status NOT IN ('resolved','closed')`, [clientId]);
    } catch { /* table may not exist */ }

    const fin: any = financialRes.rows[0] || {};
    const eff: any = effortRes.rows[0] || {};
    const pricing = pricingRes.rows[0] || null;

    return {
      engagement: {
        id: engagement.id,
        name: engagement.name,
        status: engagement.status,
        type: engagement.engagement_type,
        currency: engagement.currency,
      },
      services: {
        total: servicesRes.rows.length,
        items: servicesRes.rows.map((r: any) => ({
          serviceId: r.service_id, name: r.service_name, category: r.category,
          estimatedEffort: r.estimated_effort, estimatedInvestment: r.estimated_investment,
        })),
      },
      financial: {
        investment: parseFloat(fin.investment || '0'),
        expectedSavings: parseFloat(fin.expected_savings || '0'),
        avgRoi: parseFloat(parseFloat(fin.avg_roi || '0').toFixed(1)),
        avgPaybackMonths: parseFloat(parseFloat(fin.avg_payback || '0').toFixed(1)),
      },
      effort: {
        totalPersonDays: parseFloat(eff.total_person_days || '0'),
        maxTeamSize: parseInt(eff.max_team_size || '0', 10),
        maxDuration: parseFloat(eff.max_duration || '0'),
      },
      problems: { total: parseInt(problemsRes.rows[0]?.total || '0', 10), critical: parseInt(problemsRes.rows[0]?.critical || '0', 10), high: parseInt(problemsRes.rows[0]?.high || '0', 10) },
      gaps: { total: parseInt(gapsRes.rows[0]?.total || '0', 10) },
      pricing: pricing ? { subtotal: pricing.subtotal, discount: pricing.discount, tax: pricing.tax, total: pricing.total, billingModel: pricing.billing_model, paymentTerms: pricing.payment_terms } : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPOSALS
  // ═══════════════════════════════════════════════════════════════════════════

  async createProposal(engagementId: string, clientId: string, data: CreateProposalInput, actor: string = 'unknown-staff') {
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return { success: false, error: 'engagement_not_found' };

    // Determine next version number
    const versionRes = await sharedPool.query(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM oc_proposals WHERE engagement_id = $1',
      [engagementId]
    );
    const nextVersion = (versionRes.rows[0]?.max_version || 0) + 1;

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_proposals
        (engagement_id, client_id, version, title, created_by, valid_until)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [
      engagementId, clientId, nextVersion,
      data.title || `Proposal for ${engagement.name}`,
      data.createdBy || actor, data.validUntil || null,
    ]);

    const proposal = rows[0];

    await this.audit.createAuditEntry({
      entityType: 'proposal', entityId: proposal.id, entityName: proposal.title,
      action: 'created', actor: data.createdBy || 'unknown-staff',
      details: { engagementId, version: nextVersion },
      evidence: [`Proposal v${nextVersion} created for engagement ${engagement.name}`],
    });

    await this.workflow.emitEvent({
      eventType: 'PROPOSAL_CREATED', clientId,
      entityType: 'proposal', entityId: proposal.id, entityName: proposal.title,
      actor: data.createdBy || 'unknown-staff', severity: 'info',
      payload: { engagementId, version: nextVersion },
    });

    return { success: true, proposal };
  }

  async getProposal(proposalId: string, clientId?: string) {
    let query = 'SELECT * FROM oc_proposals WHERE id = $1';
    const params: any[] = [proposalId];
    if (clientId) {
      query += ' AND client_id = $2';
      params.push(clientId);
    }
    const { rows } = await sharedPool.query(query, params);
    return rows[0] || null;
  }

  async listProposals(engagementId: string, clientId: string) {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_proposals WHERE engagement_id = $1 AND client_id = $2 ORDER BY version DESC',
      [engagementId, clientId]
    );
    return rows;
  }

  async transitionProposal(proposalId: string, clientId: string, newStatus: string, actor?: string) {
    const proposal = await this.getProposal(proposalId, clientId);
    if (!proposal) return { success: false, error: 'proposal_not_found' };

    const currentStatus = proposal.status;
    const allowed = PROPOSAL_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      return {
        success: false,
        error: 'invalid_transition',
        message: `Cannot transition proposal from "${currentStatus}" to "${newStatus}". Allowed: [${(allowed || []).join(', ')}]`,
      };
    }

    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const params: any[] = [newStatus];

    if (newStatus === 'accepted') {
      updates.push(`approved_by = $${params.length + 1}`);
      params.push(actor || 'unknown-staff');
      updates.push(`approved_at = NOW()`);
    }

    params.push(proposalId);
    params.push(clientId);

    const { rows } = await sharedPool.query(
      `UPDATE oc_proposals SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND client_id = $${params.length} RETURNING *`,
      params
    );

    const updated = rows[0];

    const eventType = newStatus === 'sent' ? 'PROPOSAL_SENT' : newStatus === 'accepted' ? 'PROPOSAL_ACCEPTED' : 'PROPOSAL_STATUS_CHANGED';

    await this.audit.createAuditEntry({
      entityType: 'proposal', entityId: proposalId, entityName: proposal.title || '',
      action: 'status_changed', actor: actor || 'unknown-staff',
      details: { from: currentStatus, to: newStatus, version: proposal.version },
      evidence: [`Proposal status: ${currentStatus} → ${newStatus}`],
    });

    await this.workflow.emitEvent({
      eventType, clientId: proposal.client_id,
      entityType: 'proposal', entityId: proposalId, entityName: proposal.title,
      actor: actor || 'unknown-staff', severity: 'info',
      payload: { from: currentStatus, to: newStatus, version: proposal.version },
    });

    return { success: true, proposal: updated };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPOSAL GENERATION (from existing AskABD data — never fabricate)
  // ═══════════════════════════════════════════════════════════════════════════

  async generateProposalContent(proposalId: string, clientId: string) {
    const proposal = await this.getProposal(proposalId, clientId);
    if (!proposal) return { success: false, error: 'proposal_not_found' };

    const engagementId = proposal.engagement_id;
    const engagement = await this.getEngagement(engagementId, clientId);
    if (!engagement) return { success: false, error: 'engagement_not_found' };

    // Gather all existing AskABD intelligence for this client (safely)
    const servicesRes = await sharedPool.query(
      `SELECT es.*, c.name as service_name, c.category, c.description as service_description
       FROM oc_engagement_services es LEFT JOIN oc_capabilities c ON c.id = es.service_id
       WHERE es.engagement_id = $1 AND es.client_id = $2`, [engagementId, clientId]);

    let problemsRes = { rows: [] as any[] };
    try {
      problemsRes = await sharedPool.query(
        `SELECT title, description, severity, domain, business_impact FROM oc_problems
         WHERE client_id = $1 AND status NOT IN ('resolved','closed') ORDER BY severity DESC LIMIT 20`, [clientId]);
    } catch { /* table may not exist */ }

    let gapsRes = { rows: [] as any[] };
    try {
      gapsRes = await sharedPool.query(
        `SELECT title, description, severity, domain, category FROM oc_gaps
         WHERE client_id = $1 AND status NOT IN ('resolved','closed') ORDER BY severity DESC LIMIT 20`, [clientId]);
    } catch { /* table may not exist */ }

    let financialRes: { rows: any[] } = { rows: [{ investment: '0', expected_savings: '0', avg_roi: '0', avg_payback: '0' }] };
    try {
      financialRes = await sharedPool.query(
        `SELECT COALESCE(SUM(implementation_cost), 0) as investment, COALESCE(SUM(annual_savings), 0) as expected_savings,
         COALESCE(AVG(roi_percentage), 0) as avg_roi, COALESCE(AVG(payback_months), 0) as avg_payback
         FROM oc_financial_estimates WHERE client_id = $1`, [clientId]);
    } catch { /* table may not exist */ }

    let effortRes: { rows: any[] } = { rows: [{ total_person_days: '0', max_team_size: '0', roles: [] }] };
    try {
      const effRaw = await sharedPool.query(
        `SELECT COALESCE(SUM(person_days), 0) as total_person_days, MAX(team_size) as max_team_size
         FROM oc_effort_estimates WHERE client_id = $1`, [clientId]);
      let roles: string[] = [];
      try {
        const rolesRes = await sharedPool.query(
          `SELECT DISTINCT r.value as role FROM oc_effort_estimates, jsonb_array_elements_text(roles) as r(value) WHERE client_id = $1`, [clientId]);
        roles = rolesRes.rows.map((r: any) => r.role);
      } catch { /* roles column may be empty */ }
      effortRes = { rows: [{ ...effRaw.rows[0], roles }] };
    } catch { /* table may not exist */ }

    let transformRes = { rows: [] as any[] };
    try {
      transformRes = await sharedPool.query(
        `SELECT title, status, approach FROM oc_transformations WHERE client_id = $1 LIMIT 10`, [clientId]);
    } catch { /* table may not exist */ }

    let recsRes = { rows: [] as any[] };
    try {
      recsRes = await sharedPool.query(
        `SELECT recommendations FROM oc_recommendations WHERE client_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 1`, [clientId]);
    } catch { /* table may not exist */ }

    const pricingRes = await sharedPool.query(
      'SELECT * FROM oc_engagement_pricing WHERE engagement_id = $1 ORDER BY created_at DESC LIMIT 1', [engagementId]);

    const fin: any = financialRes.rows[0] || {};
    const eff: any = effortRes.rows[0] || {};
    const pricing = pricingRes.rows[0] || null;
    const services = servicesRes.rows;
    const problems = problemsRes.rows;
    const gaps = gapsRes.rows;
    const transformations = transformRes.rows;
    const recommendations = recsRes.rows[0]?.recommendations || [];

    // Build proposal content from actual data — never fabricate
    const executiveSummary = [
      `This proposal outlines a ${engagement.engagement_type} engagement comprising ${services.length} service(s).`,
      problems.length > 0 ? `Analysis has identified ${problems.length} active problem(s) to address.` : '',
      gaps.length > 0 ? `${gaps.length} gap(s) have been identified for resolution.` : '',
      parseFloat(fin.expected_savings || '0') > 0 ? `Expected annual savings: ${engagement.currency} ${parseFloat(fin.expected_savings).toLocaleString()}.` : '',
    ].filter(Boolean).join(' ');

    const scopeSummary = services.map((s: any) =>
      `• ${s.service_name} (${s.category || 'general'})${s.scope_description ? ': ' + s.scope_description : ''}`
    ).join('\n');

    const investmentSummary = parseFloat(fin.investment || '0') > 0
      ? `Total estimated investment: ${engagement.currency} ${parseFloat(fin.investment).toLocaleString()}. Expected ROI: ${parseFloat(fin.avg_roi || '0').toFixed(1)}%. Payback: ${parseFloat(fin.avg_payback || '0').toFixed(0)} months.`
      : 'Financial estimates pending.';

    const valueSummary = parseFloat(fin.expected_savings || '0') > 0
      ? `Expected annual savings: ${engagement.currency} ${parseFloat(fin.expected_savings).toLocaleString()}.`
      : 'Value projections pending.';

    // Update proposal with generated content
    await sharedPool.query(`
      UPDATE oc_proposals SET
        executive_summary = $1, scope_summary = $2, investment_summary = $3, value_summary = $4,
        updated_at = NOW()
      WHERE id = $5 AND client_id = $6
    `, [executiveSummary, scopeSummary, investmentSummary, valueSummary, proposalId, clientId]);

    await this.audit.createAuditEntry({
      entityType: 'proposal', entityId: proposalId, entityName: proposal.title || '',
      action: 'content_generated', actor: 'system',
      details: { services: services.length, problems: problems.length, gaps: gaps.length },
      evidence: [`Proposal content generated from ${services.length} services, ${problems.length} problems, ${gaps.length} gaps`],
    });

    await this.workflow.emitEvent({
      eventType: 'PROPOSAL_GENERATED', clientId,
      entityType: 'proposal', entityId: proposalId, entityName: proposal.title,
      actor: 'system', severity: 'info',
      payload: { services: services.length, problems: problems.length },
    });

    return {
      success: true,
      content: {
        executiveSummary,
        currentSituation: {
          problems: problems.map((p: any) => ({ title: p.title, severity: p.severity, domain: p.domain })),
          gaps: gaps.map((g: any) => ({ title: g.title, severity: g.severity, domain: g.domain })),
        },
        recommendedServices: (Array.isArray(recommendations) ? recommendations : []).slice(0, 10),
        selectedServices: services.map((s: any) => ({ name: s.service_name, category: s.category, description: s.service_description })),
        scope: scopeSummary,
        financialImpact: {
          investment: parseFloat(fin.investment || '0'),
          expectedSavings: parseFloat(fin.expected_savings || '0'),
          roi: parseFloat(parseFloat(fin.avg_roi || '0').toFixed(1)),
          paybackMonths: parseFloat(parseFloat(fin.avg_payback || '0').toFixed(0)),
        },
        effort: {
          totalPersonDays: parseFloat(eff.total_person_days || '0'),
          teamSize: parseInt(eff.max_team_size || '0', 10),
          roles: eff.roles || [],
        },
        transformationApproach: transformations.map((t: any) => ({ title: t.title, approach: t.approach, status: t.status })),
        pricing: pricing ? { subtotal: pricing.subtotal, discount: pricing.discount, total: pricing.total, billingModel: pricing.billing_model, paymentTerms: pricing.payment_terms } : null,
        assumptions: proposal.assumptions || [],
        exclusions: proposal.exclusions || [],
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recalculates engagement totals from its current services.
   * Accepts an optional transaction client so callers that need this atomic with
   * another write (e.g. addService/removeService) can run it inside their own
   * BEGIN/COMMIT — falls back to the shared pool when called standalone.
   */
  private async recalculateEngagementTotals(engagementId: string, client?: PoolClient) {
    const db = client ?? sharedPool;
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(estimated_investment), 0) as total_investment,
              COALESCE(SUM(expected_value), 0) as total_value,
              COALESCE(SUM(estimated_effort), 0) as total_effort
       FROM oc_engagement_services WHERE engagement_id = $1`,
      [engagementId]
    );
    const totals = rows[0] || {};
    await db.query(
      `UPDATE oc_commercial_engagements SET
        total_investment = $1, total_expected_value = $2, total_effort_days = $3, updated_at = NOW()
       WHERE id = $4`,
      [totals.total_investment, totals.total_value, totals.total_effort, engagementId]
    );
  }
}
