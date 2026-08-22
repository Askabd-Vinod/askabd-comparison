/**
 * Universal Discovery — free-text problem-statement intake (roadmap Phase
 * 2, item 1). See migration 042 for the full architecture rationale: this
 * is genuinely new capability, distinct from discovery-service.ts's live
 * connector-based TECHNICAL discovery and problem-universe-service.ts's
 * already-classified Problem records. This is the raw, human-authored
 * "here's what's wrong" narrative — the real upstream starting point.
 *
 * Document/file ingestion (PDF/Word/spreadsheet/screenshot) is a real
 * fast-follow, out of scope for this pass — not built, not faked.
 *
 * Extraction is always a STAFF action, never a fabricated AI claim (no
 * real NLP/AI extraction exists in this platform yet — see migration 042's
 * doc comment). `extractField` links the new discovery_extraction and the
 * source discovery_source together via the real Traceability Engine
 * (traceability-engine.ts), so a later Business Requirement created from
 * this source can trace all the way back to the original client narrative.
 */
import { sharedPool } from './db-pool.js';
import { TraceabilityEngine } from './traceability-engine.js';

/**
 * A distinct error class rather than string-matching the message (e.g.
 * `message.includes('not found')`) — a prior draft of this file did that
 * in the route handler and it broke on the FIRST real test run: the
 * evidence-quote-verification error's own wording ("...it was not found
 * there") happens to contain the substring "not found" too, so a
 * string-matched route would have misrouted a real 400 (bad evidence
 * quote) as a 404 (source missing). Caught by the real test suite, not
 * assumed correct — fixed by making "the source itself doesn't exist" a
 * real, distinguishable type instead of a substring guess.
 */
export class DiscoverySourceNotFoundError extends Error {
  constructor(sourceId: string) {
    super(`Discovery source ${sourceId} not found.`);
    this.name = 'DiscoverySourceNotFoundError';
  }
}

export type SourceType = 'free_text' | 'document' | 'meeting_notes' | 'email' | 'other';
export type SourceStatus = 'submitted' | 'reviewed' | 'archived';
export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'unverified';

export interface DiscoverySource {
  id: string;
  clientId: string;
  sourceType: SourceType;
  title: string;
  rawContent: string;
  status: SourceStatus;
  submittedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryExtraction {
  id: string;
  sourceId: string;
  clientId: string;
  fieldName: string;
  fieldValue: string;
  evidenceQuote: string;
  confidence: ExtractionConfidence;
  extractedBy: string | null;
  createdAt: string;
}

type SourceRow = {
  id: string; client_id: string; source_type: SourceType; title: string; raw_content: string;
  status: SourceStatus; submitted_by: string | null; created_at: Date; updated_at: Date;
};
type ExtractionRow = {
  id: string; source_id: string; client_id: string; field_name: string; field_value: string;
  evidence_quote: string; confidence: ExtractionConfidence; extracted_by: string | null; created_at: Date;
};

function toSource(r: SourceRow): DiscoverySource {
  return {
    id: r.id, clientId: r.client_id, sourceType: r.source_type, title: r.title, rawContent: r.raw_content,
    status: r.status, submittedBy: r.submitted_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}
function toExtraction(r: ExtractionRow): DiscoveryExtraction {
  return {
    id: r.id, sourceId: r.source_id, clientId: r.client_id, fieldName: r.field_name, fieldValue: r.field_value,
    evidenceQuote: r.evidence_quote, confidence: r.confidence, extractedBy: r.extracted_by, createdAt: r.created_at.toISOString(),
  };
}

async function audit(entityId: string, action: string, actor: string | null, details: Record<string, unknown>): Promise<void> {
  try {
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details) VALUES ($1, $2, $3, $4, $5)`,
      ['discovery_source', entityId, action, actor || 'system', JSON.stringify(details)]
    );
  } catch { /* best-effort, matches the platform-wide audit pattern — never blocks the real mutation */ }
}

export class DiscoveryIntakeService {
  private traceability = new TraceabilityEngine();

  async listSources(clientId: string): Promise<DiscoverySource[]> {
    const res = await sharedPool.query<SourceRow>(
      `SELECT * FROM discovery_sources WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );
    return res.rows.map(toSource);
  }

  async getSource(id: string): Promise<DiscoverySource | null> {
    const res = await sharedPool.query<SourceRow>(`SELECT * FROM discovery_sources WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toSource(row) : null;
  }

  async submitSource(clientId: string, input: { sourceType?: SourceType; title: string; rawContent: string }, submittedBy: string | null): Promise<DiscoverySource> {
    const res = await sharedPool.query<SourceRow>(
      `INSERT INTO discovery_sources (client_id, source_type, title, raw_content, submitted_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clientId, input.sourceType || 'free_text', input.title.trim(), input.rawContent, submittedBy]
    );
    const row = res.rows[0];
    if (!row) throw new Error('discovery_sources insert returned no row');
    const source = toSource(row);
    await audit(source.id, 'discovery_source.submitted', submittedBy, { clientId, sourceType: source.sourceType });
    return source;
  }

  async markReviewed(id: string, actor: string | null): Promise<DiscoverySource | null> {
    const res = await sharedPool.query<SourceRow>(
      `UPDATE discovery_sources SET status = 'reviewed', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    const row = res.rows[0];
    if (!row) return null;
    const source = toSource(row);
    await audit(id, 'discovery_source.reviewed', actor, { clientId: source.clientId });
    return source;
  }

  async archiveSource(id: string, actor: string | null): Promise<DiscoverySource | null> {
    const res = await sharedPool.query<SourceRow>(
      `UPDATE discovery_sources SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    const row = res.rows[0];
    if (!row) return null;
    const source = toSource(row);
    await audit(id, 'discovery_source.archived', actor, { clientId: source.clientId });
    return source;
  }

  async listExtractions(sourceId: string): Promise<DiscoveryExtraction[]> {
    const res = await sharedPool.query<ExtractionRow>(
      `SELECT * FROM discovery_extractions WHERE source_id = $1 ORDER BY created_at ASC`,
      [sourceId]
    );
    return res.rows.map(toExtraction);
  }

  /**
   * A real, staff-attributed structured finding tagged out of a source's
   * raw text — requires a real evidence_quote (a verbatim excerpt from the
   * source's own raw_content), so the extraction is always checkable
   * against the original words rather than trusted blindly. Also records a
   * real traceability_links row (discovery_source -> discovery_extraction,
   * 'derives_from') via the shared Traceability Engine, so later work
   * (e.g. a Business Requirement created from this finding) can trace all
   * the way back to the original client narrative.
   */
  async extractField(sourceId: string, input: { fieldName: string; fieldValue: string; evidenceQuote: string; confidence?: ExtractionConfidence }, extractedBy: string | null): Promise<DiscoveryExtraction> {
    if (!input.evidenceQuote || !input.evidenceQuote.trim()) {
      throw new Error('An evidence quote from the source text is required — an extraction cannot be recorded without it.');
    }
    const source = await this.getSource(sourceId);
    if (!source) throw new DiscoverySourceNotFoundError(sourceId);
    if (!source.rawContent.includes(input.evidenceQuote.trim())) {
      throw new Error('The evidence quote must be a verbatim excerpt of the source\'s raw content — that exact text does not appear there.');
    }

    const res = await sharedPool.query<ExtractionRow>(
      `INSERT INTO discovery_extractions (source_id, client_id, field_name, field_value, evidence_quote, confidence, extracted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [sourceId, source.clientId, input.fieldName.trim(), input.fieldValue.trim(), input.evidenceQuote.trim(), input.confidence || 'unverified', extractedBy]
    );
    const row = res.rows[0];
    if (!row) throw new Error('discovery_extractions insert returned no row');
    const extraction = toExtraction(row);

    await this.traceability.link('discovery_source', sourceId, 'discovery_extraction', extraction.id, 'derives_from', extractedBy);
    await audit(sourceId, 'discovery_extraction.created', extractedBy, { clientId: source.clientId, fieldName: extraction.fieldName, extractionId: extraction.id });
    return extraction;
  }
}
