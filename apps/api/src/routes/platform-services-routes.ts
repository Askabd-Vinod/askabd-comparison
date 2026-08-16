/**
 * AskABD Platform — Environment & Service Health + One-Click Recovery
 *
 * Provides environment-aware service discovery, real health checks,
 * dependency graph, and safe DEV-only recovery via Docker Compose.
 * Never exposes credentials or secrets. Never accepts arbitrary commands.
 */
import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { sharedPool, getDatabaseStatus } from '../services/db-pool.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── Environment Model ────────────────────────────────────────────────────────

type AppEnvironment = 'development' | 'staging' | 'production';
type ServiceStatus = 'RUNNING' | 'STARTING' | 'STOPPED' | 'UNHEALTHY' | 'NOT_CONFIGURED' | 'UNKNOWN' | 'RECOVERING' | 'RECOVERY_FAILED';
type ServiceCategory = 'application' | 'data' | 'communication' | 'external';

interface ServiceHealth {
  id: string;
  name: string;
  category: ServiceCategory;
  environment: AppEnvironment;
  endpoint?: string;
  port?: number;
  protocol: 'http' | 'tcp' | 'smtp' | 'self';
  status: ServiceStatus;
  healthy: boolean;
  responseMs?: number;
  lastChecked: string;
  lastError?: string;
  dependencies: string[];
  actions: string[];
  recoverable: boolean;
  recoveryMechanism?: string;
  affectedFeatures: string[];
}

interface EnvironmentConfig {
  environment: AppEnvironment;
  label: string;
  description: string;
  isActive: boolean;
  services: ServiceHealth[];
}

interface RecoveryEntry {
  id: string;
  serviceId: string;
  serviceName: string;
  action: string;
  status: 'started' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

// In-memory recovery history (acceptable for DEV tooling)
const recoveryHistory: RecoveryEntry[] = [];
const MAX_HISTORY = 20;

function getAppEnvironment(): AppEnvironment {
  const env = (process.env.APP_ENV || config.NODE_ENV || 'development').toLowerCase();
  if (env === 'staging') return 'staging';
  if (env === 'production') return 'production';
  return 'development';
}

// ─── Allowlisted Recovery Commands ────────────────────────────────────────────
// Only these predefined operations are permitted. No arbitrary commands.

const RECOVERY_ALLOWLIST: Record<string, { command: string; description: string }> = {
  'postgresql': { command: 'docker restart b3d4e70eabdb_comparison-postgres', description: 'Docker restart PostgreSQL container' },
  'mailpit-smtp': { command: 'docker restart askabd-mailpit', description: 'Docker restart Mailpit container' },
  'mailpit-ui': { command: 'docker restart askabd-mailpit', description: 'Docker restart Mailpit container' },
};

// ─── Health Check Functions ───────────────────────────────────────────────────

async function checkApi(): Promise<{ status: ServiceStatus; healthy: boolean; responseMs: number; error?: string }> {
  const start = Date.now();
  try {
    const dbStatus = getDatabaseStatus();
    const responseMs = Date.now() - start;
    if (dbStatus === 'ready') return { status: 'RUNNING', healthy: true, responseMs };
    return { status: 'UNHEALTHY', healthy: false, responseMs, error: `Database status: ${dbStatus}` };
  } catch (err: any) {
    return { status: 'UNHEALTHY', healthy: false, responseMs: Date.now() - start, error: err.message };
  }
}

async function checkPostgres(): Promise<{ status: ServiceStatus; healthy: boolean; responseMs: number; error?: string }> {
  const start = Date.now();
  try {
    const client = await sharedPool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    return { status: 'RUNNING', healthy: true, responseMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'UNHEALTHY', healthy: false, responseMs: Date.now() - start, error: err.message };
  }
}

async function checkMailpitSmtp(): Promise<{ status: ServiceStatus; healthy: boolean; responseMs: number; error?: string }> {
  // TCP connection check for SMTP — do NOT use HTTP against port 1025
  const start = Date.now();
  try {
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = net.connect(1025, '127.0.0.1', () => {
        socket.end();
        resolve({ status: 'RUNNING', healthy: true, responseMs: Date.now() - start });
      });
      socket.on('error', (err) => {
        resolve({ status: 'STOPPED', healthy: false, responseMs: Date.now() - start, error: err.message });
      });
      setTimeout(() => { socket.destroy(); resolve({ status: 'STOPPED', healthy: false, responseMs: Date.now() - start, error: 'SMTP connection timeout' }); }, 3000);
    });
  } catch (err: any) {
    return { status: 'STOPPED', healthy: false, responseMs: Date.now() - start, error: err.message };
  }
}

async function checkMailpitUi(): Promise<{ status: ServiceStatus; healthy: boolean; responseMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('http://127.0.0.1:8025/api/v1/messages?limit=1', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return { status: 'RUNNING', healthy: true, responseMs: Date.now() - start };
    return { status: 'UNHEALTHY', healthy: false, responseMs: Date.now() - start, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { status: 'STOPPED', healthy: false, responseMs: Date.now() - start, error: err.message };
  }
}

async function checkWeb(): Promise<{ status: ServiceStatus; healthy: boolean; responseMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://127.0.0.1:3001', { signal: controller.signal, redirect: 'manual' });
    clearTimeout(timeout);
    if (res.status < 500) return { status: 'RUNNING', healthy: true, responseMs: Date.now() - start };
    return { status: 'UNHEALTHY', healthy: false, responseMs: Date.now() - start, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { status: 'STOPPED', healthy: false, responseMs: Date.now() - start, error: err.message };
  }
}

// ─── DEV Environment Services ─────────────────────────────────────────────────

async function getDevServices(): Promise<ServiceHealth[]> {
  const now = new Date().toISOString();
  const [apiHealth, pgHealth, smtpHealth, uiHealth, webHealth] = await Promise.all([
    checkApi(), checkPostgres(), checkMailpitSmtp(), checkMailpitUi(), checkWeb(),
  ]);

  const services: ServiceHealth[] = [
    {
      id: 'askabd-web', name: 'AskABD Web', category: 'application',
      environment: 'development', endpoint: 'http://localhost:3001', port: 3001,
      protocol: 'http',
      status: webHealth.status, healthy: webHealth.healthy, responseMs: webHealth.responseMs,
      lastChecked: now, lastError: webHealth.error,
      dependencies: ['askabd-api'],
      actions: ['refresh'],
      recoverable: false,
      recoveryMechanism: 'Manual: npm run dev in apps/web',
      affectedFeatures: ['Entire AskABD Web UI'],
    },
    {
      id: 'askabd-api', name: 'AskABD API', category: 'application',
      environment: 'development', endpoint: 'http://localhost:4200', port: 4200,
      protocol: 'self',
      status: apiHealth.status, healthy: apiHealth.healthy, responseMs: apiHealth.responseMs,
      lastChecked: now, lastError: apiHealth.error,
      dependencies: ['postgresql', 'mailpit-smtp'],
      actions: ['refresh'],
      recoverable: false,
      recoveryMechanism: 'Manual: npm run dev in apps/api (this IS the API)',
      affectedFeatures: ['Client Management', 'Lifecycle', 'Requirements', 'Discovery', 'Assessment', 'Migration', 'OTP', 'Email'],
    },
    {
      id: 'postgresql', name: 'PostgreSQL', category: 'data',
      environment: 'development', endpoint: 'localhost:5442', port: 5442,
      protocol: 'tcp',
      status: pgHealth.status, healthy: pgHealth.healthy, responseMs: pgHealth.responseMs,
      lastChecked: now, lastError: pgHealth.error,
      dependencies: [],
      actions: pgHealth.healthy ? ['refresh'] : ['refresh', 'recover'],
      recoverable: true,
      recoveryMechanism: 'docker restart comparison-postgres',
      affectedFeatures: ['Client Management', 'Lifecycle', 'Requirements', 'Discovery', 'Assessment', 'Migration', 'Validation', 'Rollback', 'Engineering Intelligence'],
    },
    {
      id: 'mailpit-smtp', name: 'Mailpit SMTP', category: 'communication',
      environment: 'development', endpoint: 'localhost:1025', port: 1025,
      protocol: 'smtp',
      status: smtpHealth.status, healthy: smtpHealth.healthy, responseMs: smtpHealth.responseMs,
      lastChecked: now, lastError: smtpHealth.error,
      dependencies: [],
      actions: smtpHealth.healthy ? ['refresh'] : ['refresh', 'recover'],
      recoverable: true,
      recoveryMechanism: 'docker restart askabd-mailpit',
      affectedFeatures: ['OTP Send', 'OTP Resend', 'Email Notifications'],
    },
    {
      id: 'mailpit-ui', name: 'Mailpit Web UI', category: 'communication',
      environment: 'development', endpoint: 'http://localhost:8025', port: 8025,
      protocol: 'http',
      status: uiHealth.status, healthy: uiHealth.healthy, responseMs: uiHealth.responseMs,
      lastChecked: now, lastError: uiHealth.error,
      dependencies: ['mailpit-smtp'],
      actions: uiHealth.healthy ? ['refresh', 'open'] : ['refresh', 'recover', 'open'],
      recoverable: true,
      recoveryMechanism: 'docker restart askabd-mailpit',
      affectedFeatures: ['Email inspection in Mailpit UI'],
    },
  ];

  return services;
}

// ─── Staging/Production Placeholder Configs ───────────────────────────────────

function getStagingServices(): ServiceHealth[] {
  const now = new Date().toISOString();
  return [
    { id: 'staging-web', name: 'Staging Web', category: 'application', environment: 'staging', protocol: 'http', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: ['staging-api'], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
    { id: 'staging-api', name: 'Staging API', category: 'application', environment: 'staging', protocol: 'http', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: ['staging-postgres'], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
    { id: 'staging-postgres', name: 'Staging PostgreSQL', category: 'data', environment: 'staging', protocol: 'tcp', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: [], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
  ];
}

function getProductionServices(): ServiceHealth[] {
  const now = new Date().toISOString();
  return [
    { id: 'prod-web', name: 'Production Web', category: 'application', environment: 'production', protocol: 'http', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: ['prod-api'], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
    { id: 'prod-api', name: 'Production API', category: 'application', environment: 'production', protocol: 'http', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: ['prod-postgres', 'prod-redis'], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
    { id: 'prod-postgres', name: 'Production PostgreSQL', category: 'data', environment: 'production', protocol: 'tcp', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: [], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
    { id: 'prod-redis', name: 'Production Redis', category: 'data', environment: 'production', protocol: 'tcp', status: 'UNKNOWN', healthy: false, lastChecked: now, dependencies: [], actions: ['refresh'], recoverable: false, affectedFeatures: [] },
  ];
}

// ─── Recovery Logic ───────────────────────────────────────────────────────────

async function recoverService(serviceId: string): Promise<RecoveryEntry> {
  const entry: RecoveryEntry = {
    id: `rec-${Date.now()}`,
    serviceId,
    serviceName: serviceId,
    action: 'restart',
    status: 'started',
    startedAt: new Date().toISOString(),
  };

  const allowed = RECOVERY_ALLOWLIST[serviceId];
  if (!allowed) {
    entry.status = 'failed';
    entry.error = 'Service not in recovery allowlist';
    entry.completedAt = new Date().toISOString();
    entry.durationMs = 0;
    recoveryHistory.unshift(entry);
    return entry;
  }

  entry.action = allowed.description;
  const startMs = Date.now();

  try {
    await execAsync(allowed.command, { timeout: 30000 });

    // Wait for the service to come back up (poll health)
    let healthy = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      let check: { healthy: boolean };
      if (serviceId === 'postgresql') check = await checkPostgres();
      else if (serviceId === 'mailpit-smtp') check = await checkMailpitSmtp();
      else if (serviceId === 'mailpit-ui') check = await checkMailpitUi();
      else check = { healthy: false };

      if (check.healthy) { healthy = true; break; }
    }

    entry.durationMs = Date.now() - startMs;
    entry.completedAt = new Date().toISOString();

    if (healthy) {
      entry.status = 'success';
      entry.serviceName = serviceId === 'postgresql' ? 'PostgreSQL' : serviceId === 'mailpit-smtp' ? 'Mailpit SMTP' : 'Mailpit Web UI';
    } else {
      entry.status = 'failed';
      entry.error = 'Service restarted but did not become healthy within timeout';
    }
  } catch (err: any) {
    entry.status = 'failed';
    entry.error = err.message;
    entry.durationMs = Date.now() - startMs;
    entry.completedAt = new Date().toISOString();
  }

  recoveryHistory.unshift(entry);
  if (recoveryHistory.length > MAX_HISTORY) recoveryHistory.length = MAX_HISTORY;
  return entry;
}

// ─── Route Registration ───────────────────────────────────────────────────────

export async function platformServicesRoutes(server: FastifyInstance): Promise<void> {

  // GET /platform/services — full environment + service health
  server.get('/platform/services', async () => {
    const activeEnv = getAppEnvironment();
    const devServices = activeEnv === 'development' ? await getDevServices() : [];

    const environments: EnvironmentConfig[] = [
      {
        environment: 'development', label: 'DEV', description: 'Local Development Environment',
        isActive: activeEnv === 'development', services: activeEnv === 'development' ? devServices : [],
      },
      {
        environment: 'staging', label: 'STAGING', description: 'Staging / Pre-Production',
        isActive: activeEnv === 'staging', services: activeEnv === 'staging' ? getStagingServices() : [],
      },
      {
        environment: 'production', label: 'PRODUCTION', description: 'Production',
        isActive: activeEnv === 'production', services: activeEnv === 'production' ? getProductionServices() : [],
      },
    ];

    return { activeEnvironment: activeEnv, timestamp: new Date().toISOString(), environments };
  });

  // GET /platform/services/health — quick summary
  server.get('/platform/services/health', async () => {
    const activeEnv = getAppEnvironment();
    if (activeEnv !== 'development') {
      return { activeEnvironment: activeEnv, services: [], message: 'Remote health checks not configured.' };
    }
    const services = await getDevServices();
    const allHealthy = services.every(s => s.healthy);
    const unhealthy = services.filter(s => !s.healthy);
    return {
      activeEnvironment: activeEnv,
      overall: allHealthy ? 'HEALTHY' : 'DEGRADED',
      healthy: services.filter(s => s.healthy).length,
      total: services.length,
      unhealthy: unhealthy.map(s => ({ id: s.id, name: s.name, status: s.status, error: s.lastError })),
      timestamp: new Date().toISOString(),
    };
  });

  // POST /platform/services/:serviceId/recover — DEV-only safe recovery
  server.post('/platform/services/:serviceId/recover', async (req, reply) => {
    const activeEnv = getAppEnvironment();
    if (activeEnv !== 'development') {
      reply.status(403).send({ error: 'Recovery is only available in development environment' });
      return;
    }

    const { serviceId } = req.params as { serviceId: string };

    if (!RECOVERY_ALLOWLIST[serviceId]) {
      reply.status(400).send({
        error: `Service '${serviceId}' is not recoverable via this mechanism`,
        hint: serviceId === 'askabd-api' ? 'The API cannot restart itself. Run: npx tsx src/index.ts' :
              serviceId === 'askabd-web' ? 'Run: npm run dev in apps/web directory' : undefined,
      });
      return;
    }

    const result = await recoverService(serviceId);
    const statusCode = result.status === 'success' ? 200 : result.status === 'failed' ? 500 : 202;
    reply.status(statusCode).send(result);
  });

  // GET /platform/services/recovery-history — recent DEV recovery actions
  server.get('/platform/services/recovery-history', async () => {
    return { history: recoveryHistory.slice(0, 10) };
  });

  // ─── SERVICE REGISTRY ─────────────────────────────────────────────────────

  const { ServiceRegistryService } = await import('../services/service-registry.js');
  const serviceRegistry = new ServiceRegistryService();

  server.get('/platform/services/registry', async () => {
    return { services: await serviceRegistry.getAllServices() };
  });

  server.get('/platform/services/registry/summary', async () => {
    return serviceRegistry.getServiceSummary();
  });

  server.get('/platform/services/registry/categories', async () => {
    return { categories: await serviceRegistry.getServicesByCategory() };
  });

  server.get('/platform/services/registry/:serviceId', async (req, reply) => {
    const { serviceId } = req.params as any;
    const service = await serviceRegistry.getService(serviceId);
    if (!service) { reply.status(404).send({ error: 'Service not found' }); return; }
    reply.send(service);
  });

  // ─── PRODUCTION PREFLIGHT ───────────────────────────────────────────────────

  server.get('/platform/production/preflight', async () => {
    const { ProductionPreflightService } = await import('../services/production-preflight-service.js');
    const preflight = new ProductionPreflightService();
    return preflight.runPreflight();
  });

  server.get('/platform/production/go-no-go', async () => {
    const { ProductionPreflightService } = await import('../services/production-preflight-service.js');
    const preflight = new ProductionPreflightService();
    return preflight.getGoNoGo();
  });

  server.get('/platform/staging/go-no-go', async () => {
    const { ProductionPreflightService } = await import('../services/production-preflight-service.js');
    const preflight = new ProductionPreflightService();
    const report = await preflight.runPreflight();

    // Staging Go/No-Go: less strict than production — external integrations are optional
    const mandatoryForStaging = report.requiredItems.concat(report.verifiedItems).concat(report.blockingItems)
      .filter(i => i.required && !['Integration'].includes(i.category));
    const stagingVerified = mandatoryForStaging.filter(i => i.status === 'verified');
    const stagingBlocking = mandatoryForStaging.filter(i => i.status === 'missing' || i.status === 'failed');

    const decision = stagingBlocking.length === 0 && stagingVerified.length === mandatoryForStaging.length
      ? 'STAGING_GO' : 'STAGING_NO_GO';

    return {
      decision,
      environment: report.environment,
      applicationReady: report.applicationStatus === 'ready',
      infrastructureVerified: stagingVerified.length,
      infrastructureTotal: mandatoryForStaging.length,
      blocking: stagingBlocking.map(i => ({ id: i.id, name: i.name, status: i.status, missing: i.whatIsMissing, owner: i.owner })),
      optionalUnverified: report.optionalItems.filter(i => i.status !== 'verified').map(i => ({ id: i.id, name: i.name })),
      score: mandatoryForStaging.length > 0 ? Math.round((stagingVerified.length / mandatoryForStaging.length) * 100) : 0,
      timestamp: new Date().toISOString(),
    };
  });
}
