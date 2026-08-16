import { getPool } from '../db/connection.js';

/**
 * Operations Center Service — manages clients, audit logs, remediations, and service actions.
 * All operations are persisted to PostgreSQL for evidence and compliance.
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

    // Audit
    await this.createAuditEntry({
      entityType: 'client', entityId: client.id, entityName: data.name,
      action: 'created', actor: data.primaryContact || 'system',
      details: { industry: data.industry, country: data.country, size: data.businessSize },
      evidence: [`Client "${data.name}" onboarded at ${new Date().toISOString()}`],
    });

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

    await this.createAuditEntry({
      entityType: 'remediation', entityId: result.rows[0].id, entityName: data.title,
      action: 'created', actor: data.owner,
      details: { incidentId: data.incidentId, grade: data.grade },
      evidence: [`Remediation plan created for incident ${data.incidentId}`],
    });

    return result.rows[0];
  }

  async updateRemediationPhase(id: string, phase: string, evidence: string[], actor: string) {
    const updates: string[] = [`phase = $2`, `updated_at = NOW()`];
    const params: any[] = [id, phase];

    if (phase === 'executing') { updates.push(`started_at = NOW()`); }
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

    await this.createAuditEntry({
      entityType: 'remediation', entityId: id, entityName: '',
      action: phase === 'completed' ? 'resolved' : phase === 'rolled-back' ? 'rolled_back' : 'updated',
      actor, details: { phase }, evidence,
    });

    return result.rows[0];
  }

  async closeRemediationTicket(id: string, verifiedBy: string) {
    const result = await this.pool.query(
      `UPDATE oc_remediations SET ticket_closed = TRUE, ticket_closed_at = NOW(), verified_by = $2, verified_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`, [id, verifiedBy]
    );

    await this.createAuditEntry({
      entityType: 'remediation', entityId: id, entityName: '',
      action: 'resolved', actor: verifiedBy,
      details: { ticketClosed: true },
      evidence: [`Ticket closed and verified by ${verifiedBy} at ${new Date().toISOString()}`],
    });

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

    // Also write to audit log
    await this.createAuditEntry({
      entityType: data.entityType, entityId: data.entityId, entityName: data.entityName,
      action: data.action, actor: data.actor,
      details: { previousState: data.previousState, newState: data.newState, reason: data.reason },
      evidence: [`${data.action} action on ${data.entityType} "${data.entityName}" by ${data.actor}`],
    });

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
