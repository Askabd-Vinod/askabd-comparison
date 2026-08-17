/**
 * AskABD Compliance Automation Service
 * Supports: ISO 27001, SOC 2, PCI DSS, GDPR, HIPAA, NIST, CIS, COBIT, industry-specific.
 * Reuses: Document Management, Discovery, Assessment, Requirements, Audit.
 * Evidence auto-mapping from existing AskABD data.
 */
import { sharedPool } from './db-pool.js';

export interface ComplianceFramework {
  id: string; name: string; version: string; description?: string;
  jurisdiction?: string; category: string; totalControls: number; enabled: boolean; owner?: string;
}

export interface ComplianceControl {
  id: string; frameworkId: string; controlRef: string; name: string; description?: string;
  category: string; requirement?: string; applicability: string; riskLevel: string;
  evidenceRequired: string[]; reviewFrequency: string; owner?: string;
}

export interface ClientCompliance {
  id: string; clientId: string; frameworkId: string; controlId: string;
  status: string; maturity: number; evidenceStatus: string;
  evidenceReferences: any[]; lastAssessedAt?: string; nextReviewAt?: string;
  owner?: string; notes?: string; findingId?: string; gapId?: string;
}

export class ComplianceService {

  // ─── Frameworks ─────────────────────────────────────────────────────────────

  async getFrameworks(): Promise<ComplianceFramework[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_compliance_frameworks ORDER BY name');
    return rows.map(r => ({ id: r.id, name: r.name, version: r.version, description: r.description, jurisdiction: r.jurisdiction, category: r.category, totalControls: r.total_controls, enabled: r.enabled, owner: r.owner }));
  }

  async getControls(frameworkId: string): Promise<ComplianceControl[]> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_compliance_controls WHERE framework_id = $1 ORDER BY control_ref', [frameworkId]);
    return rows.map(r => ({ id: r.id, frameworkId: r.framework_id, controlRef: r.control_ref, name: r.name, description: r.description, category: r.category, requirement: r.requirement, applicability: r.applicability, riskLevel: r.risk_level, evidenceRequired: r.evidence_required || [], reviewFrequency: r.review_frequency, owner: r.owner }));
  }

  // ─── Client Compliance ──────────────────────────────────────────────────────

  async getClientCompliance(clientId: string, frameworkId?: string): Promise<ClientCompliance[]> {
    const where = frameworkId ? 'WHERE client_id = $1 AND framework_id = $2' : 'WHERE client_id = $1';
    const params = frameworkId ? [clientId, frameworkId] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_client_compliance ${where} ORDER BY control_id`, params);
    return rows.map(this.mapCC);
  }

  async getClientComplianceSummary(clientId: string): Promise<any> {
    const { rows } = await sharedPool.query(`
      SELECT framework_id, count(*) as total,
        count(*) FILTER (WHERE status = 'met') as met,
        count(*) FILTER (WHERE status = 'partially_met') as partial,
        count(*) FILTER (WHERE status = 'not_met') as not_met,
        count(*) FILTER (WHERE status = 'not_assessed') as not_assessed,
        count(*) FILTER (WHERE evidence_status = 'missing') as evidence_missing,
        count(*) FILTER (WHERE evidence_status = 'expired') as evidence_expired,
        COALESCE(AVG(maturity), 0) as avg_maturity
      FROM oc_client_compliance WHERE client_id = $1 GROUP BY framework_id
    `, [clientId]);

    const frameworks = await this.getFrameworks();
    const fwMap: Record<string, string> = {};
    frameworks.forEach(f => { fwMap[f.id] = f.name; });

    return {
      clientId,
      frameworks: rows.map(r => ({
        frameworkId: r.framework_id, frameworkName: fwMap[r.framework_id] || r.framework_id,
        total: parseInt(r.total), met: parseInt(r.met), partial: parseInt(r.partial),
        notMet: parseInt(r.not_met), notAssessed: parseInt(r.not_assessed),
        evidenceMissing: parseInt(r.evidence_missing), evidenceExpired: parseInt(r.evidence_expired),
        avgMaturity: parseFloat(parseFloat(r.avg_maturity).toFixed(1)),
        score: parseInt(r.total) > 0 ? Math.round((parseInt(r.met) + parseInt(r.partial) * 0.5) / parseInt(r.total) * 100) : 0,
      })),
    };
  }

  /** Initialize compliance assessment for a client — IDEMPOTENT */
  async initializeClientCompliance(clientId: string, frameworkId: string): Promise<{ initialized: number; existing: number }> {
    const controls = await this.getControls(frameworkId);
    let initialized = 0, existing = 0;

    for (const ctrl of controls) {
      const dup = await sharedPool.query(`SELECT id FROM oc_client_compliance WHERE client_id = $1 AND control_id = $2`, [clientId, ctrl.id]);
      if (dup.rows.length > 0) { existing++; continue; }

      await sharedPool.query(`
        INSERT INTO oc_client_compliance (client_id, framework_id, control_id, status, maturity, evidence_status)
        VALUES ($1,$2,$3,'not_assessed',0,'missing')
      `, [clientId, frameworkId, ctrl.id]);
      initialized++;
    }
    return { initialized, existing };
  }

  /** Auto-map existing AskABD evidence to compliance controls — IDEMPOTENT */
  async autoMapEvidence(clientId: string): Promise<{ mapped: number; controls: string[] }> {
    const mappedControls: string[] = [];

    // Check what data exists for this client
    const [hasAudit, hasDiscovery, hasRbac, hasSecReqs, hasDocs] = await Promise.all([
      sharedPool.query(`SELECT count(*) as c FROM oc_audit_log WHERE entity_id = $1 LIMIT 1`, [clientId]),
      sharedPool.query(`SELECT count(*) as c FROM oc_discovery_runs WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as c FROM oc_lifecycle WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as c FROM oc_client_service_requirements WHERE client_id = $1 AND service_id = 'security-validation'`, [clientId]),
      sharedPool.query(`SELECT count(*) as c FROM oc_client_service_documents WHERE client_id = $1`, [clientId]),
    ]);

    const evidenceMap: Record<string, { evidence: string[]; status: string; maturity: number }> = {};

    // Audit logging → A.12 Operations Security
    if (parseInt(hasAudit.rows[0]?.c || '0') > 0) {
      evidenceMap['ctrl-iso-a12'] = { evidence: ['audit_log_active', 'operational_monitoring'], status: 'partially_met', maturity: 3 };
    }
    // Discovery → A.8 Asset Management
    if (parseInt(hasDiscovery.rows[0]?.c || '0') > 0) {
      evidenceMap['ctrl-iso-a8'] = { evidence: ['discovery_asset_inventory'], status: 'partially_met', maturity: 2 };
    }
    // RBAC/Lifecycle → A.9 Access Control
    if (parseInt(hasRbac.rows[0]?.c || '0') > 0) {
      evidenceMap['ctrl-iso-a9'] = { evidence: ['rbac_active', 'lifecycle_management'], status: 'partially_met', maturity: 2 };
    }
    // Security requirements → A.5 Policies
    if (parseInt(hasSecReqs.rows[0]?.c || '0') > 0) {
      evidenceMap['ctrl-iso-a5'] = { evidence: ['security_requirements_collected'], status: 'partially_met', maturity: 2 };
    }
    // Documents → multiple controls
    if (parseInt(hasDocs.rows[0]?.c || '0') > 0) {
      evidenceMap['ctrl-iso-a18'] = { evidence: ['compliance_documents_uploaded'], status: 'partially_met', maturity: 2 };
    }

    // Apply evidence mappings
    for (const [controlId, mapping] of Object.entries(evidenceMap)) {
      const existing = await sharedPool.query(`SELECT id, evidence_references FROM oc_client_compliance WHERE client_id = $1 AND control_id = $2`, [clientId, controlId]);
      if (existing.rows.length > 0) {
        const currentRefs = existing.rows[0].evidence_references || [];
        const newRefs = [...new Set([...currentRefs, ...mapping.evidence])];
        await sharedPool.query(`UPDATE oc_client_compliance SET evidence_status = 'collected', evidence_references = $1, status = $2, maturity = GREATEST(maturity, $3), last_assessed_at = NOW(), updated_at = NOW() WHERE id = $4`,
          [JSON.stringify(newRefs), mapping.status, mapping.maturity, existing.rows[0].id]);
        mappedControls.push(controlId);
      }
    }

    return { mapped: mappedControls.length, controls: mappedControls };
  }

  /** Update a client's compliance control status */
  async updateControlStatus(clientId: string, controlId: string, data: { status?: string; maturity?: number; evidenceStatus?: string; notes?: string; owner?: string }): Promise<ClientCompliance | null> {
    const { rows } = await sharedPool.query(`
      UPDATE oc_client_compliance SET
        status = COALESCE($3, status), maturity = COALESCE($4, maturity),
        evidence_status = COALESCE($5, evidence_status), notes = COALESCE($6, notes),
        owner = COALESCE($7, owner), last_assessed_at = NOW(), updated_at = NOW()
      WHERE client_id = $1 AND control_id = $2 RETURNING *
    `, [clientId, controlId, data.status, data.maturity, data.evidenceStatus, data.notes, data.owner]);
    return rows.length > 0 ? this.mapCC(rows[0]) : null;
  }

  private mapCC(row: any): ClientCompliance {
    return { id: row.id, clientId: row.client_id, frameworkId: row.framework_id, controlId: row.control_id, status: row.status, maturity: row.maturity, evidenceStatus: row.evidence_status, evidenceReferences: row.evidence_references || [], lastAssessedAt: row.last_assessed_at, nextReviewAt: row.next_review_at, owner: row.owner, notes: row.notes, findingId: row.finding_id, gapId: row.gap_id };
  }

  /**
   * Compliance Remediation Chain: Control Failure → Problem → Gap → Recommendation
   * IDEMPOTENT — won't create duplicates for the same control+client.
   * Reuses: ProblemUniverseService, GapAnalysisService.
   */
  async triggerRemediationChain(clientId: string, controlId: string, data?: { reason?: string; severity?: string }): Promise<{ finding: any; problem: any; gap: any; alreadyExists: boolean }> {
    // Get control details
    const ctrlRes = await sharedPool.query(`SELECT c.*, f.name as framework_name FROM oc_compliance_controls c JOIN oc_compliance_frameworks f ON f.id = c.framework_id WHERE c.id = $1`, [controlId]);
    if (ctrlRes.rows.length === 0) throw new Error('Control not found');
    const ctrl = ctrlRes.rows[0];

    // Get client compliance record
    const ccRes = await sharedPool.query(`SELECT * FROM oc_client_compliance WHERE client_id = $1 AND control_id = $2`, [clientId, controlId]);
    if (ccRes.rows.length === 0) throw new Error('Client compliance record not found. Initialize compliance first.');

    // IDEMPOTENCY: check if problem already exists for this control+client
    const { ProblemUniverseService } = await import('./problem-universe-service.js');
    const { GapAnalysisService } = await import('./gap-analysis-service.js');
    const problemService = new ProblemUniverseService();
    const gapService = new GapAnalysisService();

    const existingProblem = await sharedPool.query(
      `SELECT id FROM oc_problems WHERE client_id = $1 AND source_type = 'compliance' AND source_id = $2 LIMIT 1`,
      [clientId, controlId]);

    if (existingProblem.rows.length > 0) {
      const existingGap = await sharedPool.query(`SELECT id FROM oc_gaps WHERE client_id = $1 AND related_problem_id = $2 LIMIT 1`, [clientId, existingProblem.rows[0].id]);
      return { finding: null, problem: { id: existingProblem.rows[0].id }, gap: existingGap.rows[0] ? { id: existingGap.rows[0].id } : null, alreadyExists: true };
    }

    const severity = data?.severity || ctrl.risk_level || 'medium';

    // 1. Update compliance status to not_met
    await sharedPool.query(`UPDATE oc_client_compliance SET status = 'not_met', evidence_status = CASE WHEN evidence_status = 'missing' THEN 'missing' ELSE 'insufficient' END, updated_at = NOW() WHERE client_id = $1 AND control_id = $2`, [clientId, controlId]);

    // 2. Create Problem
    const problem = await problemService.createProblem(clientId, {
      domain: 'compliance',
      category: ctrl.category,
      title: `Compliance: ${ctrl.framework_name} ${ctrl.control_ref} - ${ctrl.name}`,
      description: data?.reason || ctrl.requirement || `Control ${ctrl.control_ref} (${ctrl.name}) is not met. ${ctrl.description || ''}`,
      severity: severity as any,
      priority: severity as any,
      riskLevel: severity as any,
      sourceType: 'compliance',
      sourceId: controlId,
      businessImpact: `Non-compliance with ${ctrl.framework_name} ${ctrl.control_ref} may result in regulatory risk, audit findings, or contractual violations.`,
      technicalImpact: ctrl.requirement || ctrl.description,
      evidence: [{ source: 'compliance', framework: ctrl.framework_name, control: ctrl.control_ref, controlName: ctrl.name, timestamp: new Date().toISOString() }],
    });

    // Link problem to compliance record
    await sharedPool.query(`UPDATE oc_client_compliance SET finding_id = $1, updated_at = NOW() WHERE client_id = $2 AND control_id = $3`, [problem.id, clientId, controlId]);

    // 3. Create Gap
    const gap = await gapService.createGap(clientId, {
      domain: 'compliance',
      category: ctrl.category,
      title: `Compliance Gap: ${ctrl.framework_name} ${ctrl.control_ref}`,
      description: `Gap between current state and ${ctrl.framework_name} ${ctrl.control_ref} requirements.`,
      currentState: data?.reason || 'Control not met or evidence insufficient',
      targetState: ctrl.requirement || `Full compliance with ${ctrl.control_ref}`,
      gapDescription: `${ctrl.name}: ${ctrl.description || ctrl.requirement}`,
      businessImpact: `Regulatory/audit risk from ${ctrl.framework_name} non-compliance`,
      technicalImpact: ctrl.requirement,
      riskLevel: severity as any,
      severity: severity as any,
      priority: severity as any,
      currentMaturity: 0,
      targetMaturity: 4,
      relatedProblemId: problem.id,
      confidence: 'high',
      sourceType: 'compliance',
      sourceId: controlId,
      evidence: [{ source: 'compliance', framework: ctrl.framework_name, control: ctrl.control_ref, timestamp: new Date().toISOString() }],
    });

    // Link gap to compliance record
    await sharedPool.query(`UPDATE oc_client_compliance SET gap_id = $1, updated_at = NOW() WHERE client_id = $2 AND control_id = $3`, [gap.id, clientId, controlId]);

    return { finding: { controlId, controlRef: ctrl.control_ref, framework: ctrl.framework_name }, problem, gap, alreadyExists: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-FRAMEWORK CONTROL MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════

  async getMappings(frameworkId?: string): Promise<any[]> {
    const where = frameworkId ? 'WHERE m.source_framework_id = $1 OR m.target_framework_id = $1' : '';
    const params = frameworkId ? [frameworkId] : [];
    const { rows } = await sharedPool.query(`
      SELECT m.*, sf.name as source_framework_name, sc.control_ref as source_control_ref, sc.name as source_control_name,
        tf.name as target_framework_name, tc.control_ref as target_control_ref, tc.name as target_control_name
      FROM oc_control_mappings m
      JOIN oc_compliance_frameworks sf ON sf.id = m.source_framework_id
      JOIN oc_compliance_controls sc ON sc.id = m.source_control_id
      JOIN oc_compliance_frameworks tf ON tf.id = m.target_framework_id
      JOIN oc_compliance_controls tc ON tc.id = m.target_control_id
      ${where} ORDER BY sf.name, sc.control_ref
    `, params);
    return rows.map((r: any) => ({ id: r.id, sourceFramework: r.source_framework_name, sourceControl: r.source_control_ref, sourceControlName: r.source_control_name, targetFramework: r.target_framework_name, targetControl: r.target_control_ref, targetControlName: r.target_control_name, mappingType: r.mapping_type, coverage: r.coverage, confidence: r.confidence, rationale: r.rationale, status: r.status }));
  }

  async getMappingCoverage(): Promise<any> {
    const [totalControls, mappedControls, fwCoverage] = await Promise.all([
      sharedPool.query(`SELECT count(*) as total FROM oc_compliance_controls`),
      sharedPool.query(`SELECT count(DISTINCT source_control_id) + count(DISTINCT target_control_id) as mapped FROM oc_control_mappings WHERE status = 'active'`),
      sharedPool.query(`SELECT f.id, f.name, f.total_controls, count(DISTINCT CASE WHEN m.source_control_id = c.id OR m2.target_control_id = c.id THEN c.id END) as mapped_controls FROM oc_compliance_frameworks f LEFT JOIN oc_compliance_controls c ON c.framework_id = f.id LEFT JOIN oc_control_mappings m ON m.source_control_id = c.id AND m.status = 'active' LEFT JOIN oc_control_mappings m2 ON m2.target_control_id = c.id AND m2.status = 'active' GROUP BY f.id, f.name, f.total_controls`),
    ]);
    return {
      totalControls: parseInt(totalControls.rows[0]?.total || '0'),
      mappedControls: parseInt(mappedControls.rows[0]?.mapped || '0'),
      frameworks: fwCoverage.rows.map((r: any) => ({ id: r.id, name: r.name, totalControls: r.total_controls, mappedControls: parseInt(r.mapped_controls || '0'), coverage: r.total_controls > 0 ? Math.round(parseInt(r.mapped_controls || '0') / r.total_controls * 100) : 0 })),
    };
  }

  /** Get controls mapped to a specific control (for evidence reuse) */
  async getRelatedControls(controlId: string): Promise<any[]> {
    const { rows } = await sharedPool.query(`
      SELECT target_control_id as related_id, target_framework_id as framework_id, mapping_type, coverage, confidence
      FROM oc_control_mappings WHERE source_control_id = $1 AND status = 'active'
      UNION
      SELECT source_control_id, source_framework_id, mapping_type, coverage, confidence
      FROM oc_control_mappings WHERE target_control_id = $1 AND status = 'active'
    `, [controlId]);
    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE EXCEPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createException(clientId: string, data: any): Promise<any> {
    if (!data.controlId || !data.frameworkId || !data.reason) throw new Error('controlId, frameworkId, and reason are required');
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_compliance_exceptions (client_id, framework_id, control_id, title, description, reason, business_justification, risk_level, risk_owner, compensating_control, requested_by, expiration_date, review_date, status, conditions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'requested',$14) RETURNING *
    `, [clientId, data.frameworkId, data.controlId, data.title || 'Exception Request', data.description,
      data.reason, data.businessJustification, data.riskLevel || 'medium', data.riskOwner,
      data.compensatingControl, data.requestedBy || 'admin',
      data.expirationDate || null, data.reviewDate || null, data.conditions || null]);
    return this.mapException(rows[0]);
  }

  async getExceptions(clientId: string, status?: string): Promise<any[]> {
    const where = status ? 'WHERE client_id = $1 AND status = $2' : 'WHERE client_id = $1';
    const params = status ? [clientId, status] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_compliance_exceptions ${where} ORDER BY created_at DESC`, params);
    return rows.map(this.mapException);
  }

  async transitionException(exceptionId: string, newStatus: string, actor: string, _data?: any): Promise<any> {
    const validTransitions: Record<string, string[]> = {
      'requested': ['under_review', 'rejected'],
      'under_review': ['approved', 'rejected'],
      'approved': ['active'],
      'active': ['expired', 'revoked', 'closed'],
      'expired': ['closed'],
      'revoked': ['closed'],
    };
    const current = await sharedPool.query(`SELECT status FROM oc_compliance_exceptions WHERE id = $1`, [exceptionId]);
    if (current.rows.length === 0) throw new Error('Exception not found');
    const currentStatus = current.rows[0].status;
    if (!validTransitions[currentStatus]?.includes(newStatus)) throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);

    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [exceptionId, newStatus];
    let idx = 3;
    if (newStatus === 'approved' || newStatus === 'active') { updates.push(`approved_by = $${idx++}`); params.push(actor); updates.push(`approved_at = NOW()`); }

    const { rows } = await sharedPool.query(`UPDATE oc_compliance_exceptions SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, params);
    return this.mapException(rows[0]);
  }

  private mapException(row: any): any {
    return { id: row.id, clientId: row.client_id, frameworkId: row.framework_id, controlId: row.control_id, title: row.title, description: row.description, reason: row.reason, businessJustification: row.business_justification, riskLevel: row.risk_level, riskOwner: row.risk_owner, compensatingControl: row.compensating_control, requestedBy: row.requested_by, requestedAt: row.requested_at, approvedBy: row.approved_by, approvedAt: row.approved_at, expirationDate: row.expiration_date, reviewDate: row.review_date, status: row.status, conditions: row.conditions, evidence: row.evidence || [], createdAt: row.created_at };
  }
}
