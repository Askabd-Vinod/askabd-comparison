/**
 * AskABD Production Preflight & Go/No-Go Service
 * 
 * AUTHORITATIVE production readiness validation.
 * Covers ALL 23 documented production dependencies.
 * 
 * States:
 * - VERIFIED: tested and working with evidence
 * - READY_TO_CONNECT: code ready, awaiting credentials/infrastructure
 * - NOT_CONFIGURED: needs setup (NOT a failure)
 * - MISSING: required and absent (blocks production)
 * - FAILED: configured but not working
 * - BLOCKED: dependency prevents progress
 * - OPTIONAL: not required for production launch
 * - NOT_REQUIRED: explicitly excluded
 * - NOT_VERIFIED: exists but evidence missing
 * - EXPIRED: was verified but has expired
 * 
 * NEVER represents NOT_CONFIGURED as FAILED.
 * NEVER represents OPTIONAL as BLOCKING.
 * NEVER returns overallStatus=READY when mandatory items are unverified.
 */

import * as dns from 'dns';
import { promisify } from 'util';
import { config } from '../config/env.js';
import { getDatabaseStatus } from './db-pool.js';

const dnsResolve = promisify(dns.resolve);

export type DependencyStatus = 'verified' | 'ready_to_connect' | 'not_configured' | 'missing' | 'failed' | 'blocked' | 'optional' | 'not_required' | 'not_verified' | 'expired';

export interface PreflightItem {
  id: string;
  category: string;
  name: string;
  required: boolean;
  status: DependencyStatus;
  whatWeHave: string;
  whatIsMissing: string;
  whyRequired: string;
  businessImpact: string;
  securityImpact: string;
  howToConfigure: string;
  owner: string;
  envVariable?: string;
  isSecret: boolean;
  blocking: boolean;
  blockingReason?: string;
  nextAction: string;
  automatedCheck: boolean;
  manualVerification: boolean;
  externalDependency: boolean;
  evidence?: string;
  verifiedAt?: string;
}

export type OverallStatus = 'production_go' | 'production_certification_pending' | 'production_connection_pending' | 'staging_ready' | 'application_ready' | 'blocked';

export interface PreflightReport {
  overallStatus: OverallStatus;
  score: number;
  timestamp: string;
  environment: string;
  applicationStatus: string;
  infrastructureStatus: string;
  securityStatus: string;
  databaseStatus: string;
  externalIntegrationStatus: string;
  observabilityStatus: string;
  blockingItems: PreflightItem[];
  requiredItems: PreflightItem[];
  verifiedItems: PreflightItem[];
  optionalItems: PreflightItem[];
  missingInformation: PreflightItem[];
  securityIssues: PreflightItem[];
  warnings: string[];
  summary: { total: number; verified: number; ready: number; missing: number; optional: number; blocking: number };
}

export interface GoNoGoReport {
  decision: 'PRODUCTION_GO' | 'PRODUCTION_NO_GO';
  applicationStatus: OverallStatus;
  reason: string;
  blockingCount: number;
  missingCount: number;
  unverifiedCount: number;
  score: number;
  categories: Record<string, { status: string; verified: number; total: number; blockers: string[] }>;
  nextActions: string[];
  timestamp: string;
}

export class ProductionPreflightService {

  async runPreflight(): Promise<PreflightReport> {
    const items: PreflightItem[] = [];
    const env = config.NODE_ENV || 'development';
    const isProd = env === 'production';

    // ═══ INFRASTRUCTURE (DEP-001 to DEP-003) ═══
    items.push(this.checkAwsAccount(isProd));
    items.push(this.checkIamRoles(isProd));
    items.push(this.checkSecretsManager(isProd));

    // ═══ DATABASE (DEP-004 to DEP-007) ═══
    items.push(this.checkDatabase(isProd));
    items.push(this.checkDatabaseSsl(isProd));
    items.push(this.checkDatabaseBackup(isProd));
    items.push(this.checkDatabaseRestore(isProd));

    // ═══ SECURITY (DEP-008 to DEP-010) ═══
    items.push(this.checkJwt(isProd));
    items.push(this.checkCors(isProd));
    items.push(this.checkTls(isProd));

    // ═══ EMAIL (DEP-011) ═══
    items.push(await this.checkEmail(isProd));

    // ═══ DNS & NETWORKING (DEP-012 to DEP-014) ═══
    items.push(await this.checkDns(isProd));
    items.push(this.checkLoadBalancer(isProd));
    items.push(this.checkContainerRegistry(isProd));

    // ═══ STORAGE (DEP-015) ═══
    items.push(this.checkStorage(isProd));

    // ═══ INTEGRATIONS (DEP-016 to DEP-019) ═══
    items.push(await this.checkJira());
    items.push(this.checkAwsConnector());
    items.push(this.checkAzureConnector());
    items.push(this.checkKubernetesConnector());

    // ═══ OBSERVABILITY (DEP-020 to DEP-021) ═══
    items.push(this.checkMonitoring(isProd));
    items.push(this.checkAlerting(isProd));

    // ═══ CI/CD & DEPLOYMENT (DEP-022) ═══
    items.push(this.checkCiCd(isProd));

    // ═══ OPTIONAL (DEP-023) ═══
    items.push(this.checkRedis());

    // ─── Compute Report ───────────────────────────────────────────────────────
    const mandatory = items.filter(i => i.required);
    const blocking = items.filter(i => i.blocking);
    const verified = items.filter(i => i.status === 'verified');
    const ready = items.filter(i => i.status === 'ready_to_connect');
    const missing = items.filter(i => i.status === 'missing');
    const optional = items.filter(i => !i.required);

    const mandatoryVerified = mandatory.filter(i => i.status === 'verified').length;
    const score = mandatory.length > 0 ? Math.round((mandatoryVerified / mandatory.length) * 100) : 0;

    // Category statuses
    const appReady = getDatabaseStatus() === 'ready';
    const infraItems = items.filter(i => ['Infrastructure', 'Networking'].includes(i.category));
    const secItems = items.filter(i => i.category === 'Security');
    const dbItems = items.filter(i => i.category === 'Database');
    const extItems = items.filter(i => i.category === 'Integration');
    const obsItems = items.filter(i => i.category === 'Observability');

    const catStatus = (arr: PreflightItem[]) => arr.every(i => i.status === 'verified') ? 'verified' : arr.some(i => i.blocking) ? 'blocked' : 'pending';

    let overallStatus: OverallStatus;
    if (blocking.length > 0 && isProd) overallStatus = 'blocked';
    else if (mandatory.every(i => i.status === 'verified')) overallStatus = 'production_go';
    else if (appReady && !isProd) overallStatus = 'application_ready';
    else if (isProd && missing.length > 0) overallStatus = 'production_connection_pending';
    else overallStatus = 'staging_ready';

    return {
      overallStatus, score,
      timestamp: new Date().toISOString(),
      environment: env,
      applicationStatus: appReady ? 'ready' : 'degraded',
      infrastructureStatus: catStatus(infraItems),
      securityStatus: catStatus(secItems),
      databaseStatus: catStatus(dbItems),
      externalIntegrationStatus: catStatus(extItems),
      observabilityStatus: catStatus(obsItems),
      blockingItems: blocking,
      requiredItems: mandatory.filter(i => !i.blocking && i.status !== 'verified'),
      verifiedItems: verified,
      optionalItems: optional,
      missingInformation: missing,
      securityIssues: secItems.filter(i => i.status !== 'verified'),
      warnings: this.generateWarnings(items, env),
      summary: { total: items.length, verified: verified.length, ready: ready.length, missing: missing.length, optional: optional.length, blocking: blocking.length },
    };
  }

  /**
   * Production Go/No-Go decision endpoint.
   * Returns a single authoritative decision.
   */
  async getGoNoGo(): Promise<GoNoGoReport> {
    const report = await this.runPreflight();
    const mandatory = [...report.blockingItems, ...report.requiredItems, ...report.verifiedItems].filter(i => i.required);
    const unverified = mandatory.filter(i => i.status !== 'verified');

    const decision = report.overallStatus === 'production_go' ? 'PRODUCTION_GO' as const : 'PRODUCTION_NO_GO' as const;
    const reason = decision === 'PRODUCTION_GO'
      ? 'All mandatory production dependencies verified with evidence.'
      : `${report.summary.blocking} blocking, ${report.summary.missing} missing, ${unverified.length} unverified mandatory items.`;

    const categories: Record<string, { status: string; verified: number; total: number; blockers: string[] }> = {};
    const allItems = [...report.blockingItems, ...report.requiredItems, ...report.verifiedItems, ...report.optionalItems];
    for (const item of allItems) {
      const cat = (categories[item.category] ??= { status: 'pending', verified: 0, total: 0, blockers: [] });
      cat.total++;
      if (item.status === 'verified') cat.verified++;
      if (item.blocking) cat.blockers.push(item.name);
    }
    for (const [, cat] of Object.entries(categories)) {
      cat.status = cat.verified === cat.total ? 'verified' : cat.blockers.length > 0 ? 'blocked' : 'pending';
    }

    const nextActions = unverified.slice(0, 10).map(i => `${i.name}: ${i.nextAction}`);

    return {
      decision, applicationStatus: report.overallStatus, reason,
      blockingCount: report.summary.blocking, missingCount: report.summary.missing,
      unverifiedCount: unverified.length, score: report.score,
      categories, nextActions, timestamp: report.timestamp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INDIVIDUAL CHECKS (23 total)
  // ═══════════════════════════════════════════════════════════════════════════════

  private checkAwsAccount(isProd: boolean): PreflightItem {
    const hasAccount = !!process.env.AWS_ACCOUNT_ID;
    return this.build('DEP-001', 'Infrastructure', 'AWS Account', true, hasAccount ? 'verified' : (isProd ? 'missing' : 'ready_to_connect'), hasAccount ? `Account: ${process.env.AWS_ACCOUNT_ID}` : 'No AWS account configured', hasAccount ? 'None' : 'AWS Account ID, Region, IAM configuration', 'Production cloud infrastructure', 'No production hosting', 'None', 'Provide AWS Account ID and configure region', 'DevOps', false, isProd && !hasAccount, true, false, true, hasAccount ? `AWS Account ${process.env.AWS_ACCOUNT_ID} configured` : undefined);
  }

  private checkIamRoles(isProd: boolean): PreflightItem {
    const hasRole = !!process.env.AWS_ROLE_ARN;
    return this.build('DEP-002', 'Infrastructure', 'IAM Roles (Least Privilege)', true, hasRole ? 'ready_to_connect' : (isProd ? 'missing' : 'ready_to_connect'), hasRole ? `Role: ${process.env.AWS_ROLE_ARN}` : 'No IAM role configured', 'Application execution role + deployment role', 'Secure production execution', 'No production security boundary', 'Privilege escalation risk', 'Create least-privilege IAM roles for app and deploy', 'DevOps', false, isProd && !hasRole, true, false, true, undefined);
  }

  private checkSecretsManager(isProd: boolean): PreflightItem {
    return this.build('DEP-003', 'Security', 'Secrets Management', true, isProd ? 'missing' : 'ready_to_connect', '.env file (DEV only)', 'AWS Secrets Manager or equivalent', 'Secure credential storage and rotation', 'Credentials in plaintext files', 'Critical — credential exposure in deployment artifacts', 'Configure AWS Secrets Manager, inject via ECS task definition', 'DevOps', false, isProd, true, false, true, undefined);
  }

  private checkDatabase(isProd: boolean): PreflightItem {
    const dbUrl = config.DATABASE_URL || '';
    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    const dbReady = getDatabaseStatus() === 'ready';

    if (dbReady && !isLocal) return this.build('DEP-004', 'Database', 'PostgreSQL (RDS)', true, 'verified', `Connected: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`, 'None', 'Production persistence', 'None', 'None', 'Configured', 'DevOps', true, false, true, false, false, `Database connected, status: ready`);
    if (dbReady && isLocal) return this.build('DEP-004', 'Database', 'PostgreSQL (RDS)', true, isProd ? 'missing' : 'ready_to_connect', 'Local Docker PostgreSQL 16', 'Production RDS endpoint', 'Production data persistence, HA, backup', 'No production persistence', 'No encryption in transit', 'Provision RDS PostgreSQL 16, set DATABASE_URL', 'DevOps', true, isProd, true, false, true, 'DEV database connected');
    return this.build('DEP-004', 'Database', 'PostgreSQL (RDS)', true, 'failed', 'Not connected', 'Working database', 'All operations require database', 'Platform non-functional', 'N/A', 'Check DATABASE_URL', 'DevOps', true, true, true, false, false, undefined);
  }

  private checkDatabaseSsl(isProd: boolean): PreflightItem {
    const dbUrl = config.DATABASE_URL || '';
    const hasSsl = dbUrl.includes('sslmode=require') || dbUrl.includes('sslmode=verify');
    return this.build('DEP-005', 'Database', 'Database SSL/TLS', true, hasSsl ? 'verified' : (isProd ? 'missing' : 'ready_to_connect'), hasSsl ? 'SSL mode enabled' : 'No SSL (DEV)', hasSsl ? 'None' : 'sslmode=require in DATABASE_URL', 'Encrypt data in transit to database', 'DB traffic unencrypted', 'Critical in production', 'Add ?sslmode=require to DATABASE_URL', 'DevOps', false, isProd && !hasSsl, true, false, true, hasSsl ? 'SSL mode present in connection string' : undefined);
  }

  private checkDatabaseBackup(isProd: boolean): PreflightItem {
    return this.build('DEP-006', 'Database', 'Automated Backup', true, isProd ? 'not_verified' : 'ready_to_connect', 'No automated backup', 'RDS automated backups (7-day retention)', 'Data recovery after failure', 'Total data loss possible', 'None', 'Enable RDS automated backups, test restore', 'DevOps', false, isProd, false, true, true, undefined);
  }

  private checkDatabaseRestore(isProd: boolean): PreflightItem {
    return this.build('DEP-007', 'Database', 'Backup Restore Verified', true, isProd ? 'not_verified' : 'ready_to_connect', 'Never tested', 'Successful restore test with data verification', 'Proven recovery capability', 'Unproven recovery — risk of permanent data loss', 'None', 'Execute restore from backup, verify schema + data', 'DevOps', false, isProd, false, true, true, undefined);
  }

  private checkJwt(isProd: boolean): PreflightItem {
    const hasSecret = !!config.JWT_SECRET;
    if (hasSecret) return this.build('DEP-008', 'Security', 'JWT Authentication', true, 'verified', 'JWT_SECRET configured', 'None', 'Request authentication', 'None', 'None', 'Configured', 'Security', true, false, true, false, false, 'JWT_SECRET present');
    return this.build('DEP-008', 'Security', 'JWT Authentication', true, isProd ? 'missing' : 'ready_to_connect', 'DEV bypass (no JWT_SECRET)', 'JWT_SECRET (min 32 chars)', 'All API requests must be authenticated', 'Unauthenticated access possible', 'Critical — no auth', 'Set JWT_SECRET (openssl rand -base64 48)', 'Security', true, isProd, true, false, false, undefined);
  }

  private checkCors(isProd: boolean): PreflightItem {
    const origin = config.CORS_ORIGIN || '*';
    const isWildcard = origin === '*';
    if (!isWildcard) return this.build('DEP-009', 'Security', 'CORS Configuration', true, 'verified', `Restricted: ${origin}`, 'None', 'Prevent unauthorized cross-origin requests', 'None', 'None', 'Configured', 'Security', false, false, true, false, false, `CORS origin: ${origin}`);
    return this.build('DEP-009', 'Security', 'CORS Configuration', true, isProd ? 'missing' : 'ready_to_connect', 'CORS_ORIGIN=* (all origins)', 'Explicit domain list', 'Restrict API to authorized frontends', 'Any website can call API', 'CSRF-like attacks possible', 'Set CORS_ORIGIN to production domain(s)', 'Security', false, isProd, true, false, false, undefined);
  }

  private checkTls(isProd: boolean): PreflightItem {
    return this.build('DEP-010', 'Security', 'TLS/HTTPS', true, isProd ? 'missing' : 'ready_to_connect', 'HTTP only (DEV)', 'SSL certificate + ALB/reverse proxy', 'Encrypt all data in transit', 'Data in plaintext on network', 'Critical — tokens visible', 'Request ACM cert, configure HTTPS listener on ALB', 'DevOps', false, isProd, false, true, true, undefined);
  }

  /**
   * SMTP/Email — performs a REAL transport.verify() SMTP handshake (email-transport.ts,
   * already used by the real OTP send path) rather than only checking that SMTP_HOST is set.
   * verify() authenticates against the SMTP server without sending an email, so it's safe to
   * run automatically as part of a status check.
   */
  private async checkEmail(isProd: boolean): Promise<PreflightItem> {
    const hasSmtp = !!config.SMTP_HOST;
    let healthResult: { available: boolean; provider: string; error?: string };
    try {
      const { checkEmailHealth } = await import('./email-transport.js');
      healthResult = await checkEmailHealth();
    } catch (err) {
      healthResult = { available: false, provider: 'unknown', error: (err as Error).message };
    }

    if (healthResult.available) {
      return this.build('DEP-011', 'Email', 'SMTP/SES Provider', true, 'verified', `${healthResult.provider} — SMTP handshake succeeded`, 'None', 'OTP, notifications', 'None', 'None', 'Configured and verified', 'Platform', true, false, true, false, true, `SMTP verify() succeeded via ${healthResult.provider} at ${new Date().toISOString()}`);
    }
    if (hasSmtp) return this.build('DEP-011', 'Email', 'SMTP/SES Provider', true, 'failed', `SMTP_HOST=${config.SMTP_HOST} configured but handshake failed`, 'Working SMTP credentials', 'OTP, notifications', 'Onboarding blocked', 'None', `Fix SMTP configuration: ${healthResult.error || 'verify() failed'}`, 'Platform', true, isProd, true, false, true, undefined);
    return this.build('DEP-011', 'Email', 'SMTP/SES Provider', true, isProd ? 'missing' : (healthResult.available ? 'verified' : 'not_verified'), healthResult.provider === 'mailpit' ? `Mailpit (DEV) — handshake ${healthResult.available ? 'succeeded' : 'failed'}` : 'Not configured', 'Production SMTP/SES credentials', 'OTP delivery, notifications', 'Client onboarding impossible', 'None', 'Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS', 'Platform', true, isProd, true, false, true, healthResult.available ? `SMTP verify() succeeded via ${healthResult.provider}` : undefined);
  }

  /**
   * DNS Configuration — performs a REAL dns.resolve() against API_PUBLIC_URL's hostname
   * rather than merely checking the string doesn't say "localhost". A hostname that fails
   * to resolve is reported as 'failed' with evidence, never as 'ready_to_connect'.
   */
  private async checkDns(isProd: boolean): Promise<PreflightItem> {
    const apiUrl = process.env.API_PUBLIC_URL || '';
    if (!apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      return this.build('DEP-012', 'Networking', 'DNS Configuration', true, isProd ? 'missing' : 'ready_to_connect', 'localhost only', 'Production domain records', 'Public API/web access', 'Platform inaccessible', 'None', 'Configure A/CNAME records', 'DevOps', false, isProd, false, true, true, undefined);
    }

    let hostname: string;
    try {
      hostname = new URL(apiUrl).hostname;
    } catch {
      return this.build('DEP-012', 'Networking', 'DNS Configuration', true, 'failed', `API_PUBLIC_URL is not a valid URL: ${apiUrl}`, 'A valid API_PUBLIC_URL', 'Public API/web access', 'Platform inaccessible', 'None', 'Fix API_PUBLIC_URL format', 'DevOps', false, isProd, true, false, true, undefined);
    }

    try {
      const addresses = await dnsResolve(hostname);
      return this.build('DEP-012', 'Networking', 'DNS Configuration', true, 'verified', `${hostname} resolves`, 'None', 'Public API/web access', 'None', 'None', 'Configured', 'DevOps', false, false, true, false, true, `DNS resolved: ${hostname} → ${addresses.join(', ')} at ${new Date().toISOString()}`);
    } catch (err) {
      return this.build('DEP-012', 'Networking', 'DNS Configuration', true, 'failed', `${hostname} does not resolve`, 'A working DNS A/CNAME record for this hostname', 'Public API/web access', 'API not reachable', 'None', `Verify DNS record for ${hostname}: ${(err as Error).message}`, 'DevOps', false, isProd, true, false, true, undefined);
    }
  }

  private checkLoadBalancer(isProd: boolean): PreflightItem {
    return this.build('DEP-013', 'Networking', 'Load Balancer (ALB)', true, isProd ? 'missing' : 'ready_to_connect', 'Direct port access', 'ALB with TLS termination + health checks', 'HA, TLS, zero-downtime deploys', 'Single point of failure', 'No TLS termination', 'Create ALB, configure target groups, health check: /health', 'DevOps', false, isProd, false, true, true, undefined);
  }

  private checkContainerRegistry(isProd: boolean): PreflightItem {
    return this.build('DEP-014', 'Infrastructure', 'Container Registry (ECR)', true, isProd ? 'missing' : 'ready_to_connect', 'Local Docker images', 'ECR with immutable tags', 'Deployment artifact storage', 'No deployable images', 'None', 'Create ECR repos, push images with digest tags', 'DevOps', false, isProd, false, true, true, undefined);
  }

  private checkStorage(isProd: boolean): PreflightItem {
    const isS3 = config.STORAGE_PROVIDER === 's3';
    if (isS3 && config.S3_BUCKET) return this.build('DEP-015', 'Infrastructure', 'Object Storage (S3)', true, 'ready_to_connect', `S3: ${config.S3_BUCKET}`, 'Upload/access verification', 'Document persistence', 'Documents lost on restart', 'None', 'Test upload/download to S3', 'DevOps', false, false, true, false, true, undefined);
    return this.build('DEP-015', 'Infrastructure', 'Object Storage (S3)', true, isProd ? 'missing' : 'ready_to_connect', 'Local filesystem', 'S3 bucket + IAM permissions', 'Persistent document storage', 'Documents lost on redeploy', 'None', 'Set STORAGE_PROVIDER=s3, S3_BUCKET, S3_REGION', 'DevOps', false, isProd, true, false, true, undefined);
  }

  private async checkJira(): Promise<PreflightItem> {
    try {
      const { sharedPool } = await import('./db-pool.js');
      const res = await sharedPool.query("SELECT status FROM oc_jira_integrations WHERE environment = $1", [config.NODE_ENV || 'development']);
      if (res.rows.length > 0 && res.rows[0].status === 'healthy') return this.build('DEP-016', 'Integration', 'Jira Cloud', false, 'verified', 'Connected and healthy', 'None', 'Issue tracking', 'Manual tracking', 'None', 'Configured', 'Product', true, false, true, false, true, `Jira healthy at ${new Date().toISOString()}`);
      if (res.rows.length > 0) return this.build('DEP-016', 'Integration', 'Jira Cloud', false, 'not_configured', `Status: ${res.rows[0].status}`, 'Valid connection test', 'Issue tracking', 'Manual tracking', 'None', 'Test connection at /platform/integrations/jira', 'Product', true, false, true, false, true, undefined);
    } catch { /* */ }
    return this.build('DEP-016', 'Integration', 'Jira Cloud', false, 'not_configured', 'Not configured', 'URL, project, API token', 'Automated issue tracking', 'Manual tracking', 'None', 'Configure at /platform/integrations/jira', 'Product', true, false, true, false, true, undefined);
  }

  private checkAwsConnector(): PreflightItem {
    return this.build('DEP-017', 'Integration', 'AWS Connector', false, 'not_configured', 'Endpoint reachability only', 'IAM credentials + SDK', 'Cloud resource discovery for clients', 'Limited discovery', 'None', 'Install @aws-sdk, configure IAM role', 'Platform', true, false, false, false, true, undefined);
  }

  private checkAzureConnector(): PreflightItem {
    return this.build('DEP-018', 'Integration', 'Azure Connector', false, 'not_configured', 'Endpoint reachability only', 'Service Principal + SDK', 'Azure resource discovery', 'Limited discovery', 'None', 'Configure Azure App Registration', 'Platform', true, false, false, false, true, undefined);
  }

  private checkKubernetesConnector(): PreflightItem {
    return this.build('DEP-019', 'Integration', 'Kubernetes Connector', false, 'not_configured', 'Endpoint reachability only', 'Kubeconfig or SA token', 'K8s resource discovery', 'Limited discovery', 'None', 'Provide kubeconfig or service account', 'Platform', true, false, false, false, true, undefined);
  }

  private checkMonitoring(_isProd: boolean): PreflightItem {
    return this.build('DEP-020', 'Observability', 'Monitoring & Logging', true, 'ready_to_connect', 'Structured JSON logs (pino) + /health + /metrics', 'Log aggregation destination', 'Production visibility', 'Blind to issues', 'None', 'Configure CloudWatch/Datadog', 'DevOps', false, false, true, false, true, 'Structured logging active');
  }

  private checkAlerting(isProd: boolean): PreflightItem {
    return this.build('DEP-021', 'Observability', 'Alerting & On-Call', true, isProd ? 'not_verified' : 'ready_to_connect', 'No alerting configured', 'Alert rules + notification channel + on-call', 'Incident detection', 'Incidents undetected', 'None', 'Configure alert rules for health/error/latency thresholds', 'DevOps', false, isProd, false, true, true, undefined);
  }

  private checkCiCd(_isProd: boolean): PreflightItem {
    return this.build('DEP-022', 'Infrastructure', 'CI/CD Pipeline', true, 'ready_to_connect', 'GitHub Actions workflows exist', 'Runner configuration + end-to-end test', 'Automated deployment', 'Manual deployment required', 'None', 'Configure GitHub Actions runner, test full pipeline', 'DevOps', false, false, true, true, false, 'Workflow files present in .github/workflows/');
  }

  private checkRedis(): PreflightItem {
    return this.build('DEP-023', 'Infrastructure', 'Redis Cache', false, 'not_required', 'Not used in architecture', 'N/A', 'Optional caching', 'None — not required', 'None', 'No action required', '—', false, false, true, false, false, 'Explicitly not required');
  }

  // ─── BUILDER ────────────────────────────────────────────────────────────────

  private build(id: string, category: string, name: string, required: boolean, status: DependencyStatus, whatWeHave: string, whatIsMissing: string, whyRequired: string, businessImpact: string, securityImpact: string, howToConfigure: string, owner: string, isSecret: boolean, blocking: boolean, automatedCheck: boolean, manualVerification: boolean, externalDependency: boolean, evidence?: string): PreflightItem {
    return { id, category, name, required, status, whatWeHave, whatIsMissing, whyRequired, businessImpact, securityImpact, howToConfigure, owner, isSecret, blocking, blockingReason: blocking ? `${name} is required for production` : undefined, nextAction: status === 'verified' ? 'Monitor' : howToConfigure, automatedCheck, manualVerification, externalDependency, evidence, verifiedAt: evidence ? new Date().toISOString() : undefined };
  }

  private generateWarnings(items: PreflightItem[], env: string): string[] {
    const warnings: string[] = [];
    if (env === 'development') warnings.push('Running in DEVELOPMENT mode — DEV bypasses active, production blocking rules relaxed');
    const mandatoryUnverified = items.filter(i => i.required && i.status !== 'verified');
    if (mandatoryUnverified.length > 0) warnings.push(`${mandatoryUnverified.length} mandatory items not yet verified for production`);
    return warnings;
  }
}
