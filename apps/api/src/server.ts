import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createLogger } from '@askabd/shared-logging';
import { config } from './config/env.js';
import { apiRoutes } from './routes/api-routes.js';

/**
 * Creates the Fastify server with shared platform logging.
 * Logger includes: service name, environment, version, redaction of secrets.
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
  server.get('/health', async () => ({ status: 'ok', service: 'comparison-api', uptime: process.uptime() }));
  server.get('/ready', async () => ({ status: 'ready' }));
  await server.register(apiRoutes, { prefix: '/api/v1' });
  return server;
}
