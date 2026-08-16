/**
 * AskABD Platform Service Registry
 * Transforms capability records into a comprehensive service catalog.
 * Reuses: Capability Registry, Platform Health, shared DB pool.
 * Each service represents a meaningful reusable platform capability boundary.
 */
import { sharedPool } from './db-pool.js';

export interface PlatformService {
  id: string;
  name: string;
  category: string;
  description: string;
  businessPurpose: string;
  problemsSolved: string[];
  status: string;
  maturity: number;
  maturityLabel: string;
  health: string;
  version: string;
  owner: string;
  dependencies: string[];
  consumers: string[];
  supportedDomains: string[];
  apiAvailable: boolean;
  apiEndpoints: string[];
  uiAvailable: boolean;
  uiPath?: string;
  automationStatus: string;
  securityStatus: string;
  auditStatus: string;
  evidence: string[];
  knownGaps: string[];
  limitations: string[];
  roadmapPhase: string;
  lastVerified: string;
  inputs: string[];
  outputs: string[];
  dataTables: string[];
}

const MATURITY_LABELS: Record<number, string> = {
  0: 'Not Implemented', 1: 'Concept', 2: 'Foundation', 3: 'Implemented',
  4: 'Integrated', 5: 'Operational', 6: 'Production Hardened', 7: 'Optimized',
};

export class ServiceRegistryService {

  async getAllServices(): Promise<PlatformService[]> {
    const { rows } = await sharedPool.query(`SELECT * FROM oc_capabilities ORDER BY category, name`);
    return rows.map(r => this.buildService(r));
  }

  async getServicesByCategory(): Promise<Record<string, PlatformService[]>> {
    const services = await this.getAllServices();
    const grouped: Record<string, PlatformService[]> = {};
    for (const s of services) {
      const cat = this.normalizeCategory(s.category);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }
    return grouped;
  }

  async getServiceSummary(): Promise<any> {
    const services = await this.getAllServices();
    const statusCounts: Record<string, number> = {};
    services.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
    const categories: Record<string, number> = {};
    services.forEach(s => { const c = this.normalizeCategory(s.category); categories[c] = (categories[c] || 0) + 1; });
    const withGaps = services.filter(s => s.knownGaps.length > 0).length;
    const avgMaturity = services.length > 0 ? parseFloat((services.reduce((a, s) => a + s.maturity, 0) / services.length).toFixed(1)) : 0;

    return {
      total: services.length,
      operational: statusCounts['operational'] || 0,
      foundation: statusCounts['foundation'] || 0,
      planned: statusCounts['planned'] || 0,
      avgMaturity,
      withGaps,
      byCategory: categories,
      byStatus: statusCounts,
    };
  }

  async getService(serviceId: string): Promise<PlatformService | null> {
    const { rows } = await sharedPool.query(`SELECT * FROM oc_capabilities WHERE id = $1`, [serviceId]);
    return rows.length > 0 ? this.buildService(rows[0]) : null;
  }

  private buildService(row: any): PlatformService {
    const id = row.id;
    const meta = this.getServiceMeta(id);

    return {
      id: row.id,
      name: row.name,
      category: this.normalizeCategory(row.category),
      description: row.description || '',
      businessPurpose: row.business_value || row.business_problem || '',
      problemsSolved: meta.problemsSolved,
      status: row.status,
      maturity: row.maturity ?? 0,
      maturityLabel: MATURITY_LABELS[Math.min(row.maturity ?? 0, 7)] || 'Unknown',
      health: row.status === 'operational' ? 'healthy' : row.status === 'foundation' ? 'partial' : 'not_applicable',
      version: '1.0.0',
      owner: row.owner || 'platform-team',
      dependencies: row.dependencies || [],
      consumers: meta.consumers,
      supportedDomains: meta.domains,
      apiAvailable: meta.apiAvailable,
      apiEndpoints: row.related_apis || [],
      uiAvailable: meta.uiAvailable,
      uiPath: meta.uiPath,
      automationStatus: meta.automationStatus,
      securityStatus: row.status === 'operational' ? 'active' : 'planned',
      auditStatus: row.status === 'operational' ? 'active' : 'planned',
      evidence: row.evidence || [],
      knownGaps: row.known_gaps || [],
      limitations: row.limitations || [],
      roadmapPhase: row.roadmap_phase || 'future',
      lastVerified: row.updated_at || row.created_at,
      inputs: meta.inputs,
      outputs: meta.outputs,
      dataTables: meta.dataTables,
    };
  }

  private normalizeCategory(cat: string): string {
    const map: Record<string, string> = {
      'core': 'Foundation Services',
      'discovery': 'Discovery & Intelligence',
      'analysis': 'Analysis & Decision',
      'execution': 'Transformation & Execution',
      'optimization': 'Optimization',
      'infrastructure': 'Platform Infrastructure',
      'security': 'Security & Compliance',
      'advisory': 'Advisory & Intelligence',
    };
    return map[cat] || cat;
  }

  private getServiceMeta(id: string): { problemsSolved: string[]; consumers: string[]; domains: string[]; apiAvailable: boolean; uiAvailable: boolean; uiPath?: string; automationStatus: string; inputs: string[]; outputs: string[]; dataTables: string[] } {
    const meta: Record<string, any> = {
      'cap-client-onboarding': { problemsSolved: ['Manual client registration','Lack of audit trail','Slow onboarding'], consumers: ['Client Portal','Lifecycle','Workflow'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients', automationStatus: 'event-driven', inputs: ['Organization details','Owner contacts'], outputs: ['Client record','OTP','Lifecycle initialization'], dataTables: ['oc_clients'] },
      'cap-lifecycle-management': { problemsSolved: ['No lifecycle visibility','Uncontrolled transitions','Missing gates'], consumers: ['Client Portal','Portfolio','Workflow','Compliance'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'event-driven', inputs: ['Client ID','Events'], outputs: ['Lifecycle state','History','Events'], dataTables: ['oc_lifecycle'] },
      'cap-requirements-management': { problemsSolved: ['Scattered requirements','No readiness scoring','Manual tracking'], consumers: ['Lifecycle','Client Portal','Compliance'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'automated', inputs: ['Service definitions','Client responses'], outputs: ['Readiness scores','Validated requirements'], dataTables: ['oc_client_service_requirements'] },
      'cap-document-management': { problemsSolved: ['Lost document versions','No validation','Manual collection'], consumers: ['Requirements','Compliance','Client Portal'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'manual', inputs: ['Documents','Metadata'], outputs: ['Versioned documents','Validation status'], dataTables: ['oc_client_service_documents'] },
      'cap-audit-trail': { problemsSolved: ['No compliance audit','No forensics','No operational history'], consumers: ['All services','Portal','Compliance','Intelligence'], domains: ['All'], apiAvailable: true, uiAvailable: false, automationStatus: 'automatic', inputs: ['All platform operations'], outputs: ['Audit records','Evidence'], dataTables: ['oc_audit_log'] },
      'cap-connector-framework': { problemsSolved: ['Error-prone connections','No security levels','Manual setup'], consumers: ['Discovery','Migration','Lifecycle'], domains: ['Database','Cloud','Infrastructure'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'automated', inputs: ['Connection config'], outputs: ['Validated connections','Diagnostics'], dataTables: ['oc_connectors','oc_connection_tests'] },
      'cap-discovery-engine': { problemsSolved: ['Manual inventory','Incomplete asset data','No dependency mapping'], consumers: ['Assessment','Problems','Compliance','Portfolio'], domains: ['Database','Infrastructure','Cloud'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'event-driven', inputs: ['Connector access'], outputs: ['Resource catalog','Dependencies','Evidence'], dataTables: ['oc_discovery_runs'] },
      'cap-assessment-engine': { problemsSolved: ['No standardized risk scoring','Subjective evaluations'], consumers: ['Problems','Recommendations','Compliance','Portfolio'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'event-driven', inputs: ['Discovery data'], outputs: ['Risk scores','Findings','Evidence'], dataTables: ['oc_assessments'] },
      'cap-problem-universe': { problemsSolved: ['Ad-hoc problem discovery','No financial quantification','No evidence'], consumers: ['Gaps','Compliance','Portfolio','Intelligence','Optimization'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/problems', automationStatus: 'event-driven', inputs: ['Assessment findings','Discovery','Optimization','Compliance'], outputs: ['Classified problems','Financial impact','Evidence'], dataTables: ['oc_problems'] },
      'cap-gap-analysis': { problemsSolved: ['No structured gap identification','No maturity scoring','No prioritization'], consumers: ['Decisions','Transformations','Compliance','Portfolio'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/gaps', automationStatus: 'automated', inputs: ['Problems','Compliance controls'], outputs: ['Gaps','Maturity scores','Priorities'], dataTables: ['oc_gaps'] },
      'cap-decision-framework': { problemsSolved: ['Unstructured decisions','No comparison','No audit trail'], consumers: ['Transformations','Portfolio'], domains: ['All'], apiAvailable: true, uiAvailable: false, automationStatus: 'manual', inputs: ['Gap options','Scores'], outputs: ['Decisions','Audit','Options comparison'], dataTables: ['oc_gap_options','oc_decisions'] },
      'cap-transformation-planning': { problemsSolved: ['Ad-hoc planning','No rollback','No tracking'], consumers: ['Migration','Optimization','Portfolio','Portal'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/optimization', automationStatus: 'manual', inputs: ['Decisions','Gaps'], outputs: ['Plans','Milestones','Rollback strategies'], dataTables: ['oc_transformations'] },
      'cap-migration-execution': { problemsSolved: ['Risky manual migration','No dry-run','No rollback'], consumers: ['Validation','Optimization','Portfolio'], domains: ['Database','Infrastructure'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/lifecycle', automationStatus: 'automated', inputs: ['Migration plan','Connector'], outputs: ['Migration result','Progress','Rollback'], dataTables: ['oc_migration_runs'] },
      'cap-optimization-engine': { problemsSolved: ['No post-transformation measurement','No deviation detection','Benefit leakage'], consumers: ['Problems','Gaps','Portfolio','Intelligence','Portal'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/optimization', automationStatus: 'event-driven', inputs: ['Metrics','Baselines','Measurements'], outputs: ['Findings','Deviations','Recommendations'], dataTables: ['oc_metric_definitions','oc_measurements','oc_optimization_findings','oc_transformation_outcomes'] },
      'cap-portfolio-management': { problemsSolved: ['No cross-client visibility','No resource planning','No financial aggregation'], consumers: ['Intelligence','Admin','Portal'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/platform/portfolio', automationStatus: 'automatic', inputs: ['All client data'], outputs: ['Health scores','Rankings','Patterns','Recommendations'], dataTables: [] },
      'cap-client-portal': { problemsSolved: ['No client self-service','Manual status updates','Repeated information requests'], consumers: ['Clients','External stakeholders'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/client-portal/[id]', automationStatus: 'event-driven', inputs: ['All client data'], outputs: ['Dashboard','Actions','Notifications','Timeline'], dataTables: [] },
      'cap-event-driven': { problemsSolved: ['Tight coupling','No async processing','No event replay'], consumers: ['Workflow','Notifications','Scheduler','SSE'], domains: ['All'], apiAvailable: true, uiAvailable: false, automationStatus: 'automatic', inputs: ['Business operations'], outputs: ['Events','SSE stream'], dataTables: ['oc_events'] },
      'cap-scheduler': { problemsSolved: ['No overdue detection','Manual monitoring','No batch processing'], consumers: ['Workflow','Notifications','Compliance'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/platform/workflows', automationStatus: 'automatic', inputs: ['Job definitions','Frequency'], outputs: ['Job results','Notifications','Events'], dataTables: ['oc_scheduled_jobs'] },
      'cap-compliance-automation': { problemsSolved: ['Manual compliance checks','No evidence reuse','No auto-remediation'], consumers: ['Problems','Gaps','Portal','Portfolio','Intelligence'], domains: ['Security','Compliance','Governance'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/compliance', automationStatus: 'event-driven', inputs: ['Frameworks','Controls','Evidence'], outputs: ['Compliance scores','Findings','Remediation chain'], dataTables: ['oc_compliance_frameworks','oc_compliance_controls','oc_client_compliance'] },
      'cap-cross-framework': { problemsSolved: ['Duplicate evidence collection','No framework interop','Siloed compliance'], consumers: ['Compliance','Evidence','Portal'], domains: ['Security','Compliance'], apiAvailable: true, uiAvailable: true, uiPath: '/clients/[id]/compliance', automationStatus: 'automated', inputs: ['Control mappings'], outputs: ['Coverage metrics','Evidence reuse opportunities'], dataTables: ['oc_control_mappings'] },
      'cap-capability-registry': { problemsSolved: ['No capability inventory','No maturity tracking','No roadmap'], consumers: ['Admin','Intelligence','Portfolio'], domains: ['All'], apiAvailable: true, uiAvailable: true, uiPath: '/platform/capabilities', automationStatus: 'manual', inputs: ['Capability definitions'], outputs: ['Registry','Maturity','Roadmap'], dataTables: ['oc_capabilities'] },
    };
    const defaults = { problemsSolved: [], consumers: [], domains: ['All'], apiAvailable: true, uiAvailable: false, automationStatus: 'planned', inputs: [], outputs: [], dataTables: [] };
    return meta[id] || defaults;
  }
}
