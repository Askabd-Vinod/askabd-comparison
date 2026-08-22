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
import { Readable } from 'node:stream';
import { sharedPool } from './db-pool.js';
import { TraceabilityEngine } from './traceability-engine.js';
import { DocumentStorageService } from './document-storage-service.js';

export type ExtractionStatus = 'not_applicable' | 'extracted' | 'not_supported' | 'failed';

// Real, honest scope limit (see migration 045's own doc comment): no
// PDF/DOCX/XLSX parser exists anywhere in this codebase yet. Real text
// extraction here covers only formats that are already text — everything
// else is stored for real but honestly marked 'not_supported', never faked.
const ALLOWED_MIME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv', 'image/png', 'image/jpeg'];
const TEXT_EXTRACTABLE_MIME_TYPES = new Set(['text/plain', 'text/csv']);
const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // matches the existing onboarding-document upload limit

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
  storageReference: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  checksum: string | null;
  extractionStatus: ExtractionStatus;
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
  storage_reference: string | null; original_file_name: string | null; mime_type: string | null;
  file_size: number | null; checksum: string | null; extraction_status: ExtractionStatus;
};
type ExtractionRow = {
  id: string; source_id: string; client_id: string; field_name: string; field_value: string;
  evidence_quote: string; confidence: ExtractionConfidence; extracted_by: string | null; created_at: Date;
};

function toSource(r: SourceRow): DiscoverySource {
  return {
    id: r.id, clientId: r.client_id, sourceType: r.source_type, title: r.title, rawContent: r.raw_content,
    status: r.status, submittedBy: r.submitted_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    storageReference: r.storage_reference, originalFileName: r.original_file_name, mimeType: r.mime_type,
    fileSize: r.file_size, checksum: r.checksum, extractionStatus: r.extraction_status || 'not_applicable',
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

  /**
   * Universal Discovery — real document/file ingestion (migration 045).
   * Stores the real file (checksum, size, real bytes via the shared
   * DocumentStorageService), and extracts real text ONLY for formats that
   * need no new parsing dependency (plain text, CSV — already text). Every
   * other allowed format is stored for real but honestly marked
   * extraction_status='not_supported' — never a fabricated or silently
   * empty extraction. See migration 045's own doc comment for the full
   * scope rationale.
   */
  async submitDocument(clientId: string, input: { title: string; fileName: string; mimeType: string; buffer: Buffer }, submittedBy: string | null): Promise<DiscoverySource> {
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new Error(`File type ${input.mimeType} is not allowed. Accepted: PDF, DOCX, PNG, JPEG, TXT, CSV.`);
    }
    if (input.buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new Error('File too large. Maximum size is 20 MB.');
    }

    const created = await sharedPool.query<SourceRow>(
      `INSERT INTO discovery_sources (client_id, source_type, title, raw_content, submitted_by)
       VALUES ($1, 'document', $2, '', $3) RETURNING *`,
      [clientId, input.title.trim(), submittedBy]
    );
    const createdRow = created.rows[0];
    if (!createdRow) throw new Error('discovery_sources insert returned no row');
    const sourceId = createdRow.id;

    const storage = new DocumentStorageService();
    const stored = await storage.saveDiscoveryDocument(clientId, sourceId, input.fileName, Readable.from(input.buffer));

    let extractionStatus: ExtractionStatus;
    let rawContent = '';
    if (TEXT_EXTRACTABLE_MIME_TYPES.has(input.mimeType)) {
      try {
        rawContent = input.buffer.toString('utf-8');
        extractionStatus = 'extracted';
      } catch {
        extractionStatus = 'failed';
      }
    } else {
      extractionStatus = 'not_supported';
    }

    const updated = await sharedPool.query<SourceRow>(
      `UPDATE discovery_sources SET storage_reference = $1, original_file_name = $2, mime_type = $3, file_size = $4, checksum = $5, extraction_status = $6, raw_content = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [stored.storageReference, input.fileName, input.mimeType, stored.fileSize, stored.checksum, extractionStatus, rawContent, sourceId]
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw new Error('discovery_sources update returned no row');
    const source = toSource(updatedRow);
    await audit(source.id, 'discovery_source.document_uploaded', submittedBy, { clientId, mimeType: input.mimeType, fileSize: stored.fileSize, extractionStatus });
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
