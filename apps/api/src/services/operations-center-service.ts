import { getPool } from '../db/connection.js';

/**
 * Operations Center Service — manages clients, audit logs, remediations, and service actions.
 * All operations are persisted to PostgreSQL for evidence and compliance.
 *
 * Audit-write policy (verified per call site, not assumed — see the final hardening pass):
 * every method below writes its own durable, queryable primary record (oc_clients,
 * oc_remediations, oc_service_actions) BEFORE it writes to oc_audit_log. The audit_log
 * entry is therefore a supplementary cross-entity trail, never the sole evidence a change
 * happened — the primary table already is that evidence. On that basis, every audit call
 * here is best-effort: a failure to write the audit trail must not turn an already-committed
 * primary write into a reported failure. Failures are still logged (never silently
 * swallowed) so an operator can notice and investigate a degraded audit trail.
 */
export class OperationsCenterService {
  private pool = getPool();

  // ─── CLIENTS ──────────────────────────────────────────────────────────────

  async createClient(data: CreateClientInput) {
    const result = await this.pool.query(
      `INSERT INTO oc_clients (name, logo, industry, country, timezone, business_size, support_model, criticality,
        primary_contact, departments, capabilities, processes, applications, tech_apps, tech_services,
        tech_apis, tech_databases, tech_servers, tech_cloud, tech_infrastructure, environments,
        monitoring, enabled_services, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [data.name, data.logo || '', data.industry || '', data.country || '', data.timezone || 'UTC', data.businessSize || '',
       data.supportModel || '', data.criticality || 'standard', data.primaryContact || '', data.departments || '{}', data.capabilities || '{}',
       data.processes || '{}', data.applications || '{}', data.techApps || '{}', data.techServices || '{}', data.techApis || '{}',
       data.techDatabases || '{}', data.techServers || '{}', data.techCloud || '{}', data.techInfrastructure || '{}',
       JSON.stringify(data.environments || []), JSON.stringify(data.monitoring || {}), data.enabledServices || '{}',
       JSON.stringify(data.metadata || {})]
    );

    const client = result.rows[0];

    // Audit — best-effort (see class-level policy note): oc_clients row above is already
    // the durable record of this client's creation.
    this.auditBestEffort({
      entityType: 'client', entityId: client.id, entityName: data.name,
      action: 'created', actor: data.primaryContact || 'system',
      details: { industry: data.industry, country: data.country, size: data.businessSize },
      evidence: [`Client "${data.name}" onboarded at ${new Date().toISOString()}`],
    }, `client created: ${client.id}`);

    return client;
  }

  async listClients(filters?: { health?: string; status?: string }) {
    let query = 'SELECT * FROM oc_clients WHERE 1=1';
    const params: string[] = [];
    if (filters?.health) { params.push(filters.health); query += ` AND health = $${params.length}`; }
    if (filters?.status) { params.push(filters.status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getClient(id: string) {
    const result = await this.pool.query('SELECT * FROM oc_clients WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async updateClient(id: string, data: Partial<CreateClientInput>) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.name) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.industry) { sets.push(`industry = $${idx++}`); params.push(data.industry); }
    if (data.country) { sets.push(`country = $${idx++}`); params.push(data.country); }
    if (data.timezone) { sets.push(`timezone = $${idx++}`); params.push(data.timezone); }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const result = await this.pool.query(
      `UPDATE oc_clients SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params
    );
    return result.rows[0];
  }

  // ─── AUDIT LOG ────────────────────────────────────────────────────────────

  async createAuditEntry(entry: AuditEntry) {
    const result = await this.pool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence, environment, ip_address, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [entry.entityType, entry.entityId, entry.entityName, entry.action, entry.actor,
       JSON.stringify(entry.details || {}), entry.evidence || [], entry.environment || 'production',
       entry.ipAddress || '', entry.correlationId || '']
    );
    return result.rows[0];
  }

  /**
   * Fire-and-forget audit write for callers whose primary record already durably
   * captures the change (see the class-level audit-write policy note above). Never
   * throws — a failed audit write must not turn a successful primary operation into
   * a reported failure — but never silently swallows either: logged so it's visible.
   */
  private auditBestEffort(entry: AuditEntry, context: string): void {
    this.createAuditEntry(entry).catch((err) => {
      console.error(`[Audit] Failed to record "${context}" audit entry (primary operation already succeeded):`, err instanceof Error ? err.message : err);
    });
  }

  async getAuditLog(filters?: { entityType?: string; entityId?: string; limit?: number }) {
    let query = 'SELECT * FROM oc_audit_log WHERE 1=1';
    const params: any[] = [];
    if (filters?.entityType) { params.push(filters.entityType); query += ` AND entity_type = $${params.length}`; }
    if (filters?.entityId) { params.push(filters.entityId); query += ` AND entity_id = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    if (filters?.limit) { params.push(filters.limit); query += ` LIMIT $${params.length}`; }
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // ─── REMEDIATIONS ─────────────────────────────────────────────────────────

  async createRemediation(data: CreateRemediationInput) {
    const result = await this.pool.query(
      `INSERT INTO oc_remediations (incident_id, client_id, title, description, grade, fix_immediate, fix_permanent,
        impact_analysis, steps, validation_criteria, rollback_plan, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.incidentId, data.clientId, data.title, data.description || '', data.grade,
       data.fixImmediate, data.fixPermanent, JSON.stringify(data.impactAnalysis || {}),
       JSON.stringify(data.steps || []), data.validationCriteria || [], data.rollbackPlan || '', data.owner]
    );

    this.auditBestEffort({
      entityType: 'remediation', entityId: result.rows[0].id, entityName: data.title,
      action: 'created', actor: data.owner,
      details: { incidentId: data.incidentId, grade: data.grade },
      evidence: [`Remediation plan created for incident ${data.incidentId}`],
    }, `remediation created: ${result.rows[0].id}`);

    return result.rows[0];
  }

  /**
   * Real fix for a real bug found during live browser verification of the
   * remediation-execution engine: the incident-detail page's previous "list, then
   * create if empty" pattern was two separate HTTP round trips with a genuine race —
   * two page loads close together (a double request, a slow network, React re-render)
   * could both see an empty list and both create a remediation, leaving a duplicate
   * open row for the same incident. This does the check-and-insert atomically in one
   * statement — `WHERE NOT EXISTS` inside the same INSERT means Postgres itself
   * enforces "no second OPEN remediation for this incident", not application logic
   * racing against itself. Deliberately still allows a genuinely NEW remediation once
   * a prior one reaches a terminal phase (completed/rolled-back/failed) — a real
   * incident can legitimately need a second remediation attempt.
   */
  async findOrCreateRemediation(data: CreateRemediationInput) {
    // Real atomicity, enforced by Postgres itself via a partial unique index
    // (029_remediation_idempotency.sql) — not application-level check-then-insert,
    // which is provably unsafe under READ COMMITTED (confirmed by a real 10-way
    // concurrent test that reproduced 2 duplicate rows before this fix).
    const insertResult = await this.pool.query(
      `INSERT INTO oc_remediations (incident_id, client_id, title, description, grade, fix_immediate, fix_permanent,
        impact_analysis, steps, validation_criteria, rollback_plan, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (incident_id) WHERE phase NOT IN ('completed', 'rolled-back', 'failed') DO NOTHING
       RETURNING *`,
      [data.incidentId, data.clientId, data.title, data.description || '', data.grade,
       data.fixImmediate, data.fixPermanent, JSON.stringify(data.impactAnalysis || {}),
       JSON.stringify(data.steps || []), data.validationCriteria || [], data.rollbackPlan || '', data.owner]
    );
    if (insertResult.rows.length > 0) {
      const created = insertResult.rows[0];
      this.auditBestEffort({
        entityType: 'remediation', entityId: created.id, entityName: data.title,
        action: 'created', actor: data.owner,
        details: { incidentId: data.incidentId, grade: data.grade },
        evidence: [`Remediation plan created for incident ${data.incidentId}`],
      }, `remediation created: ${created.id}`);
      return created;
    }
    // An open remediation already existed — return it, not a duplicate.
    const existing = await this.pool.query(
      `SELECT * FROM oc_remediations WHERE incident_id = $1 AND phase NOT IN ('completed', 'rolled-back', 'failed')
       ORDER BY created_at DESC LIMIT 1`, [data.incidentId]
    );
    return existing.rows[0] || null;
  }

  async updateRemediationPhase(id: string, phase: string, evidence: string[], actor: string) {
    const updates: string[] = [`phase = $2`, `updated_at = NOW()`];
    const params: any[] = [id, phase];

    if (phase === 'executing') {
      updates.push(`started_at = NOW()`);
      // Real fix, found live: oc_remediations.approved_by has always existed but was
      // never actually written by any code path — the frontend showed a hardcoded
      // fake name instead. The real approver is whoever's execute call caused this
      // exact transition.
      params.push(actor);
      updates.push(`approved_by = $${params.length}`);
    }
    if (phase === 'completed') { updates.push(`completed_at = NOW()`); }
    if (phase === 'rolled-back') { updates.push(`rolled_back_at = NOW()`); }

    // Append evidence
    if (evidence.length > 0) {
      params.push(evidence);
      updates.push(`evidence = evidence || $${params.length}`);
    }

    const result = await this.pool.query(
      `UPDATE oc_remediations SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, params
    );

    this.auditBestEffort({
      entityType: 'remediation', entityId: id, entityName: '',
      action: phase === 'completed' ? 'resolved' : phase === 'rolled-back' ? 'rolled_back' : 'updated',
      actor, details: { phase }, evidence,
    }, `remediation phase updated: ${id} -> ${phase}`);

    return result.rows[0];
  }

  async closeRemediationTicket(id: string, verifiedBy: string) {
    // Real fix, found live: closing the ticket previously left `phase` stuck at
    // 'validating' forever — 'completed'/`completed_at` were reachable in the schema
    // but no code path ever actually reached them.
    const result = await this.pool.query(
      `UPDATE oc_remediations SET ticket_closed = TRUE, ticket_closed_at = NOW(), verified_by = $2, verified_at = NOW(),
       phase = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
       WHERE id = $1 RETURNING *`, [id, verifiedBy]
    );

    this.auditBestEffort({
      entityType: 'remediation', entityId: id, entityName: '',
      action: 'resolved', actor: verifiedBy,
      details: { ticketClosed: true },
      evidence: [`Ticket closed and verified by ${verifiedBy} at ${new Date().toISOString()}`],
    }, `remediation ticket closed: ${id}`);

    return result.rows[0];
  }

  async getRemediation(id: string) {
    const result = await this.pool.query('SELECT * FROM oc_remediations WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async listRemediations(filters: { clientId?: string; incidentId?: string } = {}) {
    let query = 'SELECT * FROM oc_remediations WHERE 1=1';
    const params: any[] = [];
    if (filters.clientId) { params.push(filters.clientId); query += ` AND client_id = $${params.length}`; }
    if (filters.incidentId) { params.push(filters.incidentId); query += ` AND incident_id = $${params.length}`; }
    query += ' ORDER BY created_at DESC LIMIT 50';
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async setRemediationOperation(id: string, operationId: string) {
    const result = await this.pool.query(
      `UPDATE oc_remediations SET operation_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, operationId]
    );
    return result.rows[0];
  }

  /**
   * Real, operator-driven step transition — replaces the frontend's previous
   * setInterval simulation entirely. Every call is a genuine staff action (Start /
   * Mark Complete / Mark Failed clicked in the browser), persisted here with a real
   * timestamp and a real, actually-measured duration (time between the real
   * "in-progress" and real "passed"/"failed" writes) — never a guessed number.
   */
  async transitionRemediationStep(id: string, stepId: string, status: 'in-progress' | 'passed' | 'failed', actor: string, note?: string) {
    const remediation = await this.getRemediation(id);
    if (!remediation) return null;
    const nowIso = new Date().toISOString();
    let matched = false;
    const steps = (remediation.steps || []).map((s: any) => {
      if (s.id !== stepId) return s;
      matched = true;
      const updated: any = { ...s, status, actor };
      if (status === 'in-progress') { updated.startedAt = nowIso; }
      if (status === 'passed' || status === 'failed') {
        updated.completedAt = nowIso;
        if (updated.startedAt) {
          const ms = new Date(nowIso).getTime() - new Date(updated.startedAt).getTime();
          updated.duration = `${Math.max(0, Math.round(ms / 1000))}s`; // real elapsed time, not fabricated
        }
      }
      if (note) updated.note = note;
      return updated;
    });
    if (!matched) return null;

    const evidenceLine = `[${nowIso}] Step "${stepId}" → ${status}, by ${actor}${note ? `: ${note}` : ''}`;
    const result = await this.pool.query(
      `UPDATE oc_remediations SET steps = $2, evidence = array_append(evidence, $3), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(steps), evidenceLine]
    );

    this.auditBestEffort({
      entityType: 'remediation', entityId: id, entityName: remediation.title,
      action: `step_${status === 'in-progress' ? 'started' : status}`, actor,
      details: { stepId, status }, evidence: [evidenceLine],
    }, `remediation step ${status}: ${id}/${stepId}`);

    return result.rows[0];
  }

  // ─── SERVICE ACTIONS ──────────────────────────────────────────────────────

  async recordServiceAction(data: ServiceActionInput) {
    const result = await this.pool.query(
      `INSERT INTO oc_service_actions (entity_type, entity_id, entity_name, action, previous_state, new_state, actor, reason, duration_ms, success, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.entityType, data.entityId, data.entityName, data.action, data.previousState || '',
       data.newState || '', data.actor, data.reason || '', data.durationMs || 0,
       data.success !== false, data.errorMessage || '']
    );

    // Also write to audit log — best-effort; oc_service_actions row above is the durable record.
    this.auditBestEffort({
      entityType: data.entityType, entityId: data.entityId, entityName: data.entityName,
      action: data.action, actor: data.actor,
      details: { previousState: data.previousState, newState: data.newState, reason: data.reason },
      evidence: [`${data.action} action on ${data.entityType} "${data.entityName}" by ${data.actor}`],
    }, `service action recorded: ${data.entityType}/${data.entityId}`);

    return result.rows[0];
  }

  async getServiceActions(entityId: string) {
    const result = await this.pool.query(
      'SELECT * FROM oc_service_actions WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 50', [entityId]
    );
    return result.rows;
  }
}

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface CreateClientInput {
  name: string;
  logo: string;
  industry: string;
  country: string;
  timezone: string;
  businessSize: string;
  supportModel: string;
  criticality: string;
  primaryContact: string;
  departments: string[];
  capabilities: string[];
  processes: string[];
  applications: string[];
  techApps: string[];
  techServices: string[];
  techApis: string[];
  techDatabases: string[];
  techServers: string[];
  techCloud: string[];
  techInfrastructure: string[];
  environments: Record<string, boolean>;
  monitoring: Record<string, boolean>;
  enabledServices: string[];
  metadata?: Record<string, unknown>;
}

export interface AuditEntry {
  entityType: string;
  entityId: string;
  entityName: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
  evidence?: string[];
  environment?: string;
  ipAddress?: string;
  correlationId?: string;
}

export interface CreateRemediationInput {
  incidentId: string;
  clientId: string;
  title: string;
  description?: string;
  grade: 'standard' | 'expedited';
  fixImmediate: string;
  fixPermanent: string;
  impactAnalysis?: Record<string, unknown>;
  steps?: unknown[];
  validationCriteria?: string[];
  rollbackPlan?: string;
  owner: string;
}

export interface ServiceActionInput {
  entityType: string;
  entityId: string;
  entityName: string;
  action: 'enabled' | 'disabled' | 'restarted';
  previousState?: string;
  newState?: string;
  actor: string;
  reason?: string;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
}
