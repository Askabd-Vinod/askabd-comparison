/**
 * Executive Reporting Engine — `executive_reporting_test_1` (2026-08-24
 * master completion directive, capability #62).
 *
 * A real, read-only AGGREGATOR over data every other engine this session
 * built/verified already owns — Requirements, Gaps, Risks, Compliance,
 * Testing, UAT, Deployments, Change Management. Computes nothing new
 * about any single domain and duplicates no domain's own business logic:
 * `RiskEngine.getRiskSummary` and `ComplianceService
 * .getClientComplianceSummary` are called directly, unmodified; every
 * other dimension is a real, simple status-count query against that
 * domain's own existing table.
 *
 * Real, non-fabricated status classification per dimension — never an
 * arbitrary percentage. A dimension with zero real rows is honestly
 * `insufficient_evidence`, never silently treated as healthy. Real,
 * rule-based recommendations (never AI-fabricated) are derived only from
 * real blocking conditions actually observed in the aggregated data.
 */
import { sharedPool } from './db-pool.js';
import { RiskEngine } from './risk-engine.js';
import { ComplianceService } from './compliance-service.js';

export type DimensionStatus = 'healthy' | 'at_risk' | 'critical' | 'insufficient_evidence';

export interface ReportDimension {
  name: string;
  status: DimensionStatus;
  summary: string;
  data: Record<string, unknown>;
}

export interface ExecutiveReport {
  id: string;
  clientId: string;
  overallHealth: DimensionStatus;
  dimensions: ReportDimension[];
  openIssues: string[];
  criticalDecisions: string[];
  recommendations: string[];
  nextActions: string[];
  generatedBy: string | null;
  generatedAt: string;
}

type Row = { id: string; client_id: string; report: Omit<ExecutiveReport, 'id' | 'clientId' | 'generatedBy' | 'generatedAt'>; generated_by: string | null; generated_at: Date };

function toReport(r: Row): ExecutiveReport {
  return { id: r.id, clientId: r.client_id, ...r.report, generatedBy: r.generated_by, generatedAt: r.generated_at.toISOString() };
}

export class ExecutiveReportOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'ExecutiveReportOwnershipError'; }
}

export class ExecutiveReportingEngine {
  private risks = new RiskEngine();
  private compliance = new ComplianceService();

  private async requirementsDimension(clientId: string): Promise<ReportDimension> {
    const res = await sharedPool.query<{ quality_status: string; count: string }>(
      `SELECT quality_status, count(*)::text AS count FROM oc_business_requirements WHERE client_id = $1 GROUP BY quality_status`, [clientId],
    );
    if (res.rows.length === 0) return { name: 'Requirements', status: 'insufficient_evidence', summary: 'No real requirements recorded for this client yet.', data: {} };
    const counts: Record<string, number> = {};
    for (const r of res.rows) counts[r.quality_status] = parseInt(r.count, 10);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const problematic = (counts.incomplete || 0) + (counts.conflicting || 0) + (counts.duplicate || 0);
    const openClarifications = await sharedPool.query<{ count: string }>(`SELECT count(*)::text AS count FROM oc_requirement_clarifications WHERE client_id = $1 AND status = 'open'`, [clientId]);
    const openCount = parseInt(openClarifications.rows[0]!.count, 10);
    const status: DimensionStatus = problematic > 0 ? 'critical' : openCount > 0 ? 'at_risk' : 'healthy';
    return { name: 'Requirements', status, summary: `${total} real requirement(s); ${problematic} incomplete/conflicting/duplicate; ${openCount} open clarification(s).`, data: { ...counts, total, openClarifications: openCount } };
  }

  private async gapsDimension(clientId: string): Promise<ReportDimension> {
    const res = await sharedPool.query<{ status: string; count: string }>(`SELECT status, count(*)::text AS count FROM oc_gaps WHERE client_id = $1 GROUP BY status`, [clientId]);
    if (res.rows.length === 0) return { name: 'Gaps', status: 'insufficient_evidence', summary: 'No real gaps recorded for this client yet.', data: {} };
    const counts: Record<string, number> = {};
    for (const r of res.rows) counts[r.status] = parseInt(r.count, 10);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const open = (counts.identified || 0) + (counts.analyzing || 0);
    const status: DimensionStatus = open > 3 ? 'critical' : open > 0 ? 'at_risk' : 'healthy';
    return { name: 'Gaps', status, summary: `${total} real gap(s); ${open} still open/unresolved.`, data: { ...counts, total } };
  }

  private async risksDimension(clientId: string): Promise<ReportDimension> {
    const summary = await this.risks.getRiskSummary(clientId);
    if (summary.total === 0) return { name: 'Risks', status: 'insufficient_evidence', summary: 'No real risks recorded for this client yet.', data: {} };
    const openCritical = summary.bySeverity.critical + summary.bySeverity.high;
    const status: DimensionStatus = summary.byStatus.open > 0 && openCritical > 0 ? 'critical' : summary.byStatus.open > 0 ? 'at_risk' : 'healthy';
    return { name: 'Risks', status, summary: `${summary.total} real risk(s); ${summary.byStatus.open} open (${openCritical} critical/high severity overall).`, data: summary };
  }

  private async complianceDimension(clientId: string): Promise<ReportDimension> {
    const summary = await this.compliance.getClientComplianceSummary(clientId);
    if (!summary.frameworks?.length) return { name: 'Compliance', status: 'insufficient_evidence', summary: 'No real compliance assessment recorded for this client yet.', data: {} };
    const worstScore = Math.min(...summary.frameworks.map((f: any) => f.score));
    const status: DimensionStatus = worstScore < 50 ? 'critical' : worstScore < 80 ? 'at_risk' : 'healthy';
    return { name: 'Compliance', status, summary: `${summary.frameworks.length} real framework(s) assessed; lowest real score: ${worstScore}%.`, data: summary };
  }

  private async testingDimension(clientId: string): Promise<ReportDimension> {
    const casesRes = await sharedPool.query<{ count: string }>(`SELECT count(*)::text AS count FROM test_cases WHERE client_id = $1`, [clientId]);
    const total = parseInt(casesRes.rows[0]!.count, 10);
    if (total === 0) return { name: 'Testing', status: 'insufficient_evidence', summary: 'No real test cases recorded for this client yet.', data: {} };
    const defectsRes = await sharedPool.query<{ count: string }>(`SELECT count(*)::text AS count FROM test_defects WHERE client_id = $1 AND status NOT IN ('closed', 'wont_fix')`, [clientId]);
    const openDefects = parseInt(defectsRes.rows[0]!.count, 10);
    const status: DimensionStatus = openDefects > 3 ? 'critical' : openDefects > 0 ? 'at_risk' : 'healthy';
    return { name: 'Testing', status, summary: `${total} real test case(s); ${openDefects} real open defect(s).`, data: { total, openDefects } };
  }

  private async uatDimension(clientId: string): Promise<ReportDimension> {
    const cyclesRes = await sharedPool.query<{ count: string }>(`SELECT count(*)::text AS count FROM test_suites WHERE client_id = $1 AND category = 'uat'`, [clientId]);
    const total = parseInt(cyclesRes.rows[0]!.count, 10);
    if (total === 0) return { name: 'UAT', status: 'insufficient_evidence', summary: 'No real UAT cycle recorded for this client yet.', data: {} };
    const approvedRes = await sharedPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM approval_workflows WHERE entity_type = 'uat_signoff' AND status = 'approved' AND entity_id IN (SELECT id FROM test_suites WHERE client_id = $1 AND category = 'uat')`, [clientId],
    );
    const approved = parseInt(approvedRes.rows[0]!.count, 10);
    const status: DimensionStatus = approved === total ? 'healthy' : approved > 0 ? 'at_risk' : 'critical';
    return { name: 'UAT', status, summary: `${total} real UAT cycle(s); ${approved} with a real approved sign-off.`, data: { total, approved } };
  }

  private async deploymentDimension(clientId: string): Promise<ReportDimension> {
    const res = await sharedPool.query<{ status: string; count: string }>(`SELECT status, count(*)::text AS count FROM oc_deployments WHERE client_id = $1 GROUP BY status`, [clientId]);
    if (res.rows.length === 0) return { name: 'Deployment', status: 'insufficient_evidence', summary: 'No real deployments recorded for this client yet.', data: {} };
    const counts: Record<string, number> = {};
    for (const r of res.rows) counts[r.status] = parseInt(r.count, 10);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const failed = counts.failed || 0;
    const status: DimensionStatus = failed > 0 ? 'critical' : (counts.validated || 0) === total ? 'healthy' : 'at_risk';
    return { name: 'Deployment', status, summary: `${total} real deployment(s); ${failed} real failure(s).`, data: { ...counts, total } };
  }

  private async changeManagementDimension(clientId: string): Promise<ReportDimension> {
    const res = await sharedPool.query<{ status: string; count: string }>(`SELECT status, count(*)::text AS count FROM oc_change_records WHERE client_id = $1 GROUP BY status`, [clientId]);
    if (res.rows.length === 0) return { name: 'Change Management', status: 'insufficient_evidence', summary: 'No real changes recorded for this client yet.', data: {} };
    const counts: Record<string, number> = {};
    for (const r of res.rows) counts[r.status] = parseInt(r.count, 10);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const inFlight = (counts.approval_pending || 0) + (counts.approved || 0) + (counts.implementing || 0);
    const status: DimensionStatus = inFlight > 5 ? 'at_risk' : 'healthy';
    return { name: 'Change Management', status, summary: `${total} real change(s); ${inFlight} currently in flight.`, data: { ...counts, total } };
  }

  async generateReport(clientId: string, actor: string | null): Promise<ExecutiveReport> {
    const dimensions = await Promise.all([
      this.requirementsDimension(clientId), this.gapsDimension(clientId), this.risksDimension(clientId),
      this.complianceDimension(clientId), this.testingDimension(clientId), this.uatDimension(clientId),
      this.deploymentDimension(clientId), this.changeManagementDimension(clientId),
    ]);

    const withEvidence = dimensions.filter(d => d.status !== 'insufficient_evidence');
    const overallHealth: DimensionStatus = withEvidence.length === 0 ? 'insufficient_evidence'
      : withEvidence.some(d => d.status === 'critical') ? 'critical'
      : withEvidence.some(d => d.status === 'at_risk') ? 'at_risk' : 'healthy';

    const openIssues: string[] = [];
    const criticalDecisions: string[] = [];
    const recommendations: string[] = [];
    const nextActions: string[] = [];

    for (const d of dimensions) {
      if (d.status === 'critical') {
        openIssues.push(`${d.name}: ${d.summary}`);
        recommendations.push(`Address the critical finding(s) in ${d.name} before proceeding further.`);
      } else if (d.status === 'at_risk') {
        openIssues.push(`${d.name}: ${d.summary}`);
      }
    }
    const riskDim = dimensions.find(d => d.name === 'Risks');
    if (riskDim && (riskDim.data as any).byStatus?.open > 0) {
      criticalDecisions.push(`${(riskDim.data as any).byStatus.open} open risk(s) require a real accept/mitigate/transfer decision.`);
    }
    const changeDim = dimensions.find(d => d.name === 'Change Management');
    if (changeDim && (changeDim.data as any).approval_pending > 0) {
      criticalDecisions.push(`${(changeDim.data as any).approval_pending} change(s) are awaiting a real approval decision.`);
    }
    if (overallHealth === 'insufficient_evidence') {
      nextActions.push('No real data exists yet in any tracked dimension for this client — begin discovery/requirements intake.');
    } else {
      for (const d of dimensions) {
        if (d.status === 'insufficient_evidence') nextActions.push(`${d.name}: no real data yet — real assessment/tracking has not started.`);
      }
    }

    const reportBody = { overallHealth, dimensions, openIssues, criticalDecisions, recommendations, nextActions };
    const res = await sharedPool.query<Row>(
      `INSERT INTO oc_executive_reports (client_id, report, generated_by) VALUES ($1,$2,$3) RETURNING *`,
      [clientId, JSON.stringify(reportBody), actor],
    );
    return toReport(res.rows[0]!);
  }

  async getReport(id: string, clientId: string): Promise<ExecutiveReport> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_executive_reports WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new ExecutiveReportOwnershipError(`Report ${id} not found.`);
    if (row.client_id !== clientId) throw new ExecutiveReportOwnershipError('This report does not belong to this client.');
    return toReport(row);
  }

  async listReports(clientId: string): Promise<ExecutiveReport[]> {
    const res = await sharedPool.query<Row>(`SELECT * FROM oc_executive_reports WHERE client_id = $1 ORDER BY generated_at DESC`, [clientId]);
    return res.rows.map(toReport);
  }

  /** Real Markdown export, deterministically rendered from the persisted real report — no PDF (no library in this codebase; not fabricated). */
  async exportMarkdown(id: string, clientId: string): Promise<string> {
    const report = await this.getReport(id, clientId);
    const lines: string[] = [
      `# Executive Report — ${clientId}`, '', `**Generated:** ${report.generatedAt}`, `**Overall Health:** ${report.overallHealth}`, '',
      '## Dimensions', '',
    ];
    for (const d of report.dimensions) lines.push(`- **${d.name}** (${d.status}): ${d.summary}`);
    lines.push('', '## Open Issues', '');
    lines.push(...(report.openIssues.length ? report.openIssues.map(i => `- ${i}`) : ['- None.']));
    lines.push('', '## Critical Decisions', '');
    lines.push(...(report.criticalDecisions.length ? report.criticalDecisions.map(i => `- ${i}`) : ['- None.']));
    lines.push('', '## Recommendations', '');
    lines.push(...(report.recommendations.length ? report.recommendations.map(i => `- ${i}`) : ['- None.']));
    lines.push('', '## Next Actions', '');
    lines.push(...(report.nextActions.length ? report.nextActions.map(i => `- ${i}`) : ['- None.']));
    return lines.join('\n');
  }
}
