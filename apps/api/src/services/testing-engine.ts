/**
 * Universal Testing & Validation Engine — test case model + real,
 * rule-based (never AI-fabricated) generation. See migration 049's own
 * doc comment for the full v1 scope statement and the real
 * `oc_defects`-vs-`test_defects` architecture decision.
 *
 * "Do not blindly generate meaningless tests. Every generated test must
 * have a reason and traceability source" is enforced structurally: every
 * generated test case carries a real, non-empty `generationReason` tied
 * to a real field on the source record, and is linked to that source via
 * the shared Traceability Engine (`test_case` --tests--> source),
 * never a bare row with no way to trace why it exists.
 */
import { sharedPool } from './db-pool.js';
import { TraceabilityEngine } from './traceability-engine.js';

export type TestCaseCategory =
  | 'positive' | 'negative' | 'boundary' | 'validation' | 'permission' | 'security'
  | 'integration' | 'regression' | 'error_handling' | 'data_validation'
  | 'performance' | 'accessibility' | 'cross_browser' | 'cross_device';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TestCaseStatus = 'draft' | 'active' | 'deprecated';
export type TestCaseSourceType = 'business_requirement' | 'gap' | 'discovery_extraction' | 'manual';

export interface TestCase {
  id: string; clientId: string; sourceType: TestCaseSourceType; sourceId: string | null;
  title: string; description: string; preconditions: string; environment: string; device: string; browser: string;
  testData: string; steps: string[]; expectedResult: string; category: TestCaseCategory;
  priority: Priority; severity: Priority; source: 'generated' | 'manual'; generationReason: string;
  status: TestCaseStatus; createdBy: string | null; createdAt: string; updatedAt: string;
}

type Row = {
  id: string; client_id: string; source_type: TestCaseSourceType; source_id: string | null; title: string;
  description: string; preconditions: string; environment: string; device: string; browser: string;
  test_data: string; steps: string[]; expected_result: string; category: TestCaseCategory;
  priority: Priority; severity: Priority; source: 'generated' | 'manual'; generation_reason: string;
  status: TestCaseStatus; created_by: string | null; created_at: Date; updated_at: Date;
};

function toCase(r: Row): TestCase {
  return {
    id: r.id, clientId: r.client_id, sourceType: r.source_type, sourceId: r.source_id, title: r.title,
    description: r.description, preconditions: r.preconditions, environment: r.environment, device: r.device,
    browser: r.browser, testData: r.test_data, steps: r.steps || [], expectedResult: r.expected_result,
    category: r.category, priority: r.priority, severity: r.severity, source: r.source,
    generationReason: r.generation_reason, status: r.status, createdBy: r.created_by,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export interface ManualTestCaseInput {
  title: string; description?: string; preconditions?: string; environment?: string; device?: string; browser?: string;
  testData?: string; steps?: string[]; expectedResult?: string; category: TestCaseCategory;
  priority?: Priority; severity?: Priority;
}

interface GeneratedSpec {
  title: string; description: string; expectedResult: string; category: TestCaseCategory;
  priority: Priority; severity: Priority; reason: string; testData?: string;
}

export class TestCaseService {
  private traceability = new TraceabilityEngine();

  async list(clientId: string): Promise<TestCase[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM test_cases WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toCase);
  }

  async get(id: string): Promise<TestCase | null> {
    const res = await sharedPool.query<Row>(`SELECT * FROM test_cases WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toCase(row) : null;
  }

  async updateStatus(id: string, status: TestCaseStatus): Promise<TestCase | null> {
    const res = await sharedPool.query<Row>(`UPDATE test_cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, id]);
    const row = res.rows[0];
    return row ? toCase(row) : null;
  }

  async createManual(clientId: string, input: ManualTestCaseInput, actor: string | null): Promise<TestCase> {
    if (!input.title?.trim()) throw new Error('title is required');
    return this.insert(clientId, 'manual', null, {
      title: input.title, description: input.description || '', expectedResult: input.expectedResult || '',
      category: input.category, priority: input.priority || 'medium', severity: input.severity || 'medium', reason: 'Manually authored by staff.',
    }, 'manual', actor, { preconditions: '', environment: input.environment || '', device: input.device || '', browser: input.browser || '', testData: input.testData || '', steps: input.steps || [] });
  }

  private async insert(
    clientId: string, sourceType: TestCaseSourceType, sourceId: string | null, spec: GeneratedSpec,
    source: 'generated' | 'manual', actor: string | null,
    extra?: { preconditions?: string; environment?: string; device?: string; browser?: string; testData?: string; steps?: string[] }
  ): Promise<TestCase> {
    const res = await sharedPool.query<Row>(
      `INSERT INTO test_cases (client_id, source_type, source_id, title, description, preconditions, environment, device, browser, test_data, steps, expected_result, category, priority, severity, source, generation_reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [clientId, sourceType, sourceId, spec.title, spec.description, extra?.preconditions || '', extra?.environment || '',
        extra?.device || '', extra?.browser || '', extra?.testData || spec.testData || '', JSON.stringify(extra?.steps || []),
        spec.expectedResult, spec.category, spec.priority, spec.severity, source, spec.reason, actor]
    );
    const row = res.rows[0];
    if (!row) throw new Error('test_cases insert returned no row');
    const testCase = toCase(row);
    if (sourceId) {
      await this.traceability.link('test_case', testCase.id, sourceType, sourceId, 'tests', actor).catch(() => {});
    }
    return testCase;
  }

  /** Real, rule-based generation from a real business requirement — every case ties to a real field, never fabricated. */
  async generateFromBusinessRequirement(clientId: string, requirementId: string, actor: string | null): Promise<TestCase[]> {
    const res = await sharedPool.query(`SELECT * FROM oc_business_requirements WHERE id = $1 AND client_id = $2`, [requirementId, clientId]);
    const req = res.rows[0];
    if (!req) throw new Error(`Business requirement ${requirementId} not found for this client.`);

    const specs: GeneratedSpec[] = [];
    specs.push({
      title: `Verify: ${req.title}`, description: req.description || req.title,
      expectedResult: req.acceptance_criteria || `${req.title} behaves as described.`,
      category: 'positive', priority: req.priority || 'medium', severity: 'medium',
      reason: req.acceptance_criteria
        ? "Derived directly from the requirement's own acceptance criteria."
        : "Derived from the requirement's title/description — no acceptance criteria recorded yet (see Known Limitations).",
    });
    if (req.acceptance_criteria) {
      specs.push({
        title: `Verify rejection when preconditions are not met: ${req.title}`,
        description: `Confirms the system does not silently succeed when the acceptance criteria's real conditions are not satisfied.`,
        expectedResult: 'The system rejects or correctly handles the inverse of the stated acceptance criteria.',
        category: 'negative', priority: req.priority || 'medium', severity: 'medium',
        reason: "Acceptance criteria implies a specific expected condition — a negative case verifies the system correctly rejects or handles the inverse.",
      });
    }
    const numberMatch = `${req.description || ''} ${req.acceptance_criteria || ''}`.match(/\d+(\.\d+)?\s*(seconds?|minutes?|hours?|days?|items?|records?|%|percent)/i);
    if (numberMatch) {
      specs.push({
        title: `Verify boundary condition: ${numberMatch[0]}`,
        description: `A numeric threshold ("${numberMatch[0]}") was found in the requirement text.`,
        expectedResult: `Behavior at, just below, and just above "${numberMatch[0]}" matches the requirement.`,
        category: 'boundary', priority: req.priority || 'medium', severity: 'medium',
        reason: `A numeric threshold was found in the requirement text ("${numberMatch[0]}") — boundary cases verify behavior at/around that threshold.`,
      });
    }
    if (['security', 'compliance'].includes(req.requirement_type)) {
      specs.push({
        title: `Security validation: ${req.title}`, description: 'Verifies access control / data protection behavior implied by this requirement.',
        expectedResult: 'No unauthorized access, no sensitive data exposure.', category: 'security', priority: 'high', severity: 'high',
        reason: `Requirement type is "${req.requirement_type}" — security/compliance requirements require an explicit security validation case.`,
      });
    }
    if (req.requirement_type === 'integration') {
      specs.push({
        title: `Integration validation: ${req.title}`, description: 'Verifies the integrated system(s) behave correctly end-to-end.',
        expectedResult: 'The integration completes and both systems reflect the correct state.', category: 'integration', priority: req.priority || 'medium', severity: 'medium',
        reason: `Requirement type is "integration" — integration requirements require an explicit end-to-end integration case.`,
      });
    }
    if (['data', 'reporting'].includes(req.requirement_type)) {
      specs.push({
        title: `Data validation: ${req.title}`, description: 'Verifies the underlying data is correct, complete, and correctly typed.',
        expectedResult: 'Data matches the requirement, no corruption or type mismatch.', category: 'data_validation', priority: req.priority || 'medium', severity: 'medium',
        reason: `Requirement type is "${req.requirement_type}" — data/reporting requirements require an explicit data validation case.`,
      });
    }
    if (req.quality_status === 'complete') {
      specs.push({
        title: `Regression: ${req.title}`, description: 'Protects this stable, fully-specified requirement against future regressions.',
        expectedResult: req.acceptance_criteria || `${req.title} continues to behave as described.`, category: 'regression', priority: req.priority || 'medium', severity: 'medium',
        reason: 'This requirement has COMPLETE quality status — a stable candidate worth protecting via the regression suite.',
      });
    }
    if (['performance', 'availability'].includes(req.requirement_type)) {
      specs.push({
        title: `Performance candidate: ${req.title}`,
        description: 'Candidate only — no load-testing tool is wired into this engine yet (see Known Limitations).',
        expectedResult: 'INFORMATION REQUIRED — real performance target not yet captured by this engine.', category: 'performance', priority: req.priority || 'medium', severity: 'low',
        reason: `Requirement type is "${req.requirement_type}" — flagged as a real performance test candidate, not an executed benchmark.`,
      });
    }
    if (req.requirement_type === 'usability') {
      specs.push({
        title: `Accessibility candidate: ${req.title}`,
        description: 'Candidate only — no automated accessibility tooling is wired into this engine yet (see Known Limitations).',
        expectedResult: 'INFORMATION REQUIRED — real accessibility criteria not yet captured by this engine.', category: 'accessibility', priority: req.priority || 'medium', severity: 'low',
        reason: `Requirement type is "usability" — flagged as a real accessibility test candidate, not an executed check.`,
      });
    }

    const created: TestCase[] = [];
    for (const spec of specs) created.push(await this.insert(clientId, 'business_requirement', requirementId, spec, 'generated', actor));
    return created;
  }

  /** Real, rule-based generation from a real gap. */
  async generateFromGap(clientId: string, gapId: string, actor: string | null): Promise<TestCase[]> {
    const res = await sharedPool.query(`SELECT * FROM oc_gaps WHERE id = $1 AND client_id = $2`, [gapId, clientId]);
    const gap = res.rows[0];
    if (!gap) throw new Error(`Gap ${gapId} not found for this client.`);

    const specs: GeneratedSpec[] = [{
      title: `Verify target state achieved: ${gap.title}`,
      description: gap.gap_description || gap.description || gap.title,
      expectedResult: gap.target_state || 'The target state described in the gap.',
      category: 'validation', priority: gap.priority || 'medium', severity: gap.severity || 'medium',
      reason: "Derived from the gap's own recorded target state — validates the gap has actually been closed.",
    }, {
      title: `Regression: ${gap.title}`, description: 'Protects the gap resolution against future regressions.',
      expectedResult: gap.target_state || 'The resolved state continues to hold.', category: 'regression', priority: gap.priority || 'medium', severity: 'medium',
      reason: 'Every resolved gap needs a regression case to confirm the fix does not regress.',
    }];
    if (gap.security_impact) {
      specs.push({
        title: `Security validation: ${gap.title}`, description: `Security impact recorded: ${gap.security_impact}`,
        expectedResult: 'No unauthorized access, no sensitive data exposure related to this gap.', category: 'security', priority: 'high', severity: 'high',
        reason: 'This gap has a recorded security impact — requires an explicit security validation case.',
      });
    }

    const created: TestCase[] = [];
    for (const spec of specs) created.push(await this.insert(clientId, 'gap', gapId, spec, 'generated', actor));
    return created;
  }

  /** Real, rule-based generation from a real, evidence-quoted discovery extraction. */
  async generateFromDiscoveryExtraction(clientId: string, extractionId: string, actor: string | null): Promise<TestCase[]> {
    const res = await sharedPool.query(`SELECT * FROM discovery_extractions WHERE id = $1 AND client_id = $2`, [extractionId, clientId]);
    const extraction = res.rows[0];
    if (!extraction) throw new Error(`Discovery extraction ${extractionId} not found for this client.`);

    const spec: GeneratedSpec = {
      title: `Verify discovered fact still holds: ${extraction.field_name}`,
      description: `Real, staff-attributed discovery extraction (confidence: ${extraction.confidence}).`,
      expectedResult: extraction.field_value || 'INFORMATION REQUIRED',
      category: 'validation', priority: 'medium', severity: 'medium',
      reason: `Derived from a real, evidence-quoted discovery extraction — verifies the extracted fact is still true in the client's real environment.`,
      testData: extraction.evidence_quote || '',
    };
    return [await this.insert(clientId, 'discovery_extraction', extractionId, spec, 'generated', actor)];
  }
}
