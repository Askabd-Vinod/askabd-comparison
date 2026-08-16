/**
 * AskABD Enterprise Operations Center — Core Types
 */

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'offline';

export type EnvironmentName = 'development' | 'staging' | 'production';

export type Environment = {
  name: EnvironmentName;
  status: HealthStatus;
  version: string;
  build: string;
  release: string;
  database: HealthStatus;
  api: HealthStatus;
  frontend: HealthStatus;
  backend: HealthStatus;
  redis: HealthStatus;
  storage: HealthStatus;
  scheduler: HealthStatus;
  workers: number;
  services: HealthStatus;
  health: HealthStatus;
  latency: number;
  availability: number;
  deployment: string;
  lastSync: string;
  lastDeployment: string;
  lastBackup: string;
};

export type ServiceInfo = {
  id: string;
  name: string;
  status: HealthStatus;
  version: string;
  uptime: string;
  description: string;
};

export type MonitoringMetrics = {
  frontend: HealthStatus;
  backend: HealthStatus;
  database: HealthStatus;
  api: HealthStatus;
  cpu: number;
  memory: number;
  disk: number;
  latency: number;
  availability: number;
  errorRate: number;
  apiSuccess: number;
  apiFailure: number;
  queue: number;
  scheduler: HealthStatus;
  workers: number;
  connections: number;
  bandwidth: number;
  traffic: number;
  threadCount: number;
};

export type InfrastructureInfo = {
  servers: number;
  containers: number;
  pods: number;
  namespaces: number;
  ingress: number;
  loadBalancers: number;
  certificates: number;
  domains: number;
  cpuTotal: number;
  cpuUsed: number;
  memoryTotal: number;
  memoryUsed: number;
  diskTotal: number;
  diskUsed: number;
};

export type Deployment = {
  id: string;
  version: string;
  previousVersion: string;
  buildNumber: string;
  gitCommit: string;
  pipeline: string;
  status: 'success' | 'failed' | 'rolling-back' | 'in-progress';
  duration: string;
  engineer: string;
  environment: EnvironmentName;
  timestamp: string;
};

export type Incident = {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  assignedEngineer: string;
  rootCause: string;
  resolution: string;
  createdAt: string;
  resolvedAt: string;
};

export type Alert = {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'information';
  status: 'active' | 'acknowledged' | 'resolved';
  timestamp: string;
  source: string;
};

export type AuditEntry = {
  id: string;
  who: string;
  what: string;
  when: string;
  oldValue: string;
  newValue: string;
  correlationId: string;
  ip: string;
  environment: EnvironmentName;
};

export type Client = {
  id: string;
  name: string;
  logo: string;
  industry: string;
  health: HealthStatus;
  slaStatus: 'compliant' | 'at-risk' | 'breached';
  activeServices: string[];
  applications: string[];
  environments: {
    development: Environment;
    staging: Environment;
    production: Environment;
  };
  lastDeployment: string;
  lastBackup: string;
  lastHeartbeat: string;
  activeIncidents: number;
  openServiceRequests: number;
  platformScore: number;
  primaryContact: string;
  monitoring: MonitoringMetrics;
  infrastructure: InfrastructureInfo;
  services: ServiceInfo[];
  deployments: Deployment[];
  incidents: Incident[];
  alerts: Alert[];
  auditLog: AuditEntry[];
};

export type PlatformService = {
  id: string;
  name: string;
  description: string;
  status: HealthStatus;
  version: string;
  clientCount: number;
};
