import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createLogger } from '@askabd/shared-logging';
import { config } from './config/env.js';
import { apiRoutes } from './routes/api-routes.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerErrorHandler } from './middleware/error-handler.js';

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

  const server = Fastify({ loggerInstance: logger, genReqId: () => crypto.randomUUID() });
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, { origin: true, credentials: true });

  // Authentication middleware (dev bypass when no JWT_SECRET configured)
  registerAuthMiddleware(server, { publicRoutes: ['/health', '/ready'] });

  // Rate limiting middleware (after auth so authenticated users get higher limits)
  registerRateLimitMiddleware(server);

  // Global error handler (structured responses for all error types)
  registerErrorHandler(server);

  server.get('/health', async () => ({ status: 'ok', service: 'comparison-api', uptime: process.uptime() }));
  server.get('/ready', async () => ({ status: 'ready' }));
  await server.register(apiRoutes, { prefix: '/api/v1' });
  return server;
}
