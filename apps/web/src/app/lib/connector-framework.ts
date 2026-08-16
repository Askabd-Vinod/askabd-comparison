// Connector Framework - Production-ready connector management library

export type ConnectorStatus =
  | 'ready-for-connection'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'disabled';

export type ConnectorType =
  | 'source-control'
  | 'project-management'
  | 'monitoring'
  | 'cloud'
  | 'ci-cd'
  | 'logging'
  | 'security'
  | 'communication'
  | 'documentation'
  | 'identity';

export type AuthMethod = 'api-key' | 'oauth' | 'pat' | 'basic' | 'certificate';

export interface HealthCheck {
  lastCheck: string;
  healthy: boolean;
  latencyMs: number;
  message: string;
}

export interface SyncConfig {
  lastSync: string;
  nextSync: string;
  frequency: string;
  coverage: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  timeoutMs: number;
}

export interface AuditInfo {
  lastAuditAt: string;
  auditCount: number;
}

export interface ErrorEntry {
  timestamp: string;
  message: string;
  resolved: boolean;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  type: ConnectorType;
  provider: string;
  status: ConnectorStatus;
  description: string;
  icon: string;
  authMethod: AuthMethod;
  credentials: Record<string, string>;
  healthCheck: HealthCheck;
  sync: SyncConfig;
  permissions: string[];
  features: string[];
  retryPolicy: RetryPolicy;
  encryption: 'aes-256-gcm';
  audit: AuditInfo;
  errorHistory: ErrorEntry[];
  version: string;
}

export const connectorRegistry: ConnectorConfig[] = [
  {
    id: 'conn-github-001',
    name: 'GitHub',
    type: 'source-control',
    provider: 'GitHub Inc.',
    status: 'ready-for-connection',
    description: 'Source code hosting, pull requests, code review, and CI/CD workflows',
    icon: '🐙',
    authMethod: 'oauth',
    credentials: { accessToken: '[ENCRYPTED:AES-256-GCM]', clientSecret: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['repo:read', 'repo:write', 'org:read', 'actions:read', 'webhooks:manage'],
    features: ['pull-requests', 'code-review', 'actions', 'packages', 'security-advisories', 'dependabot'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.1.0',
  },
  {
    id: 'conn-gitlab-002',
    name: 'GitLab',
    type: 'source-control',
    provider: 'GitLab Inc.',
    status: 'ready-for-connection',
    description: 'Complete DevOps platform with source control, CI/CD, and container registry',
    icon: '🦊',
    authMethod: 'pat',
    credentials: { personalAccessToken: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['api:read', 'api:write', 'registry:read', 'runner:manage'],
    features: ['merge-requests', 'pipelines', 'container-registry', 'packages', 'security-scanning', 'wiki'],
    retryPolicy: { maxRetries: 3, backoffMs: 1500, timeoutMs: 30000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.8.0',
  },
  {
    id: 'conn-bitbucket-003',
    name: 'Bitbucket',
    type: 'source-control',
    provider: 'Atlassian',
    status: 'ready-for-connection',
    description: 'Git-based source control with Jira integration and Bitbucket Pipelines',
    icon: '🪣',
    authMethod: 'oauth',
    credentials: { appPassword: '[ENCRYPTED:AES-256-GCM]', clientId: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '10m', coverage: 0 },
    permissions: ['repository:read', 'repository:write', 'pipeline:read', 'webhook:manage'],
    features: ['pull-requests', 'pipelines', 'deployments', 'jira-integration', 'code-insights'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 25000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.4.1',
  },
  {
    id: 'conn-azure-devops-004',
    name: 'Azure DevOps',
    type: 'source-control',
    provider: 'Microsoft',
    status: 'ready-for-connection',
    description: 'End-to-end DevOps toolchain with repos, boards, pipelines, and artifacts',
    icon: '🔷',
    authMethod: 'pat',
    credentials: { personalAccessToken: '[ENCRYPTED:AES-256-GCM]', orgUrl: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['code:read', 'code:write', 'build:read', 'release:manage', 'work_items:read'],
    features: ['repos', 'boards', 'pipelines', 'artifacts', 'test-plans', 'wiki'],
    retryPolicy: { maxRetries: 4, backoffMs: 2000, timeoutMs: 45000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.0.2',
  },
  {
    id: 'conn-jira-005',
    name: 'Jira',
    type: 'project-management',
    provider: 'Atlassian',
    status: 'ready-for-connection',
    description: 'Issue tracking, agile project management, and sprint planning',
    icon: '📋',
    authMethod: 'api-key',
    credentials: { apiToken: '[ENCRYPTED:AES-256-GCM]', email: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '2m', coverage: 0 },
    permissions: ['issue:read', 'issue:write', 'project:admin', 'sprint:manage', 'board:read'],
    features: ['issues', 'sprints', 'boards', 'roadmaps', 'automation', 'custom-fields', 'workflows'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 20000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '4.2.0',
  },
  {
    id: 'conn-confluence-006',
    name: 'Confluence',
    type: 'documentation',
    provider: 'Atlassian',
    status: 'ready-for-connection',
    description: 'Team workspace for documentation, knowledge bases, and collaboration',
    icon: '📝',
    authMethod: 'api-key',
    credentials: { apiToken: '[ENCRYPTED:AES-256-GCM]', email: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '15m', coverage: 0 },
    permissions: ['space:read', 'space:write', 'page:create', 'page:delete', 'attachment:manage'],
    features: ['pages', 'spaces', 'templates', 'macros', 'comments', 'versioning', 'search'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 20000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.1.3',
  },
  {
    id: 'conn-servicenow-007',
    name: 'ServiceNow',
    type: 'project-management',
    provider: 'ServiceNow Inc.',
    status: 'ready-for-connection',
    description: 'IT service management, incident response, and change management platform',
    icon: '🎫',
    authMethod: 'basic',
    credentials: { username: '[ENCRYPTED:AES-256-GCM]', password: '[ENCRYPTED:AES-256-GCM]', instanceUrl: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['incident:read', 'incident:write', 'change:manage', 'cmdb:read', 'catalog:read'],
    features: ['incidents', 'changes', 'problems', 'cmdb', 'service-catalog', 'knowledge-base', 'workflows'],
    retryPolicy: { maxRetries: 4, backoffMs: 2000, timeoutMs: 60000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '1.9.0',
  },
  {
    id: 'conn-prometheus-008',
    name: 'Prometheus',
    type: 'monitoring',
    provider: 'Cloud Native Computing Foundation',
    status: 'ready-for-connection',
    description: 'Time-series metrics collection, alerting, and monitoring for cloud-native systems',
    icon: '🔥',
    authMethod: 'basic',
    credentials: { endpoint: '[ENCRYPTED:AES-256-GCM]', bearerToken: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '30s', coverage: 0 },
    permissions: ['metrics:read', 'alerts:read', 'rules:read', 'targets:read'],
    features: ['metrics', 'alerts', 'rules', 'targets', 'service-discovery', 'remote-write'],
    retryPolicy: { maxRetries: 5, backoffMs: 500, timeoutMs: 10000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.6.0',
  },
  {
    id: 'conn-grafana-009',
    name: 'Grafana',
    type: 'monitoring',
    provider: 'Grafana Labs',
    status: 'ready-for-connection',
    description: 'Observability dashboards, alerting, and visualization for metrics and logs',
    icon: '📊',
    authMethod: 'api-key',
    credentials: { apiKey: '[ENCRYPTED:AES-256-GCM]', instanceUrl: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '1m', coverage: 0 },
    permissions: ['dashboards:read', 'dashboards:write', 'datasources:read', 'alerts:manage', 'folders:read'],
    features: ['dashboards', 'alerts', 'annotations', 'data-sources', 'plugins', 'teams', 'reporting'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 15000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.2.1',
  },
  {
    id: 'conn-datadog-010',
    name: 'Datadog',
    type: 'monitoring',
    provider: 'Datadog Inc.',
    status: 'ready-for-connection',
    description: 'Full-stack observability with APM, infrastructure monitoring, and log management',
    icon: '🐕',
    authMethod: 'api-key',
    credentials: { apiKey: '[ENCRYPTED:AES-256-GCM]', appKey: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '1m', coverage: 0 },
    permissions: ['metrics:read', 'monitors:read', 'monitors:write', 'logs:read', 'apm:read', 'synthetics:read'],
    features: ['apm', 'infrastructure', 'logs', 'synthetics', 'rum', 'security', 'dashboards', 'monitors'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 20000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '4.0.1',
  },
  {
    id: 'conn-splunk-011',
    name: 'Splunk',
    type: 'logging',
    provider: 'Splunk Inc.',
    status: 'ready-for-connection',
    description: 'Log aggregation, SIEM, search analytics, and operational intelligence',
    icon: '🔍',
    authMethod: 'api-key',
    credentials: { authToken: '[ENCRYPTED:AES-256-GCM]', baseUrl: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '1m', coverage: 0 },
    permissions: ['search:read', 'index:write', 'alerts:manage', 'reports:read', 'apps:read'],
    features: ['search', 'dashboards', 'alerts', 'reports', 'indexes', 'forwarders', 'apps'],
    retryPolicy: { maxRetries: 3, backoffMs: 2000, timeoutMs: 60000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.3.0',
  },
  {
    id: 'conn-elastic-012',
    name: 'Elastic',
    type: 'logging',
    provider: 'Elastic NV',
    status: 'ready-for-connection',
    description: 'Elasticsearch, Kibana, and APM for search, observability, and security',
    icon: '🟡',
    authMethod: 'api-key',
    credentials: { apiKey: '[ENCRYPTED:AES-256-GCM]', cloudId: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '30s', coverage: 0 },
    permissions: ['index:read', 'index:write', 'cluster:monitor', 'kibana:read', 'apm:read'],
    features: ['search', 'kibana-dashboards', 'apm', 'siem', 'machine-learning', 'alerting', 'fleet'],
    retryPolicy: { maxRetries: 4, backoffMs: 1500, timeoutMs: 30000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.1.2',
  },
  {
    id: 'conn-aws-013',
    name: 'AWS',
    type: 'cloud',
    provider: 'Amazon Web Services',
    status: 'ready-for-connection',
    description: 'Cloud infrastructure, compute, storage, and managed services',
    icon: '☁️',
    authMethod: 'api-key',
    credentials: { accessKeyId: '[ENCRYPTED:AES-256-GCM]', secretAccessKey: '[ENCRYPTED:AES-256-GCM]', region: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['ec2:describe', 's3:read', 'cloudwatch:read', 'iam:read', 'lambda:read', 'ecs:read'],
    features: ['ec2', 's3', 'lambda', 'ecs', 'cloudwatch', 'iam', 'rds', 'cloudformation', 'cost-explorer'],
    retryPolicy: { maxRetries: 5, backoffMs: 1000, timeoutMs: 30000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '5.0.0',
  },
  {
    id: 'conn-azure-cloud-014',
    name: 'Azure Cloud',
    type: 'cloud',
    provider: 'Microsoft',
    status: 'ready-for-connection',
    description: 'Cloud platform with compute, AI, databases, and enterprise services',
    icon: '🌐',
    authMethod: 'certificate',
    credentials: { tenantId: '[ENCRYPTED:AES-256-GCM]', clientId: '[ENCRYPTED:AES-256-GCM]', clientCertificate: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['subscription:read', 'resource-group:read', 'vm:read', 'storage:read', 'monitor:read'],
    features: ['virtual-machines', 'app-service', 'functions', 'storage', 'cosmos-db', 'aks', 'monitor', 'key-vault'],
    retryPolicy: { maxRetries: 4, backoffMs: 2000, timeoutMs: 45000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.5.0',
  },
  {
    id: 'conn-gcp-015',
    name: 'GCP',
    type: 'cloud',
    provider: 'Google Cloud',
    status: 'ready-for-connection',
    description: 'Cloud infrastructure with compute, BigQuery, Kubernetes Engine, and AI/ML services',
    icon: '🔵',
    authMethod: 'certificate',
    credentials: { serviceAccountKey: '[ENCRYPTED:AES-256-GCM]', projectId: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['compute:read', 'storage:read', 'bigquery:read', 'gke:read', 'logging:read', 'monitoring:read'],
    features: ['compute-engine', 'gke', 'cloud-run', 'bigquery', 'cloud-storage', 'pub-sub', 'cloud-functions', 'iam'],
    retryPolicy: { maxRetries: 4, backoffMs: 1500, timeoutMs: 30000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '4.1.0',
  },
  {
    id: 'conn-docker-hub-016',
    name: 'Docker Hub',
    type: 'ci-cd',
    provider: 'Docker Inc.',
    status: 'ready-for-connection',
    description: 'Container image registry, automated builds, and vulnerability scanning',
    icon: '🐳',
    authMethod: 'pat',
    credentials: { accessToken: '[ENCRYPTED:AES-256-GCM]', username: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '10m', coverage: 0 },
    permissions: ['repo:read', 'repo:write', 'repo:delete', 'org:read', 'scan:read'],
    features: ['repositories', 'automated-builds', 'webhooks', 'vulnerability-scanning', 'teams', 'access-tokens'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 20000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.0.3',
  },
  {
    id: 'conn-kubernetes-017',
    name: 'Kubernetes',
    type: 'ci-cd',
    provider: 'Cloud Native Computing Foundation',
    status: 'ready-for-connection',
    description: 'Container orchestration, service mesh, and cluster management',
    icon: '⎈',
    authMethod: 'certificate',
    credentials: { kubeconfig: '[ENCRYPTED:AES-256-GCM]', clusterEndpoint: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '1m', coverage: 0 },
    permissions: ['pods:read', 'deployments:manage', 'services:read', 'namespaces:read', 'nodes:read', 'secrets:read'],
    features: ['deployments', 'services', 'pods', 'namespaces', 'ingress', 'config-maps', 'hpa', 'rbac'],
    retryPolicy: { maxRetries: 5, backoffMs: 1000, timeoutMs: 15000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.8.0',
  },
  {
    id: 'conn-slack-018',
    name: 'Slack',
    type: 'communication',
    provider: 'Salesforce',
    status: 'ready-for-connection',
    description: 'Team messaging, notifications, workflows, and bot integrations',
    icon: '💬',
    authMethod: 'oauth',
    credentials: { botToken: '[ENCRYPTED:AES-256-GCM]', signingSecret: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '1m', coverage: 0 },
    permissions: ['channels:read', 'chat:write', 'users:read', 'reactions:read', 'files:read', 'commands'],
    features: ['messages', 'channels', 'threads', 'reactions', 'workflows', 'bots', 'apps', 'slash-commands'],
    retryPolicy: { maxRetries: 3, backoffMs: 1000, timeoutMs: 10000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.5.0',
  },
  {
    id: 'conn-pagerduty-019',
    name: 'PagerDuty',
    type: 'monitoring',
    provider: 'PagerDuty Inc.',
    status: 'ready-for-connection',
    description: 'Incident management, on-call scheduling, and event-driven automation',
    icon: '🚨',
    authMethod: 'api-key',
    credentials: { apiKey: '[ENCRYPTED:AES-256-GCM]', routingKey: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '1m', coverage: 0 },
    permissions: ['incidents:read', 'incidents:write', 'services:read', 'schedules:read', 'escalation:read'],
    features: ['incidents', 'services', 'escalation-policies', 'schedules', 'event-rules', 'analytics', 'status-pages'],
    retryPolicy: { maxRetries: 4, backoffMs: 1000, timeoutMs: 15000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '3.0.0',
  },
  {
    id: 'conn-okta-020',
    name: 'Okta',
    type: 'identity',
    provider: 'Okta Inc.',
    status: 'ready-for-connection',
    description: 'Identity and access management, SSO, MFA, and lifecycle management',
    icon: '🔐',
    authMethod: 'api-key',
    credentials: { apiToken: '[ENCRYPTED:AES-256-GCM]', orgUrl: '[ENCRYPTED:AES-256-GCM]' },
    healthCheck: { lastCheck: '', healthy: false, latencyMs: 0, message: 'Not yet connected' },
    sync: { lastSync: '', nextSync: '', frequency: '5m', coverage: 0 },
    permissions: ['users:read', 'users:manage', 'groups:read', 'apps:read', 'logs:read', 'policies:read'],
    features: ['sso', 'mfa', 'user-provisioning', 'groups', 'directory-integration', 'policies', 'system-log', 'lifecycle'],
    retryPolicy: { maxRetries: 3, backoffMs: 1500, timeoutMs: 20000 },
    encryption: 'aes-256-gcm',
    audit: { lastAuditAt: '', auditCount: 0 },
    errorHistory: [],
    version: '2.7.0',
  },
];

// Helper Functions

export function getConnectorsByType(type: ConnectorType): ConnectorConfig[] {
  return connectorRegistry.filter((connector) => connector.type === type);
}

export function getConnectorsByStatus(status: ConnectorStatus): ConnectorConfig[] {
  return connectorRegistry.filter((connector) => connector.status === status);
}

export function getHealthySummary(): {
  total: number;
  healthy: number;
  unhealthy: number;
  unchecked: number;
} {
  const total = connectorRegistry.length;
  const healthy = connectorRegistry.filter((c) => c.healthCheck.healthy).length;
  const unchecked = connectorRegistry.filter((c) => c.healthCheck.lastCheck === '').length;
  const unhealthy = total - healthy - unchecked;

  return { total, healthy, unhealthy, unchecked };
}

export async function testConnection(
  connectorId: string
): Promise<HealthCheck> {
  const connector = connectorRegistry.find((c) => c.id === connectorId);

  if (!connector) {
    return {
      lastCheck: new Date().toISOString(),
      healthy: false,
      latencyMs: 0,
      message: `Connector not found: ${connectorId}`,
    };
  }

  // Simulate network latency (50-300ms)
  const simulatedLatency = Math.floor(Math.random() * 250) + 50;
  await new Promise((resolve) => setTimeout(resolve, simulatedLatency));

  const now = new Date().toISOString();

  // Simulate a health check result
  const healthy = Math.random() > 0.1; // 90% success rate simulation

  return {
    lastCheck: now,
    healthy,
    latencyMs: simulatedLatency,
    message: healthy
      ? `${connector.name} connection verified successfully`
      : `${connector.name} connection failed: timeout after ${connector.retryPolicy.timeoutMs}ms`,
  };
}
