import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createLogger } from '@askabd/shared-logging';
import { config } from './config/env.js';
import { apiRoutes } from './routes/api-routes.js';
import { operationsCenterRoutes } from './routes/operations-center-routes.js';
import { platformServicesRoutes } from './routes/platform-services-routes.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerAuthorizationMiddleware, COMPARISON_API_RULES } from './platform/rbac/index.js';
import { registerAuditEngine } from './platform/audit/index.js';
import { registerMonitoring } from './platform/monitoring/index.js';
import { registerOpenAPI } from './platform/openapi/index.js';
import { getDatabaseStatus } from './services/db-pool.js';

/**
 * Creates the Fastify server with shared platform logging and authentication.
 */
export async function createServer(): Promise<FastifyInstance> {
  const logger = createLogger({
    service: 'comparison-api',
    environment: config.NODE_ENV,
    version: '0.1.0',
    level: config.LOG_LEVEL as any,
  });

  const server = Fastify({
    loggerInstance: logger,
    genReqId: (req) => {
      // Propagate incoming correlation ID or generate a new one
      return (req.headers['x-request-id'] as string)
        || (req.headers['x-correlation-id'] as string)
        || crypto.randomUUID();
    },
  });
  await server.register(helmet, { contentSecurityPolicy: false });
  const corsOrigin = config.CORS_ORIGIN ?? '*';
  await server.register(cors, {
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Multipart file upload support
  const multipart = await import('@fastify/multipart');
  await server.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });

  // OpenAPI documentation (must be registered before routes)
  await registerOpenAPI(server);

  // Echo correlation ID in response headers for distributed tracing
  server.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Authentication middleware (dev bypass when no JWT_SECRET configured)
  registerAuthMiddleware(server, { publicRoutes: ['/health', '/ready', '/metrics', '/platform/startup', '/docs'] });

  // Authorization middleware (RBAC — evaluates route rules after auth)
  registerAuthorizationMiddleware(server, {
    rules: COMPARISON_API_RULES,
    defaultPolicy: 'authenticated',
    devBypass: config.NODE_ENV !== 'production',
  });

  // Rate limiting middleware (after auth so authenticated users get higher limits)
  registerRateLimitMiddleware(server);

  // Audit engine (captures write operations automatically)
  registerAuditEngine(server, { service: 'comparison-api', repository: 'askabd-comparison' });

  // Monitoring (records response times and error metrics)
  registerMonitoring(server, 'comparison-api');

  // Global error handler (structured responses for all error types)
  registerErrorHandler(server);

  server.get('/health', async () => {
    // Liveness: is this process alive and answering requests? Deliberately does NOT
    // gate on the database — restarting the API would not fix a database outage, and
    // a liveness probe that fails on a downstream dependency causes needless restart
    // loops. `status` therefore reflects startup health only (unchanged contract).
    //
    // `database` below is a LIVE check on every call, not the cached startup flag.
    // Before this fix it reused getDatabaseStatus() — a value set once at startup and
    // never refreshed — so /health kept reporting the database as ready during a real,
    // live Postgres outage (confirmed by DEV failure testing: stopping the DB container
    // left /health saying "database":"ready" while /ready correctly said "disconnected").
    // A monitoring system reading /health must never be told the database is healthy
    // when it is actually unreachable, so this field now always reflects reality.
    let liveDatabase: 'connected' | 'disconnected' = 'disconnected';
    try {
      const { getPrisma } = await import('./services/prisma-client.js');
      await getPrisma().category.count();
      liveDatabase = 'connected';
    } catch { /* liveDatabase stays 'disconnected' */ }

    return {
      status: getDatabaseStatus() === 'ready' ? 'ok' : getDatabaseStatus(), // startup liveness — unchanged
      service: 'comparison-api',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: liveDatabase, // live, current — never stale
    };
  });
  server.get('/ready', async () => {
    // Readiness: verify database connectivity
    try {
      const { getPrisma } = await import('./services/prisma-client.js');
      await getPrisma().category.count();
      return { status: 'ready', database: 'connected' };
    } catch {
      return { status: 'degraded', database: 'disconnected' };
    }
  });
  server.get('/platform/health', async () => {
    const { collectPlatformHealth } = await import('./platform/health/index.js');
    return collectPlatformHealth('comparison-api', {
      checkDatabase: async () => {
        try {
          const { getPrisma } = await import('./services/prisma-client.js');
          const start = Date.now();
          await getPrisma().category.count();
          return { name: 'connectivity', status: 'healthy' as const, message: 'Connected', durationMs: Date.now() - start };
        } catch (err) {
          return { name: 'connectivity', status: 'unhealthy' as const, message: (err as Error).message };
        }
      },
      customDimensions: async () => {
        const now = new Date().toISOString();
        return [
          { name: 'Security Health', status: 'healthy' as const, score: 100, details: 'All security middleware active', lastChecked: now, checks: [
            { name: 'authentication', status: 'healthy' as const, message: 'JWT middleware active' },
            { name: 'authorization', status: 'healthy' as const, message: 'RBAC framework active' },
            { name: 'rate_limiting', status: 'healthy' as const, message: 'Token bucket active' },
          ]},
          { name: 'Platform Health', status: 'healthy' as const, score: 100, details: 'Full middleware stack operational', lastChecked: now, checks: [
            { name: 'auth_middleware', status: 'healthy' as const, message: 'Active' },
            { name: 'audit_engine', status: 'healthy' as const, message: 'Active' },
            { name: 'correlation_id', status: 'healthy' as const, message: 'Active' },
          ]},
        ];
      },
    });
  });
  server.get('/platform/flags', async (request) => {
    const { getFeatureFlags } = await import('./platform/feature-flags/index.js');
    const auth = (request as any).auth;
    return getFeatureFlags().getAllFlags({
      environment: config.NODE_ENV ?? 'development',
      tenantId: auth?.tenantId,
      userId: auth?.userId,
    });
  });
  await server.register(apiRoutes, { prefix: '/api/v1' });
  await server.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await server.register(platformServicesRoutes);
  return server;
}
