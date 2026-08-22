/**
 * AskABD Assessment Service
 * Analyzes discovery results to produce risk, compatibility, and readiness scores.
 * Every finding must reference discovery evidence.
 */

import { randomUUID } from 'node:crypto';
import { sharedPool } from './db-pool.js';

const dbPool = sharedPool;

export type AssessmentDomain = 'infrastructure' | 'business' | 'application' | 'data' | 'security' | 'quality' | 'operations';

export interface AssessmentFinding {
  id: string;
  category: 'security' | 'performance' | 'compatibility' | 'risk' | 'technical-debt' | 'complexity'
    // Domain-assessment categories (Phase 2 item 2 extension) — same
    // AssessmentFinding shape, new real category values, not a parallel type.
    | 'business-context' | 'application-portfolio' | 'data-inventory' | 'compliance-security' | 'quality' | 'operational-readiness';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  evidence: string; // reference to discovery resource, or a real DB-query citation for domain assessments
  recommendation: string;
  effort: string;
}

export interface AssessmentResult {
  id: string;
  clientId: string;
  discoveryRunId: string;
  domain: AssessmentDomain;
  status: 'pending' | 'running' | 'completed' | 'failed';
  riskScore: number; // 0-100
  complexityScore: number; // 0-100
  findings: AssessmentFinding[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  evidence: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export class AssessmentService {

  /**
   * Start an assessment based on a discovery run's results
   */
  async startAssessment(clientId: string, discoveryRunId: string): Promise<AssessmentResult> {
    // randomUUID, not Math.random() — a genuinely collision-safe suffix, not a
    // weak pseudo-random one (found during a fabrication/ID-safety sweep).
    const assessmentId = `assess-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const startedAt = new Date().toISOString();

    // Load discovery results
    const discRes = await dbPool.query('SELECT results, status FROM oc_discovery_runs WHERE id = $1 AND client_id = $2', [discoveryRunId, clientId]);
    if (discRes.rows.length === 0 || discRes.rows[0].status !== 'completed') {
      const failed: AssessmentResult = {
        id: assessmentId, clientId, discoveryRunId, domain: 'infrastructure', status: 'failed',
        riskScore: 0, complexityScore: 0, findings: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        evidence: ['Assessment failed: Discovery run not found or not completed'],
        startedAt, completedAt: startedAt,
      };
      await this.persistAssessment(failed);
      return failed;
    }

    const discoveryData = discRes.rows[0].results;
    const resources = discoveryData?.resources || [];

    // Perform real assessment based on discovery data
    const findings = this.analyzeResources(resources);
    const riskScore = this.calculateRiskScore(findings);
    const complexityScore = this.calculateComplexityScore(resources);

    const summary = {
      total: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    };

    const completedAt = new Date().toISOString();
    const result: AssessmentResult = {
      id: assessmentId, clientId, discoveryRunId, domain: 'infrastructure', status: 'completed',
      riskScore, complexityScore, findings, summary,
      evidence: [
        `Assessment completed at ${completedAt}`,
        `Resources analyzed: ${resources.length}`,
        `Findings: ${findings.length} (${summary.critical} critical, ${summary.high} high)`,
        `Risk score: ${riskScore}/100`,
        `Complexity score: ${complexityScore}/100`,
      ],
      startedAt, completedAt,
    };

    await this.persistAssessment(result);
    return result;
  }

  /**
   * Analyze discovered resources and generate evidence-based findings
   */
  private analyzeResources(resources: any[]): AssessmentFinding[] {
    const findings: AssessmentFinding[] = [];
    let findingIdx = 0;

    // Analyze PostgreSQL version
    const serverRes = resources.find((r: any) => r.type === 'server');
    if (serverRes?.metadata?.version) {
      const version = serverRes.metadata.version;
      const majorVersion = parseInt(version.match(/PostgreSQL (\d+)/)?.[1] || '0');
      if (majorVersion > 0 && majorVersion < 14) {
        findings.push({ id: `f-${++findingIdx}`, category: 'security', severity: 'high', title: 'PostgreSQL version outdated', description: `Running PostgreSQL ${majorVersion}. Versions below 14 have known security vulnerabilities and are approaching end-of-life.`, evidence: `Discovery: server ${serverRes.name} version ${version}`, recommendation: 'Upgrade to PostgreSQL 15 or 16 for security patches and performance improvements', effort: '2-4 hours' });
      } else if (majorVersion >= 14) {
        findings.push({ id: `f-${++findingIdx}`, category: 'security', severity: 'info', title: 'PostgreSQL version current', description: `Running PostgreSQL ${majorVersion}. This version is actively maintained.`, evidence: `Discovery: server ${serverRes.name}`, recommendation: 'No action required. Continue monitoring for updates.', effort: 'None' });
      }
    }

    // Analyze table count
    const tables = resources.filter((r: any) => r.type === 'table');
    if (tables.length > 50) {
      findings.push({ id: `f-${++findingIdx}`, category: 'complexity', severity: 'medium', title: 'Large database schema', description: `${tables.length} tables discovered. Complex schemas increase migration risk and require careful dependency mapping.`, evidence: `Discovery: ${tables.length} tables across schemas`, recommendation: 'Create detailed table dependency map before migration. Consider phased migration approach.', effort: '1-2 days' });
    }

    // Analyze missing indexes (tables without associated indexes)
    const indexes = resources.filter((r: any) => r.type === 'index');
    const tablesWithIndexes = new Set(indexes.map((i: any) => i.metadata?.table));
    const tablesWithoutIndexes = tables.filter((t: any) => !tablesWithIndexes.has(t.name.split('.')[1]));
    if (tablesWithoutIndexes.length > 0 && tables.length > 0) {
      const ratio = Math.round((tablesWithoutIndexes.length / tables.length) * 100);
      if (ratio > 30) {
        findings.push({ id: `f-${++findingIdx}`, category: 'performance', severity: 'medium', title: 'Tables without indexes', description: `${tablesWithoutIndexes.length} of ${tables.length} tables (${ratio}%) have no custom indexes. This may indicate performance issues under load.`, evidence: `Discovery: ${tablesWithoutIndexes.length} tables without indexes`, recommendation: 'Review query patterns and add indexes for frequently accessed columns.', effort: '2-5 days' });
      }
    }

    // Analyze extensions
    const extensions = resources.filter((r: any) => r.type === 'extension');
    if (extensions.length > 0) {
      findings.push({ id: `f-${++findingIdx}`, category: 'compatibility', severity: 'info', title: 'Database extensions in use', description: `${extensions.length} PostgreSQL extensions detected: ${extensions.map((e: any) => e.name).join(', ')}. Extensions must be available on target during migration.`, evidence: `Discovery: extensions ${extensions.map((e: any) => e.name).join(', ')}`, recommendation: 'Verify all extensions are available and compatible on the target platform.', effort: '1 hour' });
    }

    // Analyze schemas
    const schemas = resources.filter((r: any) => r.type === 'schema');
    if (schemas.length > 3) {
      findings.push({ id: `f-${++findingIdx}`, category: 'complexity', severity: 'low', title: 'Multiple schemas', description: `${schemas.length} schemas detected. Multi-schema databases require schema-aware migration.`, evidence: `Discovery: schemas ${schemas.map((s: any) => s.name).join(', ')}`, recommendation: 'Plan migration per-schema or ensure schema creation order respects dependencies.', effort: '2-4 hours' });
    }

    // GitHub repositories analysis
    const repos = resources.filter((r: any) => r.type === 'repository');
    if (repos.length > 0) {
      const outdated = repos.filter((r: any) => {
        const updated = new Date(r.metadata?.updatedAt || '');
        const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        return updated < sixMonthsAgo;
      });
      if (outdated.length > 0) {
        findings.push({ id: `f-${++findingIdx}`, category: 'technical-debt', severity: 'low', title: 'Stale repositories', description: `${outdated.length} repositories not updated in 6+ months. May contain outdated dependencies.`, evidence: `Discovery: ${outdated.length} repos inactive`, recommendation: 'Review and archive unused repositories. Update dependencies in active ones.', effort: '1-2 days' });
      }
    }

    return findings;
  }

  private calculateRiskScore(findings: AssessmentFinding[]): number {
    let score = 0;
    for (const f of findings) {
      switch (f.severity) {
        case 'critical': score += 25; break;
        case 'high': score += 15; break;
        case 'medium': score += 8; break;
        case 'low': score += 3; break;
        default: score += 0;
      }
    }
    return Math.min(100, score);
  }

  private calculateComplexityScore(resources: any[]): number {
    const tables = resources.filter((r: any) => r.type === 'table').length;
    const schemas = resources.filter((r: any) => r.type === 'schema').length;
    const repos = resources.filter((r: any) => r.type === 'repository').length;
    return Math.min(100, Math.round((tables * 1.5) + (schemas * 5) + (repos * 2)));
  }

  async getAssessments(clientId: string): Promise<any[]> {
    try {
      const res = await dbPool.query('SELECT * FROM oc_assessments WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10', [clientId]);
      return res.rows;
    } catch { return []; }
  }

  async getAssessmentsByDomain(clientId: string, domain: AssessmentDomain): Promise<any[]> {
    try {
      const res = await dbPool.query('SELECT * FROM oc_assessments WHERE client_id = $1 AND domain = $2 ORDER BY created_at DESC LIMIT 10', [clientId, domain]);
      return res.rows;
    } catch { return []; }
  }

  /**
   * Current State Assessment — the six domains beyond Infrastructure
   * (roadmap Phase 2 item 2): Business, Application, Data, Security,
   * Quality, Operations. Same real-findings shape as startAssessment
   * above, not a parallel schema — every finding cites a real, checkable
   * evidence source (a specific column/table on this exact client's real
   * record), never a guess. An empty/zero real count is reported as an
   * honest `info`-severity finding ("not recorded yet"), never silently
   * skipped — matching this platform's "Not provided" / "Insufficient
   * evidence" honesty convention rather than pretending nothing to assess.
   */
  async startDomainAssessment(clientId: string, domain: Exclude<AssessmentDomain, 'infrastructure'>): Promise<AssessmentResult> {
    const assessmentId = `assess-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const startedAt = new Date().toISOString();

    const clientRes = await dbPool.query(
      `SELECT departments, capabilities, processes, tech_apps, tech_services, tech_apis, tech_databases, tech_servers, tech_cloud, tech_infrastructure, environments, monitoring FROM oc_clients WHERE id = $1`,
      [clientId]
    );
    if (clientRes.rows.length === 0) {
      const failed: AssessmentResult = {
        id: assessmentId, clientId, discoveryRunId: '', domain, status: 'failed',
        riskScore: 0, complexityScore: 0, findings: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        evidence: [`Assessment failed: client ${clientId} not found`],
        startedAt, completedAt: startedAt,
      };
      await this.persistAssessment(failed);
      return failed;
    }
    const client = clientRes.rows[0];

    let findings: AssessmentFinding[];
    switch (domain) {
      case 'business': findings = await this.analyzeBusinessDomain(client); break;
      case 'application': findings = await this.analyzeApplicationDomain(client); break;
      case 'data': findings = await this.analyzeDataDomain(clientId, client); break;
      case 'security': findings = await this.analyzeSecurityDomain(clientId); break;
      case 'quality': findings = await this.analyzeQualityDomain(clientId); break;
      case 'operations': findings = await this.analyzeOperationsDomain(client); break;
    }

    const riskScore = this.calculateRiskScore(findings);
    const summary = {
      total: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    };
    const completedAt = new Date().toISOString();
    const result: AssessmentResult = {
      id: assessmentId, clientId, discoveryRunId: '', domain, status: 'completed',
      riskScore, complexityScore: 0, findings, summary,
      evidence: [
        `${domain} assessment completed at ${completedAt}`,
        `Findings: ${findings.length} (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low)`,
        `Risk score: ${riskScore}/100`,
      ],
      startedAt, completedAt,
    };
    await this.persistAssessment(result);
    return result;
  }

  private async analyzeBusinessDomain(client: any): Promise<AssessmentFinding[]> {
    const findings: AssessmentFinding[] = [];
    let idx = 0;
    const departments: string[] = client.departments || [];
    const capabilities: string[] = client.capabilities || [];
    const processes: string[] = client.processes || [];

    if (departments.length === 0) {
      findings.push({ id: `f-${++idx}`, category: 'business-context', severity: 'medium', title: 'No departments recorded', description: 'This client has no departments recorded in their onboarding profile. Business-context assessment cannot identify organizational structure without this.', evidence: 'Client record: departments field is empty', recommendation: 'Capture the client\'s department structure during a discovery/onboarding conversation.', effort: '1-2 hours' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'business-context', severity: 'info', title: 'Departments recorded', description: `${departments.length} department(s) recorded: ${departments.join(', ')}.`, evidence: `Client record: departments = [${departments.join(', ')}]`, recommendation: 'No action required.', effort: 'None' });
    }
    if (capabilities.length === 0) {
      findings.push({ id: `f-${++idx}`, category: 'business-context', severity: 'medium', title: 'No business capabilities recorded', description: 'No business capabilities are recorded for this client — capability mapping is a real prerequisite for gap analysis against requirements.', evidence: 'Client record: capabilities field is empty', recommendation: 'Run a capability-mapping session with client stakeholders.', effort: '1-2 days' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'business-context', severity: 'info', title: 'Business capabilities recorded', description: `${capabilities.length} capability(ies) recorded: ${capabilities.join(', ')}.`, evidence: `Client record: capabilities = [${capabilities.join(', ')}]`, recommendation: 'No action required.', effort: 'None' });
    }
    if (processes.length === 0) {
      findings.push({ id: `f-${++idx}`, category: 'business-context', severity: 'low', title: 'No business processes recorded', description: 'No business processes are recorded for this client.', evidence: 'Client record: processes field is empty', recommendation: 'Capture key business processes during discovery.', effort: '1 day' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'business-context', severity: 'info', title: 'Business processes recorded', description: `${processes.length} process(es) recorded: ${processes.join(', ')}.`, evidence: `Client record: processes = [${processes.join(', ')}]`, recommendation: 'No action required.', effort: 'None' });
    }
    return findings;
  }

  private async analyzeApplicationDomain(client: any): Promise<AssessmentFinding[]> {
    const findings: AssessmentFinding[] = [];
    let idx = 0;
    const apps: string[] = client.tech_apps || [];
    const services: string[] = client.tech_services || [];
    const apis: string[] = client.tech_apis || [];
    const total = apps.length + services.length + apis.length;

    if (total === 0) {
      findings.push({ id: `f-${++idx}`, category: 'application-portfolio', severity: 'medium', title: 'No application/service/API inventory recorded', description: 'No applications, services, or APIs are recorded for this client. Application-portfolio assessment needs a real inventory to work from.', evidence: 'Client record: tech_apps, tech_services, tech_apis are all empty', recommendation: 'Run technical discovery or capture the application inventory directly during onboarding.', effort: '1-2 days' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'application-portfolio', severity: 'info', title: 'Application portfolio recorded', description: `${apps.length} application(s), ${services.length} service(s), ${apis.length} API(s) recorded.`, evidence: `Client record: tech_apps=${apps.length}, tech_services=${services.length}, tech_apis=${apis.length}`, recommendation: 'No action required.', effort: 'None' });
      if (apps.length > 20) {
        findings.push({ id: `f-${++idx}`, category: 'application-portfolio', severity: 'medium', title: 'Large application portfolio', description: `${apps.length} applications recorded — a large portfolio increases migration/rationalization complexity.`, evidence: `Client record: tech_apps has ${apps.length} entries`, recommendation: 'Consider an application rationalization exercise to identify consolidation opportunities.', effort: '1-2 weeks' });
      }
    }
    return findings;
  }

  private async analyzeDataDomain(clientId: string, client: any): Promise<AssessmentFinding[]> {
    const findings: AssessmentFinding[] = [];
    let idx = 0;
    const databases: string[] = client.tech_databases || [];

    // Reuse real, already-discovered technical inventory if a completed
    // discovery run exists — never a separate, disconnected data source.
    const discRes = await dbPool.query(
      `SELECT results FROM oc_discovery_runs WHERE client_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
      [clientId]
    );
    const resources = discRes.rows[0]?.results?.resources || [];
    const discoveredTables = resources.filter((r: any) => r.type === 'table').length;
    const discoveredSchemas = resources.filter((r: any) => r.type === 'schema').length;

    if (databases.length === 0 && discoveredTables === 0) {
      findings.push({ id: `f-${++idx}`, category: 'data-inventory', severity: 'medium', title: 'No data inventory recorded', description: 'No databases are recorded in the client profile, and no completed technical discovery run has found any tables. Data assessment cannot proceed without a real inventory.', evidence: 'Client record: tech_databases is empty; no discovery run has found tables', recommendation: 'Record known databases during onboarding, or run technical discovery against a connected database.', effort: '1 day' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'data-inventory', severity: 'info', title: 'Data inventory available', description: `${databases.length} database(s) recorded in the client profile${discoveredTables > 0 ? `, plus ${discoveredTables} table(s) across ${discoveredSchemas} schema(s) from the latest technical discovery` : ''}.`, evidence: `Client record: tech_databases=${databases.length}; latest discovery: ${discoveredTables} tables, ${discoveredSchemas} schemas`, recommendation: 'No action required.', effort: 'None' });
    }
    return findings;
  }

  private async analyzeSecurityDomain(clientId: string): Promise<AssessmentFinding[]> {
    const findings: AssessmentFinding[] = [];
    let idx = 0;

    const connectorRes = await dbPool.query(
      `SELECT security_level, COUNT(*)::int AS count FROM oc_connectors WHERE client_id = $1 GROUP BY security_level`,
      [clientId]
    );
    const adminConnectors = connectorRes.rows.find(r => r.security_level === 'admin')?.count || 0;
    const totalConnectors = connectorRes.rows.reduce((sum, r) => sum + r.count, 0);

    if (totalConnectors === 0) {
      findings.push({ id: `f-${++idx}`, category: 'compliance-security', severity: 'low', title: 'No connectors configured yet', description: 'No connectors are configured for this client — security posture of external connections cannot be assessed until at least one exists.', evidence: 'Client record: oc_connectors has 0 rows for this client', recommendation: 'Configure connectors on the Connectors page as the client\'s discovery needs require them.', effort: 'None — expected before onboarding is complete' });
    } else if (adminConnectors > 0) {
      findings.push({ id: `f-${++idx}`, category: 'compliance-security', severity: 'medium', title: 'Admin-level connector access in use', description: `${adminConnectors} of ${totalConnectors} connector(s) are configured with admin-level access. Admin access carries a larger blast radius than read-only or read-write and should be justified.`, evidence: `oc_connectors: security_level='admin' count=${adminConnectors} of ${totalConnectors} total`, recommendation: 'Review whether each admin-level connector genuinely needs that access level, or can be downgraded to read-only/read-write.', effort: '2-4 hours' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'compliance-security', severity: 'info', title: 'No admin-level connectors', description: `${totalConnectors} connector(s) configured, none at admin-level access.`, evidence: `oc_connectors: security_level distribution across ${totalConnectors} connectors, 0 admin-level`, recommendation: 'No action required.', effort: 'None' });
    }

    const complianceRes = await dbPool.query(
      `SELECT COUNT(*) FILTER (WHERE evidence_status = 'missing')::int AS missing, COUNT(*) FILTER (WHERE evidence_status = 'expired')::int AS expired
       FROM oc_client_compliance WHERE client_id = $1`,
      [clientId]
    );
    const { missing, expired } = complianceRes.rows[0] || { missing: 0, expired: 0 };
    if (missing > 0) {
      findings.push({ id: `f-${++idx}`, category: 'compliance-security', severity: 'high', title: 'Missing compliance evidence', description: `${missing} compliance control(s) have missing evidence.`, evidence: `oc_client_compliance: evidence_status='missing' count=${missing}`, recommendation: 'Provide the missing evidence on the Compliance page for each affected control.', effort: 'Varies per control' });
    }
    if (expired > 0) {
      findings.push({ id: `f-${++idx}`, category: 'compliance-security', severity: 'high', title: 'Expired compliance evidence', description: `${expired} compliance control(s) have expired evidence.`, evidence: `oc_client_compliance: evidence_status='expired' count=${expired}`, recommendation: 'Refresh the expired evidence on the Compliance page for each affected control.', effort: 'Varies per control' });
    }
    return findings;
  }

  private async analyzeQualityDomain(clientId: string): Promise<AssessmentFinding[]> {
    const findings: AssessmentFinding[] = [];
    let idx = 0;
    const res = await dbPool.query(
      `SELECT severity, COUNT(*)::int AS count FROM oc_defects WHERE client_id = $1 AND status IN ('detected', 'acknowledged', 'investigating', 'mitigating') GROUP BY severity`,
      [clientId]
    );
    const bySeverity: Record<string, number> = {};
    for (const row of res.rows) bySeverity[row.severity] = row.count;
    const total = Object.values(bySeverity).reduce((a, b) => a + b, 0);

    if (total === 0) {
      findings.push({ id: `f-${++idx}`, category: 'quality', severity: 'info', title: 'No open defects', description: 'This client has no open (detected, acknowledged, investigating, or mitigating) defects recorded.', evidence: `oc_defects: 0 rows with status in (detected, acknowledged, investigating, mitigating) for client_id=${clientId}`, recommendation: 'No action required.', effort: 'None' });
    } else {
      const criticalCount = bySeverity.critical || 0;
      const highCount = bySeverity.high || 0;
      if (criticalCount > 0) {
        findings.push({ id: `f-${++idx}`, category: 'quality', severity: 'critical', title: 'Open critical defects', description: `${criticalCount} critical-severity defect(s) are currently open.`, evidence: `oc_defects: severity='critical', open status, count=${criticalCount}`, recommendation: 'Prioritize resolution of critical defects before further delivery work.', effort: 'Varies per defect' });
      }
      if (highCount > 0) {
        findings.push({ id: `f-${++idx}`, category: 'quality', severity: 'high', title: 'Open high-severity defects', description: `${highCount} high-severity defect(s) are currently open.`, evidence: `oc_defects: severity='high', open status, count=${highCount}`, recommendation: 'Schedule resolution in the current or next sprint.', effort: 'Varies per defect' });
      }
      const lowerCount = (bySeverity.medium || 0) + (bySeverity.low || 0);
      if (lowerCount > 0) {
        findings.push({ id: `f-${++idx}`, category: 'quality', severity: 'low', title: 'Open medium/low-severity defects', description: `${lowerCount} medium or low-severity defect(s) are currently open.`, evidence: `oc_defects: severity in (medium, low), open status, count=${lowerCount}`, recommendation: 'Track for a future maintenance cycle.', effort: 'Varies per defect' });
      }
    }
    return findings;
  }

  private async analyzeOperationsDomain(client: any): Promise<AssessmentFinding[]> {
    const findings: AssessmentFinding[] = [];
    let idx = 0;
    const environments: Record<string, boolean> = client.environments || {};
    const monitoring: Record<string, boolean> = client.monitoring || {};

    const uncoveredMonitoring = Object.entries(monitoring).filter(([, v]) => !v).map(([k]) => k);
    const prodExists = environments.prod === true;

    if (prodExists && !monitoring.infra) {
      findings.push({ id: `f-${++idx}`, category: 'operational-readiness', severity: 'high', title: 'Production environment without infrastructure monitoring', description: 'This client has a production environment but infrastructure monitoring is not enabled.', evidence: `Client record: environments.prod=true, monitoring.infra=${monitoring.infra ?? false}`, recommendation: 'Enable infrastructure monitoring for the production environment before go-live.', effort: '1-2 days' });
    }
    if (uncoveredMonitoring.length > 0) {
      findings.push({ id: `f-${++idx}`, category: 'operational-readiness', severity: 'medium', title: 'Monitoring gaps', description: `${uncoveredMonitoring.length} monitoring categor(ies) not enabled: ${uncoveredMonitoring.join(', ')}.`, evidence: `Client record: monitoring = ${JSON.stringify(monitoring)}`, recommendation: 'Review whether each uncovered category is genuinely not needed, or should be enabled.', effort: '2-4 hours' });
    } else {
      findings.push({ id: `f-${++idx}`, category: 'operational-readiness', severity: 'info', title: 'Full monitoring coverage', description: 'All recorded monitoring categories are enabled.', evidence: `Client record: monitoring = ${JSON.stringify(monitoring)}`, recommendation: 'No action required.', effort: 'None' });
    }
    return findings;
  }

  private async persistAssessment(result: AssessmentResult): Promise<void> {
    try {
      await dbPool.query(`
        INSERT INTO oc_assessments (id, client_id, discovery_run_id, domain, status, risk_score, complexity_score, findings, risks, recommendations, evidence, started_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [result.id, result.clientId, result.discoveryRunId || null, result.domain, result.status, result.riskScore, result.complexityScore, JSON.stringify(result.findings), JSON.stringify(result.findings.filter(f => f.category === 'risk')), JSON.stringify(result.findings.filter(f => f.recommendation)), result.evidence, result.startedAt, result.completedAt]);
    } catch (err) {
      console.error('Failed to persist assessment:', (err as Error).message);
    }
  }
}
