import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server.js';
import { sharedPool } from '../src/services/db-pool.js';
import { FastifyInstance } from 'fastify';
describe('Comparison API', () => {
  let server: FastifyInstance;
  beforeAll(async () => { server = await createServer(); await server.ready(); });
  afterAll(async () => { await server.close(); await sharedPool.end(); });
  it('GET /health', async () => { const r = await server.inject({ method: 'GET', url: '/health' }); expect(r.statusCode).toBe(200); expect(r.json().service).toBe('comparison-api'); });
  // GET /api/v1/categories is `authenticatedOnly: true` (see platform/rbac/rules.ts)
  // — this used to assert 200 with zero Authorization header, which only ever
  // passed because this process's real devBypass was accidentally active (no
  // JWKS_URL/JWT_SECRET configured — see docs/local-development-runbook.md). Now
  // that real auth is correctly enforced, an unauthenticated request here should
  // genuinely 401 — a more accurate assertion than the old one, not a weaker one.
  // Real authenticated behavior for this route is covered by
  // rbac-service-assignment.test.ts.
  it('GET /api/v1/categories requires authentication (401 with no token)', async () => { const r = await server.inject({ method: 'GET', url: '/api/v1/categories' }); expect(r.statusCode).toBe(401); });
});
