/**
 * AskABD Workflow Automation + Event-Driven Notification Engine
 * EVENT → RULE → DECISION → ACTION → NOTIFICATION → ESCALATION → AUDIT
 * Reuses: Notification Service, Audit, shared DB pool.
 * Idempotent, client-isolated, configurable rules.
 */
import { sharedPool } from './db-pool.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformEvent {
  id: string; eventType: string; clientId: string; entityType?: string;
  entityId?: string; actor: string; actorType: string; severity: string;
  payload: any; source: string; correlationId?: string; idempotencyKey?: string;
  processed: boolean; createdAt: string;
}

export interface WorkflowRule {
  id: string; name: string; description?: string; eventType: string;
  conditions: any; actions: any[]; notificationTemplate: any;
  recipientRules: any; escalationRules: any; priority: string;
  severity: string; enabled: boolean; scope: string; clientId?: string;
  cooldownMinutes: number; executionCount: number; failureCount: number;
  lastExecutedAt?: string; createdAt: string;
}

export interface WorkflowExecution {
  id: string; ruleId: string; eventId: string; clientId: string;
  status: string; actionsExecuted: any[]; result: any;
  failureReason?: string; startedAt: string; completedAt?: string;
  durationMs?: number; correlationId?: string;
}

export interface NotificationPreference {
  id: string; clientId: string; userId: string; role: string;
  channel: string; category: string; severityMinimum: string;
  enabled: boolean; quietHoursStart?: string; quietHoursEnd?: string;
  digestMode: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class WorkflowAutomationService {

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT EMISSION
  // ═══════════════════════════════════════════════════════════════════════════

  async emitEvent(data: { eventType: string; clientId: string; entityType?: string; entityId?: string; entityName?: string; actor?: string; actorType?: string; severity?: string; payload?: any; source?: string; correlationId?: string; idempotencyKey?: string }): Promise<{ event: PlatformEvent; executions: WorkflowExecution[] }> {
   try {
    // Idempotency check
    if (data.idempotencyKey) {
      const dup = await sharedPool.query(`SELECT id FROM oc_events WHERE idempotency_key = $1`, [data.idempotencyKey]);
      if (dup.rows.length > 0) {
        const existing = await this.getEvent(dup.rows[0].id);
        return { event: existing!, executions: [] };
      }
    }

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_events (event_type, client_id, entity_type, entity_id, actor, actor_type, severity, payload, source, correlation_id, idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [data.eventType, data.clientId, data.entityType || null, data.entityId || null,
      data.actor || 'system', data.actorType || 'system', data.severity || 'info',
      JSON.stringify({ ...data.payload, entityName: data.entityName }), data.source || 'api',
      data.correlationId || null, data.idempotencyKey || null]);

    const event = this.mapEvent(rows[0]);

    // Process rules for this event
    const executions = await this.processEvent(event);

    // Mark processed
    await sharedPool.query(`UPDATE oc_events SET processed = true, processed_at = NOW() WHERE id = $1`, [event.id]);

    return { event, executions };
   } catch (err) {
    // Workflow event emission must NEVER crash the calling business operation.
    // The primary operation (engagement creation, lifecycle transition, etc.) has already succeeded.
    // Workflow failure is logged but not propagated.
    console.error(`[Workflow] Event emission failed (non-fatal): ${(err as Error).message}`);
    return { event: { id: '', eventType: data.eventType, clientId: data.clientId, entityType: data.entityType || '', entityId: data.entityId || '', actor: data.actor || 'system', actorType: data.actorType || 'system', severity: data.severity || 'info', payload: data.payload || {}, source: data.source || 'api', processed: false, correlationId: data.correlationId || null, idempotencyKey: data.idempotencyKey || null, createdAt: new Date().toISOString() } as PlatformEvent, executions: [] };
   }
  }

  async getEvent(eventId: string): Promise<PlatformEvent | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_events WHERE id = $1', [eventId]);
    return rows.length > 0 ? this.mapEvent(rows[0]) : null;
  }

  async getEvents(clientId: string, limit: number = 50): Promise<PlatformEvent[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_events WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2', [clientId, limit]);
    return rows.map(this.mapEvent);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RULE PROCESSING ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  private async processEvent(event: PlatformEvent): Promise<WorkflowExecution[]> {
    const rules = await this.getMatchingRules(event);
    const executions: WorkflowExecution[] = [];

    for (const rule of rules) {
      // Cooldown check
      if (rule.cooldownMinutes > 0 && rule.lastExecutedAt) {
        const cooldownEnd = new Date(rule.lastExecutedAt).getTime() + rule.cooldownMinutes * 60000;
        if (Date.now() < cooldownEnd) continue;
      }

      // Deduplication: check if this rule already executed for this event type + client recently
      if (rule.cooldownMinutes > 0) {
        const recent = await sharedPool.query(
          `SELECT id FROM oc_workflow_executions WHERE rule_id = $1 AND client_id = $2 AND created_at > NOW() - INTERVAL '1 minute' * $3 LIMIT 1`,
          [rule.id, event.clientId, rule.cooldownMinutes]);
        if (recent.rows.length > 0) continue;
      }

      const execution = await this.executeRule(rule, event);
      executions.push(execution);
    }
    return executions;
  }

  private async getMatchingRules(event: PlatformEvent): Promise<WorkflowRule[]> {
    const { rows } = await sharedPool.query(
      `SELECT * FROM oc_workflow_rules WHERE enabled = true AND event_type = $1 AND (client_id IS NULL OR client_id = $2)`,
      [event.eventType, event.clientId]);

    // Filter by conditions
    return rows.filter((r: any) => this.evaluateConditions(r.conditions, event)).map(this.mapRule);
  }

  private evaluateConditions(conditions: any, event: PlatformEvent): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    // Simple condition matching against event payload/severity
    for (const [key, value] of Object.entries(conditions)) {
      if (key === 'severity' && event.severity !== value) return false;
      if (key === 'entityType' && event.entityType !== value) return false;
      if (event.payload && event.payload[key] !== undefined && event.payload[key] !== value) return false;
    }
    return true;
  }

  private async executeRule(rule: WorkflowRule, event: PlatformEvent): Promise<WorkflowExecution> {
    const startTime = Date.now();
    const actionsExecuted: any[] = [];
    let status = 'completed';
    let failureReason: string | undefined;
    let attempt = 1;
    const maxAttempts = 3;

    while (attempt <= maxAttempts) {
      try {
        for (const action of rule.actions) {
          switch (action.type) {
            case 'CREATE_NOTIFICATION':
              await this.createNotificationFromRule(rule, event);
              actionsExecuted.push({ type: 'CREATE_NOTIFICATION', status: 'completed' });
              break;
            case 'CREATE_ESCALATION':
              await this.createEscalationFromRule(rule, event);
              actionsExecuted.push({ type: 'CREATE_ESCALATION', status: 'completed' });
              break;
            case 'SEND_EMAIL':
              await this.sendEmailFromRule(rule, event);
              actionsExecuted.push({ type: 'SEND_EMAIL', status: 'completed' });
              break;
            default:
              actionsExecuted.push({ type: action.type, status: 'skipped', reason: 'unsupported' });
          }
        }
        status = 'completed';
        break; // Success — exit retry loop
      } catch (err) {
        failureReason = (err as Error).message;
        if (attempt >= maxAttempts) {
          status = 'dead_letter';
        } else {
          attempt++;
          await new Promise(r => setTimeout(r, 500 * attempt)); // Bounded backoff
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Record execution
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_workflow_executions (rule_id, event_id, client_id, status, actions_executed, result, failure_reason, completed_at, duration_ms, correlation_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9) RETURNING *
    `, [rule.id, event.id, event.clientId, status, JSON.stringify(actionsExecuted),
      JSON.stringify({ actionsCount: actionsExecuted.length, attempts: attempt }), failureReason || null,
      durationMs, event.correlationId || null]);

    // Update rule stats
    if (status === 'completed') {
      await sharedPool.query(`UPDATE oc_workflow_rules SET execution_count = execution_count + 1, last_executed_at = NOW(), updated_at = NOW() WHERE id = $1`, [rule.id]);
    } else {
      await sharedPool.query(`UPDATE oc_workflow_rules SET failure_count = failure_count + 1, updated_at = NOW() WHERE id = $1`, [rule.id]);
    }

    return this.mapExecution(rows[0]);
  }

  private async createNotificationFromRule(rule: WorkflowRule, event: PlatformEvent): Promise<void> {
    const tmpl = rule.notificationTemplate || {};
    const entityName = event.payload?.entityName || event.entityId || '';
    const title = (tmpl.title || `${event.eventType}`).replace(/\{entityName\}/g, entityName);
    const message = (tmpl.message || '').replace(/\{entityName\}/g, entityName);

    // Deduplication: check recent notifications for same event type + client
    const dedup = await sharedPool.query(
      `SELECT id FROM oc_notifications WHERE client_id = $1 AND subject = $2 AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
      [event.clientId, title]);
    if (dedup.rows.length > 0) return; // Skip duplicate

    // Check preferences
    const prefOk = await this.checkPreferences(event.clientId, tmpl.category || 'system', rule.severity);
    if (!prefOk) return;

    await sharedPool.query(`
      INSERT INTO oc_notifications (client_id, client_name, phase, priority, subject, summary, details, recipients, evidence, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sent')
    `, [event.clientId, '', event.eventType, rule.severity || 'info', title, message,
      JSON.stringify({ eventId: event.id, ruleId: rule.id, entityType: event.entityType, entityId: event.entityId }),
      JSON.stringify([]), [title]]);
  }

  private async createEscalationFromRule(rule: WorkflowRule, event: PlatformEvent): Promise<void> {
    const escRules = rule.escalationRules || {};
    if (!escRules.afterHours) return;

    const dueAt = new Date(Date.now() + (escRules.afterHours || 48) * 3600000).toISOString();
    const entityName = event.payload?.entityName || event.entityId || '';

    // Dedup: no duplicate escalation for same event
    const dup = await sharedPool.query(`SELECT id FROM oc_escalations WHERE event_id = $1 AND client_id = $2 LIMIT 1`, [event.id, event.clientId]);
    if (dup.rows.length > 0) return;

    await sharedPool.query(`
      INSERT INTO oc_escalations (client_id, event_id, entity_type, entity_id, title, reason, severity, escalation_level, due_at, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,'open')
    `, [event.clientId, event.id, event.entityType, event.entityId,
      `Escalation: ${rule.name} - ${entityName}`, `Auto-escalation from rule "${rule.name}"`,
      escRules.severity || rule.severity || 'high', dueAt]);
  }

  /** Send email notification using template with Mailpit in DEV */
  private async sendEmailFromRule(rule: WorkflowRule, event: PlatformEvent): Promise<void> {
    const tmpl = rule.notificationTemplate || {};
    const entityName = event.payload?.entityName || event.entityId || '';
    const subject = (tmpl.title || event.eventType).replace(/\{entityName\}/g, entityName);
    const body = (tmpl.message || '').replace(/\{entityName\}/g, entityName);

    const html = this.renderEmailTemplate(subject, body, event.severity, event.clientId);

    try {
      const { sendEmail } = await import('./email-transport.js');
      await sendEmail({
        to: `client-${event.clientId}@askabd.com`,
        subject: `[AskABD ${event.severity.toUpperCase()}] ${subject}`,
        html,
        from: 'AskABD Workflow <workflow@askabd.com>',
      });
    } catch { /* Email delivery is best-effort in workflow — notification already created */ }
  }

  /** Render HTML email template */
  private renderEmailTemplate(title: string, message: string, severity: string, clientId: string): string {
    const severityColor = severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f59e0b' : severity === 'warning' ? '#eab308' : '#3b82f6';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;padding:20px">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:${severityColor};padding:16px 24px"><h1 style="margin:0;color:#fff;font-size:18px">${title}</h1></div>
        <div style="padding:24px">
          <p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 16px">${message}</p>
          <div style="background:#f1f5f9;padding:12px;border-radius:6px;margin:16px 0">
            <p style="margin:0;font-size:12px;color:#64748b"><strong>Severity:</strong> ${severity.toUpperCase()}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b"><strong>Client:</strong> ${clientId}</p>
          </div>
          <a href="http://localhost:3001/client-portal/${clientId}" style="display:inline-block;background:#1e40af;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;margin-top:12px">View in Portal →</a>
        </div>
        <div style="background:#f8fafc;padding:12px 24px;border-top:1px solid #e2e8f0"><p style="margin:0;font-size:11px;color:#94a3b8">AskABD Enterprise Platform • Automated Notification</p></div>
      </div>
    </body></html>`;
  }

  private async checkPreferences(clientId: string, category: string, severity: string): Promise<boolean> {
    const { rows } = await sharedPool.query(
      `SELECT enabled, severity_minimum FROM oc_notification_preferences WHERE client_id = $1 AND category = $2 AND enabled = true LIMIT 1`,
      [clientId, category]);
    if (rows.length === 0) return true; // No preference = allow all
    const sevOrder = ['info', 'success', 'warning', 'high', 'critical'];
    const minIdx = sevOrder.indexOf(rows[0].severity_minimum || 'info');
    const curIdx = sevOrder.indexOf(severity || 'info');
    return curIdx >= minIdx;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKFLOW RULES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async getRules(filters?: { eventType?: string; enabled?: boolean }): Promise<WorkflowRule[]> {
    let where = 'WHERE 1=1'; const params: any[] = []; let idx = 1;
    if (filters?.eventType) { where += ` AND event_type = $${idx++}`; params.push(filters.eventType); }
    if (filters?.enabled !== undefined) { where += ` AND enabled = $${idx++}`; params.push(filters.enabled); }
    const { rows } = await sharedPool.query(`SELECT * FROM oc_workflow_rules ${where} ORDER BY priority DESC, name`, params);
    return rows.map(this.mapRule);
  }

  async getRule(ruleId: string): Promise<WorkflowRule | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_workflow_rules WHERE id = $1', [ruleId]);
    return rows.length > 0 ? this.mapRule(rows[0]) : null;
  }

  async createRule(data: Partial<WorkflowRule>): Promise<WorkflowRule> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_workflow_rules (name, description, event_type, conditions, actions, notification_template, recipient_rules, escalation_rules, priority, severity, enabled, scope, client_id, cooldown_minutes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `, [data.name || 'Custom Rule', data.description, data.eventType || 'LIFECYCLE_CHANGED',
      JSON.stringify(data.conditions || {}), JSON.stringify(data.actions || [{ type: 'CREATE_NOTIFICATION' }]),
      JSON.stringify(data.notificationTemplate || {}), JSON.stringify(data.recipientRules || {}),
      JSON.stringify(data.escalationRules || {}), data.priority || 'medium', data.severity || 'info',
      data.enabled !== false, data.scope || 'global', data.clientId || null,
      data.cooldownMinutes || 0, 'admin']);
    return this.mapRule(rows[0]);
  }

  async toggleRule(ruleId: string, enabled: boolean): Promise<WorkflowRule | null> {
    const { rows } = await sharedPool.query(`UPDATE oc_workflow_rules SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [enabled, ruleId]);
    return rows.length > 0 ? this.mapRule(rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATION PREFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  async getPreferences(clientId: string, userId?: string): Promise<NotificationPreference[]> {
    const where = userId ? 'WHERE client_id = $1 AND user_id = $2' : 'WHERE client_id = $1';
    const params = userId ? [clientId, userId] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_notification_preferences ${where} ORDER BY category, channel`, params);
    return rows.map(this.mapPreference);
  }

  async upsertPreference(clientId: string, data: Partial<NotificationPreference>): Promise<NotificationPreference> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_notification_preferences (client_id, user_id, role, channel, category, severity_minimum, enabled, quiet_hours_start, quiet_hours_end, digest_mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (client_id, user_id, channel, category) DO UPDATE SET
        severity_minimum = EXCLUDED.severity_minimum, enabled = EXCLUDED.enabled,
        quiet_hours_start = EXCLUDED.quiet_hours_start, quiet_hours_end = EXCLUDED.quiet_hours_end,
        digest_mode = EXCLUDED.digest_mode, updated_at = NOW()
      RETURNING *
    `, [clientId, data.userId || 'default', data.role || 'CLIENT_ADMIN',
      data.channel || 'IN_APP', data.category || 'system',
      data.severityMinimum || 'info', data.enabled !== false,
      data.quietHoursStart || null, data.quietHoursEnd || null,
      data.digestMode || 'immediate']);
    return this.mapPreference(rows[0]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ESCALATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getEscalations(clientId: string, status?: string): Promise<any[]> {
    const where = status ? 'WHERE client_id = $1 AND status = $2' : 'WHERE client_id = $1';
    const params = status ? [clientId, status] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_escalations ${where} ORDER BY created_at DESC LIMIT 50`, params);
    return rows.map((r: any) => ({ id: r.id, clientId: r.client_id, eventId: r.event_id, entityType: r.entity_type, entityId: r.entity_id, title: r.title, reason: r.reason, severity: r.severity, level: r.escalation_level, owner: r.owner, dueAt: r.due_at, acknowledgedAt: r.acknowledged_at, resolvedAt: r.resolved_at, status: r.status, createdAt: r.created_at }));
  }

  async acknowledgeEscalation(escalationId: string): Promise<boolean> {
    const { rowCount } = await sharedPool.query(`UPDATE oc_escalations SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'open'`, [escalationId]);
    return (rowCount ?? 0) > 0;
  }

  async resolveEscalation(escalationId: string): Promise<boolean> {
    const { rowCount } = await sharedPool.query(`UPDATE oc_escalations SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1`, [escalationId]);
    return (rowCount ?? 0) > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getExecutions(filters?: { clientId?: string; ruleId?: string; status?: string; limit?: number }): Promise<WorkflowExecution[]> {
    let where = 'WHERE 1=1'; const params: any[] = []; let idx = 1;
    if (filters?.clientId) { where += ` AND client_id = $${idx++}`; params.push(filters.clientId); }
    if (filters?.ruleId) { where += ` AND rule_id = $${idx++}`; params.push(filters.ruleId); }
    if (filters?.status) { where += ` AND status = $${idx++}`; params.push(filters.status); }
    const limit = filters?.limit || 50;
    const { rows } = await sharedPool.query(`SELECT * FROM oc_workflow_executions ${where} ORDER BY created_at DESC LIMIT ${limit}`, params);
    return rows.map(this.mapExecution);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private mapEvent(row: any): PlatformEvent {
    return { id: row.id, eventType: row.event_type, clientId: row.client_id, entityType: row.entity_type, entityId: row.entity_id, actor: row.actor, actorType: row.actor_type, severity: row.severity, payload: row.payload || {}, source: row.source, correlationId: row.correlation_id, idempotencyKey: row.idempotency_key, processed: row.processed, createdAt: row.created_at };
  }

  private mapRule(row: any): WorkflowRule {
    return { id: row.id, name: row.name, description: row.description, eventType: row.event_type, conditions: row.conditions || {}, actions: row.actions || [], notificationTemplate: row.notification_template || {}, recipientRules: row.recipient_rules || {}, escalationRules: row.escalation_rules || {}, priority: row.priority, severity: row.severity, enabled: row.enabled, scope: row.scope, clientId: row.client_id, cooldownMinutes: row.cooldown_minutes || 0, executionCount: row.execution_count || 0, failureCount: row.failure_count || 0, lastExecutedAt: row.last_executed_at, createdAt: row.created_at };
  }

  private mapExecution(row: any): WorkflowExecution {
    return { id: row.id, ruleId: row.rule_id, eventId: row.event_id, clientId: row.client_id, status: row.status, actionsExecuted: row.actions_executed || [], result: row.result || {}, failureReason: row.failure_reason, startedAt: row.started_at, completedAt: row.completed_at, durationMs: row.duration_ms, correlationId: row.correlation_id };
  }

  private mapPreference(row: any): NotificationPreference {
    return { id: row.id, clientId: row.client_id, userId: row.user_id, role: row.role, channel: row.channel, category: row.category, severityMinimum: row.severity_minimum, enabled: row.enabled, quietHoursStart: row.quiet_hours_start, quietHoursEnd: row.quiet_hours_end, digestMode: row.digest_mode };
  }
}
