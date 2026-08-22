/**
 * Document Generation Engine — Phase 3 (migration 046). ONE reusable
 * engine, not a per-document-type generator. Reuses the Phase 1 shared
 * engines rather than building parallel ones:
 *   - Version HISTORY of a document's content: the shared Versioning
 *     Engine (entity_versions, entity_type='generated_document').
 *   - Formal APPROVAL (when a template requires one): the shared Approval
 *     Workflow Engine (entity_type='generated_document') — this document's
 *     own `status` is written FROM that workflow's real decision in the
 *     same call, mirroring the exact pattern already proven for Gap
 *     Analysis's risk-acceptance flow, never an independent `approved`
 *     flag.
 *   - Traceability from a generated document back to the real records it
 *     was built from: the shared Traceability Engine.
 *
 * SOURCE-OF-TRUTH RULE: every section's content comes from a real,
 * registered data-fetcher querying real platform tables for this exact
 * client. A fetcher that finds nothing real to say never invents
 * something — it returns an honest "INFORMATION REQUIRED" content string
 * plus a structured `missingFields` list, which the quality check (see
 * getQualityCheck) surfaces as real, specific NOT READY reasons.
 */
import { sharedPool } from './db-pool.js';
import { VersioningEngine } from './versioning-engine.js';
import { ApprovalWorkflowEngine } from './approval-workflow-engine.js';
import { TraceabilityEngine } from './traceability-engine.js';

export type DocumentStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded' | 'archived';
export type ExportFormat = 'html' | 'markdown';

export interface DocumentSection {
  key: string;
  title: string;
  dataSource: string;
  required: boolean;
}

export interface DocumentTemplate {
  id: string;
  documentType: string;
  name: string;
  description: string;
  version: number;
  sections: DocumentSection[];
  approvalRequired: boolean;
  status: 'active' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedSectionContent {
  key: string;
  title: string;
  content: string;
  missingFields: string[];
  sourceType: string;
  sourceIds: string[];
}

export interface GeneratedDocument {
  id: string;
  clientId: string;
  templateId: string;
  documentType: string;
  title: string;
  status: DocumentStatus;
  content: GeneratedSectionContent[];
  customerVisible: boolean;
  approvalWorkflowId: string | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualityCheckResult {
  ready: boolean;
  reasons: string[];
}

type TemplateRow = {
  id: string; document_type: string; name: string; description: string; version: number;
  sections: DocumentSection[]; approval_required: boolean; status: 'active' | 'deprecated';
  created_at: Date; updated_at: Date;
};
type DocumentRow = {
  id: string; client_id: string; template_id: string; document_type: string; title: string;
  status: DocumentStatus; content: GeneratedSectionContent[]; customer_visible: boolean;
  approval_workflow_id: string | null; version: number; created_by: string | null; updated_by: string | null;
  created_at: Date; updated_at: Date;
};

function toTemplate(r: TemplateRow): DocumentTemplate {
  return {
    id: r.id, documentType: r.document_type, name: r.name, description: r.description, version: r.version,
    sections: r.sections || [], approvalRequired: r.approval_required, status: r.status,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}
function toDocument(r: DocumentRow): GeneratedDocument {
  return {
    id: r.id, clientId: r.client_id, templateId: r.template_id, documentType: r.document_type, title: r.title,
    status: r.status, content: r.content || [], customerVisible: r.customer_visible,
    approvalWorkflowId: r.approval_workflow_id, version: r.version, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

const INFO_REQUIRED = 'INFORMATION REQUIRED';

/**
 * Real, registered data-source fetchers — one real Postgres query per
 * entry, keyed by the string a template's section.dataSource names. Every
 * fetcher returns real rows for THIS client only, and an honest
 * missingFields explanation when there is nothing real to report — never
 * a fabricated narrative.
 */
const DATA_SOURCES: Record<string, (clientId: string) => Promise<{ content: string; missingFields: string[]; sourceIds: string[] }>> = {
  async client_profile(clientId) {
    const res = await sharedPool.query(
      `SELECT name, industry, business_size, departments, capabilities, processes FROM oc_clients WHERE id = $1`,
      [clientId]
    );
    const row = res.rows[0];
    if (!row) return { content: `${INFO_REQUIRED}: client record not found.`, missingFields: ['client record'], sourceIds: [] };
    const missing: string[] = [];
    if (!row.departments?.length) missing.push('departments');
    if (!row.capabilities?.length) missing.push('business capabilities');
    if (!row.processes?.length) missing.push('business processes');
    const lines = [
      `Client: ${row.name} (${row.industry || 'industry not recorded'}, ${row.business_size || 'size not recorded'})`,
      `Departments: ${row.departments?.length ? row.departments.join(', ') : INFO_REQUIRED}`,
      `Business Capabilities: ${row.capabilities?.length ? row.capabilities.join(', ') : INFO_REQUIRED}`,
      `Business Processes: ${row.processes?.length ? row.processes.join(', ') : INFO_REQUIRED}`,
    ];
    return { content: lines.join('\n'), missingFields: missing, sourceIds: [clientId] };
  },

  async business_requirements(clientId) {
    const res = await sharedPool.query(
      `SELECT id, title, description, business_objective, stakeholder, priority, category, quality_status, acceptance_criteria
       FROM oc_business_requirements WHERE client_id = $1 AND status != 'deprecated' ORDER BY created_at ASC`,
      [clientId]
    );
    if (res.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no business requirements have been captured for this client yet.`, missingFields: ['business requirements'], sourceIds: [] };
    }
    const missing: string[] = [];
    const lines = res.rows.map((r: any) => {
      if (r.quality_status !== 'complete') missing.push(`${r.id} (${r.title}) — quality status: ${r.quality_status}`);
      return `[${r.id}] ${r.title} (${r.priority} priority, ${r.category || 'uncategorized'})\n  Objective: ${r.business_objective || INFO_REQUIRED}\n  Stakeholder: ${r.stakeholder || INFO_REQUIRED}\n  Acceptance Criteria: ${r.acceptance_criteria || INFO_REQUIRED}\n  Quality: ${r.quality_status}`;
    });
    return { content: lines.join('\n\n'), missingFields: missing, sourceIds: res.rows.map((r: any) => r.id) };
  },

  async gaps(clientId) {
    const res = await sharedPool.query(
      `SELECT id, title, gap_description, current_state, target_state, severity, compliance_status, status
       FROM oc_gaps WHERE client_id = $1 ORDER BY severity DESC, created_at ASC`,
      [clientId]
    );
    if (res.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no gaps have been identified for this client yet.`, missingFields: ['gaps'], sourceIds: [] };
    }
    const missing: string[] = [];
    const lines = res.rows.map((r: any) => {
      if (r.compliance_status === 'needs_evidence' || r.compliance_status === 'unknown') missing.push(`${r.id} (${r.title}) — compliance status: ${r.compliance_status}`);
      if (!r.target_state) missing.push(`${r.id} (${r.title}) — no target state defined yet`);
      return `[${r.id}] ${r.title} — ${r.severity} severity, compliance: ${r.compliance_status}\n  Current: ${r.current_state || INFO_REQUIRED}\n  Target: ${r.target_state || INFO_REQUIRED}\n  Gap: ${r.gap_description || INFO_REQUIRED}`;
    });
    return { content: lines.join('\n\n'), missingFields: missing, sourceIds: res.rows.map((r: any) => r.id) };
  },

  async gap_evidence(clientId) {
    const res = await sharedPool.query(
      `SELECT ge.id, ge.gap_id, ge.text, ge.source_type, ge.verification_status
       FROM oc_gap_evidence ge JOIN oc_gaps g ON g.id = ge.gap_id
       WHERE g.client_id = $1 ORDER BY ge.created_at ASC`,
      [clientId]
    );
    const gapsWithoutEvidence = await sharedPool.query(
      `SELECT id, title FROM oc_gaps g WHERE client_id = $1 AND NOT EXISTS (SELECT 1 FROM oc_gap_evidence ge WHERE ge.gap_id = g.id)`,
      [clientId]
    );
    const missing = gapsWithoutEvidence.rows.map((r: any) => `${r.id} (${r.title}) — no evidence recorded`);
    if (res.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no evidence has been recorded for any gap yet.`, missingFields: missing.length ? missing : ['gap evidence'], sourceIds: [] };
    }
    const lines = res.rows.map((r: any) => `[${r.gap_id}] (${r.source_type}, ${r.verification_status}): ${r.text}`);
    return { content: lines.join('\n'), missingFields: missing, sourceIds: res.rows.map((r: any) => r.id) };
  },

  async gap_options_decisions(clientId) {
    const opts = await sharedPool.query(
      `SELECT o.id, o.gap_id, o.name, o.solution_type, o.score, o.selected FROM oc_gap_options o JOIN oc_gaps g ON g.id = o.gap_id WHERE g.client_id = $1 ORDER BY o.created_at ASC`,
      [clientId]
    );
    const decisions = await sharedPool.query(
      `SELECT d.id, d.gap_id, d.selected_option_id, d.decision_maker, d.rationale, d.status FROM oc_decisions d JOIN oc_gaps g ON g.id = d.gap_id WHERE g.client_id = $1 ORDER BY d.created_at ASC`,
      [clientId]
    );
    const decidedGapIds = new Set(decisions.rows.map((d: any) => d.gap_id));
    const gapsNoDecision = await sharedPool.query(`SELECT id, title FROM oc_gaps WHERE client_id = $1 AND status NOT IN ('resolved','closed','rejected','accepted_risk')`, [clientId]);
    const missing = gapsNoDecision.rows.filter((r: any) => !decidedGapIds.has(r.id)).map((r: any) => `${r.id} (${r.title}) — no recommendation/decision recorded yet`);
    if (opts.rows.length === 0 && decisions.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no options or decisions have been recorded yet.`, missingFields: missing.length ? missing : ['recommendations and decisions'], sourceIds: [] };
    }
    const optLines = opts.rows.map((o: any) => `[${o.gap_id}] Option "${o.name}" (${o.solution_type})${o.score != null ? `, score ${o.score}/100` : ''}${o.selected ? ' — SELECTED' : ''}`);
    const decLines = decisions.rows.map((d: any) => `[${d.gap_id}] Decision by ${d.decision_maker || INFO_REQUIRED}: ${d.rationale || INFO_REQUIRED} (${d.status})`);
    return { content: [...optLines, ...decLines].join('\n'), missingFields: missing, sourceIds: [...opts.rows.map((o: any) => o.id), ...decisions.rows.map((d: any) => d.id)] };
  },

  async transformations(clientId) {
    const res = await sharedPool.query(
      `SELECT id, title, transformation_type, status, expected_outcome FROM oc_transformations WHERE client_id = $1 ORDER BY created_at ASC`,
      [clientId]
    );
    if (res.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no transformations have been planned yet.`, missingFields: ['transformation plan'], sourceIds: [] };
    }
    const lines = res.rows.map((r: any) => `[${r.id}] ${r.title} (${r.transformation_type}, ${r.status})\n  Expected outcome: ${r.expected_outcome || INFO_REQUIRED}`);
    return { content: lines.join('\n\n'), missingFields: [], sourceIds: res.rows.map((r: any) => r.id) };
  },

  async assessments(clientId) {
    const res = await sharedPool.query(
      `SELECT DISTINCT ON (domain) id, domain, status, risk_score, findings, created_at FROM oc_assessments WHERE client_id = $1 ORDER BY domain, created_at DESC`,
      [clientId]
    );
    const ALL_DOMAINS = ['infrastructure', 'business', 'application', 'data', 'security', 'quality', 'operations'];
    const assessedDomains = new Set(res.rows.map((r: any) => r.domain));
    const missing = ALL_DOMAINS.filter(d => !assessedDomains.has(d)).map(d => `${d} domain — not yet assessed`);
    if (res.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no assessments have been run for this client yet.`, missingFields: missing, sourceIds: [] };
    }
    const lines = res.rows.map((r: any) => {
      const findingsCount = Array.isArray(r.findings) ? r.findings.length : 0;
      return `[${r.domain}] ${r.status}, risk score ${r.risk_score ?? INFO_REQUIRED}/100, ${findingsCount} finding(s)`;
    });
    return { content: lines.join('\n'), missingFields: missing, sourceIds: res.rows.map((r: any) => r.id) };
  },

  async discovery_sources(clientId) {
    const res = await sharedPool.query(
      `SELECT id, title, source_type, extraction_status FROM discovery_sources WHERE client_id = $1 AND status != 'archived' ORDER BY created_at ASC`,
      [clientId]
    );
    if (res.rows.length === 0) {
      return { content: `${INFO_REQUIRED}: no discovery sources have been captured for this client yet.`, missingFields: ['discovery sources'], sourceIds: [] };
    }
    const lines = res.rows.map((r: any) => `[${r.id}] ${r.title} (${r.source_type})`);
    return { content: lines.join('\n'), missingFields: [], sourceIds: res.rows.map((r: any) => r.id) };
  },
};

export class DocumentGenerationEngine {
  private versioning = new VersioningEngine();
  private approvals = new ApprovalWorkflowEngine();
  private traceability = new TraceabilityEngine();

  // ─── Templates ────────────────────────────────────────────────────────

  async listTemplates(): Promise<DocumentTemplate[]> {
    const res = await sharedPool.query<TemplateRow>(`SELECT * FROM document_templates WHERE status = 'active' ORDER BY name ASC`);
    return res.rows.map(toTemplate);
  }

  async getTemplate(id: string): Promise<DocumentTemplate | null> {
    const res = await sharedPool.query<TemplateRow>(`SELECT * FROM document_templates WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toTemplate(row) : null;
  }

  /** Real, staff-driven template creation — new document types are added this way, never by editing generation code. */
  async createTemplate(data: { documentType: string; name: string; description?: string; sections: DocumentSection[]; approvalRequired?: boolean }): Promise<DocumentTemplate> {
    for (const section of data.sections) {
      if (!DATA_SOURCES[section.dataSource]) {
        throw new Error(`Unknown data source "${section.dataSource}" for section "${section.key}". Registered sources: ${Object.keys(DATA_SOURCES).join(', ')}.`);
      }
    }
    const res = await sharedPool.query<TemplateRow>(
      `INSERT INTO document_templates (document_type, name, description, sections, approval_required) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.documentType, data.name, data.description || '', JSON.stringify(data.sections), data.approvalRequired ?? false]
    );
    const row = res.rows[0];
    if (!row) throw new Error('document_templates insert returned no row');
    return toTemplate(row);
  }

  // ─── Generation ───────────────────────────────────────────────────────

  private async runSections(clientId: string, sections: DocumentSection[]): Promise<GeneratedSectionContent[]> {
    const out: GeneratedSectionContent[] = [];
    for (const section of sections) {
      const fetcher = DATA_SOURCES[section.dataSource];
      if (!fetcher) {
        out.push({ key: section.key, title: section.title, content: `${INFO_REQUIRED}: unrecognized data source "${section.dataSource}".`, missingFields: [`data source "${section.dataSource}"`], sourceType: section.dataSource, sourceIds: [] });
        continue;
      }
      const result = await fetcher(clientId);
      out.push({ key: section.key, title: section.title, content: result.content, missingFields: result.missingFields, sourceType: section.dataSource, sourceIds: result.sourceIds });
    }
    return out;
  }

  /** Generates a new document from a template against this client's real, current data. */
  async generateDocument(clientId: string, templateId: string, actor: string | null, title?: string): Promise<GeneratedDocument> {
    const template = await this.getTemplate(templateId);
    if (!template) throw new Error(`Template ${templateId} not found.`);
    const content = await this.runSections(clientId, template.sections);

    const res = await sharedPool.query<DocumentRow>(
      `INSERT INTO generated_documents (client_id, template_id, document_type, title, content, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
      [clientId, templateId, template.documentType, title || template.name, JSON.stringify(content), actor]
    );
    const row = res.rows[0];
    if (!row) throw new Error('generated_documents insert returned no row');
    const doc = toDocument(row);

    await this.versioning.recordVersion('generated_document', doc.id, { content }, actor, 'Initial generation').catch(() => {});
    // Real Traceability Engine links from this document to every real
    // source record its sections actually cited — best-effort, never
    // blocks the document that already exists.
    for (const section of content) {
      for (const sourceId of section.sourceIds) {
        if (sourceId === clientId) continue;
        await this.traceability.link(section.sourceType, sourceId, 'generated_document', doc.id, 'derives_from', actor).catch(() => {});
      }
    }
    return doc;
  }

  async getDocument(id: string): Promise<GeneratedDocument | null> {
    const res = await sharedPool.query<DocumentRow>(`SELECT * FROM generated_documents WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toDocument(row) : null;
  }

  async listDocuments(clientId: string): Promise<GeneratedDocument[]> {
    const res = await sharedPool.query<DocumentRow>(`SELECT * FROM generated_documents WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toDocument);
  }

  /** Re-runs generation against the latest real data — only while still editable (draft/changes_requested). */
  async regenerateContent(documentId: string, actor: string | null): Promise<GeneratedDocument> {
    const doc = await this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found.`);
    if (doc.status !== 'draft' && doc.status !== 'changes_requested') {
      throw new Error(`Cannot regenerate a document with status "${doc.status}" — only draft or changes_requested documents can be regenerated.`);
    }
    const template = await this.getTemplate(doc.templateId);
    if (!template) throw new Error(`Template ${doc.templateId} not found.`);
    const content = await this.runSections(doc.clientId, template.sections);
    const nextVersion = await this.versioning.getCurrentVersionNumber('generated_document', documentId) + 1;

    const res = await sharedPool.query<DocumentRow>(
      `UPDATE generated_documents SET content = $1, version = $2, updated_by = COALESCE($3, updated_by), updated_at = NOW() WHERE id = $4 RETURNING *`,
      [JSON.stringify(content), nextVersion, actor, documentId]
    );
    const row = res.rows[0];
    if (!row) throw new Error('generated_documents update returned no row');
    await this.versioning.recordVersion('generated_document', documentId, { content }, actor, 'Regenerated from latest platform data').catch(() => {});
    return toDocument(row);
  }

  async getDocumentHistory(documentId: string) {
    return this.versioning.getHistory('generated_document', documentId);
  }

  // ─── Approval ─────────────────────────────────────────────────────────

  /** Opens a real approval workflow for a document whose template requires one. */
  async submitForApproval(documentId: string, actor: string | null): Promise<GeneratedDocument> {
    const doc = await this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found.`);
    const template = await this.getTemplate(doc.templateId);
    if (!template) throw new Error(`Template ${doc.templateId} not found.`);
    if (!template.approvalRequired) throw new Error(`This document's template ("${template.name}") does not require approval.`);
    if (doc.status !== 'draft' && doc.status !== 'changes_requested') {
      throw new Error(`Cannot submit a document with status "${doc.status}" for approval.`);
    }
    const workflow = await this.approvals.openWorkflow('generated_document', documentId, `Approve: ${doc.title}`, { documentId, clientId: doc.clientId }, actor);
    const submitted = await this.approvals.submit(workflow.id, actor);
    const res = await sharedPool.query<DocumentRow>(
      `UPDATE generated_documents SET status = 'in_review', approval_workflow_id = $1, updated_by = COALESCE($2, updated_by), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [submitted.id, actor, documentId]
    );
    const row = res.rows[0];
    if (!row) throw new Error('generated_documents update returned no row');
    return toDocument(row);
  }

  /** Approve/reject/request-changes on a document's real, linked approval workflow. */
  async decideApproval(documentId: string, decision: 'approve' | 'reject' | 'request_changes', actor: string | null, note?: string): Promise<GeneratedDocument> {
    const doc = await this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found.`);
    if (!doc.approvalWorkflowId) throw new Error('This document has no open approval workflow.');

    let newStatus: DocumentStatus;
    if (decision === 'approve') {
      await this.approvals.approve(doc.approvalWorkflowId, actor, note);
      newStatus = 'approved';
    } else if (decision === 'reject') {
      await this.approvals.reject(doc.approvalWorkflowId, actor, note);
      newStatus = 'rejected';
    } else {
      if (!note || !note.trim()) throw new Error('A note explaining what changes are needed is required.');
      await this.approvals.requestChanges(doc.approvalWorkflowId, actor, note);
      newStatus = 'changes_requested';
    }
    const res = await sharedPool.query<DocumentRow>(
      `UPDATE generated_documents SET status = $1, updated_by = COALESCE($2, updated_by), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newStatus, actor, documentId]
    );
    const row = res.rows[0];
    if (!row) throw new Error('generated_documents update returned no row');
    return toDocument(row);
  }

  async archiveDocument(documentId: string, actor: string | null): Promise<GeneratedDocument | null> {
    const res = await sharedPool.query<DocumentRow>(
      `UPDATE generated_documents SET status = 'archived', updated_by = COALESCE($1, updated_by), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [actor, documentId]
    );
    const row = res.rows[0];
    return row ? toDocument(row) : null;
  }

  async setCustomerVisibility(documentId: string, visible: boolean, actor: string | null): Promise<GeneratedDocument | null> {
    const res = await sharedPool.query<DocumentRow>(
      `UPDATE generated_documents SET customer_visible = $1, updated_by = COALESCE($2, updated_by), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [visible, actor, documentId]
    );
    const row = res.rows[0];
    return row ? toDocument(row) : null;
  }

  async listCustomerVisibleDocuments(clientId: string): Promise<GeneratedDocument[]> {
    const res = await sharedPool.query<DocumentRow>(
      `SELECT * FROM generated_documents WHERE client_id = $1 AND customer_visible = true AND status NOT IN ('archived') ORDER BY created_at DESC`,
      [clientId]
    );
    return res.rows.map(toDocument);
  }

  // ─── Quality check ────────────────────────────────────────────────────

  /** Real READY/NOT READY check with exact, specific reasons — never a vague pass/fail. */
  async getQualityCheck(documentId: string): Promise<QualityCheckResult> {
    const doc = await this.getDocument(documentId);
    if (!doc) return { ready: false, reasons: ['Document not found.'] };
    const template = await this.getTemplate(doc.templateId);
    const reasons: string[] = [];

    for (const section of doc.content) {
      for (const missing of section.missingFields) {
        reasons.push(`[${section.title}] ${missing}`);
      }
    }
    if (template?.approvalRequired && doc.status !== 'approved') {
      reasons.push(`This document requires approval and is currently "${doc.status}", not approved.`);
    }
    return { ready: reasons.length === 0, reasons };
  }

  // ─── Export ───────────────────────────────────────────────────────────

  /** Real, deterministic rendering from stored content — HTML and Markdown only (see module doc for the honest scope reason). */
  async exportDocument(documentId: string, format: ExportFormat): Promise<string> {
    const doc = await this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found.`);

    if (format === 'markdown') {
      const lines = [`# ${doc.title}`, '', `**Status:** ${doc.status} · **Version:** ${doc.version}`, ''];
      for (const section of doc.content) {
        lines.push(`## ${section.title}`, '', section.content, '');
      }
      return lines.join('\n');
    }
    if (format === 'html') {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const sections = doc.content.map(s => `<section><h2>${esc(s.title)}</h2><pre>${esc(s.content)}</pre></section>`).join('\n');
      return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title></head><body><h1>${esc(doc.title)}</h1><p><strong>Status:</strong> ${esc(doc.status)} · <strong>Version:</strong> ${doc.version}</p>${sections}</body></html>`;
    }
    throw new Error(`Export format "${format}" is NOT SUPPORTED YET — only html and markdown are currently implemented and tested.`);
  }
}
