import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createLogger } from '@askabd/shared-logging';
import { config } from './config/env.js';
import { apiRoutes } from './routes/api-routes.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerAuthorizationMiddleware, COMPARISON_API_RULES } from './platform/rbac/index.js';
import { registerAuditEngine } from './platform/audit/index.js';
import { registerMonitoring } from './platform/monitoring/index.js';

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
  await server.register(cors, { origin: true, credentials: true });

  // Echo correlation ID in response headers for distributed tracing
  server.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Authentication middleware (dev bypass when no JWT_SECRET configured)
  registerAuthMiddleware(server, { publicRoutes: ['/health', '/ready', '/metrics'] });

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

  server.get('/health', async () => ({
    status: 'ok',
    service: 'comparison-api',
    version: '0.1.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));
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
  return server;
}
