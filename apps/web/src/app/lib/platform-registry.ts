/**
 * AskABD Platform Registry — Metadata-Driven Architecture
 * 
 * Central registry for all platform capabilities. When a new feature is registered,
 * it automatically appears in navigation, client workspaces, dashboards, search,
 * AI Copilot context, audit, permissions, and feature toggles.
 * 
 * No manual updates required for existing clients — new capabilities propagate automatically.
 */

// ─── REGISTRY TYPES ────────────────────────────────────────────────────────

export type ModuleCategory = 'operations' | 'intelligence' | 'engineering' | 'migration' | 'governance' | 'support' | 'platform';
export type ModuleStatus = 'active' | 'beta' | 'preview' | 'disabled' | 'deprecated';
export type FeatureToggleScope = 'platform' | 'client' | 'user';

export interface PlatformModule {
  id: string;
  name: string;
  category: ModuleCategory;
  description: string;
  icon: string;
  route: string;
  clientRoute?: string; // If available at client level
  status: ModuleStatus;
  version: string;
  features: string[];
  permissions: string[];
  reports: string[];
  connectors: string[];
  aiCapabilities: string[];
  toggleable: boolean;
  premium: boolean;
  order: number;
}

export interface FeatureToggle {
  id: string;
  moduleId: string;
  name: string;
  scope: FeatureToggleScope;
  enabled: boolean;
  description: string;
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: string;
  icon: string;
  authMethods: string[];
  status: 'ready-for-connection' | 'connected' | 'validating' | 'syncing' | 'healthy' | 'warning' | 'failed';
  features: string[];
  premium: boolean;
}

// ─── PLATFORM MODULE REGISTRY ──────────────────────────────────────────────

export const platformModules: PlatformModule[] = [
  {
    id: 'operations', name: 'Enterprise Operations', category: 'operations', description: 'Executive dashboard, client management, SLA monitoring',
    icon: '📊', route: '/', clientRoute: '', status: 'active', version: '4.0.0',
    features: ['dashboard', 'kpi-tiles', 'client-overview', 'health-monitoring', 'sla-tracking'],
    permissions: ['operations:read', 'operations:write', 'operations:admin'],
    reports: ['Executive Operations Report', 'SLA Compliance Report', 'Client Health Report'],
    connectors: [], aiCapabilities: ['explain-health', 'predict-sla', 'recommend-actions'], toggleable: false, premium: false, order: 1,
  },
  {
    id: 'clients', name: 'Client Management', category: 'operations', description: 'Client onboarding, lifecycle management, service toggles',
    icon: '👥', route: '/clients', status: 'active', version: '3.5.0',
    features: ['onboarding-wizard', 'client-directory', 'kanban-view', 'cards-view', 'service-toggles', 'notifications'],
    permissions: ['clients:read', 'clients:write', 'clients:admin', 'clients:onboard'],
    reports: ['Client Directory Report', 'Onboarding Report', 'Service Adoption Report'],
    connectors: [], aiCapabilities: ['recommend-services', 'predict-churn', 'assess-readiness'], toggleable: false, premium: false, order: 2,
  },
  {
    id: 'applications', name: 'Applications', category: 'operations', description: 'Application portfolio management, health monitoring',
    icon: '📱', route: '/applications', clientRoute: '/applications', status: 'active', version: '2.0.0',
    features: ['application-list', 'health-status', 'service-toggles', 'environment-status'],
    permissions: ['applications:read', 'applications:write'],
    reports: ['Application Health Report', 'Application Portfolio Report'],
    connectors: ['github', 'gitlab', 'azure-devops'], aiCapabilities: ['explain-health', 'recommend-optimization'], toggleable: true, premium: false, order: 3,
  },
  {
    id: 'services', name: 'Platform Services', category: 'operations', description: 'Service catalog, health, toggles',
    icon: '⚙️', route: '/services', clientRoute: '/services', status: 'active', version: '2.0.0',
    features: ['service-catalog', 'health-monitoring', 'service-toggles', 'dependencies'],
    permissions: ['services:read', 'services:write', 'services:toggle'],
    reports: ['Service Health Report', 'Service Adoption Report'],
    connectors: [], aiCapabilities: ['recommend-services'], toggleable: true, premium: false, order: 4,
  },
  {
    id: 'infrastructure', name: 'Infrastructure', category: 'operations', description: 'Servers, containers, clusters, resource monitoring',
    icon: '🖥️', route: '/infrastructure', clientRoute: '/infrastructure', status: 'active', version: '2.0.0',
    features: ['server-inventory', 'resource-utilization', 'container-status', 'cluster-health'],
    permissions: ['infrastructure:read', 'infrastructure:write'],
    reports: ['Infrastructure Report', 'Capacity Report', 'Resource Utilization Report'],
    connectors: ['aws', 'azure', 'gcp', 'kubernetes', 'docker'], aiCapabilities: ['predict-capacity', 'recommend-scaling'], toggleable: true, premium: false, order: 5,
  },
  {
    id: 'monitoring', name: 'Monitoring', category: 'operations', description: 'Live metrics, alerts, performance tracking',
    icon: '📈', route: '/monitoring', clientRoute: '/monitoring', status: 'active', version: '3.0.0',
    features: ['live-metrics', 'alerts', 'performance', 'availability', 'latency'],
    permissions: ['monitoring:read', 'monitoring:write', 'monitoring:configure'],
    reports: ['Monitoring Report', 'Performance Report', 'Availability Report'],
    connectors: ['prometheus', 'grafana', 'datadog', 'splunk', 'elastic'], aiCapabilities: ['predict-anomalies', 'explain-metrics'], toggleable: true, premium: false, order: 6,
  },
  {
    id: 'deployments', name: 'Deployments', category: 'operations', description: 'Deployment tracking, history, rollback',
    icon: '🚀', route: '/deployments', clientRoute: '/deployments', status: 'active', version: '2.0.0',
    features: ['deployment-history', 'rollback', 'pipeline-status', 'environment-promotion'],
    permissions: ['deployments:read', 'deployments:write', 'deployments:rollback'],
    reports: ['Deployment Report', 'Release Report'],
    connectors: ['github', 'gitlab', 'azure-devops', 'docker', 'kubernetes'], aiCapabilities: ['predict-failure', 'recommend-rollback'], toggleable: true, premium: false, order: 7,
  },
  {
    id: 'incidents', name: 'Incidents', category: 'operations', description: 'Incident management, RCA, remediation',
    icon: '🚨', route: '/incidents', clientRoute: '/incidents', status: 'active', version: '3.0.0',
    features: ['incident-tracking', 'rca', 'remediation', 'timeline', 'escalation'],
    permissions: ['incidents:read', 'incidents:write', 'incidents:remediate'],
    reports: ['Incident Report', 'MTTR Report', 'Root Cause Report'],
    connectors: ['pagerduty', 'jira', 'servicenow'], aiCapabilities: ['generate-rca', 'recommend-fix', 'predict-recurrence'], toggleable: false, premium: false, order: 8,
  },
  {
    id: 'intelligence', name: 'Enterprise Intelligence', category: 'intelligence', description: 'Risk, maturity, transformation, compliance',
    icon: '🧠', route: '/intelligence', status: 'active', version: '2.5.0',
    features: ['risk-register', 'maturity-assessment', 'transformation-roadmap', 'compliance'],
    permissions: ['intelligence:read', 'intelligence:write'],
    reports: ['Intelligence Report', 'Risk Report', 'Maturity Report', 'Compliance Report'],
    connectors: [], aiCapabilities: ['predict-risks', 'recommend-improvements'], toggleable: true, premium: false, order: 9,
  },
  {
    id: 'engineering', name: 'Engineering Intelligence', category: 'engineering', description: 'Defect detection, RCA, solutions, knowledge base',
    icon: '⚙️', route: '/engineering', clientRoute: '/engineering', status: 'active', version: '1.0.0',
    features: ['defect-detection', 'rca-engine', 'solution-engine', 'knowledge-base', 'code-intelligence'],
    permissions: ['engineering:read', 'engineering:write', 'engineering:remediate'],
    reports: ['Engineering Health Report', 'Defect Report', 'RCA Report', 'Code Quality Report', 'Security Report'],
    connectors: ['github', 'gitlab', 'jira', 'sonarqube'], aiCapabilities: ['generate-rca', 'generate-solution', 'explain-error', 'search-knowledge'], toggleable: true, premium: false, order: 10,
  },
  {
    id: 'migrations', name: 'Migration Intelligence', category: 'migration', description: 'Enterprise migration assessment, planning, execution, validation',
    icon: '🔄', route: '/migrations', clientRoute: '/migrations', status: 'active', version: '1.0.0',
    features: ['migration-wizard', 'portfolio', 'assessment', 'gap-analysis', 'wave-planning', 'validation', 'reporting'],
    permissions: ['migrations:read', 'migrations:write', 'migrations:execute', 'migrations:approve'],
    reports: ['Migration Assessment', 'Migration Readiness', 'Gap Analysis', 'Risk Report', 'Execution Report', 'Validation Report'],
    connectors: ['aws', 'azure', 'gcp', 'kubernetes', 'docker', 'oracle', 'postgresql', 'mongodb'],
    aiCapabilities: ['generate-migration-plan', 'predict-risks', 'recommend-strategy', 'explain-gaps'], toggleable: true, premium: false, order: 11,
  },
  {
    id: 'governance', name: 'Governance & Audit', category: 'governance', description: 'Compliance, security, audit trail, governance policies',
    icon: '🛡️', route: '/governance', status: 'active', version: '2.0.0',
    features: ['audit-timeline', 'compliance', 'security-governance', 'policy-management'],
    permissions: ['governance:read', 'governance:write', 'governance:admin'],
    reports: ['Governance Report', 'Compliance Report', 'Security Report', 'Audit Report'],
    connectors: ['okta', 'entra-id'], aiCapabilities: ['assess-compliance', 'recommend-policies'], toggleable: false, premium: false, order: 12,
  },
  {
    id: 'reports', name: 'Reports', category: 'platform', description: 'Downloadable reports — PDF, Excel, CSV, JSON',
    icon: '📄', route: '/reports', clientRoute: '/reports', status: 'active', version: '2.0.0',
    features: ['download', 'share', 'schedule', 'version-history', 'evidence', 'confidence'],
    permissions: ['reports:read', 'reports:generate', 'reports:share'],
    reports: [], connectors: [], aiCapabilities: ['generate-executive-summary'], toggleable: false, premium: false, order: 13,
  },
  {
    id: 'platform', name: 'Platform Health', category: 'platform', description: 'API health, system diagnostics, feature flags',
    icon: '🔧', route: '/platform', status: 'active', version: '1.5.0',
    features: ['health-checks', 'diagnostics', 'feature-flags', 'system-metrics'],
    permissions: ['platform:read', 'platform:admin'],
    reports: ['Platform Health Report'], connectors: [], aiCapabilities: [], toggleable: false, premium: false, order: 14,
  },
];

// ─── CONNECTOR REGISTRY ────────────────────────────────────────────────────

export const connectorRegistry: ConnectorDefinition[] = [
  { id: 'aws', name: 'AWS', category: 'Cloud', icon: '☁️', authMethods: ['api-key', 'iam-role'], status: 'ready-for-connection', features: ['ec2', 's3', 'rds', 'lambda', 'ecs', 'cloudwatch'], premium: false },
  { id: 'azure', name: 'Azure', category: 'Cloud', icon: '🌐', authMethods: ['certificate', 'oauth'], status: 'ready-for-connection', features: ['vms', 'storage', 'sql', 'aks', 'monitor'], premium: false },
  { id: 'gcp', name: 'Google Cloud', category: 'Cloud', icon: '🔵', authMethods: ['certificate'], status: 'ready-for-connection', features: ['compute', 'gke', 'bigquery', 'storage'], premium: false },
  { id: 'github', name: 'GitHub', category: 'Source Control', icon: '🐙', authMethods: ['oauth', 'pat'], status: 'ready-for-connection', features: ['repos', 'prs', 'actions', 'security'], premium: false },
  { id: 'gitlab', name: 'GitLab', category: 'Source Control', icon: '🦊', authMethods: ['pat'], status: 'ready-for-connection', features: ['repos', 'pipelines', 'registry'], premium: false },
  { id: 'jira', name: 'Jira', category: 'Project Management', icon: '📋', authMethods: ['api-key'], status: 'ready-for-connection', features: ['issues', 'sprints', 'boards'], premium: false },
  { id: 'servicenow', name: 'ServiceNow', category: 'ITSM', icon: '🎫', authMethods: ['basic', 'oauth'], status: 'ready-for-connection', features: ['incidents', 'changes', 'cmdb'], premium: false },
  { id: 'prometheus', name: 'Prometheus', category: 'Monitoring', icon: '🔥', authMethods: ['basic', 'bearer'], status: 'ready-for-connection', features: ['metrics', 'alerts', 'rules'], premium: false },
  { id: 'grafana', name: 'Grafana', category: 'Monitoring', icon: '📊', authMethods: ['api-key'], status: 'ready-for-connection', features: ['dashboards', 'alerts', 'datasources'], premium: false },
  { id: 'datadog', name: 'Datadog', category: 'Monitoring', icon: '🐕', authMethods: ['api-key'], status: 'ready-for-connection', features: ['apm', 'logs', 'monitors', 'synthetics'], premium: false },
  { id: 'splunk', name: 'Splunk', category: 'Logging', icon: '🔍', authMethods: ['api-key'], status: 'ready-for-connection', features: ['search', 'dashboards', 'alerts'], premium: false },
  { id: 'elastic', name: 'Elastic', category: 'Logging', icon: '🟡', authMethods: ['api-key'], status: 'ready-for-connection', features: ['search', 'kibana', 'apm'], premium: false },
  { id: 'kubernetes', name: 'Kubernetes', category: 'Container', icon: '⎈', authMethods: ['certificate', 'kubeconfig'], status: 'ready-for-connection', features: ['deployments', 'pods', 'services'], premium: false },
  { id: 'docker', name: 'Docker', category: 'Container', icon: '🐳', authMethods: ['pat'], status: 'ready-for-connection', features: ['images', 'builds', 'scanning'], premium: false },
  { id: 'okta', name: 'Okta', category: 'Identity', icon: '🔐', authMethods: ['api-key'], status: 'ready-for-connection', features: ['sso', 'mfa', 'provisioning'], premium: false },
  { id: 'entra-id', name: 'Microsoft Entra ID', category: 'Identity', icon: '🔑', authMethods: ['certificate', 'oauth'], status: 'ready-for-connection', features: ['sso', 'groups', 'conditional-access'], premium: false },
  { id: 'slack', name: 'Slack', category: 'Communication', icon: '💬', authMethods: ['oauth'], status: 'ready-for-connection', features: ['messages', 'channels', 'bots'], premium: false },
  { id: 'pagerduty', name: 'PagerDuty', category: 'Incident', icon: '🚨', authMethods: ['api-key'], status: 'ready-for-connection', features: ['incidents', 'schedules', 'escalation'], premium: false },
  { id: 'postgresql', name: 'PostgreSQL', category: 'Database', icon: '🐘', authMethods: ['basic'], status: 'ready-for-connection', features: ['query', 'schema', 'replication'], premium: false },
  { id: 'mongodb', name: 'MongoDB', category: 'Database', icon: '🍃', authMethods: ['basic', 'certificate'], status: 'ready-for-connection', features: ['collections', 'indexes', 'replication'], premium: false },
  { id: 'oracle', name: 'Oracle', category: 'Database', icon: '🔶', authMethods: ['basic'], status: 'ready-for-connection', features: ['tables', 'procedures', 'rac'], premium: true },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', icon: '☁️', authMethods: ['oauth'], status: 'ready-for-connection', features: ['objects', 'reports', 'workflows'], premium: true },
  { id: 'sap', name: 'SAP', category: 'ERP', icon: '🏢', authMethods: ['basic', 'certificate'], status: 'ready-for-connection', features: ['modules', 'transactions', 'interfaces'], premium: true },
  { id: 'confluence', name: 'Confluence', category: 'Documentation', icon: '📝', authMethods: ['api-key'], status: 'ready-for-connection', features: ['pages', 'spaces', 'search'], premium: false },
  { id: 'terraform', name: 'Terraform', category: 'IaC', icon: '🏗️', authMethods: ['api-key'], status: 'ready-for-connection', features: ['state', 'plans', 'workspaces'], premium: false },
];

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────

export function getActiveModules(): PlatformModule[] {
  return platformModules.filter(m => m.status === 'active').sort((a, b) => a.order - b.order);
}

export function getModulesByCategory(category: ModuleCategory): PlatformModule[] {
  return platformModules.filter(m => m.category === category && m.status === 'active');
}

export function getClientModules(): PlatformModule[] {
  return platformModules.filter(m => m.clientRoute !== undefined && m.status === 'active');
}

export function getModuleReports(): Array<{ module: string; reports: string[] }> {
  return platformModules.filter(m => m.reports.length > 0).map(m => ({ module: m.name, reports: m.reports }));
}

export function getModulePermissions(): Array<{ module: string; permissions: string[] }> {
  return platformModules.map(m => ({ module: m.name, permissions: m.permissions }));
}

export function getConnectorsByCategory(): Record<string, ConnectorDefinition[]> {
  const grouped: Record<string, ConnectorDefinition[]> = {};
  connectorRegistry.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });
  return grouped;
}

export function getPlatformStats() {
  return {
    totalModules: platformModules.filter(m => m.status === 'active').length,
    totalConnectors: connectorRegistry.length,
    connectedConnectors: connectorRegistry.filter(c => c.status === 'connected' || c.status === 'healthy').length,
    readyConnectors: connectorRegistry.filter(c => c.status === 'ready-for-connection').length,
    totalReports: platformModules.reduce((a, m) => a + m.reports.length, 0),
    totalAiCapabilities: platformModules.reduce((a, m) => a + m.aiCapabilities.length, 0),
    totalPermissions: platformModules.reduce((a, m) => a + m.permissions.length, 0),
    premiumConnectors: connectorRegistry.filter(c => c.premium).length,
  };
}
