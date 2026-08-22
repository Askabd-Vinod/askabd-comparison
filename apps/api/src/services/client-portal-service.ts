/**
 * AskABD Client Self-Service Portal Service
 * Aggregates ALL existing client data into a unified client-facing view.
 * NO new tables — pure aggregation on existing data.
 * Security: masks credentials, respects classification, client-isolated.
 * Reuses: Lifecycle, Requirements, Problems, Gaps, Transformations, Financial, Optimization, Notifications.
 */
import { sharedPool } from './db-pool.js';

export class ClientPortalService {

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTAL HOME — Executive Client Dashboard
  // ═══════════════════════════════════════════════════════════════════════════

  async getPortalHome(clientId: string): Promise<any> {
    const [lcRes, probRes, gapRes, tfmRes, finRes, optRes, reqRes, notifRes, connRes] = await Promise.all([
      sharedPool.query(`SELECT * FROM oc_lifecycle WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE severity = 'critical') as critical, count(*) FILTER (WHERE severity = 'high') as high, count(*) FILTER (WHERE status NOT IN ('resolved','rejected')) as open FROM oc_problems WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status NOT IN ('resolved','closed','rejected','accepted_risk')) as open FROM oc_gaps WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'in_progress') as active, count(*) FILTER (WHERE status = 'completed') as completed FROM oc_transformations WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT COALESCE(SUM(annual_savings), 0) as expected, COALESCE(SUM(implementation_cost), 0) as investment FROM oc_financial_estimates WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) FILTER (WHERE status IN ('detected','acknowledged')) as open_findings FROM oc_optimization_findings WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'submitted' OR status = 'validated') as completed, count(*) FILTER (WHERE status IS NULL OR status = 'pending' OR status = 'not_started') as missing FROM oc_client_service_requirements WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) FILTER (WHERE read_at IS NULL) as unread FROM oc_notifications WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'connected') as connected FROM oc_connectors WHERE client_id = $1`, [clientId]),
    ]);

    const lifecycle = lcRes.rows[0] || {};
    const prob = probRes.rows[0] || {};
    const gap = gapRes.rows[0] || {};
    const tfm = tfmRes.rows[0] || {};
    const fin = finRes.rows[0] || {};
    const opt = optRes.rows[0] || {};
    const req = reqRes.rows[0] || {};
    const notif = notifRes.rows[0] || {};
    const conn = connRes.rows[0] || {};

    // Outcomes
    const outRes = await sharedPool.query(`SELECT COALESCE(SUM(actual_savings), 0) as realized, COALESCE(AVG(benefit_realization_pct), 0) as benefit_pct FROM oc_transformation_outcomes WHERE client_id = $1`, [clientId]);
    const out = outRes.rows[0] || {};

    // Calculate overall progress from lifecycle
    const stageOrder = ['organization-created','otp-verified','identity-verified','security-validated','environment-registered','connector-validated','discovery-complete','assessment-complete','recommendations-ready','migration-planned','migration-approved','migration-running','migration-complete','validation-passed','managed-services','engineering-intelligence'];
    const currentIdx = stageOrder.indexOf(lifecycle.status || '');
    const progress = currentIdx >= 0 ? Math.round((currentIdx / (stageOrder.length - 1)) * 100) : 0;

    return {
      clientId,
      lifecycle: { status: lifecycle.status || 'unknown', version: lifecycle.version, progress },
      problems: { total: parseInt(prob.total || '0'), critical: parseInt(prob.critical || '0'), high: parseInt(prob.high || '0'), open: parseInt(prob.open || '0') },
      gaps: { total: parseInt(gap.total || '0'), open: parseInt(gap.open || '0') },
      transformations: { total: parseInt(tfm.total || '0'), active: parseInt(tfm.active || '0'), completed: parseInt(tfm.completed || '0') },
      financial: { expectedSavings: parseFloat(fin.expected || '0'), investment: parseFloat(fin.investment || '0'), realizedSavings: parseFloat(out.realized || '0'), benefitRealization: parseFloat(parseFloat(out.benefit_pct || '0').toFixed(1)) },
      optimization: { openFindings: parseInt(opt.open_findings || '0') },
      requirements: { total: parseInt(req.total || '0'), completed: parseInt(req.completed || '0'), missing: parseInt(req.missing || '0') },
      notifications: { unread: parseInt(notif.unread || '0') },
      connectors: { total: parseInt(conn.total || '0'), connected: parseInt(conn.connected || '0') },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION CENTER — What does the client need to do?
  // ═══════════════════════════════════════════════════════════════════════════

  async getActionCenter(clientId: string): Promise<any[]> {
    const actions: any[] = [];

    // Missing requirements
    const reqRes = await sharedPool.query(
      `SELECT service_id, requirement_key, status FROM oc_client_service_requirements WHERE client_id = $1 AND (status IS NULL OR status IN ('pending','not_started','rejected'))`,
      [clientId]);
    for (const r of reqRes.rows) {
      actions.push({ type: 'requirement', priority: 'high', title: `Complete requirement: ${r.requirement_key}`, description: `Service "${r.service_id}" requires "${r.requirement_key}"`, link: `/clients/${clientId}/lifecycle`, entity: { serviceId: r.service_id, key: r.requirement_key }, status: r.status || 'not_started' });
    }

    // Missing documents
    const docReq = await sharedPool.query(
      `SELECT DISTINCT service_id, requirement_key FROM oc_client_service_requirements WHERE client_id = $1 AND requirement_key LIKE '%document%' AND (status IS NULL OR status IN ('pending','not_started'))`,
      [clientId]);
    for (const d of docReq.rows) {
      actions.push({ type: 'document', priority: 'medium', title: `Upload document: ${d.requirement_key}`, description: `Required for service "${d.service_id}"`, link: `/clients/${clientId}/lifecycle`, entity: { serviceId: d.service_id, key: d.requirement_key } });
    }

    // Connectors needing validation
    const connRes = await sharedPool.query(
      `SELECT provider, status FROM oc_connectors WHERE client_id = $1 AND status != 'connected'`,
      [clientId]);
    for (const c of connRes.rows) {
      actions.push({ type: 'connector', priority: 'medium', title: `Validate connector: ${c.provider}`, description: `Connector "${c.provider}" status: ${c.status}`, link: `/clients/${clientId}/lifecycle` });
    }

    // Recommendations awaiting approval
    const recRes = await sharedPool.query(
      `SELECT id, summary FROM oc_recommendations WHERE client_id = $1 AND status = 'ready'`,
      [clientId]);
    for (const r of recRes.rows) {
      actions.push({ type: 'approval', priority: 'medium', title: `Review recommendation`, description: (r.summary as any)?.title || 'Recommendation ready for review', link: `/clients/${clientId}/lifecycle`, entity: { recommendationId: r.id } });
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    return actions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVITY TIMELINE — Client-safe events
  // ═══════════════════════════════════════════════════════════════════════════

  async getActivityTimeline(clientId: string, limit: number = 50): Promise<any[]> {
    // Get lifecycle history + audit events (client-safe only)
    const safeActions = ['otp_sent', 'otp_verified', 'lifecycle_transition', 'requirement_updated', 'document_uploaded', 'document_validated', 'connector_configured', 'connection_validated', 'discovery_completed', 'assessment_completed', 'recommendations_generated', 'recommendation_approved', 'migration_plan_created', 'migration_completed', 'problems_imported', 'gaps_generated', 'decision_made', 'transformation_created', 'outcome_recorded', 'measurement_recorded', 'baseline_captured'];

    const events = await sharedPool.query(
      `SELECT action, entity_type, entity_name, details, created_at FROM oc_audit_log WHERE entity_id = $1 AND action = ANY($2) ORDER BY created_at DESC LIMIT $3`,
      [clientId, safeActions, limit]);

    return events.rows.map((r: any) => ({
      action: r.action, type: r.entity_type, name: r.entity_name,
      timestamp: r.created_at,
      description: this.humanizeAction(r.action, r.entity_name, r.details),
    }));
  }

  private humanizeAction(action: string, name: string, details: any): string {
    switch (action) {
      case 'otp_sent': return 'Verification code sent to business owner';
      case 'otp_verified': return 'Business owner identity verified';
      case 'lifecycle_transition': return `Progress: ${details?.event || name}`;
      case 'requirement_updated': return `Requirement "${name}" updated`;
      case 'document_uploaded': return `Document "${name}" uploaded`;
      case 'document_validated': return `Document "${name}" validated`;
      case 'connector_configured': return `Connector "${name}" configured`;
      case 'connection_validated': return `Connection to "${name}" validated`;
      case 'discovery_completed': return 'Infrastructure discovery completed';
      case 'assessment_completed': return 'Risk assessment completed';
      case 'recommendations_generated': return 'Recommendations generated';
      case 'recommendation_approved': return 'Recommendation approved';
      case 'migration_plan_created': return 'Migration plan created';
      case 'migration_completed': return 'Migration completed successfully';
      case 'problems_imported': return `${details?.created || 'New'} problems identified`;
      case 'gaps_generated': return `${details?.created || 'New'} gaps identified`;
      case 'decision_made': return 'Decision recorded';
      case 'transformation_created': return `Transformation "${name}" planned`;
      case 'outcome_recorded': return 'Transformation outcome recorded';
      case 'measurement_recorded': return 'Optimization measurement recorded';
      case 'baseline_captured': return 'Performance baseline captured';
      default: return action.replace(/_/g, ' ');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getNotifications(clientId: string, limit: number = 50): Promise<any[]> {
    const { rows } = await sharedPool.query(
      `SELECT id, subject, summary, priority, phase, status, sent_at, read_at, created_at FROM oc_notifications WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [clientId, limit]);
    return rows.map(r => ({ id: r.id, subject: r.subject, summary: r.summary, priority: r.priority, phase: r.phase, status: r.status, sentAt: r.sent_at, readAt: r.read_at, createdAt: r.created_at, unread: !r.read_at }));
  }

  async markNotificationRead(notificationId: string, clientId: string): Promise<boolean> {
    const { rowCount } = await sharedPool.query(
      `UPDATE oc_notifications SET read_at = NOW() WHERE id = $1 AND client_id = $2 AND read_at IS NULL`, [notificationId, clientId]);
    return (rowCount ?? 0) > 0;
  }

  async markAllRead(clientId: string): Promise<number> {
    const { rowCount } = await sharedPool.query(
      `UPDATE oc_notifications SET read_at = NOW() WHERE client_id = $1 AND read_at IS NULL`, [clientId]);
    return rowCount ?? 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL VALUE — Client-facing
  // ═══════════════════════════════════════════════════════════════════════════

  async getFinancialSummary(clientId: string): Promise<any> {
    const [finRes, outRes] = await Promise.all([
      sharedPool.query(`SELECT COALESCE(SUM(annual_savings), 0) as expected_savings, COALESCE(SUM(implementation_cost), 0) as investment, COALESCE(AVG(roi_percentage), 0) as avg_roi, COALESCE(AVG(payback_months), 0) as avg_payback FROM oc_financial_estimates WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT COALESCE(SUM(actual_savings), 0) as realized, COALESCE(SUM(expected_savings), 0) as expected_out, COALESCE(AVG(benefit_realization_pct), 0) as benefit_pct, COALESCE(SUM(actual_cost), 0) as actual_cost FROM oc_transformation_outcomes WHERE client_id = $1`, [clientId]),
    ]);
    const f = finRes.rows[0] || {}; const o = outRes.rows[0] || {};
    const realized = parseFloat(o.realized || '0');
    const expectedOut = parseFloat(o.expected_out || '0');
    return {
      investment: parseFloat(f.investment || '0'),
      expectedSavings: parseFloat(f.expected_savings || '0'),
      realizedSavings: realized,
      missedSavings: Math.max(0, expectedOut - realized),
      avgRoi: parseFloat(parseFloat(f.avg_roi || '0').toFixed(1)),
      avgPaybackMonths: parseFloat(parseFloat(f.avg_payback || '0').toFixed(1)),
      benefitRealization: parseFloat(parseFloat(o.benefit_pct || '0').toFixed(1)),
      actualCost: parseFloat(o.actual_cost || '0'),
      dataSource: realized > 0 ? 'measured' : 'estimated',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTOR STATUS (masked — no credentials exposed)
  // ═══════════════════════════════════════════════════════════════════════════

  async getConnectorStatus(clientId: string): Promise<any[]> {
    const { rows } = await sharedPool.query(
      `SELECT provider, status, security_level, last_tested_at, created_at FROM oc_connectors WHERE client_id = $1 ORDER BY provider`, [clientId]);
    return rows.map(r => ({
      provider: r.provider, status: r.status, securityLevel: r.security_level,
      validatedAt: r.last_tested_at, createdAt: r.created_at,
      // SECURITY: never expose connection fields/credentials
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROBLEMS (client-safe view)
  // ═══════════════════════════════════════════════════════════════════════════

  async getProblems(clientId: string): Promise<any[]> {
    const { rows } = await sharedPool.query(
      `SELECT id, domain, category, title, description, severity, priority, status, business_impact, financial_impact_summary, created_at FROM oc_problems WHERE client_id = $1 ORDER BY severity DESC, priority DESC LIMIT 50`, [clientId]);
    return rows.map(r => ({ id: r.id, domain: r.domain, category: r.category, title: r.title, description: r.description, severity: r.severity, priority: r.priority, status: r.status, businessImpact: r.business_impact, financialImpact: r.financial_impact_summary, createdAt: r.created_at }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAPS (client-safe view)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Real defect fixed here (found during the Gap Analysis extension pass,
   * migration 044): this previously returned EVERY gap for the client with
   * no visibility filter at all — internal-only gaps (root cause, internal
   * risk commentary excluded from the SELECT list, but the gap's very
   * existence and business impact were still exposed) were visible to any
   * genuinely-mapped customer. Gaps are internal by default
   * (`customer_visible` defaults false) — a customer must now only ever
   * see gaps staff explicitly opted in, same default-closed convention as
   * CRM's contact/note/task visibility.
   */
  async getGaps(clientId: string): Promise<any[]> {
    const { rows } = await sharedPool.query(
      `SELECT id, domain, category, title, description, current_state, target_state, severity, priority, status, current_maturity, target_maturity, business_impact, compliance_status, compliance_status_reason, created_at FROM oc_gaps WHERE client_id = $1 AND customer_visible = true ORDER BY severity DESC, priority DESC LIMIT 50`, [clientId]);
    return rows.map(r => ({ id: r.id, domain: r.domain, category: r.category, title: r.title, description: r.description, currentState: r.current_state, targetState: r.target_state, severity: r.severity, priority: r.priority, status: r.status, currentMaturity: r.current_maturity, targetMaturity: r.target_maturity, businessImpact: r.business_impact, complianceStatus: r.compliance_status, complianceStatusReason: r.compliance_status_reason, createdAt: r.created_at }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFORMATIONS (client-safe view)
  // ═══════════════════════════════════════════════════════════════════════════

  async getTransformations(clientId: string): Promise<any[]> {
    const { rows } = await sharedPool.query(
      `SELECT id, title, description, domain, transformation_type, status, phases, milestones, investment, expected_savings, expected_roi, duration, rollback_strategy, expected_outcome, actual_outcome, started_at, completed_at, created_at FROM oc_transformations WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);

    // Enrich with outcomes
    const outcomes = await sharedPool.query(`SELECT * FROM oc_transformation_outcomes WHERE client_id = $1`, [clientId]);
    const outMap: Record<string, any> = {};
    outcomes.rows.forEach((r: any) => { if (!outMap[r.transformation_id]) outMap[r.transformation_id] = r; });

    return rows.map(r => ({
      id: r.id, title: r.title, description: r.description, domain: r.domain,
      type: r.transformation_type, status: r.status,
      phases: r.phases || [], milestones: r.milestones || [],
      investment: parseFloat(r.investment) || null, expectedSavings: parseFloat(r.expected_savings) || null,
      expectedRoi: parseFloat(r.expected_roi) || null, duration: r.duration,
      rollbackStrategy: r.rollback_strategy, expectedOutcome: r.expected_outcome,
      actualOutcome: r.actual_outcome, startedAt: r.started_at, completedAt: r.completed_at,
      outcome: outMap[r.id] ? { health: outMap[r.id].health, benefitRealization: parseFloat(outMap[r.id].benefit_realization_pct) || null, costVariance: parseFloat(outMap[r.id].cost_variance_pct) || null, actualSavings: parseFloat(outMap[r.id].actual_savings) || null } : null,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZATION (client-safe view)
  // ═══════════════════════════════════════════════════════════════════════════

  async getOptimizationSummary(clientId: string): Promise<any> {
    const [metRes, findRes, msrRes] = await Promise.all([
      sharedPool.query(`SELECT id, name, category, unit, direction, target_value, last_measured_at FROM oc_metric_definitions WHERE client_id = $1 AND enabled = true ORDER BY category, name`, [clientId]),
      sharedPool.query(`SELECT id, title, severity, status, actual_value, baseline_value, variance_pct, recommendation, detected_at FROM oc_optimization_findings WHERE client_id = $1 AND status IN ('detected','acknowledged') ORDER BY severity DESC LIMIT 20`, [clientId]),
      sharedPool.query(`SELECT metric_id, value, variance_pct, alert_level, measured_at FROM oc_measurements WHERE client_id = $1 ORDER BY measured_at DESC LIMIT 20`, [clientId]),
    ]);
    return {
      metrics: metRes.rows.map(r => ({ id: r.id, name: r.name, category: r.category, unit: r.unit, direction: r.direction, targetValue: parseFloat(r.target_value) || null, lastMeasuredAt: r.last_measured_at })),
      findings: findRes.rows.map(r => ({ id: r.id, title: r.title, severity: r.severity, status: r.status, actualValue: parseFloat(r.actual_value) || null, baselineValue: parseFloat(r.baseline_value) || null, variancePct: parseFloat(r.variance_pct) || null, recommendation: r.recommendation, detectedAt: r.detected_at })),
      recentMeasurements: msrRes.rows.map(r => ({ metricId: r.metric_id, value: parseFloat(r.value), variancePct: parseFloat(r.variance_pct) || null, alertLevel: r.alert_level, measuredAt: r.measured_at })),
    };
  }
}
