/**
 * Real global search — final closure pass. The frontend previously only searched
 * ~20 static mock-clients.ts records; a genuinely onboarded client, incident,
 * defect, or migration was never findable. Proves the real backend search against
 * real Postgres rows, and proves it's gated the same way every other cross-client
 * aggregate route is (staff/admin-only — not reachable by an unrelated customer).
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const SECRET = 'test-secret-value-not-a-real-secret';

function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('askabd-identity')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'unrelated-org' });

function minimalClient(name: string) {
  return {
    name, logo: '', industry: 'Technology', country: 'India', timezone: 'UTC',
    businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
    primaryContact: 'test@example.com', departments: [], capabilities: [], processes: [],
    applications: [], techApps: [], techServices: [], techApis: [], techDatabases: [],
    techServers: [], techCloud: [], techInfrastructure: [], environments: {}, monitoring: {},
    enabledServices: [],
  };
}

const cleanupClientIds: string[] = [];
afterAll(async () => {
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

describe('Real global search', () => {
  it('finds a genuinely real client by a unique name fragment, via the actual database — not the demo dataset', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const uniqueName = `Zylophant Search Fixture ${randomUUID().slice(0, 8)}`;
    const client = await ocService.createClient(minimalClient(uniqueName));
    cleanupClientIds.push(client.id);

    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/search?q=${encodeURIComponent('Zylophant Search Fixture')}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results.clients.some((c: any) => c.id === client.id)).toBe(true);
    expect(body.totalMatches).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it('a real customer token is denied global search (403) — this is a cross-client staff aggregate, not a customer-portal capability', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/search?q=test', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/search?q=test' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a short/empty query returns an honest empty result set, never fabricated matches', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/search?q=a', headers: { authorization: `Bearer ${admin}` } });
    expect(res.json().totalMatches).toBe(0);
    expect(res.json().results.clients).toEqual([]);
    await app.close();
  });
});
