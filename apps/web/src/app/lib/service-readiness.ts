/**
 * AskABD Service Readiness Engine
 * Maps lifecycle stages to actual service requirements, connector needs,
 * client actions, and AskABD actions.
 * 
 * This is NOT another lifecycle engine. It CONSUMES the canonical lifecycle
 * from onboarding-lifecycle.ts and provides the service delivery layer.
 * 
 * Single source of truth for: "What does this client need NOW?"
 */

import { type LifecycleStatus, statusMeta } from './onboarding-lifecycle';

export type ActionOwner = 'client' | 'askabd' | 'automatic' | 'approval';
export type ServiceStatus = 'not-started' | 'ready' | 'in-progress' | 'blocked' | 'completed' | 'failed';

export interface RequiredConnector {
  connectorType: string;
  provider: string;
  purpose: string;
  securityLevel: 'read-only' | 'read-write' | 'admin';
  requiredFields: { field: string; label: string; placeholder: string; sensitive: boolean }[];
  validationSteps: string[];
  whyNeeded: string;
}

export interface ServiceRequirement {
  serviceId: string;
  serviceName: string;
  description: string;
  lifecycleStatus: LifecycleStatus;
  owner: ActionOwner;
  clientRequired: string[];
  askabdRequired: string[];
  requiredConnectors: RequiredConnector[];
  requiredInputs: string[];
  validationChecks: { id: string; label: string; description: string }[];
  successCriteria: string;
  expectedOutput: string[];
  blockingConditions: string[];
  securityNote: string;
  estimatedDuration: string;
}

export interface ClientDeliveryStatus {
  clientId: string;
  clientName: string;
  currentStatus: LifecycleStatus;
  currentService: ServiceRequirement | null;
  completedServices: ServiceRequirement[];
  pendingServices: ServiceRequirement[];
  blockedReason: string | null;
  clientActions: string[];
  askabdActions: string[];
  nextService: ServiceRequirement | null;
  progress: number;
  currentOwner: ActionOwner;
}

// ─── CONNECTOR REQUIREMENT DEFINITIONS ───────────────────────────────────────

export const connectorRequirements: Record<string, RequiredConnector> = {
  postgresql: {
    connectorType: 'database', provider: 'PostgreSQL',
    purpose: 'Database discovery, schema analysis, and migration',
    securityLevel: 'read-only',
    requiredFields: [
      { field: 'host', label: 'Host', placeholder: 'db.example.com', sensitive: false },
      { field: 'port', label: 'Port', placeholder: '5432', sensitive: false },
      { field: 'database', label: 'Database Name', placeholder: 'production_db', sensitive: false },
      { field: 'username', label: 'Username', placeholder: 'readonly_user', sensitive: false },
      { field: 'password', label: 'Password', placeholder: '••••••••', sensitive: true },
      { field: 'ssl', label: 'SSL Mode', placeholder: 'require', sensitive: false },
    ],
    validationSteps: ['DNS resolution', 'Port accessibility', 'TCP connectivity', 'TLS/SSL handshake', 'Authentication', 'Database access', 'Read permission', 'Query execution', 'Latency check'],
    whyNeeded: 'AskABD needs read-only access to discover database schemas, tables, views, indexes, and data volumes for assessment and migration planning.',
  },
  aws: {
    connectorType: 'cloud', provider: 'AWS',
    purpose: 'Cloud resource discovery, infrastructure assessment, and migration',
    securityLevel: 'read-only',
    requiredFields: [
      { field: 'accountId', label: 'AWS Account ID', placeholder: '123456789012', sensitive: false },
      { field: 'region', label: 'Primary Region', placeholder: 'ap-southeast-2', sensitive: false },
      { field: 'roleArn', label: 'IAM Role ARN', placeholder: 'arn:aws:iam::123456789012:role/AskABDReadOnly', sensitive: false },
      { field: 'externalId', label: 'External ID', placeholder: 'askabd-trust-xxxxx', sensitive: true },
    ],
    validationSteps: ['AWS endpoint connectivity', 'Credential validation', 'Account identity', 'Region access', 'IAM permission check', 'EC2 read access', 'RDS read access', 'S3 list access', 'VPC read access'],
    whyNeeded: 'AskABD needs read-only access to discover EC2 instances, RDS databases, S3 buckets, VPCs, ECS/EKS clusters, and other configured resources. No modifications will be made.',
  },
  azure: {
    connectorType: 'cloud', provider: 'Azure',
    purpose: 'Azure resource discovery and infrastructure assessment',
    securityLevel: 'read-only',
    requiredFields: [
      { field: 'tenantId', label: 'Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', sensitive: false },
      { field: 'subscriptionId', label: 'Subscription ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', sensitive: false },
      { field: 'clientId', label: 'App Registration Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', sensitive: false },
      { field: 'clientSecret', label: 'Client Secret', placeholder: '••••••••', sensitive: true },
    ],
    validationSteps: ['Azure endpoint connectivity', 'Authentication', 'Tenant access', 'Subscription access', 'Resource group read', 'VM list access', 'Database list access'],
    whyNeeded: 'AskABD needs Reader role access to discover VMs, Azure SQL, Storage Accounts, VNets, AKS clusters, and other resources.',
  },
  github: {
    connectorType: 'source-control', provider: 'GitHub',
    purpose: 'Repository discovery, code analysis, and CI/CD assessment',
    securityLevel: 'read-only',
    requiredFields: [
      { field: 'organization', label: 'Organization', placeholder: 'your-org', sensitive: false },
      { field: 'token', label: 'Personal Access Token', placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx', sensitive: true },
    ],
    validationSteps: ['GitHub API connectivity', 'Token validation', 'Organization access', 'Repository list access', 'Read permission confirmed'],
    whyNeeded: 'AskABD needs read access to repositories for code analysis, dependency scanning, and CI/CD pipeline assessment.',
  },
  kubernetes: {
    connectorType: 'infrastructure', provider: 'Kubernetes',
    purpose: 'Container infrastructure discovery and workload assessment',
    securityLevel: 'read-only',
    requiredFields: [
      { field: 'clusterEndpoint', label: 'Cluster API Endpoint', placeholder: 'https://k8s.example.com:6443', sensitive: false },
      { field: 'token', label: 'Service Account Token', placeholder: '••••••••', sensitive: true },
      { field: 'namespace', label: 'Namespace (optional)', placeholder: 'default', sensitive: false },
    ],
    validationSteps: ['Endpoint connectivity', 'TLS validation', 'Authentication', 'Namespace access', 'Pod list permission', 'Deployment list permission'],
    whyNeeded: 'AskABD needs read-only access to discover namespaces, deployments, services, pods, and resource utilization.',
  },
};

// ─── SERVICE REQUIREMENT DEFINITIONS ─────────────────────────────────────────
// Maps each lifecycle status to its service delivery requirements.
// Derived from the canonical lifecycle — does NOT duplicate statuses.

export const serviceRequirements: ServiceRequirement[] = [
  {
    serviceId: 'identity-verification', serviceName: 'Identity Verification',
    description: 'Confirm business owner identity after OTP verification',
    lifecycleStatus: 'otp-verified', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Verify OTP completion', 'Confirm organization record', 'Validate contact information'],
    requiredConnectors: [], requiredInputs: [],
    validationChecks: [
      { id: 'iv-otp', label: 'OTP Verified', description: 'One-time password confirmed via email' },
      { id: 'iv-org', label: 'Organization Persisted', description: 'Client record exists in database' },
      { id: 'iv-contact', label: 'Contact Valid', description: 'Business owner email confirmed' },
    ],
    successCriteria: 'Business owner identity confirmed via verified email channel',
    expectedOutput: ['Identity confirmation record', 'Audit entry'],
    blockingConditions: ['OTP not verified'], securityNote: 'Identity verified via secure OTP channel',
    estimatedDuration: 'Automatic',
  },
  {
    serviceId: 'security-validation', serviceName: 'Security Validation',
    description: 'Enterprise security posture validation before platform access',
    lifecycleStatus: 'identity-verified', owner: 'askabd',
    clientRequired: ['Security contact', 'Compliance requirements', 'Authentication preferences'],
    askabdRequired: ['Run security checklist', 'Validate authentication config', 'Check encryption', 'Verify access policy'],
    requiredConnectors: [], requiredInputs: ['Authentication method preference', 'Compliance standard (SOC2, ISO27001, etc.)'],
    validationChecks: [
      { id: 'sv-auth', label: 'Authentication Configured', description: 'SSO/OAuth/API key method defined' },
      { id: 'sv-rbac', label: 'Access Policy Defined', description: 'Role-based access control configured' },
      { id: 'sv-scan', label: 'Security Scan Passed', description: 'No critical vulnerabilities' },
      { id: 'sv-compliance', label: 'Compliance Met', description: 'Industry standards validated' },
      { id: 'sv-encrypt', label: 'Encryption Validated', description: 'Data encryption confirmed' },
    ],
    successCriteria: 'All mandatory security checks pass without critical findings',
    expectedOutput: ['Security validation report', 'Compliance checklist', 'Access policy document'],
    blockingConditions: ['Identity not verified', 'Critical security finding'],
    securityNote: 'Security validation is mandatory before any system access is granted',
    estimatedDuration: '1-2 days',
  },
  {
    serviceId: 'environment-registration', serviceName: 'Environment Registration',
    description: 'Document and register all client environments for AskABD access',
    lifecycleStatus: 'security-validated', owner: 'client',
    clientRequired: ['List all environments', 'Provide access credentials', 'Confirm network access'],
    askabdRequired: ['Validate environment access', 'Catalog environments'],
    requiredConnectors: [], requiredInputs: ['Environment list (dev/test/staging/prod)', 'Host addresses', 'Access method', 'Firewall/VPN requirements'],
    validationChecks: [
      { id: 'er-list', label: 'Environments Documented', description: 'All active environments listed' },
      { id: 'er-access', label: 'Access Confirmed', description: 'Read access to each environment verified' },
      { id: 'er-network', label: 'Network Validated', description: 'Network paths confirmed accessible' },
    ],
    successCriteria: 'All environments catalogued with confirmed access paths',
    expectedOutput: ['Environment registry', 'Access documentation', 'Network diagram'],
    blockingConditions: ['Security not validated', 'No environment information provided'],
    securityNote: 'AskABD requires read-only access to environments for discovery',
    estimatedDuration: '1-3 days',
  },
  {
    serviceId: 'connector-configuration', serviceName: 'Connector Configuration & Validation',
    description: 'Configure and validate all required integration connectors',
    lifecycleStatus: 'environment-registered', owner: 'client',
    clientRequired: ['Provide connection credentials', 'Grant required permissions', 'Open network access'],
    askabdRequired: ['Test each connector', 'Validate permissions', 'Confirm read-only access'],
    requiredConnectors: [connectorRequirements.postgresql, connectorRequirements.aws, connectorRequirements.github],
    requiredInputs: ['Database credentials', 'Cloud account details', 'API tokens', 'SSH keys where applicable'],
    validationChecks: [
      { id: 'cc-select', label: 'Connectors Selected', description: 'Required connectors identified' },
      { id: 'cc-config', label: 'Credentials Provided', description: 'Authentication configured' },
      { id: 'cc-test', label: 'Connection Tested', description: 'Each connector validated with health check' },
      { id: 'cc-perm', label: 'Permissions Confirmed', description: 'Read-only access verified' },
    ],
    successCriteria: 'All required connectors validated with successful health checks',
    expectedOutput: ['Connection validation report', 'Connector health status', 'Permission audit'],
    blockingConditions: ['Environments not registered', 'Connection test failed', 'Insufficient permissions'],
    securityNote: 'All connections use encrypted channels. Credentials stored using AES-256-GCM.',
    estimatedDuration: '1-5 days',
  },
  {
    serviceId: 'discovery', serviceName: 'Environment Discovery',
    description: 'Read-only scan of client environment to map infrastructure, applications, and data',
    lifecycleStatus: 'connectors-configured', owner: 'askabd',
    clientRequired: ['Approve discovery scope', 'Confirm read-only consent'],
    askabdRequired: ['Run discovery engines', 'Map applications', 'Catalog databases', 'Document infrastructure', 'Identify dependencies'],
    requiredConnectors: [connectorRequirements.postgresql, connectorRequirements.aws],
    requiredInputs: ['Discovery scope confirmation', 'Read-only consent'],
    validationChecks: [
      { id: 'disc-scope', label: 'Scope Defined', description: 'Systems and boundaries identified' },
      { id: 'disc-consent', label: 'Consent Received', description: 'Written read-only approval' },
      { id: 'disc-conn', label: 'Connectors Validated', description: 'All required connectors healthy' },
    ],
    successCriteria: 'Complete environment inventory generated with zero data modifications',
    expectedOutput: ['Discovery report', 'Application inventory', 'Database catalog', 'Infrastructure map', 'Dependency graph'],
    blockingConditions: ['Connectors not configured', 'Connection test failed', 'No consent'],
    securityNote: 'AskABD is performing READ-ONLY scanning. No source data will be modified.',
    estimatedDuration: '2-8 hours',
  },
  {
    serviceId: 'discovery-execution', serviceName: 'Discovery Execution',
    description: 'Active scanning of environment — read-only operations in progress',
    lifecycleStatus: 'discovery-running', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Scan applications', 'Map databases', 'Catalog infrastructure', 'Identify dependencies'],
    requiredConnectors: [], requiredInputs: [],
    validationChecks: [
      { id: 'de-apps', label: 'Applications Discovered', description: 'All applications inventoried' },
      { id: 'de-data', label: 'Data Sources Mapped', description: 'Databases and schemas catalogued' },
      { id: 'de-infra', label: 'Infrastructure Mapped', description: 'Servers and cloud resources documented' },
      { id: 'de-deps', label: 'Dependencies Identified', description: 'Inter-service dependencies mapped' },
    ],
    successCriteria: 'All systems successfully scanned with complete inventory',
    expectedOutput: ['Full environment inventory', 'Resource count summary', 'Dependency map'],
    blockingConditions: ['Discovery not started', 'Connector failure during scan'],
    securityNote: 'Read-only scanning active. No modifications to source systems.',
    estimatedDuration: '2-8 hours',
  },
  {
    serviceId: 'assessment', serviceName: 'Environment Assessment',
    description: 'Expert analysis of discovered environment — security, performance, compatibility, risks',
    lifecycleStatus: 'discovery-complete', owner: 'askabd',
    clientRequired: ['Confirm discovery results', 'Provide business context'],
    askabdRequired: ['Analyze architecture', 'Assess security', 'Evaluate performance', 'Identify risks', 'Calculate migration complexity'],
    requiredConnectors: [], requiredInputs: ['Discovery results confirmation', 'Business priorities', 'SLA requirements'],
    validationChecks: [
      { id: 'as-discovery', label: 'Discovery Reviewed', description: 'Discovery results validated' },
      { id: 'as-criteria', label: 'Criteria Defined', description: 'Assessment dimensions confirmed' },
    ],
    successCriteria: 'Complete assessment with findings, risks, and evidence',
    expectedOutput: ['Assessment report', 'Risk register', 'Compatibility matrix', 'Migration complexity score'],
    blockingConditions: ['Discovery not complete', 'Discovery data insufficient'],
    securityNote: 'Assessment uses only previously discovered data — no additional access required',
    estimatedDuration: '3-10 days',
  },
  {
    serviceId: 'assessment-execution', serviceName: 'Assessment Analysis',
    description: 'Deep analysis engines processing discovery data',
    lifecycleStatus: 'assessment-running', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Security analysis', 'Performance analysis', 'Compatibility analysis', 'Risk analysis'],
    requiredConnectors: [], requiredInputs: [],
    validationChecks: [
      { id: 'ae-security', label: 'Security Assessed', description: 'Vulnerabilities and risks identified' },
      { id: 'ae-perf', label: 'Performance Assessed', description: 'Bottlenecks and capacity issues found' },
      { id: 'ae-compat', label: 'Compatibility Assessed', description: 'Migration readiness evaluated' },
      { id: 'ae-risk', label: 'Risk Assessed', description: 'Business impact analysis complete' },
    ],
    successCriteria: 'All assessment dimensions complete with evidence',
    expectedOutput: ['Security findings', 'Performance report', 'Compatibility matrix', 'Risk register'],
    blockingConditions: ['Assessment not started'], securityNote: 'Analysis of previously collected data only',
    estimatedDuration: '3-10 days',
  },
  {
    serviceId: 'recommendations', serviceName: 'Recommendations Generation',
    description: 'AI-powered recommendations based on assessment findings',
    lifecycleStatus: 'assessment-complete', owner: 'askabd',
    clientRequired: ['Review findings', 'Confirm business priorities'],
    askabdRequired: ['Generate recommendations', 'Estimate costs', 'Define alternatives', 'Calculate impact'],
    requiredConnectors: [], requiredInputs: ['Assessment results', 'Business priorities', 'Budget constraints'],
    validationChecks: [
      { id: 'rec-findings', label: 'Findings Analyzed', description: 'All assessment findings processed' },
      { id: 'rec-solutions', label: 'Solutions Defined', description: 'Recommended and alternative approaches' },
      { id: 'rec-cost', label: 'Costs Estimated', description: 'AskABD, cloud, and client costs separated' },
    ],
    successCriteria: 'Plain-English recommendations delivered with cost/effort/timeline estimates',
    expectedOutput: ['Recommendation document', 'Cost breakdown', 'Timeline estimate', 'Risk assessment'],
    blockingConditions: ['Assessment not complete'],
    securityNote: 'Recommendations based on assessment data — no additional system access',
    estimatedDuration: '3-5 days',
  },
  {
    serviceId: 'client-approval', serviceName: 'Customer Approval',
    description: 'Customer reviews and approves recommendations before execution',
    lifecycleStatus: 'recommendations-generated', owner: 'approval',
    clientRequired: ['Review recommendations', 'Approve approach', 'Confirm budget', 'Sign off timeline'],
    askabdRequired: ['Present recommendations', 'Answer questions', 'Provide alternatives'],
    requiredConnectors: [], requiredInputs: ['Approval decision', 'Budget confirmation', 'Timeline acceptance'],
    validationChecks: [
      { id: 'ca-reviewed', label: 'Recommendations Reviewed', description: 'Customer has reviewed all recommendations' },
      { id: 'ca-approved', label: 'Approach Approved', description: 'Customer agreed to recommended strategy' },
      { id: 'ca-budget', label: 'Budget Confirmed', description: 'Required budget allocated' },
    ],
    successCriteria: 'Written customer approval of approach, budget, and timeline',
    expectedOutput: ['Signed approval document', 'Budget allocation', 'Timeline agreement'],
    blockingConditions: ['Recommendations not generated', 'Customer rejected approach'],
    securityNote: 'No system access required — business approval phase',
    estimatedDuration: '1-2 weeks',
  },
  {
    serviceId: 'migration-planning', serviceName: 'Migration Planning',
    description: 'Detailed migration plan development including waves, rollback, and validation strategy',
    lifecycleStatus: 'migration-planning', owner: 'askabd',
    clientRequired: ['Confirm migration window', 'Approve downtime plan', 'Designate migration lead'],
    askabdRequired: ['Design migration waves', 'Plan rollback', 'Define validation', 'Prepare pre-flight checks'],
    requiredConnectors: [connectorRequirements.postgresql, connectorRequirements.aws],
    requiredInputs: ['Migration window', 'Downtime tolerance', 'Priority systems', 'Rollback requirements'],
    validationChecks: [
      { id: 'mp-source', label: 'Source Validated', description: 'Source systems confirmed accessible' },
      { id: 'mp-target', label: 'Target Prepared', description: 'Target environment provisioned' },
      { id: 'mp-waves', label: 'Waves Defined', description: 'Migration sequence planned' },
      { id: 'mp-rollback', label: 'Rollback Ready', description: 'Recovery procedures documented' },
    ],
    successCriteria: 'Complete migration plan with waves, rollback, validation, and customer sign-off',
    expectedOutput: ['Migration plan', 'Wave schedule', 'Rollback procedure', 'Validation criteria'],
    blockingConditions: ['Customer approval not received'],
    securityNote: 'Planning phase — target environment provisioning may require write access',
    estimatedDuration: '1-3 weeks',
  },
  {
    serviceId: 'migration-approval', serviceName: 'Migration Execution Approval',
    description: 'Final go/no-go decision before migration execution begins',
    lifecycleStatus: 'migration-approved', owner: 'askabd',
    clientRequired: ['Final approval for execution'],
    askabdRequired: ['Pre-flight validation', 'Dry run execution', 'Final readiness confirmation'],
    requiredConnectors: [connectorRequirements.postgresql, connectorRequirements.aws],
    requiredInputs: ['Go/no-go decision', 'Dry run results acceptance'],
    validationChecks: [
      { id: 'ma-preflight', label: 'Pre-Flight Passed', description: 'All prerequisites validated' },
      { id: 'ma-dryrun', label: 'Dry Run Successful', description: 'Simulation completed without errors' },
      { id: 'ma-final', label: 'Final Approval', description: 'Go/No-Go confirmed' },
    ],
    successCriteria: 'All pre-flight checks pass, dry run successful, explicit go decision',
    expectedOutput: ['Pre-flight report', 'Dry run results', 'Go decision record'],
    blockingConditions: ['Migration plan not approved', 'Pre-flight failure', 'Dry run failure'],
    securityNote: 'Dry run does NOT modify production data. Execution requires explicit write access.',
    estimatedDuration: '1-3 days',
  },
  {
    serviceId: 'migration-execution', serviceName: 'Migration Execution',
    description: 'Active data migration — transfer, transform, and load',
    lifecycleStatus: 'migration-running', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Execute migration waves', 'Monitor transfer', 'Handle exceptions'],
    requiredConnectors: [connectorRequirements.postgresql, connectorRequirements.aws],
    requiredInputs: [],
    validationChecks: [
      { id: 'me-transfer', label: 'Transfer Complete', description: 'All objects transferred' },
      { id: 'me-integrity', label: 'Integrity Verified', description: 'Checksums and counts match' },
      { id: 'me-errors', label: 'Zero Critical Errors', description: 'No unresolved failures' },
    ],
    successCriteria: 'All migration waves complete with zero critical errors',
    expectedOutput: ['Migration execution log', 'Transfer statistics', 'Error report'],
    blockingConditions: ['Execution not started', 'Critical error during transfer'],
    securityNote: 'WRITE OPERATION — Production data being modified',
    estimatedDuration: '1 hour to 7 days (depends on data volume)',
  },
  {
    serviceId: 'post-migration-validation', serviceName: 'Post-Migration Validation',
    description: 'Comprehensive validation comparing source and target after migration',
    lifecycleStatus: 'migration-complete', owner: 'askabd',
    clientRequired: ['Confirm application connectivity', 'Verify business functionality'],
    askabdRequired: ['Row count validation', 'Schema validation', 'Data integrity checks', 'Performance baseline comparison'],
    requiredConnectors: [connectorRequirements.postgresql],
    requiredInputs: ['Validation acceptance criteria'],
    validationChecks: [
      { id: 'pv-data', label: 'Data Integrity', description: 'Source vs target comparison passed' },
      { id: 'pv-schema', label: 'Schema Valid', description: 'All structures match specification' },
      { id: 'pv-app', label: 'App Connectivity', description: 'Applications connect to new data' },
      { id: 'pv-perf', label: 'Performance Met', description: 'Response times within baseline' },
    ],
    successCriteria: 'Zero mismatches between source and target, performance within bounds',
    expectedOutput: ['Validation report', 'Data comparison results', 'Performance comparison'],
    blockingConditions: ['Migration not complete', 'Data mismatch found'],
    securityNote: 'Read-only comparison operations', estimatedDuration: '1-3 days',
  },
  {
    serviceId: 'validation-execution', serviceName: 'Validation In Progress',
    description: 'Running automated validation suites against migrated data',
    lifecycleStatus: 'validation-running', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Execute validation suites', 'Compare source/target', 'Generate report'],
    requiredConnectors: [], requiredInputs: [],
    validationChecks: [
      { id: 've-rows', label: 'Row Counts Match', description: 'Every table row count verified' },
      { id: 've-checksum', label: 'Checksums Pass', description: 'Data checksums validated' },
      { id: 've-constraints', label: 'Constraints Valid', description: 'Foreign keys and indexes verified' },
      { id: 've-functions', label: 'Functions Tested', description: 'Stored procedures and triggers verified' },
    ],
    successCriteria: 'All validation suites pass with zero discrepancies',
    expectedOutput: ['Validation suite results', 'Discrepancy report (if any)', 'Sign-off recommendation'],
    blockingConditions: ['Validation not started', 'Critical mismatch'],
    securityNote: 'Read-only verification', estimatedDuration: '1-3 days',
  },
  {
    serviceId: 'governance-audit', serviceName: 'Governance Audit',
    description: 'Independent compliance and governance audit of the entire migration',
    lifecycleStatus: 'validation-passed', owner: 'askabd',
    clientRequired: ['Designate audit reviewer', 'Provide compliance requirements'],
    askabdRequired: ['Generate audit trail', 'Verify compliance', 'Produce audit report'],
    requiredConnectors: [], requiredInputs: ['Compliance standard', 'Audit scope'],
    validationChecks: [
      { id: 'ga-scope', label: 'Audit Scope Defined', description: 'Compliance requirements identified' },
    ],
    successCriteria: 'Complete audit trail with compliance verification',
    expectedOutput: ['Audit report', 'Compliance certificate', 'Evidence package'],
    blockingConditions: ['Validation not passed'],
    securityNote: 'Audit uses collected evidence — no additional access', estimatedDuration: '3-7 days',
  },
  {
    serviceId: 'audit-execution', serviceName: 'Audit In Progress',
    description: 'Governance audit execution and report generation',
    lifecycleStatus: 'audit-running', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Verify compliance', 'Collect evidence', 'Generate report'],
    requiredConnectors: [], requiredInputs: [],
    validationChecks: [
      { id: 'ax-compliance', label: 'Compliance Verified', description: 'Regulatory requirements met' },
      { id: 'ax-evidence', label: 'Evidence Complete', description: 'Full audit trail available' },
      { id: 'ax-report', label: 'Report Signed', description: 'Independent review completed' },
    ],
    successCriteria: 'Audit report signed with no critical findings',
    expectedOutput: ['Signed audit report', 'Evidence package', 'Compliance certificate'],
    blockingConditions: ['Audit not started', 'Critical compliance finding'],
    securityNote: 'Evidence review only', estimatedDuration: '3-7 days',
  },
  {
    serviceId: 'go-live', serviceName: 'Production Go-Live',
    description: 'Production activation after all validations and audits pass',
    lifecycleStatus: 'audit-passed', owner: 'approval',
    clientRequired: ['Final go-live approval', 'Confirm support readiness', 'Designate on-call contacts'],
    askabdRequired: ['Production readiness check', 'Activate monitoring', 'Prepare hyper-care team'],
    requiredConnectors: [], requiredInputs: ['Go-live date', 'On-call contacts', 'Escalation matrix'],
    validationChecks: [
      { id: 'gl-ready', label: 'Production Ready', description: 'All systems verified' },
      { id: 'gl-support', label: 'Support Ready', description: 'Hyper-care team on standby' },
      { id: 'gl-rollback', label: 'Rollback Tested', description: 'Recovery validated' },
    ],
    successCriteria: 'Production traffic flowing with zero critical issues',
    expectedOutput: ['Go-live record', 'Production confirmation', 'Hyper-care activation'],
    blockingConditions: ['Audit not passed', 'Critical readiness failure'],
    securityNote: 'Production activation is irreversible without rollback plan', estimatedDuration: '1 day',
  },
  {
    serviceId: 'hyper-care', serviceName: 'Hyper Care',
    description: 'Intensive post-go-live support with enhanced monitoring (2-4 weeks)',
    lifecycleStatus: 'go-live', owner: 'askabd',
    clientRequired: ['Report any issues immediately', 'Confirm business functionality'],
    askabdRequired: ['24/7 monitoring', 'Rapid incident response', 'Performance tracking', 'Stability assessment'],
    requiredConnectors: [], requiredInputs: ['Issue reports', 'User feedback'],
    validationChecks: [
      { id: 'hc-traffic', label: 'Traffic Flowing', description: 'Production traffic confirmed' },
      { id: 'hc-monitoring', label: 'Monitoring Active', description: '24/7 enhanced monitoring live' },
    ],
    successCriteria: 'System stable for 2+ weeks with no critical incidents',
    expectedOutput: ['Stability report', 'Incident log', 'Performance trends'],
    blockingConditions: ['Go-live not complete', 'Critical incident unresolved'],
    securityNote: 'AskABD monitoring access required', estimatedDuration: '2-4 weeks',
  },
  {
    serviceId: 'managed-services', serviceName: 'Managed Services Activation',
    description: 'Transition from hyper-care to ongoing managed services',
    lifecycleStatus: 'hyper-care', owner: 'askabd',
    clientRequired: ['Confirm operational handover', 'Approve SLA terms'],
    askabdRequired: ['Confirm stability', 'Activate SLA monitoring', 'Complete handover documentation'],
    requiredConnectors: [], requiredInputs: ['SLA acceptance', 'Support model confirmation'],
    validationChecks: [
      { id: 'ms-stable', label: 'Stability Confirmed', description: 'No critical incidents in 2+ weeks' },
      { id: 'ms-sla', label: 'SLA Active', description: 'Service levels being measured' },
      { id: 'ms-handover', label: 'Handover Complete', description: 'BAU operations documented' },
    ],
    successCriteria: 'All SLA targets met, operations team trained, documentation complete',
    expectedOutput: ['Managed services agreement', 'SLA dashboard', 'Operations runbook'],
    blockingConditions: ['Hyper-care period not complete', 'Stability not confirmed'],
    securityNote: 'Ongoing operational access required per SLA', estimatedDuration: 'Ongoing',
  },
  {
    serviceId: 'continuous-monitoring', serviceName: 'Continuous Monitoring',
    description: 'Activate 24/7 automated monitoring with alerting and escalation',
    lifecycleStatus: 'managed-services', owner: 'automatic',
    clientRequired: ['Confirm alert recipients', 'Approve escalation paths'],
    askabdRequired: ['Configure monitors', 'Set alert rules', 'Define escalation'],
    requiredConnectors: [], requiredInputs: ['Alert contacts', 'Escalation matrix', 'SLA thresholds'],
    validationChecks: [
      { id: 'cm-infra', label: 'Infrastructure Monitored', description: 'All infrastructure coverage' },
      { id: 'cm-app', label: 'Application Monitored', description: 'APM and logging active' },
      { id: 'cm-alerts', label: 'Alerts Configured', description: 'Escalation paths defined' },
    ],
    successCriteria: 'All monitors active with correct escalation paths',
    expectedOutput: ['Monitoring dashboard', 'Alert configuration', 'Escalation procedures'],
    blockingConditions: ['Managed services not active'],
    securityNote: 'Monitoring requires read access to all systems', estimatedDuration: '1-3 days',
  },
  {
    serviceId: 'engineering-intelligence', serviceName: 'Engineering Intelligence',
    description: 'Activate AI-powered root cause analysis, prediction, and recommendations',
    lifecycleStatus: 'continuous-monitoring', owner: 'automatic',
    clientRequired: [], askabdRequired: ['Activate AI engines', 'Train models', 'Enable predictions'],
    requiredConnectors: [], requiredInputs: [],
    validationChecks: [
      { id: 'ei-data', label: 'Telemetry Flowing', description: 'Sufficient data for AI analysis' },
      { id: 'ei-models', label: 'Models Active', description: 'RCA and prediction engines running' },
    ],
    successCriteria: 'AI engines active with growing knowledge base',
    expectedOutput: ['AI dashboard', 'Knowledge base', 'Predictive alerts'],
    blockingConditions: ['Monitoring not active', 'Insufficient telemetry data'],
    securityNote: 'AI engines process telemetry data within AskABD platform', estimatedDuration: '1-2 weeks',
  },
];

// ─── CLIENT DELIVERY STATUS CALCULATOR ───────────────────────────────────────

/**
 * Calculate the complete delivery status for a client given their lifecycle state.
 * Uses the canonical lifecycle engine — does NOT create parallel state.
 */
export function calculateClientDeliveryStatus(
  clientId: string,
  clientName: string,
  currentStatus: LifecycleStatus
): ClientDeliveryStatus {
  const currentOrder = statusMeta[currentStatus]?.order ?? 0;

  const currentService = serviceRequirements.find(s => s.lifecycleStatus === currentStatus) || null;
  const completedServices = serviceRequirements.filter(s => {
    const sOrder = statusMeta[s.lifecycleStatus]?.order ?? 0;
    return sOrder < currentOrder;
  });
  const pendingServices = serviceRequirements.filter(s => {
    const sOrder = statusMeta[s.lifecycleStatus]?.order ?? 0;
    return sOrder > currentOrder;
  });

  // Determine next service
  const nextServiceOrder = currentOrder + 1;
  const nextService = serviceRequirements.find(s => {
    const sOrder = statusMeta[s.lifecycleStatus]?.order ?? 0;
    return sOrder === nextServiceOrder;
  }) || (pendingServices.length > 0 ? pendingServices[0] : null);

  // Calculate blocking
  let blockedReason: string | null = null;
  if (currentService) {
    const blocking = currentService.blockingConditions;
    if (blocking.length > 0) {
      blockedReason = blocking[0]; // Primary blocking condition
    }
  }

  // Determine current owner and actions
  const currentOwner: ActionOwner = currentService?.owner || 'askabd';
  const clientActions = currentService?.clientRequired || [];
  const askabdActions = currentService?.askabdRequired || [];

  const progress = Math.round((currentOrder / 27) * 100);

  return {
    clientId, clientName, currentStatus, currentService,
    completedServices, pendingServices,
    blockedReason, clientActions, askabdActions,
    nextService, progress, currentOwner,
  };
}

/**
 * Get the service requirement for a given lifecycle status.
 */
export function getServiceForStatus(status: LifecycleStatus): ServiceRequirement | null {
  return serviceRequirements.find(s => s.lifecycleStatus === status) || null;
}

/**
 * Get all connector requirements needed at or before a given lifecycle stage.
 */
export function getRequiredConnectors(status: LifecycleStatus): RequiredConnector[] {
  const order = statusMeta[status]?.order ?? 0;
  const connectors: RequiredConnector[] = [];
  const seen = new Set<string>();
  for (const svc of serviceRequirements) {
    const svcOrder = statusMeta[svc.lifecycleStatus]?.order ?? 0;
    if (svcOrder <= order) {
      for (const conn of svc.requiredConnectors) {
        if (!seen.has(conn.provider)) {
          seen.add(conn.provider);
          connectors.push(conn);
        }
      }
    }
  }
  return connectors;
}
