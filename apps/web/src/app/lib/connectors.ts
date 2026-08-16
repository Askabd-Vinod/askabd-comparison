export type ConnectorCategory = 'source-control' | 'project' | 'documentation' | 'cloud' | 'containers' | 'ci-cd' | 'monitoring' | 'logging' | 'databases' | 'identity' | 'communication';
export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'pending' | 'configuring';
export type AuthType = 'oauth' | 'pat' | 'api-key' | 'certificate' | 'service-account';

export interface Connector {
  id: string;
  name: string;
  category: ConnectorCategory;
  status: ConnectorStatus;
  authType: AuthType;
  lastSync: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
  dataCoverage: number;
  confidence: number;
  permissions: string[];
  missingPermissions: string[];
}

export const connectorCatalog: { category: ConnectorCategory; label: string; connectors: { id: string; name: string; icon: string }[] }[] = [
  { category: 'source-control', label: 'Source Control', connectors: [{ id: 'github', name: 'GitHub', icon: '🐙' }, { id: 'gitlab', name: 'GitLab', icon: '🦊' }, { id: 'bitbucket', name: 'Bitbucket', icon: '🪣' }, { id: 'azure-devops-repos', name: 'Azure DevOps', icon: '🔷' }] },
  { category: 'project', label: 'Project Management', connectors: [{ id: 'jira', name: 'Jira', icon: '📋' }, { id: 'azure-boards', name: 'Azure Boards', icon: '🔷' }, { id: 'servicenow', name: 'ServiceNow', icon: '🔧' }] },
  { category: 'documentation', label: 'Documentation', connectors: [{ id: 'confluence', name: 'Confluence', icon: '📄' }, { id: 'sharepoint', name: 'SharePoint', icon: '📁' }, { id: 'notion', name: 'Notion', icon: '📝' }] },
  { category: 'cloud', label: 'Cloud Providers', connectors: [{ id: 'aws', name: 'AWS', icon: '☁️' }, { id: 'azure', name: 'Azure', icon: '🔷' }, { id: 'gcp', name: 'Google Cloud', icon: '🌐' }] },
  { category: 'containers', label: 'Containers & Orchestration', connectors: [{ id: 'kubernetes', name: 'Kubernetes', icon: '⚙️' }, { id: 'openshift', name: 'OpenShift', icon: '🔴' }, { id: 'docker', name: 'Docker', icon: '🐳' }] },
  { category: 'ci-cd', label: 'CI/CD', connectors: [{ id: 'github-actions', name: 'GitHub Actions', icon: '▶️' }, { id: 'azure-pipelines', name: 'Azure Pipelines', icon: '🔷' }, { id: 'jenkins', name: 'Jenkins', icon: '🔨' }] },
  { category: 'monitoring', label: 'Monitoring', connectors: [{ id: 'prometheus', name: 'Prometheus', icon: '🔥' }, { id: 'grafana', name: 'Grafana', icon: '📊' }, { id: 'datadog', name: 'Datadog', icon: '🐕' }, { id: 'dynatrace', name: 'Dynatrace', icon: '💎' }] },
  { category: 'logging', label: 'Logging', connectors: [{ id: 'splunk', name: 'Splunk', icon: '🔍' }, { id: 'elk', name: 'ELK Stack', icon: '📊' }] },
  { category: 'databases', label: 'Databases', connectors: [{ id: 'postgresql', name: 'PostgreSQL', icon: '🐘' }, { id: 'sqlserver', name: 'SQL Server', icon: '🗄️' }, { id: 'mongodb', name: 'MongoDB', icon: '🍃' }] },
  { category: 'identity', label: 'Identity', connectors: [{ id: 'entra-id', name: 'Microsoft Entra ID', icon: '🔐' }, { id: 'okta', name: 'Okta', icon: '🔒' }] },
  { category: 'communication', label: 'Communication', connectors: [{ id: 'teams', name: 'Microsoft Teams', icon: '💬' }, { id: 'slack', name: 'Slack', icon: '💬' }, { id: 'pagerduty', name: 'PagerDuty', icon: '📟' }] },
];

export const premiumServices = [
  { id: 'enterprise-monitoring', name: 'Enterprise Monitoring', value: 'Proactive 24/7 monitoring with intelligent alerting', deliverables: ['Monitoring Dashboard', 'Alert Configuration', 'Runbooks', 'Monthly Reports'], outcomes: ['60% faster MTTR', '99.9% availability'] },
  { id: 'architecture-review', name: 'Architecture Review', value: 'Comprehensive architecture assessment against industry standards', deliverables: ['Assessment Report', 'Gap Analysis', 'Recommendations', 'Roadmap'], outcomes: ['Technical debt reduction', 'Scalability confidence'] },
  { id: 'security-assessment', name: 'Security Assessment', value: 'Vulnerability assessment and compliance validation', deliverables: ['Security Report', 'Remediation Plan', 'Compliance Matrix'], outcomes: ['Risk reduction', 'Audit readiness'] },
  { id: 'cloud-optimization', name: 'Cloud Cost Optimization', value: 'Right-sizing, reserved instances, and waste elimination', deliverables: ['Cost Analysis', 'Optimization Plan', 'Implementation Support'], outcomes: ['20-40% cost reduction'] },
  { id: 'digital-transformation', name: 'Digital Transformation', value: 'End-to-end modernization strategy and execution', deliverables: ['Transformation Strategy', 'Phased Roadmap', 'Business Case'], outcomes: ['Competitive advantage', 'Operational excellence'] },
  { id: 'autonomous-ops', name: 'Autonomous Operations', value: 'AI-powered detection, analysis, and approved remediation', deliverables: ['Auto-detection', 'RCA Generation', 'Remediation Playbooks', 'Approval Workflows'], outcomes: ['Reduced manual effort', 'Faster resolution'] },
];
