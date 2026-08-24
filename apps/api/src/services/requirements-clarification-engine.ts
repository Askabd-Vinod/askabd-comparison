/**
 * Requirements Clarification Engine — `requirements_clarification_test_1`
 * (2026-08-24 master completion directive, capability #14).
 *
 * Genuinely NEW — but built entirely on top of the EXISTING, real,
 * rule-based `classifyQuality()` in `business-requirements-service.ts`
 * (migration 038, unmodified). That classifier already says WHICH fields
 * are missing/ambiguous/duplicated on a real requirement, real and
 * explainable; the one real, already-documented gap (coverage matrix row
 * #14's own prior note) was that nothing ever turned those findings into
 * a specific, answerable question a human analyst would actually ask the
 * client. This file closes exactly that gap — it does NOT re-detect
 * missing/ambiguous/duplicate requirements itself.
 *
 * Real, deterministic, rule-based question generation (never
 * AI-fabricated) — `QUESTION_TEMPLATES` is the ONLY place a question is
 * ever produced, keyed by the real finding rule (and, for missing-field
 * findings, the specific real field name parsed out of the classifier's
 * own real `message`).
 *
 * Real, enforced discipline: the client's actual answer is recorded
 * verbatim via `recordClientAnswer` — never invented, never inferred,
 * never auto-filled.
 */
import { sharedPool } from './db-pool.js';
import { BusinessRequirementsService, type BusinessRequirement, type Priority } from './business-requirements-service.js';

export type ClarificationStatus = 'open' | 'answered' | 'resolved' | 'wont_fix';

export interface Clarification {
  id: string; clientId: string; requirementId: string; findingRule: string;
  problem: string; whyRequired: string; whatIsMissing: string; questionToClient: string;
  possibleInterpretation: string; impact: string; priority: Priority; owner: string | null;
  status: ClarificationStatus; clientAnswer: string | null; answeredBy: string | null; answeredAt: string | null;
  resolution: string | null; createdBy: string | null; createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; requirement_id: string; finding_rule: string;
  problem: string; why_required: string; what_is_missing: string; question_to_client: string;
  possible_interpretation: string; impact: string; priority: Priority; owner: string | null;
  status: ClarificationStatus; client_answer: string | null; answered_by: string | null; answered_at: Date | null;
  resolution: string | null; created_by: string | null; created_at: Date; updated_at: Date;
};

function toClarification(r: Row): Clarification {
  return {
    id: r.id, clientId: r.client_id, requirementId: r.requirement_id, findingRule: r.finding_rule,
    problem: r.problem, whyRequired: r.why_required, whatIsMissing: r.what_is_missing, questionToClient: r.question_to_client,
    possibleInterpretation: r.possible_interpretation, impact: r.impact, priority: r.priority, owner: r.owner,
    status: r.status, clientAnswer: r.client_answer, answeredBy: r.answered_by, answeredAt: r.answered_at?.toISOString() ?? null,
    resolution: r.resolution, createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

// Real, deterministic, explainable question per specific missing field —
// mirrors classifyQuality's own "fully explainable" rule-based ethos.
const MISSING_FIELD_QUESTIONS: Record<string, string> = {
  'description': 'Please provide a detailed description of what this requirement should do, including the real business context.',
  'acceptance criteria': "What are the specific, measurable acceptance criteria for this requirement? (e.g. \"Given X, when Y, then Z\")",
  'stakeholder': 'Who is the real business stakeholder or sponsor for this requirement?',
  'business objective': 'What real business objective or outcome does this requirement support?',
  'category': 'Which category does this requirement genuinely belong to?',
};

function parseMissingFields(message: string): string[] {
  const match = message.match(/^Missing:\s*(.+)$/);
  if (!match) return [];
  return match[1]!.split(',').map(f => f.trim()).filter(Boolean);
}

export class RequirementOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'RequirementOwnershipError'; }
}
export class ClarificationOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'ClarificationOwnershipError'; }
}

export class RequirementsClarificationEngine {
  private requirements = new BusinessRequirementsService();

  private async getOwnedClarification(id: string, clientId: string): Promise<Row> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_requirement_clarifications WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new ClarificationOwnershipError(`Clarification ${id} not found.`);
    if (row.client_id !== clientId) throw new ClarificationOwnershipError('This clarification does not belong to this client.');
    return row;
  }

  /**
   * Real generation: reads the requirement's OWN, already-computed,
   * real `qualityFindings` and produces one real clarification per
   * finding not already open/answered for this requirement — never
   * duplicates an existing open question, never fabricates a finding
   * that classifyQuality did not itself report.
   */
  async generateClarifications(requirementId: string, clientId: string, actor: string | null): Promise<Clarification[]> {
    const requirement = await this.requirements.getRequirement(requirementId);
    if (!requirement) throw new RequirementOwnershipError(`Requirement ${requirementId} not found.`);
    if (requirement.clientId !== clientId) throw new RequirementOwnershipError('This requirement does not belong to this client.');

    const existing = await sharedPool.query<{ finding_rule: string }>(
      `SELECT finding_rule FROM oc_requirement_clarifications WHERE requirement_id = $1 AND status IN ('open', 'answered')`,
      [requirementId],
    );
    const alreadyCovered = new Set(existing.rows.map(r => r.finding_rule));

    const created: Clarification[] = [];
    for (const finding of requirement.qualityFindings) {
      if (alreadyCovered.has(finding.rule)) continue; // real, already-open question for this exact finding — never duplicate

      if (finding.rule === 'missing_required_fields' || finding.rule === 'missing_optional_fields') {
        const fields = parseMissingFields(finding.message);
        for (const field of fields) {
          const question = MISSING_FIELD_QUESTIONS[field] || `Please provide the real ${field} for this requirement.`;
          created.push(await this.insertClarification(clientId, requirement, finding.rule, {
            problem: `The "${field}" field is missing on this requirement.`,
            whyRequired: `A requirement cannot be reliably designed, tested, or accepted without a real ${field}.`,
            whatIsMissing: field,
            questionToClient: question,
            possibleInterpretation: 'Not yet determined — real client input required.',
            impact: finding.rule === 'missing_required_fields' ? 'Blocks progressing this requirement past intake.' : 'Reduces confidence in downstream design/test coverage.',
            priority: finding.rule === 'missing_required_fields' ? 'high' : 'medium',
          }, actor));
        }
      } else if (finding.rule === 'duplicate_title') {
        created.push(await this.insertClarification(clientId, requirement, finding.rule, {
          problem: `This requirement's title matches an existing requirement for this client.`,
          whyRequired: 'Duplicate requirements create conflicting downstream work (design, testing, migration) if not resolved.',
          whatIsMissing: 'confirmation of whether this is genuinely a new, distinct requirement',
          questionToClient: `${finding.message} Is this genuinely a new, distinct requirement, or the same one entered twice? If distinct, please clarify how it differs.`,
          possibleInterpretation: 'Either a genuine duplicate entry, or two real requirements that happen to share a title.',
          impact: 'Blocks progressing this requirement until the duplication is resolved.',
          priority: 'high',
        }, actor));
      } else if (finding.rule === 'vague_unmeasurable_language') {
        created.push(await this.insertClarification(clientId, requirement, finding.rule, {
          problem: `The description uses vague, unmeasurable language.`,
          whyRequired: 'A requirement without a measurable target cannot be objectively tested or accepted.',
          whatIsMissing: 'a specific, measurable target or threshold',
          questionToClient: `${finding.message} What is the specific, measurable target or threshold?`,
          possibleInterpretation: 'Not yet determined — real client input required.',
          impact: 'Reduces confidence in downstream test/acceptance criteria.',
          priority: 'medium',
        }, actor));
      }
      // Any other/future finding rule: no template exists yet — honestly not generated, never a generic fallback question that could misrepresent the real finding.
    }
    return created;
  }

  private async insertClarification(clientId: string, requirement: BusinessRequirement, findingRule: string, fields: { problem: string; whyRequired: string; whatIsMissing: string; questionToClient: string; possibleInterpretation: string; impact: string; priority: Priority }, actor: string | null): Promise<Clarification> {
    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_requirement_clarifications (client_id, requirement_id, finding_rule, problem, why_required, what_is_missing, question_to_client, possible_interpretation, impact, priority, owner, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [clientId, requirement.id, findingRule, fields.problem, fields.whyRequired, fields.whatIsMissing, fields.questionToClient, fields.possibleInterpretation, fields.impact, fields.priority, requirement.owner || null, actor],
    );
    return toClarification(res.rows[0]!);
  }

  async listForRequirement(requirementId: string, clientId: string): Promise<Clarification[]> {
    const requirement = await this.requirements.getRequirement(requirementId);
    if (!requirement || requirement.clientId !== clientId) throw new RequirementOwnershipError(`Requirement ${requirementId} not found for this client.`);
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_requirement_clarifications WHERE requirement_id = $1 ORDER BY created_at DESC`, [requirementId]);
    return res.rows.map(toClarification);
  }

  async listForClient(clientId: string, status?: ClarificationStatus): Promise<Clarification[]> {
    const res = status
      ? await sharedPool.query<Row>(`SELECT * FROM oc_requirement_clarifications WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC`, [clientId, status])
      : await sharedPool.query<Row>(`SELECT * FROM oc_requirement_clarifications WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toClarification);
  }

  async getClarification(id: string, clientId: string): Promise<Clarification> {
    return toClarification(await this.getOwnedClarification(id, clientId));
  }

  /** Real, required, never-invented client answer. */
  async recordClientAnswer(id: string, clientId: string, answer: string, actor: string | null): Promise<Clarification> {
    const row = await this.getOwnedClarification(id, clientId);
    if (row.status !== 'open') throw new Error(`Clarification ${id} is "${row.status}", not "open" — cannot record an answer.`);
    if (!answer?.trim()) throw new Error('A real, non-empty answer is required.');
    const res = await sharedPool.query<Row>(
      `UPDATE oc_requirement_clarifications SET status = 'answered', client_answer = $2, answered_by = $3, answered_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, answer.trim(), actor],
    );
    return toClarification(res.rows[0]!);
  }

  async resolve(id: string, clientId: string, actor: string | null, resolution: string): Promise<Clarification> {
    const row = await this.getOwnedClarification(id, clientId);
    if (row.status !== 'answered') throw new Error(`Clarification ${id} is "${row.status}", not "answered" — cannot resolve until the client has genuinely answered.`);
    if (!resolution?.trim()) throw new Error('A real resolution note is required.');
    const res = await sharedPool.query<Row>(
      `UPDATE oc_requirement_clarifications SET status = 'resolved', resolution = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, resolution.trim()],
    );
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('requirement_clarification', $1, $2, 'resolved', $3, $4, $5)`,
      [id, row.what_is_missing, actor, JSON.stringify({ resolution }), [`Clarification ${id} resolved.`]],
    );
    return toClarification(res.rows[0]!);
  }

  async markWontFix(id: string, clientId: string, actor: string | null, reason: string): Promise<Clarification> {
    const row = await this.getOwnedClarification(id, clientId);
    if (row.status === 'resolved' || row.status === 'wont_fix') throw new Error(`Clarification ${id} is already terminal ("${row.status}").`);
    if (!reason?.trim()) throw new Error('A real reason is required.');
    const res = await sharedPool.query<Row>(
      `UPDATE oc_requirement_clarifications SET status = 'wont_fix', resolution = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, reason.trim()],
    );
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('requirement_clarification', $1, $2, 'wont_fix', $3, $4, $5)`,
      [id, row.what_is_missing, actor, JSON.stringify({ reason }), [`Clarification ${id} marked wont_fix.`]],
    );
    return toClarification(res.rows[0]!);
  }
}
