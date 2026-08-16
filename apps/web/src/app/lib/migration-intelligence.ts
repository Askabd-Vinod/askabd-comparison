/**
 * AskABD Migration Intelligence Engine
 * Universal Enterprise Migration Assessment, Planning, Validation, and Reporting Platform
 */

// ─── MIGRATION TYPES ───────────────────────────────────────────────────────

export type MigrationType =
  | 'application' | 'database' | 'server' | 'cloud' | 'data-center' | 'storage'
  | 'network' | 'operating-system' | 'container' | 'kubernetes' | 'virtual-machine'
  | 'platform' | 'erp' | 'crm' | 'hrms' | 'finance' | 'identity' | 'directory'
  | 'email' | 'document' | 'sharepoint' | 'knowledge-base' | 'api' | 'microservices'
  | 'legacy-modernization' | 'monolith-to-microservices' | 'mainframe' | 'data-warehouse'
  | 'business-process' | 'devops-tool' | 'monitoring-tool' | 'itsm' | 'security-platform'
  | 'analytics-platform' | 'digital-transformation';

export type MigrationStatus = 'planning' | 'assessing' | 'ready' | 'in-progress' | 'validating' | 'completed' | 'rolled-back' | 'paused' | 'cancelled';
export type MigrationPhase = 'discovery' | 'assessment' | 'planning' | 'pre-validation' | 'execution' | 'post-validation' | 'cutover' | 'hypercare';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type ReadinessLevel = 'not-ready' | 'partial' | 'ready' | 'validated';

// ─── CORE INTERFACES ───────────────────────────────────────────────────────

export interface MigrationProgram {
  id: string;
  name: string;
  type: MigrationType;
  status: MigrationStatus;
  phase: MigrationPhase;
  clientId: string;
  clientName: string;
  description: string;
  source: EnvironmentProfile;
  target: EnvironmentProfile;
  assessment: MigrationAssessment;
  plan: MigrationPlan;
  gaps: GapItem[];
  waves: MigrationWave[];
  validation: ValidationResult;
  owner: string;
  startDate: string;
  targetDate: string;
  progress: number;
  riskScore: number;
  readinessScore: number;
  confidenceScore: number;
  lastSync: string;
}

export interface EnvironmentProfile {
  name: string;
  type: string;
  applications: number;
  databases: number;
  servers: number;
  storage: string;
  users: number;
  integrations: number;
  dependencies: number;
  status: 'discovered' | 'analysing' | 'ready-for-connection' | 'connected';
}

export interface MigrationAssessment {
  complexity: RiskLevel;
  readiness: ReadinessLevel;
  businessReadiness: number;
  technicalReadiness: number;
  riskScore: number;
  effortEstimate: string;
  timeline: string;
  cost: string;
  requiredSkills: string[];
  recommendations: string[];
  confidence: number;
}

export interface MigrationPlan {
  strategy: string;
  approach: string;
  waves: number;
  rollbackPlan: string;
  validationPlan: string;
  testingPlan: string;
  cutoverPlan: string;
  communicationPlan: string;
  supportPlan: string;
}

export interface GapItem {
  id: string;
  category: string;
  severity: RiskLevel;
  title: string;
  description: string;
  source: string;
  target: string;
  recommendation: string;
  effort: string;
  owner: string;
  status: 'open' | 'mitigated' | 'accepted' | 'resolved';
}

export interface MigrationWave {
  id: string;
  name: string;
  order: number;
  status: MigrationStatus;
  items: number;
  progress: number;
  startDate: string;
  endDate: string;
  dependencies: string[];
}

export interface ValidationResult {
  sourceCount: number;
  targetCount: number;
  matched: number;
  mismatched: number;
  missing: number;
  extra: number;
  checksumValid: boolean;
  permissionsValid: boolean;
  performanceAcceptable: boolean;
  businessValidation: boolean;
}

// ─── MOCK DATA ─────────────────────────────────────────────────────────────

export function generateMockMigrations(): MigrationProgram[] {
  return [
    {
      id: 'mig-001',
      name: 'Trading Platform Cloud Migration',
      type: 'cloud',
      status: 'in-progress',
      phase: 'execution',
      clientId: 'meridian-financial',
      clientName: 'Meridian Financial Group',
      description: 'Migrate on-premise trading platform to AWS with zero-downtime cutover',
      source: { name: 'On-Premise DC', type: 'Data Center', applications: 12, databases: 8, servers: 24, storage: '4.2 TB', users: 850, integrations: 15, dependencies: 42, status: 'connected' },
      target: { name: 'AWS ap-southeast-2', type: 'Cloud (AWS)', applications: 12, databases: 8, servers: 0, storage: '4.2 TB', users: 850, integrations: 15, dependencies: 42, status: 'ready-for-connection' },
      assessment: { complexity: 'high', readiness: 'ready', businessReadiness: 85, technicalReadiness: 78, riskScore: 35, effortEstimate: '16 weeks', timeline: 'Q3-Q4 2026', cost: '$320,000', requiredSkills: ['AWS Solutions Architect', 'DBA', 'Network Engineer', 'Security'], recommendations: ['Use blue-green deployment for cutover', 'Replicate data before switching DNS', 'Run parallel for 2 weeks'], confidence: 82 },
      plan: { strategy: 'Lift-and-Shift + Optimize', approach: 'Phased migration with parallel run', waves: 4, rollbackPlan: 'DNS failback to on-premise within 5 minutes', validationPlan: 'Automated comparison of trade execution times and data integrity', testingPlan: 'Load test at 2x production volume before cutover', cutoverPlan: 'Weekend cutover with 4-hour maintenance window', communicationPlan: 'Weekly stakeholder updates, 48h pre-cutover notice', supportPlan: 'Dedicated team for 4 weeks post-migration (hypercare)' },
      gaps: [
        { id: 'gap-1', category: 'Performance', severity: 'high', title: 'Network latency to external exchanges', description: 'AWS region adds 3ms latency to exchange feeds', source: '<1ms (co-located)', target: '3-5ms (cloud)', recommendation: 'Use AWS Direct Connect or place matching engine in edge location', effort: '2 weeks', owner: 'Network Team', status: 'open' },
        { id: 'gap-2', category: 'Compliance', severity: 'medium', title: 'Data residency requirements', description: 'Financial data must remain in AU region', source: 'Sydney DC', target: 'ap-southeast-2', recommendation: 'Confirmed: ap-southeast-2 satisfies AU data residency', effort: '1 day', owner: 'Compliance', status: 'resolved' },
        { id: 'gap-3', category: 'Security', severity: 'high', title: 'HSM key migration', description: 'Hardware security modules cannot be directly migrated', source: 'Physical HSM', target: 'AWS CloudHSM', recommendation: 'Provision CloudHSM, generate new keys, re-encrypt data', effort: '3 weeks', owner: 'Security Team', status: 'open' },
      ],
      waves: [
        { id: 'wave-1', name: 'Non-Production Environments', order: 1, status: 'completed', items: 8, progress: 100, startDate: '2026-06-01', endDate: '2026-06-28', dependencies: [] },
        { id: 'wave-2', name: 'Internal Services & APIs', order: 2, status: 'in-progress', items: 6, progress: 65, startDate: '2026-07-01', endDate: '2026-07-31', dependencies: ['wave-1'] },
        { id: 'wave-3', name: 'Database Migration', order: 3, status: 'planning', items: 8, progress: 10, startDate: '2026-08-01', endDate: '2026-08-28', dependencies: ['wave-2'] },
        { id: 'wave-4', name: 'Production Cutover', order: 4, status: 'planning', items: 12, progress: 0, startDate: '2026-09-01', endDate: '2026-09-15', dependencies: ['wave-3'] },
      ],
      validation: { sourceCount: 2400000, targetCount: 2398500, matched: 2398500, mismatched: 0, missing: 1500, extra: 0, checksumValid: true, permissionsValid: true, performanceAcceptable: true, businessValidation: false },
      owner: 'hello@askabd.com',
      startDate: '2026-06-01',
      targetDate: '2026-09-15',
      progress: 45,
      riskScore: 35,
      readinessScore: 82,
      confidenceScore: 82,
      lastSync: new Date().toISOString(),
    },
    {
      id: 'mig-002',
      name: 'Patient Records Database Migration',
      type: 'database',
      status: 'assessing',
      phase: 'assessment',
      clientId: 'nexus-healthcare',
      clientName: 'Nexus Healthcare Systems',
      description: 'Migrate Oracle 12c patient records to PostgreSQL 16 with HIPAA compliance validation',
      source: { name: 'Oracle 12c RAC', type: 'Database', applications: 5, databases: 3, servers: 6, storage: '1.8 TB', users: 2200, integrations: 8, dependencies: 23, status: 'connected' },
      target: { name: 'PostgreSQL 16 (RDS)', type: 'Database', applications: 5, databases: 3, servers: 0, storage: '1.8 TB', users: 2200, integrations: 8, dependencies: 23, status: 'ready-for-connection' },
      assessment: { complexity: 'critical', readiness: 'partial', businessReadiness: 60, technicalReadiness: 55, riskScore: 65, effortEstimate: '24 weeks', timeline: 'Q4 2026 - Q1 2027', cost: '$450,000', requiredSkills: ['DBA (Oracle)', 'DBA (PostgreSQL)', 'HIPAA Specialist', 'Data Engineer'], recommendations: ['Use pgLoader for bulk data migration', 'Validate every stored procedure manually', 'Run 4-week parallel comparison'], confidence: 58 },
      plan: { strategy: 'Replatform', approach: 'Schema conversion + incremental data sync', waves: 3, rollbackPlan: 'Maintain Oracle read-replica until PostgreSQL validated for 30 days', validationPlan: 'Row-by-row comparison of 100% patient records', testingPlan: 'Full regression of all clinical applications against PostgreSQL', cutoverPlan: 'Scheduled maintenance window — Saturday 2am-6am', communicationPlan: 'Clinical staff briefing 1 week before, IT team daily standup', supportPlan: 'DBA on-call 24/7 for first 2 weeks' },
      gaps: [
        { id: 'gap-4', category: 'Compatibility', severity: 'critical', title: 'Oracle PL/SQL stored procedures', description: '147 stored procedures require conversion to PL/pgSQL', source: 'PL/SQL', target: 'PL/pgSQL', recommendation: 'Use Ora2Pg for automated conversion + manual review of complex procedures', effort: '8 weeks', owner: 'DBA Team', status: 'open' },
        { id: 'gap-5', category: 'Compliance', severity: 'critical', title: 'HIPAA encryption at rest', description: 'Ensure PostgreSQL encryption matches Oracle TDE', source: 'Oracle TDE', target: 'PostgreSQL pgcrypto + RDS encryption', recommendation: 'Enable RDS encryption + application-level field encryption for PHI', effort: '2 weeks', owner: 'Security', status: 'open' },
      ],
      waves: [
        { id: 'wave-5', name: 'Schema Conversion', order: 1, status: 'in-progress', items: 147, progress: 30, startDate: '2026-09-01', endDate: '2026-10-15', dependencies: [] },
        { id: 'wave-6', name: 'Data Migration', order: 2, status: 'planning', items: 3, progress: 0, startDate: '2026-10-16', endDate: '2026-11-30', dependencies: ['wave-5'] },
        { id: 'wave-7', name: 'Application Cutover', order: 3, status: 'planning', items: 5, progress: 0, startDate: '2026-12-01', endDate: '2027-01-15', dependencies: ['wave-6'] },
      ],
      validation: { sourceCount: 0, targetCount: 0, matched: 0, mismatched: 0, missing: 0, extra: 0, checksumValid: false, permissionsValid: false, performanceAcceptable: false, businessValidation: false },
      owner: 'ops@askabd.com',
      startDate: '2026-09-01',
      targetDate: '2027-01-15',
      progress: 15,
      riskScore: 65,
      readinessScore: 55,
      confidenceScore: 58,
      lastSync: new Date().toISOString(),
    },
    {
      id: 'mig-003',
      name: 'Monolith to Microservices Transformation',
      type: 'monolith-to-microservices',
      status: 'planning',
      phase: 'planning',
      clientId: 'atlas-logistics',
      clientName: 'Atlas Logistics International',
      description: 'Decompose monolithic Fleet Management system into domain-driven microservices on Kubernetes',
      source: { name: 'Fleet Manager Monolith', type: 'Application', applications: 1, databases: 1, servers: 4, storage: '800 GB', users: 3500, integrations: 12, dependencies: 67, status: 'connected' },
      target: { name: 'Kubernetes Microservices', type: 'Platform', applications: 8, databases: 4, servers: 0, storage: '800 GB', users: 3500, integrations: 12, dependencies: 67, status: 'ready-for-connection' },
      assessment: { complexity: 'critical', readiness: 'not-ready', businessReadiness: 40, technicalReadiness: 45, riskScore: 72, effortEstimate: '36 weeks', timeline: 'Q4 2026 - Q2 2027', cost: '$680,000', requiredSkills: ['Domain-Driven Design', 'Kubernetes', 'Event-Driven Architecture', 'DevOps'], recommendations: ['Use Strangler Fig pattern', 'Start with least-coupled domain', 'Implement event bus before decomposition'], confidence: 45 },
      plan: { strategy: 'Strangler Fig Pattern', approach: 'Incremental domain extraction with API gateway', waves: 6, rollbackPlan: 'Route traffic back to monolith via API gateway', validationPlan: 'Compare API response contracts byte-for-byte', testingPlan: 'Contract testing + integration testing per service', cutoverPlan: 'Progressive traffic shifting (10% → 50% → 100%)', communicationPlan: 'Bi-weekly architecture review, monthly stakeholder demo', supportPlan: 'Shared responsibility model with embedded SRE' },
      gaps: [],
      waves: [],
      validation: { sourceCount: 0, targetCount: 0, matched: 0, mismatched: 0, missing: 0, extra: 0, checksumValid: false, permissionsValid: false, performanceAcceptable: false, businessValidation: false },
      owner: 'hello@askabd.com',
      startDate: '2026-10-01',
      targetDate: '2027-06-30',
      progress: 5,
      riskScore: 72,
      readinessScore: 40,
      confidenceScore: 45,
      lastSync: new Date().toISOString(),
    },
  ];
}

export const migrationTypes: Array<{ value: MigrationType; label: string; category: string }> = [
  { value: 'application', label: 'Application Migration', category: 'Application' },
  { value: 'database', label: 'Database Migration', category: 'Data' },
  { value: 'cloud', label: 'Cloud Migration', category: 'Infrastructure' },
  { value: 'server', label: 'Server Migration', category: 'Infrastructure' },
  { value: 'container', label: 'Container Migration', category: 'Infrastructure' },
  { value: 'kubernetes', label: 'Kubernetes Migration', category: 'Infrastructure' },
  { value: 'data-center', label: 'Data Center Migration', category: 'Infrastructure' },
  { value: 'monolith-to-microservices', label: 'Monolith to Microservices', category: 'Modernization' },
  { value: 'legacy-modernization', label: 'Legacy Modernization', category: 'Modernization' },
  { value: 'mainframe', label: 'Mainframe Modernization', category: 'Modernization' },
  { value: 'platform', label: 'Platform Migration', category: 'Platform' },
  { value: 'erp', label: 'ERP Migration', category: 'Business Systems' },
  { value: 'crm', label: 'CRM Migration', category: 'Business Systems' },
  { value: 'identity', label: 'Identity Migration', category: 'Security' },
  { value: 'security-platform', label: 'Security Platform Migration', category: 'Security' },
  { value: 'email', label: 'Email Migration', category: 'Communication' },
  { value: 'devops-tool', label: 'DevOps Tool Migration', category: 'Tooling' },
  { value: 'monitoring-tool', label: 'Monitoring Tool Migration', category: 'Tooling' },
  { value: 'digital-transformation', label: 'Digital Transformation', category: 'Strategic' },
];
