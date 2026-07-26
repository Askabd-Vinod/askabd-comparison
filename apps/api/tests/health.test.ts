import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { FastifyInstance } from 'fastify';
describe('Comparison API', () => {
  let server: FastifyInstance;
  beforeAll(async () => { server = await createServer(); await server.ready(); });
  afterAll(async () => { await server.close(); });
  it('GET /health', async () => { const r = await server.inject({ method: 'GET', url: '/health' }); expect(r.statusCode).toBe(200); expect(r.json().service).toBe('comparison-api'); });
  it('GET /api/v1/categories returns array', async () => { const r = await server.inject({ method: 'GET', url: '/api/v1/categories' }); expect(r.statusCode).toBe(200); });
});
