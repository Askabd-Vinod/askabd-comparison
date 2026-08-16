/**
 * AskABD Engineering Intelligence Engine — Core Types & Service
 * Phases 1-12: Detection, Analysis, RCA, Solutions, Code Intelligence,
 * Impact Analysis, Validation, Knowledge, Auto-Remediation, Dashboard, Reporting, Audit
 */

// ─── PHASE 1: ERROR TYPES ──────────────────────────────────────────────────

export type ErrorCategory =
  | 'frontend' | 'backend' | 'build' | 'compilation' | 'runtime' | 'hydration'
  | 'database' | 'api' | 'authentication' | 'authorization' | 'performance'
  | 'memory-leak' | 'deployment' | 'infrastructure' | 'container' | 'kubernetes'
  | 'cloud' | 'network' | 'security';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ─── PHASE 2: ERROR CONTEXT ────────────────────────────────────────────────

export interface ErrorContext {
  timestamp: string;
  environment: string;
  application: string;
  module: string;
  component: string;
  file: string;
  function: string;
  stackTrace: string;
  correlationId: string;
  session: string;
  browser: string;
  os: string;
  framework: string;
  version: string;
  request: string;
  response: string;
  api: string;
  database: string;
  deploymentVersion: string;
  connector: string;
  user: string;
  client: string;
  tenant: string;
  severity: Severity;
  frequency: number;
  businessImpact: string;
}

// ─── PHASE 3: ROOT CAUSE ANALYSIS ──────────────────────────────────────────

export interface RootCauseAnalysis {
  primaryCause: string;
  alternativeCauses: Array<{ cause: string; confidence: number; evidence: string[] }>;
  evidence: string[];
  confidence: number;
  dependencies: string[];
  relatedChanges: string[];
  relatedDeployments: string[];
  relatedIncidents: string[];
  relatedCommits: string[];
  relatedPullRequests: string[];
  relatedRequirements: string[];
  relatedDefects: string[];
  historicalSimilar: string[];
  patternMatching: string[];
}

// ─── PHASE 4: SOLUTION ─────────────────────────────────────────────────────

export interface EngineeringSolution {
  executiveSummary: string;
  problemStatement: string;
  businessImpact: string;
  technicalImpact: string;
  evidence: string[];
  rootCause: string;
  alternativeCauses: string[];
  recommendedFix: string;
  alternativeFixes: Array<{ fix: string; advantages: string[]; disadvantages: string[]; risk: string; effort: string }>;
  advantages: string[];
  disadvantages: string[];
  risk: string;
  estimatedEffort: string;
  owner: string;
  dependencies: string[];
  implementationSteps: string[];
  validationSteps: string[];
  regressionTests: string[];
  rollbackSteps: string[];
  expectedOutcome: string;
  successCriteria: string[];
  confidenceScore: number;
  missingInformation: string[];
  limitations: string[];
  references: string[];
}

// ─── PHASE 5: CODE INTELLIGENCE ────────────────────────────────────────────

export type CodeIssueType =
  | 'invalid-html' | 'nested-links' | 'hydration-problem' | 'react-anti-pattern'
  | 'nextjs-issue' | 'performance-bottleneck' | 'duplicate-logic' | 'dead-code'
  | 'unused-imports' | 'circular-dependency' | 'security-vulnerability'
  | 'accessibility-issue' | 'architecture-violation';

export interface CodeIssue {
  type: CodeIssueType;
  severity: Severity;
  file: string;
  line: number;
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

// ─── PHASE 6: IMPACT ANALYSIS ──────────────────────────────────────────────

export interface ImpactAnalysisResult {
  affectedPages: string[];
  affectedComponents: string[];
  affectedApis: string[];
  affectedDatabaseTables: string[];
  affectedConnectors: string[];
  affectedReports: string[];
  affectedDashboards: string[];
  affectedClients: string[];
  affectedServices: string[];
  affectedContracts: string[];
  affectedWorkflows: string[];
  affectedAutomations: string[];
  regressionRisk: Severity;
  businessRisk: Severity;
}

// ─── PHASE 8: KNOWLEDGE ENGINE ─────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string;
  problem: string;
  evidence: string[];
  rootCause: string;
  solution: string;
  validation: string;
  regression: string;
  owner: string;
  approval: string;
  timeToResolve: string;
  businessImpact: string;
  lessonsLearned: string[];
  tags: string[];
  createdAt: string;
  reusedCount: number;
}

// ─── COMBINED DEFECT RECORD ────────────────────────────────────────────────

export type DefectStatus = 'detected' | 'analysing' | 'rca-complete' | 'solution-proposed' | 'fix-validated' | 'resolved' | 'closed';

export interface EngineeringDefect {
  id: string;
  title: string;
  category: ErrorCategory;
  severity: Severity;
  status: DefectStatus;
  context: ErrorContext;
  rootCause?: RootCauseAnalysis;
  solution?: EngineeringSolution;
  impact?: ImpactAnalysisResult;
  codeIssues?: CodeIssue[];
  knowledgeRef?: string; // ID of knowledge entry if reused
  clientId: string;
  clientName: string;
  detectedAt: string;
  resolvedAt?: string;
  owner: string;
  confidenceScore: number;
  recurring: boolean;
  occurrenceCount: number;
}

// ─── DASHBOARD METRICS ─────────────────────────────────────────────────────

export interface EngineeringMetrics {
  openDefects: number;
  recurringIssues: number;
  avgConfidence: number;
  avgTimeToResolve: string;
  topRootCauses: Array<{ cause: string; count: number }>;
  mostImpactedSystems: Array<{ system: string; defects: number }>;
  technicalDebt: number;
  buildHealth: number;
  deploymentHealth: number;
  codeQuality: number;
  securityFindings: number;
  performanceTrends: 'improving' | 'stable' | 'degrading';
  automationOpportunities: number;
  knowledgeReuse: number;
}

// ─── MOCK DATA GENERATOR ───────────────────────────────────────────────────

export function generateMockDefects(): EngineeringDefect[] {
  return [
    {
      id: 'def-001', title: 'Database connection pool exhausted', category: 'database', severity: 'critical', status: 'solution-proposed',
      context: { timestamp: '2026-08-05T14:30:00Z', environment: 'production', application: 'Trading Portal', module: 'Data Layer', component: 'ConnectionPool', file: 'src/db/pool.ts', function: 'getConnection', stackTrace: 'Error: Pool exhausted at ConnectionPool.acquire()', correlationId: 'corr-9f3a2b', session: 'sess-abc123', browser: 'N/A', os: 'Linux', framework: 'Node.js', version: '20.11.0', request: 'GET /api/v1/trades', response: '503 Service Unavailable', api: '/api/v1/trades', database: 'PostgreSQL 15', deploymentVersion: 'v2.4.1', connector: 'pg-pool', user: 'system', client: 'Meridian Financial Group', tenant: 'meridian', severity: 'critical', frequency: 47, businessImpact: 'Trading operations blocked for 150+ users' },
      rootCause: { primaryCause: 'Connection leak in ORM layer — connections not released after timeout', alternativeCauses: [{ cause: 'Sudden traffic spike exceeding pool capacity', confidence: 25, evidence: ['Traffic 2x normal at incident time'] }, { cause: 'Database server slow to respond', confidence: 15, evidence: ['DB response time normal in metrics'] }], evidence: ['Pool utilization at 100%', 'No connections returned in 5min window', 'ORM query timeout handler missing await'], confidence: 87, dependencies: ['pg-pool', 'prisma-client'], relatedChanges: ['PR #847 — Added new trade query'], relatedDeployments: ['v2.4.1 deployed 2h before incident'], relatedIncidents: ['INC-034 — similar issue 3 months ago'], relatedCommits: ['a3f9b2c'], relatedPullRequests: ['#847'], relatedRequirements: ['REQ-234'], relatedDefects: ['DEF-019'], historicalSimilar: ['Pool exhaustion in Q1 — same root cause'], patternMatching: ['Missing await in async connection handler'] },
      solution: { executiveSummary: 'Add connection timeout and implement connection pool health monitoring', problemStatement: 'Database connections are not being returned to the pool when queries timeout, causing pool exhaustion under normal load', businessImpact: 'Trading operations blocked — estimated $45K/hour revenue impact', technicalImpact: '503 errors on all database-dependent endpoints', evidence: ['Pool utilization metrics', 'ORM source code analysis', 'Historical incident correlation'], rootCause: 'Missing await in connection release handler', alternativeCauses: ['Traffic spike', 'DB latency'], recommendedFix: 'Add connection timeout configuration and fix async handler', alternativeFixes: [{ fix: 'Increase pool size to 100', advantages: ['Quick fix', 'No code change'], disadvantages: ['Masks root cause', 'Higher resource usage'], risk: 'Issue will recur under slightly higher load', effort: '5 minutes' }, { fix: 'Implement connection pool recycling', advantages: ['Prevents all leak scenarios'], disadvantages: ['More complex', 'Brief reconnection delays'], risk: 'Low — standard pattern', effort: '2 hours' }], advantages: ['Fixes root cause', 'Adds monitoring', 'Prevents recurrence'], disadvantages: ['Requires deployment', '~30s pool restart'], risk: 'Low — change is isolated to connection layer', estimatedEffort: '2-4 hours', owner: 'ops@askabd.com', dependencies: ['Database team sign-off'], implementationSteps: ['Add timeout config', 'Fix async handler', 'Add pool health endpoint', 'Deploy with rolling restart'], validationSteps: ['Verify pool utilization < 60%', 'Run load test', 'Confirm no leaked connections over 1h'], regressionTests: ['Connection pool stability test', 'Concurrent query test', 'Timeout handling test'], rollbackSteps: ['Revert to v2.4.0', 'Restart database connections'], expectedOutcome: 'Pool utilization stable at 30-50%, zero exhaustion events', successCriteria: ['Zero pool exhaustion in 7 days', 'p99 latency < 200ms', 'All health checks green'], confidenceScore: 87, missingInformation: ['Exact query causing longest hold'], limitations: ['Cannot prevent all future leaks without connection recycling'], references: ['pg-pool docs', 'INC-034 post-mortem'] },
      impact: { affectedPages: ['/trades', '/portfolio', '/reports'], affectedComponents: ['TradeList', 'PortfolioView', 'ReportGenerator'], affectedApis: ['/api/v1/trades', '/api/v1/portfolio'], affectedDatabaseTables: ['trades', 'positions', 'accounts'], affectedConnectors: ['pg-pool'], affectedReports: ['Trading Activity Report'], affectedDashboards: ['Trading Dashboard'], affectedClients: ['Meridian Financial Group'], affectedServices: ['Trading Portal', 'Risk Dashboard'], affectedContracts: ['Platform Operations SOW'], affectedWorkflows: ['Trade Execution'], affectedAutomations: ['Auto-reconciliation'], regressionRisk: 'low', businessRisk: 'critical' },
      clientId: 'meridian-financial', clientName: 'Meridian Financial Group', detectedAt: '2026-08-05T14:30:00Z', owner: 'ops@askabd.com', confidenceScore: 87, recurring: true, occurrenceCount: 3,
    },
    {
      id: 'def-002', title: 'React hydration mismatch on Patient Portal', category: 'hydration', severity: 'high', status: 'rca-complete',
      context: { timestamp: '2026-08-05T09:15:00Z', environment: 'production', application: 'Patient Portal', module: 'UI', component: 'AppointmentCalendar', file: 'src/components/calendar.tsx', function: 'AppointmentCalendar', stackTrace: 'Hydration failed: server HTML differs from client render', correlationId: 'corr-7d2e4a', session: 'sess-med456', browser: 'Chrome 126', os: 'Windows 11', framework: 'Next.js 15', version: '15.0.3', request: 'GET /appointments', response: '200 OK (with hydration error)', api: 'N/A', database: 'N/A', deploymentVersion: 'v1.8.0', connector: 'N/A', user: 'patient-user', client: 'Nexus Healthcare Systems', tenant: 'nexus', severity: 'high', frequency: 234, businessImpact: 'Calendar not interactive for 15% of users' },
      rootCause: { primaryCause: 'Date formatting using locale-dependent new Date() during SSR produces different output than client', alternativeCauses: [{ cause: 'Browser timezone mismatch', confidence: 30, evidence: ['Error more common in non-AU timezones'] }], evidence: ['Server renders "5 Aug" while client renders "08/05"', 'Date.toLocaleDateString() output varies'], confidence: 92, dependencies: ['date-fns', 'Next.js SSR'], relatedChanges: ['PR #312 — Added locale formatting'], relatedDeployments: ['v1.8.0'], relatedIncidents: [], relatedCommits: ['e7d1a4f'], relatedPullRequests: ['#312'], relatedRequirements: [], relatedDefects: [], historicalSimilar: ['Hydration issues with dates are a known Next.js pattern'], patternMatching: ['SSR/client date mismatch'] },
      clientId: 'nexus-healthcare', clientName: 'Nexus Healthcare Systems', detectedAt: '2026-08-05T09:15:00Z', owner: 'hello@askabd.com', confidenceScore: 92, recurring: false, occurrenceCount: 234,
    },
    {
      id: 'def-003', title: 'API authentication token refresh race condition', category: 'authentication', severity: 'high', status: 'detected',
      context: { timestamp: '2026-08-06T03:00:00Z', environment: 'production', application: 'Fleet Tracker', module: 'Auth', component: 'TokenRefresher', file: 'src/auth/refresh.ts', function: 'refreshToken', stackTrace: 'Error: 401 Unauthorized — Token expired during refresh', correlationId: 'corr-auth-99', session: 'sess-fleet789', browser: 'N/A', os: 'Linux', framework: 'Node.js', version: '20.11.0', request: 'POST /auth/refresh', response: '401 Unauthorized', api: '/auth/refresh', database: 'Redis', deploymentVersion: 'v3.2.0', connector: 'ioredis', user: 'fleet-service', client: 'Atlas Logistics International', tenant: 'atlas', severity: 'high', frequency: 12, businessImpact: 'Intermittent auth failures during token rotation window' },
      clientId: 'atlas-logistics', clientName: 'Atlas Logistics International', detectedAt: '2026-08-06T03:00:00Z', owner: 'ops@askabd.com', confidenceScore: 0, recurring: true, occurrenceCount: 12,
    },
    {
      id: 'def-004', title: 'Memory leak in WebSocket connection handler', category: 'memory-leak', severity: 'medium', status: 'analysing',
      context: { timestamp: '2026-08-04T18:00:00Z', environment: 'staging', application: 'Risk Dashboard', module: 'WebSocket', component: 'WSHandler', file: 'src/ws/handler.ts', function: 'onMessage', stackTrace: 'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed', correlationId: 'corr-mem-44', session: 'N/A', browser: 'N/A', os: 'Linux', framework: 'Node.js', version: '20.11.0', request: 'WS /ws/risk-feed', response: 'Connection reset', api: '/ws/risk-feed', database: 'N/A', deploymentVersion: 'v2.3.5', connector: 'ws', user: 'system', client: 'Meridian Financial Group', tenant: 'meridian', severity: 'medium', frequency: 3, businessImpact: 'Risk feed disconnects every ~8 hours requiring manual restart' },
      clientId: 'meridian-financial', clientName: 'Meridian Financial Group', detectedAt: '2026-08-04T18:00:00Z', owner: 'ops@askabd.com', confidenceScore: 45, recurring: true, occurrenceCount: 3,
    },
    {
      id: 'def-005', title: 'Kubernetes pod CrashLoopBackOff — OOM Killed', category: 'kubernetes', severity: 'critical', status: 'detected',
      context: { timestamp: '2026-08-06T06:30:00Z', environment: 'production', application: 'Warehouse Manager', module: 'Container', component: 'worker-pod', file: 'k8s/deployments/worker.yaml', function: 'N/A', stackTrace: 'OOMKilled: Container exceeded memory limit (512Mi)', correlationId: 'corr-k8s-12', session: 'N/A', browser: 'N/A', os: 'Linux', framework: 'Docker', version: '24.0', request: 'N/A', response: 'N/A', api: 'N/A', database: 'N/A', deploymentVersion: 'v1.5.2', connector: 'N/A', user: 'system', client: 'Atlas Logistics International', tenant: 'atlas', severity: 'critical', frequency: 8, businessImpact: 'Warehouse processing queue backing up — orders delayed' },
      clientId: 'atlas-logistics', clientName: 'Atlas Logistics International', detectedAt: '2026-08-06T06:30:00Z', owner: 'ops@askabd.com', confidenceScore: 0, recurring: true, occurrenceCount: 8,
    },
  ];
}

export function generateMockMetrics(): EngineeringMetrics {
  return {
    openDefects: 5,
    recurringIssues: 3,
    avgConfidence: 72,
    avgTimeToResolve: '4.2 hours',
    topRootCauses: [
      { cause: 'Connection pool exhaustion', count: 3 },
      { cause: 'Memory leaks', count: 2 },
      { cause: 'Authentication race conditions', count: 2 },
      { cause: 'Hydration mismatches', count: 1 },
      { cause: 'Container OOM', count: 1 },
    ],
    mostImpactedSystems: [
      { system: 'Trading Portal', defects: 3 },
      { system: 'Fleet Tracker', defects: 2 },
      { system: 'Patient Portal', defects: 1 },
      { system: 'Warehouse Manager', defects: 1 },
    ],
    technicalDebt: 34,
    buildHealth: 96,
    deploymentHealth: 88,
    codeQuality: 82,
    securityFindings: 7,
    performanceTrends: 'stable',
    automationOpportunities: 12,
    knowledgeReuse: 4,
  };
}
