import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config/env.js';
import { apiRoutes } from './routes/api-routes.js';
export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: { level: config.LOG_LEVEL }, genReqId: () => crypto.randomUUID() });
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, { origin: true, credentials: true });
  server.get('/health', async () => ({ status: 'ok', service: 'comparison-api', uptime: process.uptime() }));
  server.get('/ready', async () => ({ status: 'ready' }));
  await server.register(apiRoutes, { prefix: '/api/v1' });
  return server;
}
