import { Client, HealthStatus, Environment, Deployment, Incident, Alert, AuditEntry, InfrastructureInfo, ServiceInfo } from './types';

function makeEnv(
  name: 'development' | 'staging' | 'production',
  status: HealthStatus,
  version: string,
  build: string,
  deployment: string,
): Environment {
  return {
    name, status, version, build,
    release: `r${build.replace('#', '')}`,
    database: status, api: status, frontend: status, backend: status,
    redis: status, storage: status, scheduler: status,
    workers: status === 'offline' ? 0 : status === 'critical' ? 2 : 8,
    services: status, health: status,
    latency: status === 'healthy' ? 42 : status === 'warning' ? 180 : 1200,
    availability: status === 'healthy' ? 99.99 : status === 'warning' ? 99.5 : 94.0,
    deployment,
    lastSync: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    lastDeployment: deployment,
    lastBackup: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  };
}

function makeInfra(scale: number): InfrastructureInfo {
  return {
    servers: scale * 3, containers: scale * 12, pods: scale * 8,
    namespaces: scale * 2, ingress: scale, loadBalancers: scale,
    certificates: scale * 4, domains: scale * 2,
    cpuTotal: scale * 16, cpuUsed: Math.round(scale * 16 * 0.4),
    memoryTotal: scale * 64, memoryUsed: Math.round(scale * 64 * 0.6),
    diskTotal: scale * 500, diskUsed: Math.round(scale * 500 * 0.45),
  };
}

function makeDeployments(clientId: string): Deployment[] {
  return [
    { id: `${clientId}-dep-1`, version: '2.4.1', previousVersion: '2.4.0', buildNumber: '#1847', gitCommit: 'a3f9b2c', pipeline: 'main', status: 'success', duration: '4m 32s', engineer: 'ops@askabd.com', environment: 'development', timestamp: '2026-08-03T08:00:00Z' },
    { id: `${clientId}-dep-2`, version: '2.4.0', previousVersion: '2.3.9', buildNumber: '#1842', gitCommit: 'e7d1a4f', pipeline: 'release/2.4', status: 'success', duration: '5m 11s', engineer: 'hello@askabd.com', environment: 'staging', timestamp: '2026-08-02T14:00:00Z' },
    { id: `${clientId}-dep-3`, version: '2.3.8', previousVersion: '2.3.7', buildNumber: '#1835', gitCommit: 'c2b8e1d', pipeline: 'release/2.3', status: 'success', duration: '6m 02s', engineer: 'hello@askabd.com', environment: 'production', timestamp: '2026-08-01T22:00:00Z' },
  ];
}

function makeIncidents(clientId: string, count: number): Incident[] {
  if (count === 0) return [];
  const incidents: Incident[] = [];
  if (count >= 1) incidents.push({ id: `${clientId}-inc-1`, title: 'Database connection pool exhausted', severity: 'critical', status: 'open', assignedEngineer: 'hello@askabd.com', rootCause: 'Connection leak in ORM layer', resolution: '', createdAt: '2026-08-03T06:00:00Z', resolvedAt: '' });
  if (count >= 2) incidents.push({ id: `${clientId}-inc-2`, title: 'API latency spike > 2s', severity: 'major', status: 'investigating', assignedEngineer: 'ops@askabd.com', rootCause: 'Cache invalidation storm', resolution: '', createdAt: '2026-08-02T18:00:00Z', resolvedAt: '' });
  if (count >= 3) incidents.push({ id: `${clientId}-inc-3`, title: 'SSL certificate expiry warning', severity: 'minor', status: 'resolved', assignedEngineer: 'hello@askabd.com', rootCause: 'Auto-renewal misconfiguration', resolution: 'Renewed certificate and fixed renewal job', createdAt: '2026-08-01T10:00:00Z', resolvedAt: '2026-08-01T11:30:00Z' });
  return incidents;
}

function makeAlerts(clientId: string, health: HealthStatus): Alert[] {
  const alerts: Alert[] = [];
  if (health === 'critical' || health === 'warning') {
    alerts.push({ id: `${clientId}-alert-1`, title: 'High CPU utilization', severity: 'warning', status: 'active', timestamp: '2026-08-03T09:00:00Z', source: 'monitoring' });
    alerts.push({ id: `${clientId}-alert-2`, title: 'Memory threshold exceeded', severity: 'critical', status: 'acknowledged', timestamp: '2026-08-03T08:30:00Z', source: 'infrastructure' });
  }
  if (health === 'critical') {
    alerts.push({ id: `${clientId}-alert-3`, title: 'Service degradation detected', severity: 'critical', status: 'active', timestamp: '2026-08-03T07:00:00Z', source: 'health-check' });
  }
  return alerts;
}

function makeAudit(clientId: string): AuditEntry[] {
  return [
    { id: `${clientId}-audit-1`, who: 'hello@askabd.com', what: 'Deployed v2.4.1 to development', when: '2026-08-03T08:00:00Z', oldValue: 'v2.4.0', newValue: 'v2.4.1', correlationId: 'cor-a1b2c3', ip: '10.0.1.50', environment: 'development' },
    { id: `${clientId}-audit-2`, who: 'ops@askabd.com', what: 'Updated feature flag: dark-mode', when: '2026-08-02T16:00:00Z', oldValue: 'false', newValue: 'true', correlationId: 'cor-d4e5f6', ip: '10.0.1.51', environment: 'staging' },
    { id: `${clientId}-audit-3`, who: 'hello@askabd.com', what: 'Scaled workers from 6 to 8', when: '2026-08-01T14:00:00Z', oldValue: '6', newValue: '8', correlationId: 'cor-g7h8i9', ip: '10.0.1.50', environment: 'production' },
  ];
}

function makeServices(names: string[]): ServiceInfo[] {
  return names.map((name, i) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    status: (i < names.length - 1 ? 'healthy' : 'healthy') as HealthStatus,
    version: `${Math.floor(Math.random() * 4) + 1}.${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 9)}`,
    uptime: `${(99 + Math.random()).toFixed(2)}%`,
    description: `${name} service for client operations`,
  }));
}

export const mockClients: Client[] = [
  {
    id: 'meridian-financial', name: 'Meridian Financial Group', logo: 'MF',
    industry: 'Financial Services', health: 'healthy', slaStatus: 'compliant',
    activeServices: ['Comparison Platform', 'Identity Platform', 'Workflow Platform', 'Analytics Platform', 'Reporting Platform'],
    applications: ['Trading Portal', 'Risk Dashboard', 'Client Onboarding'],
    environments: {
      development: makeEnv('development', 'healthy', '2.4.1', '#1847', '2026-08-01T09:30:00Z'),
      staging: makeEnv('staging', 'healthy', '2.4.0', '#1842', '2026-07-30T14:00:00Z'),
      production: makeEnv('production', 'healthy', '2.3.8', '#1835', '2026-07-28T22:00:00Z'),
    },
    lastDeployment: '2026-08-01T09:30:00Z', lastBackup: '2026-08-03T02:00:00Z', lastHeartbeat: '2026-08-03T10:14:00Z',
    activeIncidents: 0, openServiceRequests: 2, platformScore: 98, primaryContact: 'j.harrison@meridian.com',
    monitoring: { frontend: 'healthy', backend: 'healthy', database: 'healthy', api: 'healthy', cpu: 34, memory: 62, disk: 45, latency: 42, availability: 99.99, errorRate: 0.02, apiSuccess: 99.98, apiFailure: 0.02, queue: 3, scheduler: 'healthy', workers: 8, connections: 245, bandwidth: 120, traffic: 15000, threadCount: 64 },
    infrastructure: makeInfra(4),
    services: makeServices(['Comparison Platform', 'Identity Platform', 'Workflow Platform', 'Analytics Platform', 'Reporting Platform']),
    deployments: makeDeployments('meridian-financial'),
    incidents: makeIncidents('meridian-financial', 0),
    alerts: makeAlerts('meridian-financial', 'healthy'),
    auditLog: makeAudit('meridian-financial'),
  },

  {
    id: 'nexus-healthcare', name: 'Nexus Healthcare Systems', logo: 'NH',
    industry: 'Healthcare', health: 'warning', slaStatus: 'at-risk',
    activeServices: ['Comparison Platform', 'Identity Platform', 'Assessment Platform', 'Notification Platform', 'Audit Platform'],
    applications: ['Patient Portal', 'Clinical Dashboard', 'Appointment Scheduler'],
    environments: {
      development: makeEnv('development', 'healthy', '1.9.3', '#982', '2026-08-02T11:00:00Z'),
      staging: makeEnv('staging', 'warning', '1.9.2', '#978', '2026-07-31T16:00:00Z'),
      production: makeEnv('production', 'warning', '1.9.1', '#975', '2026-07-29T20:00:00Z'),
    },
    lastDeployment: '2026-08-02T11:00:00Z', lastBackup: '2026-08-03T01:30:00Z', lastHeartbeat: '2026-08-03T10:12:00Z',
    activeIncidents: 1, openServiceRequests: 5, platformScore: 82, primaryContact: 's.chen@nexushealth.com',
    monitoring: { frontend: 'healthy', backend: 'warning', database: 'healthy', api: 'warning', cpu: 72, memory: 81, disk: 58, latency: 185, availability: 99.5, errorRate: 1.2, apiSuccess: 98.8, apiFailure: 1.2, queue: 24, scheduler: 'healthy', workers: 6, connections: 189, bandwidth: 85, traffic: 8500, threadCount: 48 },
    infrastructure: makeInfra(3),
    services: makeServices(['Comparison Platform', 'Identity Platform', 'Assessment Platform', 'Notification Platform', 'Audit Platform']),
    deployments: makeDeployments('nexus-healthcare'),
    incidents: makeIncidents('nexus-healthcare', 1),
    alerts: makeAlerts('nexus-healthcare', 'warning'),
    auditLog: makeAudit('nexus-healthcare'),
  },
  {
    id: 'atlas-logistics', name: 'Atlas Logistics International', logo: 'AL',
    industry: 'Logistics', health: 'healthy', slaStatus: 'compliant',
    activeServices: ['Workflow Platform', 'Monitoring Platform', 'API Gateway', 'Notification Platform', 'Payment Platform'],
    applications: ['Fleet Tracker', 'Warehouse Manager', 'Route Optimizer'],
    environments: {
      development: makeEnv('development', 'healthy', '3.2.0', '#2104', '2026-08-03T08:00:00Z'),
      staging: makeEnv('staging', 'healthy', '3.1.9', '#2098', '2026-08-02T10:00:00Z'),
      production: makeEnv('production', 'healthy', '3.1.8', '#2091', '2026-08-01T18:00:00Z'),
    },
    lastDeployment: '2026-08-03T08:00:00Z', lastBackup: '2026-08-03T03:00:00Z', lastHeartbeat: '2026-08-03T10:15:00Z',
    activeIncidents: 0, openServiceRequests: 1, platformScore: 96, primaryContact: 'm.okafor@atlaslog.com',
    monitoring: { frontend: 'healthy', backend: 'healthy', database: 'healthy', api: 'healthy', cpu: 28, memory: 55, disk: 39, latency: 38, availability: 99.99, errorRate: 0.01, apiSuccess: 99.99, apiFailure: 0.01, queue: 1, scheduler: 'healthy', workers: 12, connections: 312, bandwidth: 200, traffic: 22000, threadCount: 96 },
    infrastructure: makeInfra(5),
    services: makeServices(['Workflow Platform', 'Monitoring Platform', 'API Gateway', 'Notification Platform', 'Payment Platform']),
    deployments: makeDeployments('atlas-logistics'),
    incidents: makeIncidents('atlas-logistics', 0),
    alerts: makeAlerts('atlas-logistics', 'healthy'),
    auditLog: makeAudit('atlas-logistics'),
  },

  {
    id: 'pinnacle-education', name: 'Pinnacle Education Group', logo: 'PE',
    industry: 'Education', health: 'critical', slaStatus: 'breached',
    activeServices: ['Comparison Platform', 'Assessment Platform', 'Identity Platform', 'Reporting Platform'],
    applications: ['Student Portal', 'Course Manager', 'Exam System'],
    environments: {
      development: makeEnv('development', 'healthy', '1.2.5', '#412', '2026-08-01T14:00:00Z'),
      staging: makeEnv('staging', 'healthy', '1.2.4', '#409', '2026-07-30T12:00:00Z'),
      production: makeEnv('production', 'critical', '1.2.3', '#405', '2026-07-27T19:00:00Z'),
    },
    lastDeployment: '2026-08-01T14:00:00Z', lastBackup: '2026-08-03T01:00:00Z', lastHeartbeat: '2026-08-03T09:45:00Z',
    activeIncidents: 3, openServiceRequests: 8, platformScore: 54, primaryContact: 'r.williams@pinnacle-edu.com',
    monitoring: { frontend: 'healthy', backend: 'critical', database: 'critical', api: 'warning', cpu: 92, memory: 94, disk: 87, latency: 1240, availability: 94.2, errorRate: 8.5, apiSuccess: 91.5, apiFailure: 8.5, queue: 156, scheduler: 'warning', workers: 2, connections: 45, bandwidth: 20, traffic: 2100, threadCount: 16 },
    infrastructure: makeInfra(2),
    services: makeServices(['Comparison Platform', 'Assessment Platform', 'Identity Platform', 'Reporting Platform']),
    deployments: makeDeployments('pinnacle-education'),
    incidents: makeIncidents('pinnacle-education', 3),
    alerts: makeAlerts('pinnacle-education', 'critical'),
    auditLog: makeAudit('pinnacle-education'),
  },
  {
    id: 'sovereign-insurance', name: 'Sovereign Insurance Corp', logo: 'SI',
    industry: 'Insurance', health: 'healthy', slaStatus: 'compliant',
    activeServices: ['Comparison Platform', 'Workflow Platform', 'Analytics Platform', 'Payment Platform', 'Audit Platform', 'API Gateway'],
    applications: ['Claims Portal', 'Underwriting Engine', 'Policy Manager'],
    environments: {
      development: makeEnv('development', 'healthy', '4.1.0', '#3201', '2026-08-03T07:00:00Z'),
      staging: makeEnv('staging', 'healthy', '4.0.9', '#3195', '2026-08-02T09:00:00Z'),
      production: makeEnv('production', 'healthy', '4.0.8', '#3188', '2026-08-01T21:00:00Z'),
    },
    lastDeployment: '2026-08-03T07:00:00Z', lastBackup: '2026-08-03T04:00:00Z', lastHeartbeat: '2026-08-03T10:15:00Z',
    activeIncidents: 0, openServiceRequests: 0, platformScore: 99, primaryContact: 'l.patel@sovereign.com',
    monitoring: { frontend: 'healthy', backend: 'healthy', database: 'healthy', api: 'healthy', cpu: 22, memory: 48, disk: 31, latency: 28, availability: 99.99, errorRate: 0.005, apiSuccess: 99.99, apiFailure: 0.005, queue: 0, scheduler: 'healthy', workers: 16, connections: 410, bandwidth: 250, traffic: 31000, threadCount: 128 },
    infrastructure: makeInfra(6),
    services: makeServices(['Comparison Platform', 'Workflow Platform', 'Analytics Platform', 'Payment Platform', 'Audit Platform', 'API Gateway']),
    deployments: makeDeployments('sovereign-insurance'),
    incidents: makeIncidents('sovereign-insurance', 0),
    alerts: makeAlerts('sovereign-insurance', 'healthy'),
    auditLog: makeAudit('sovereign-insurance'),
  },

  {
    id: 'vanguard-retail', name: 'Vanguard Retail Solutions', logo: 'VR',
    industry: 'Retail', health: 'offline', slaStatus: 'breached',
    activeServices: ['Comparison Platform', 'Payment Platform', 'Notification Platform'],
    applications: ['E-Commerce Platform', 'Inventory Manager'],
    environments: {
      development: makeEnv('development', 'healthy', '0.9.2', '#187', '2026-07-28T10:00:00Z'),
      staging: makeEnv('staging', 'offline', '0.9.1', '#184', '2026-07-25T11:00:00Z'),
      production: makeEnv('production', 'offline', '0.9.0', '#180', '2026-07-20T15:00:00Z'),
    },
    lastDeployment: '2026-07-28T10:00:00Z', lastBackup: '2026-07-31T02:00:00Z', lastHeartbeat: '2026-07-31T23:59:00Z',
    activeIncidents: 2, openServiceRequests: 12, platformScore: 0, primaryContact: 'a.martinez@vanguard-retail.com',
    monitoring: { frontend: 'offline', backend: 'offline', database: 'offline', api: 'offline', cpu: 0, memory: 0, disk: 0, latency: 0, availability: 0, errorRate: 0, apiSuccess: 0, apiFailure: 0, queue: 0, scheduler: 'offline', workers: 0, connections: 0, bandwidth: 0, traffic: 0, threadCount: 0 },
    infrastructure: makeInfra(1),
    services: makeServices(['Comparison Platform', 'Payment Platform', 'Notification Platform']),
    deployments: makeDeployments('vanguard-retail'),
    incidents: makeIncidents('vanguard-retail', 2),
    alerts: makeAlerts('vanguard-retail', 'offline'),
    auditLog: makeAudit('vanguard-retail'),
  },
  {
    id: 'beacon-energy', name: 'Beacon Energy Partners', logo: 'BE',
    industry: 'Energy', health: 'healthy', slaStatus: 'compliant',
    activeServices: ['Workflow Platform', 'Monitoring Platform', 'Analytics Platform', 'Reporting Platform', 'Audit Platform'],
    applications: ['Grid Monitor', 'Energy Trading', 'Asset Manager'],
    environments: {
      development: makeEnv('development', 'healthy', '2.0.1', '#890', '2026-08-02T16:00:00Z'),
      staging: makeEnv('staging', 'healthy', '2.0.0', '#885', '2026-08-01T13:00:00Z'),
      production: makeEnv('production', 'healthy', '1.9.9', '#880', '2026-07-31T20:00:00Z'),
    },
    lastDeployment: '2026-08-02T16:00:00Z', lastBackup: '2026-08-03T03:30:00Z', lastHeartbeat: '2026-08-03T10:14:00Z',
    activeIncidents: 0, openServiceRequests: 3, platformScore: 94, primaryContact: 'k.johansson@beacon-energy.com',
    monitoring: { frontend: 'healthy', backend: 'healthy', database: 'healthy', api: 'healthy', cpu: 41, memory: 59, disk: 52, latency: 55, availability: 99.98, errorRate: 0.08, apiSuccess: 99.92, apiFailure: 0.08, queue: 7, scheduler: 'healthy', workers: 10, connections: 280, bandwidth: 160, traffic: 18000, threadCount: 80 },
    infrastructure: makeInfra(4),
    services: makeServices(['Workflow Platform', 'Monitoring Platform', 'Analytics Platform', 'Reporting Platform', 'Audit Platform']),
    deployments: makeDeployments('beacon-energy'),
    incidents: makeIncidents('beacon-energy', 0),
    alerts: makeAlerts('beacon-energy', 'healthy'),
    auditLog: makeAudit('beacon-energy'),
  },
  {
    id: 'horizon-telecom', name: 'Horizon Telecommunications', logo: 'HT',
    industry: 'Telecommunications', health: 'warning', slaStatus: 'at-risk',
    activeServices: ['Comparison Platform', 'Identity Platform', 'Workflow Platform', 'Monitoring Platform', 'API Gateway', 'Notification Platform'],
    applications: ['Network Dashboard', 'Subscriber Portal', 'Billing System'],
    environments: {
      development: makeEnv('development', 'healthy', '5.3.0', '#4502', '2026-08-03T06:00:00Z'),
      staging: makeEnv('staging', 'warning', '5.2.9', '#4498', '2026-08-02T14:00:00Z'),
      production: makeEnv('production', 'warning', '5.2.8', '#4491', '2026-08-01T23:00:00Z'),
    },
    lastDeployment: '2026-08-03T06:00:00Z', lastBackup: '2026-08-03T02:30:00Z', lastHeartbeat: '2026-08-03T10:13:00Z',
    activeIncidents: 1, openServiceRequests: 4, platformScore: 85, primaryContact: 'n.garcia@horizon-tel.com',
    monitoring: { frontend: 'healthy', backend: 'healthy', database: 'warning', api: 'healthy', cpu: 65, memory: 73, disk: 68, latency: 120, availability: 99.7, errorRate: 0.8, apiSuccess: 99.2, apiFailure: 0.8, queue: 18, scheduler: 'healthy', workers: 8, connections: 350, bandwidth: 180, traffic: 25000, threadCount: 72 },
    infrastructure: makeInfra(5),
    services: makeServices(['Comparison Platform', 'Identity Platform', 'Workflow Platform', 'Monitoring Platform', 'API Gateway', 'Notification Platform']),
    deployments: makeDeployments('horizon-telecom'),
    incidents: makeIncidents('horizon-telecom', 1),
    alerts: makeAlerts('horizon-telecom', 'warning'),
    auditLog: makeAudit('horizon-telecom'),
  },
];

export const platformServices: import('./types').PlatformService[] = [
  { id: 'comparison-platform', name: 'Comparison Platform', description: 'Enterprise comparison engine for products, services, and pricing', status: 'healthy', version: '4.0.8', clientCount: 6 },
  { id: 'identity-platform', name: 'Identity Platform', description: 'Universal identity, authentication, and authorization', status: 'healthy', version: '2.0.1', clientCount: 5 },
  { id: 'workflow-platform', name: 'Workflow Platform', description: 'Business process automation and rules engine', status: 'healthy', version: '2.4.1', clientCount: 5 },
  { id: 'notification-platform', name: 'Notification Platform', description: 'Multi-channel notification delivery', status: 'warning', version: '1.5.1', clientCount: 4 },
  { id: 'analytics-platform', name: 'Analytics Platform', description: 'Business intelligence and data analytics', status: 'healthy', version: '3.2.0', clientCount: 4 },
  { id: 'assessment-platform', name: 'Assessment Platform', description: 'Evaluation and assessment framework', status: 'healthy', version: '2.1.0', clientCount: 2 },
  { id: 'reporting-platform', name: 'Reporting Platform', description: 'Enterprise reporting and document generation', status: 'healthy', version: '2.0.1', clientCount: 4 },
  { id: 'monitoring-platform', name: 'Monitoring Platform', description: 'Infrastructure and application monitoring', status: 'healthy', version: '2.2.0', clientCount: 4 },
  { id: 'audit-platform', name: 'Audit Platform', description: 'Compliance audit trail and log management', status: 'healthy', version: '1.2.0', clientCount: 4 },
  { id: 'api-gateway', name: 'API Gateway', description: 'Centralized API management and routing', status: 'healthy', version: '4.1.2', clientCount: 4 },
  { id: 'search-platform', name: 'Search Platform', description: 'Full-text search and discovery', status: 'healthy', version: '1.3.0', clientCount: 3 },
  { id: 'recommendation-platform', name: 'Recommendation Platform', description: 'ML-powered recommendation engine', status: 'healthy', version: '1.1.0', clientCount: 2 },
  { id: 'decision-platform', name: 'Decision Platform', description: 'AI-powered decision support', status: 'healthy', version: '0.9.0', clientCount: 1 },
  { id: 'localization-platform', name: 'Localization Platform', description: 'Multi-language and locale management', status: 'healthy', version: '1.0.2', clientCount: 3 },
  { id: 'configuration-platform', name: 'Configuration Platform', description: 'Remote configuration management', status: 'healthy', version: '1.4.0', clientCount: 5 },
  { id: 'document-platform', name: 'Document Platform', description: 'Document generation and management', status: 'healthy', version: '1.2.1', clientCount: 3 },
  { id: 'payment-platform', name: 'Payment Platform', description: 'Payment processing and billing', status: 'healthy', version: '3.1.0', clientCount: 3 },
  { id: 'wallet-platform', name: 'Wallet Platform', description: 'Digital wallet and balance management', status: 'healthy', version: '1.0.0', clientCount: 1 },
];
