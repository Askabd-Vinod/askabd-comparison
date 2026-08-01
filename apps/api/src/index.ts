import { createServer } from './server.js';
import { config } from './config/env.js';
import {
  validateConfiguration,
  databaseCheck,
  jwtCheck,
  urlCheck,
} from './platform/config-validator/index.js';

async function main(): Promise<void> {
  // ─── Startup Configuration Validation ───────────────────────────────────────
  const report = await validateConfiguration('comparison-api', config.NODE_ENV ?? 'development', [
    databaseCheck(config.DATABASE_URL),
    jwtCheck(),
    urlCheck('Gateway', config.GATEWAY_URL, false),
  ]);

  // Log startup report
  const icon = report.overallStatus === 'ready' ? '✓' : report.overallStatus === 'degraded' ? '⚠' : '✗';
  console.log(`\n[${icon}] Startup Validation: ${report.overallStatus.toUpperCase()} (${report.summary.passed}/${report.summary.total} checks passed)`);
  for (const r of report.results) {
    const sym = r.status === 'pass' ? '  ✓' : r.status === 'warn' ? '  ⚠' : r.status === 'skip' ? '  ○' : '  ✗';
    console.log(`${sym} ${r.name}: ${r.message}`);
    if (r.fix && r.status !== 'pass') console.log(`      Fix: ${r.fix}`);
  }
  console.log('');

  // In production, fail-fast on required check failures
  if (report.overallStatus === 'failed' && config.NODE_ENV === 'production') {
    console.error('FATAL: Required configuration checks failed. Cannot start in production.');
    process.exit(1);
  }

  // ─── Server Start ──────────────────────────────────────────────────────────
  const server = await createServer();

  // Expose startup report on platform endpoint (must register before listen)
  server.get('/platform/startup', async () => report);

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
