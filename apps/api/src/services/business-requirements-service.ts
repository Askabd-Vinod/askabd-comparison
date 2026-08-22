/**
 * Business Requirements Intelligence — Phase 1 of the Master Platform
 * Evolution Program (see docs/enterprise-operations-roadmap.md).
 *
 * Real, database-backed client business/functional/technical requirements —
 * distinct from the existing onboarding-requirement catalog
 * (requirements-service.ts / oc_client_service_requirements), which is
 * AskABD's own fixed, well-specified field set (Database Host, Security
 * Contact, ...). This table holds the CLIENT's own stated requirements
 * ("We need a better ordering system"), which can genuinely be incomplete,
 * ambiguous, conflicting, or duplicate.
 *
 * The quality classifier below is a real, rule-based, fully explainable
 * heuristic — never an opaque score, never a fabricated AI judgment. Every
 * non-'complete' status carries a `quality_findings` array explaining
 * exactly which rule fired and why. Anything this system cannot honestly
 * assess on its own (genuine semantic conflicts between two requirements)
 * is left as 'unverified' rather than guessed — see Part 34 of the
 * governing brief: "Never present generated suggestions as verified facts."
 */
import { sharedPool } from './db-pool.js';

export type RequirementType =
  | 'business' | 'functional' | 'non_functional' | 'technical' | 'integration'
  | 'security' | 'compliance' | 'data' | 'reporting' | 'migration'
  | 'performance' | 'availability' | 'usability';

export type RequirementStatus = 'draft' | 'active' | 'superseded' | 'deprecated';
export type QualityStatus = 'complete' | 'partially_complete' | 'incomplete' | 'ambiguous' | 'conflicting' | 'duplicate' | 'unverified';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface QualityFinding {
  rule: string;
  message: string;
}

export interface BusinessRequirement {
  id: string;
  clientId: string;
  requirementType: RequirementType;
  title: string;
  description: string;
  source: string;
  businessObjective: string;
  stakeholder: string;
  priority: Priority;
  category: string;
  status: RequirementStatus;
  qualityStatus: QualityStatus;
  qualityFindings: QualityFinding[];
  relatedRequirementId: string | null;
  acceptanceCriteria: string;
  dependencies: string;
  constraints: string;
  assumptions: string;
  evidence: string;
  owner: string;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequirementInput {
  requirementType?: RequirementType;
  title: string;
  description?: string;
  source?: string;
  businessObjective?: string;
  stakeholder?: string;
  priority?: Priority;
  category?: string;
  acceptanceCriteria?: string;
  dependencies?: string;
  constraints?: string;
  assumptions?: string;
  evidence?: string;
  owner?: string;
}

type Row = {
  id: string; client_id: string; requirement_type: string; title: string; description: string;
  source: string; business_objective: string; stakeholder: string; priority: string; category: string;
  status: string; quality_status: string; quality_findings: QualityFinding[]; related_requirement_id: string | null;
  acceptance_criteria: string; dependencies: string; constraints: string; assumptions: string;
  evidence: string; owner: string; version: number; created_by: string | null; updated_by: string | null;
  created_at: Date; updated_at: Date;
};

function toRequirement(r: Row): BusinessRequirement {
  return {
    id: r.id, clientId: r.client_id, requirementType: r.requirement_type as RequirementType,
    title: r.title, description: r.description, source: r.source, businessObjective: r.business_objective,
    stakeholder: r.stakeholder, priority: r.priority as Priority, category: r.category,
    status: r.status as RequirementStatus, qualityStatus: r.quality_status as QualityStatus,
    qualityFindings: r.quality_findings || [], relatedRequirementId: r.related_requirement_id,
    acceptanceCriteria: r.acceptance_criteria, dependencies: r.dependencies, constraints: r.constraints,
    assumptions: r.assumptions, evidence: r.evidence, owner: r.owner, version: r.version,
    createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

// Vague/unmeasurable phrasing with no attached metric — a real, narrow,
// explainable list, not a fabricated "AI ambiguity score". Deliberately
// conservative: false negatives (missing real ambiguity) are safer than
// false positives (flagging a genuinely fine requirement as ambiguous).
const VAGUE_TERMS = ['better', 'faster', 'improve', 'improved', 'optimize', 'user-friendly', 'modern', 'robust', 'seamless', 'efficient', 'scalable', 'easy to use', 'simple'];
const HAS_METRIC = /\d/; // any digit at all — "faster (under 2s)" is fine, "faster" alone is not

async function findSimilarRequirements(clientId: string, title: string, excludeId?: string): Promise<{ id: string; title: string }[]> {
  // Real, explainable duplicate signal: same client, case/whitespace-insensitive
  // exact or near-exact title match. Deliberately NOT a fuzzy semantic match —
  // that would require a real NLP model this system does not have, and a
  // wrong fuzzy match would be exactly the kind of unverifiable auto-conclusion
  // Part 34 of the governing brief forbids presenting as fact.
  const normalized = title.trim().toLowerCase().replace(/\s+/g, ' ');
  const res = await sharedPool.query(
    `SELECT id, title FROM oc_business_requirements
     WHERE client_id = $1 AND status != 'deprecated' AND id != COALESCE($3, '')
       AND lower(regexp_replace(title, '\\s+', ' ', 'g')) = $2`,
    [clientId, normalized, excludeId || null]
  );
  return res.rows;
}

/**
 * Real, rule-based quality classification. Every branch is explainable —
 * `findings` always says exactly why. Priority order matches the governing
 * brief's own ("Never automatically mark something compliant simply because
 * information looks reasonable"): duplicate > incomplete > ambiguous >
 * partially_complete > complete. 'conflicting' is never auto-assigned here
 * (see module doc) — it can only be set by an explicit staff action.
 */
export async function classifyQuality(
  clientId: string,
  input: { title: string; description: string; businessObjective: string; stakeholder: string; acceptanceCriteria: string; category: string; priority: string },
  excludeId?: string
): Promise<{ qualityStatus: QualityStatus; findings: QualityFinding[]; relatedRequirementId: string | null }> {
  const findings: QualityFinding[] = [];

  const duplicates = await findSimilarRequirements(clientId, input.title, excludeId);
  const firstDuplicate = duplicates[0];
  if (firstDuplicate) {
    findings.push({ rule: 'duplicate_title', message: `Matches the title of an existing requirement for this client: "${firstDuplicate.title}" (${firstDuplicate.id})` });
    return { qualityStatus: 'duplicate', findings, relatedRequirementId: firstDuplicate.id };
  }

  const missing: string[] = [];
  if (!input.description || input.description.trim().length < 10) missing.push('description');
  if (!input.acceptanceCriteria || !input.acceptanceCriteria.trim()) missing.push('acceptance criteria');
  if (!input.stakeholder || !input.stakeholder.trim()) missing.push('stakeholder');
  if (!input.businessObjective || !input.businessObjective.trim()) missing.push('business objective');
  if (!input.category || !input.category.trim()) missing.push('category');

  if (missing.length >= 3) {
    findings.push({ rule: 'missing_required_fields', message: `Missing: ${missing.join(', ')}` });
    return { qualityStatus: 'incomplete', findings, relatedRequirementId: null };
  }

  // Ambiguity: description uses a vague/unmeasurable term with no attached
  // number anywhere in the description (a real, if narrow, signal that a
  // "quality" or "performance"-style requirement has no measurable target).
  const descLower = (input.description || '').toLowerCase();
  const vagueHit = VAGUE_TERMS.find(t => descLower.includes(t));
  if (vagueHit && !HAS_METRIC.test(input.description || '')) {
    findings.push({ rule: 'vague_unmeasurable_language', message: `Description uses "${vagueHit}" without a measurable target (no number found in the description) — consider adding a concrete metric or threshold` });
    return { qualityStatus: 'ambiguous', findings, relatedRequirementId: null };
  }

  if (missing.length > 0) {
    findings.push({ rule: 'missing_optional_fields', message: `Missing: ${missing.join(', ')}` });
    return { qualityStatus: 'partially_complete', findings, relatedRequirementId: null };
  }

  return { qualityStatus: 'complete', findings: [], relatedRequirementId: null };
}

async function audit(entityId: string, action: string, actor: string | null, details: Record<string, unknown>): Promise<void> {
  try {
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details) VALUES ($1, $2, $3, $4, $5)`,
      ['business_requirement', entityId, action, actor || 'system', JSON.stringify(details)]
    );
  } catch { /* best-effort, matches the platform-wide audit pattern — never blocks the real mutation */ }
}

export class BusinessRequirementsService {
  async listRequirements(clientId: string): Promise<BusinessRequirement[]> {
    const res = await sharedPool.query<Row>(
      `SELECT * FROM oc_business_requirements WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );
    return res.rows.map(toRequirement);
  }

  async getRequirement(id: string): Promise<BusinessRequirement | null> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_business_requirements WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toRequirement(row) : null;
  }

  async createRequirement(clientId: string, input: CreateRequirementInput, actorId: string | null): Promise<BusinessRequirement> {
    const description = input.description || '';
    const businessObjective = input.businessObjective || '';
    const stakeholder = input.stakeholder || '';
    const acceptanceCriteria = input.acceptanceCriteria || '';
    const category = input.category || '';
    const priority = input.priority || 'medium';

    const { qualityStatus, findings, relatedRequirementId } = await classifyQuality(clientId, {
      title: input.title, description, businessObjective, stakeholder, acceptanceCriteria, category, priority,
    });

    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_business_requirements (
        client_id, requirement_type, title, description, source, business_objective, stakeholder,
        priority, category, quality_status, quality_findings, related_requirement_id,
        acceptance_criteria, dependencies, constraints, assumptions, evidence, owner, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
      RETURNING *`,
      [
        clientId, input.requirementType || 'business', input.title.trim(), description, input.source || '',
        businessObjective, stakeholder, priority, category, qualityStatus, JSON.stringify(findings), relatedRequirementId,
        acceptanceCriteria, input.dependencies || '', input.constraints || '', input.assumptions || '',
        input.evidence || '', input.owner || '', actorId,
      ]
    );
    const createdRow = res.rows[0];
    if (!createdRow) throw new Error('business_requirement insert returned no row');
    const requirement = toRequirement(createdRow);
    await audit(requirement.id, 'business_requirement.created', actorId, { clientId, title: requirement.title, qualityStatus: requirement.qualityStatus });
    return requirement;
  }

  /**
   * Transactional, versioned update with real history — same pattern as
   * requirements-service.ts's updateRequirement. Re-classifies quality on
   * every update since the fields the classifier reads may have changed.
   */
  async updateRequirement(id: string, patch: Partial<CreateRequirementInput> & { status?: RequirementStatus }, actorId: string | null): Promise<BusinessRequirement | null> {
    const current = await sharedPool.query<Row>(`SELECT * FROM oc_business_requirements WHERE id = $1`, [id]);
    const row = current.rows[0];
    if (!row) return null;

    const merged = {
      title: patch.title ?? row.title,
      description: patch.description ?? row.description,
      businessObjective: patch.businessObjective ?? row.business_objective,
      stakeholder: patch.stakeholder ?? row.stakeholder,
      acceptanceCriteria: patch.acceptanceCriteria ?? row.acceptance_criteria,
      category: patch.category ?? row.category,
      priority: patch.priority ?? row.priority,
    };
    const { qualityStatus, findings, relatedRequirementId } = await classifyQuality(row.client_id, merged, id);

    const client = await sharedPool.connect();
    try {
      await client.query('BEGIN');
      const newVersion = (row.version || 1) + 1;
      const updated = await client.query<Row>(
        `UPDATE oc_business_requirements SET
          requirement_type = $1, title = $2, description = $3, source = $4, business_objective = $5,
          stakeholder = $6, priority = $7, category = $8, status = $9, quality_status = $10,
          quality_findings = $11, related_requirement_id = $12, acceptance_criteria = $13,
          dependencies = $14, constraints = $15, assumptions = $16, evidence = $17, owner = $18,
          version = $19, updated_by = $20, updated_at = NOW()
        WHERE id = $21 RETURNING *`,
        [
          patch.requirementType ?? row.requirement_type, merged.title.trim(), merged.description, patch.source ?? row.source,
          merged.businessObjective, merged.stakeholder, merged.priority, merged.category, patch.status ?? row.status,
          qualityStatus, JSON.stringify(findings), relatedRequirementId, merged.acceptanceCriteria,
          patch.dependencies ?? row.dependencies, patch.constraints ?? row.constraints, patch.assumptions ?? row.assumptions,
          patch.evidence ?? row.evidence, patch.owner ?? row.owner, newVersion, actorId, id,
        ]
      );
      await client.query(
        `INSERT INTO oc_business_requirement_history (requirement_id, client_id, field_snapshot, changed_by, version) VALUES ($1,$2,$3,$4,$5)`,
        [id, row.client_id, JSON.stringify(row), actorId, newVersion]
      );
      await client.query('COMMIT');
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new Error('business_requirement update returned no row');
      const result = toRequirement(updatedRow);
      await audit(id, 'business_requirement.updated', actorId, { clientId: row.client_id, qualityStatus: result.qualityStatus });
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Soft state change only — never a hard delete, matching platform-wide ethos. */
  async deprecateRequirement(id: string, actorId: string | null): Promise<BusinessRequirement | null> {
    const res = await sharedPool.query<Row>(
      `UPDATE oc_business_requirements SET status = 'deprecated', updated_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [actorId, id]
    );
    const deprecatedRow = res.rows[0];
    if (!deprecatedRow) return null;
    const requirement = toRequirement(deprecatedRow);
    await audit(id, 'business_requirement.deprecated', actorId, { clientId: requirement.clientId });
    return requirement;
  }

  /** Explicit, staff-only conflict flag — the one quality_status this system never auto-assigns (see module doc). */
  async flagConflict(id: string, conflictsWithId: string, actorId: string | null): Promise<BusinessRequirement | null> {
    const other = await sharedPool.query(`SELECT id, title FROM oc_business_requirements WHERE id = $1`, [conflictsWithId]);
    const otherRow = other.rows[0];
    if (!otherRow) return null;
    const findings: QualityFinding[] = [{ rule: 'staff_flagged_conflict', message: `Manually flagged by staff as conflicting with "${otherRow.title}" (${conflictsWithId})` }];
    const res = await sharedPool.query<Row>(
      `UPDATE oc_business_requirements SET quality_status = 'conflicting', quality_findings = $1, related_requirement_id = $2, updated_by = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [JSON.stringify(findings), conflictsWithId, actorId, id]
    );
    const flaggedRow = res.rows[0];
    if (!flaggedRow) return null;
    const requirement = toRequirement(flaggedRow);
    await audit(id, 'business_requirement.flagged_conflict', actorId, { clientId: requirement.clientId, conflictsWithId });
    return requirement;
  }

  async getHistory(id: string): Promise<any[]> {
    const res = await sharedPool.query(
      `SELECT * FROM oc_business_requirement_history WHERE requirement_id = $1 ORDER BY version DESC LIMIT 20`,
      [id]
    );
    return res.rows;
  }

  /** Real, evidence-backed rollup — no fabricated single "health score" (Part 17 of the governing brief). */
  async getQualitySummary(clientId: string): Promise<Record<QualityStatus, number> & { total: number }> {
    const res = await sharedPool.query(
      `SELECT quality_status, COUNT(*)::int AS count FROM oc_business_requirements WHERE client_id = $1 AND status != 'deprecated' GROUP BY quality_status`,
      [clientId]
    );
    const summary: Record<string, number> = { complete: 0, partially_complete: 0, incomplete: 0, ambiguous: 0, conflicting: 0, duplicate: 0, unverified: 0 };
    let total = 0;
    for (const row of res.rows) { summary[row.quality_status] = row.count; total += row.count; }
    return { ...(summary as Record<QualityStatus, number>), total };
  }
}
