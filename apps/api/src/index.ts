import { createServer } from './server.js';
import { config } from './config/env.js';
import {
  validateConfiguration,
  calculateReadiness,
  databaseCheck,
  databaseConnectivityCheck,
  jwtCheck,
  urlCheck,
  nodeVersionCheck,
  portCheck,
  memoryCheck,
} from '@askabd/shared-config-validator';
import {
  osCheck,
  cpuCheck,
  loggingCheck,
  featureFlagCheck,
  monitoringCheck,
  auditCheck,
  rbacCheck,
  diagnosticsCheck,
  dockerCheck,
  redisCheck,
} from './platform/config-validator/checks.js';

async function main(): Promise<void> {
  // ─── Startup Configuration Validation ───────────────────────────────────────
  const report = await validateConfiguration('comparison-api', config.NODE_ENV ?? 'development', [
    // Infrastructure
    nodeVersionCheck(20),
    osCheck(),
    cpuCheck(2),
    memoryCheck(256),
    portCheck(config.PORT ?? 4200),

    // Database
    databaseCheck(config.DATABASE_URL),
    databaseConnectivityCheck(config.DATABASE_URL),

    // Security
    jwtCheck(),

    // Platform Capabilities
    loggingCheck(config.LOG_LEVEL),
    featureFlagCheck(),
    monitoringCheck(),
    auditCheck(),
    rbacCheck(),
    diagnosticsCheck(),

    // External Services
    urlCheck('Gateway', config.GATEWAY_URL, false),
    redisCheck(process.env.REDIS_URL),

    // Docker
    dockerCheck(),
  ]);

  const readiness = calculateReadiness(report);

  // Log startup report
  const icon = report.overallStatus === 'ready' ? '✓' : report.overallStatus === 'degraded' ? '⚠' : '✗';
  console.log(`\n[${icon}] Startup Validation: ${report.overallStatus.toUpperCase()} (${report.summary.passed}/${report.summary.total} checks passed)`);
  for (const r of report.results) {
    const sym = r.status === 'pass' ? '  ✓' : r.status === 'warn' ? '  ⚠' : r.status === 'skip' ? '  ○' : '  ✗';
    console.log(`${sym} ${r.name}: ${r.message}`);
    if (r.fix && r.status !== 'pass') console.log(`      Fix: ${r.fix}`);
  }
  console.log(`\n  Readiness: Platform=${readiness.platform}% Security=${readiness.security}% Database=${readiness.database}% Infra=${readiness.infrastructure}% Deploy=${readiness.deployment}% API=${readiness.api}% Overall=${readiness.overall}%\n`);

  // In production, fail-fast on required check failures
  if (report.overallStatus === 'failed' && config.NODE_ENV === 'production') {
    console.error('FATAL: Required configuration checks failed. Cannot start in production.');
    process.exit(1);
  }

  // ─── Server Start ──────────────────────────────────────────────────────────
  const server = await createServer();

  // Expose startup report on platform endpoint (must register before listen)
  server.get('/platform/startup', async () => ({ ...report, readiness }));

  await server.listen({ port: config.PORT, host: config.HOST });
  server.log.info(`Comparison API on ${config.HOST}:${config.PORT}`);

  // ─── Graceful Shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    server.log.info({ signal }, 'Received shutdown signal, closing server...');
    try {
      await server.close();
      server.log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => { console.error(e); process.exit(1); });
