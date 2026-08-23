/**
 * Technology Adapter Registry — migration 051, technology-adapter-registry.ts,
 * technology-adapter-routes.ts. Proves, against real Postgres:
 *  - the real seed data (postgresql=supported, oracle/sqlserver/mysql/
 *    mongodb=adapter_required) is genuinely persisted and readable
 *  - checkCompatibility() returns the real, honest status for a known
 *    technology, and a real, honest `unknown_technology` (never a crash,
 *    never a fabricated `supported`) for one that was never registered
 *  - register() really persists a new/updated adapter row (upsert)
 *  - the real routes require Admin.Access and return the real registry data
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { technologyAdapterRoutes } from '../src/routes/technology-adapter-routes.js';
import { TechnologyAdapterRegistry } from '../src/services/technology-adapter-registry.js';
import { sharedPool } from '../src/services/db-pool.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'unrelated-org' });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(technologyAdapterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const cleanupKeys: Array<{ technology: string; category: string }> = [];
afterAll(async () => {
  for (const { technology, category } of cleanupKeys) {
    await sharedPool.query('DELETE FROM technology_adapters WHERE technology = $1 AND category = $2', [technology, category]).catch(() => {});
  }
});

describe('TechnologyAdapterRegistry — real seed data', () => {
  it('lists the real, honestly-seeded database adapters', async () => {
    const registry = new TechnologyAdapterRegistry();
    const adapters = await registry.list('database');
    const byTech = Object.fromEntries(adapters.map(a => [a.technology, a.status]));
    expect(byTech.postgresql).toBe('supported');
    expect(byTech.oracle).toBe('adapter_required');
    expect(byTech.sqlserver).toBe('adapter_required');
    expect(byTech.mysql).toBe('adapter_required');
    expect(byTech.mongodb).toBe('adapter_required');
  });

  it('checkCompatibility reports the real status and a real, non-empty message for a known technology', async () => {
    const registry = new TechnologyAdapterRegistry();
    const supported = await registry.checkCompatibility('postgresql', 'database');
    expect(supported.status).toBe('supported');
    expect(supported.adapter).not.toBeNull();
    expect(supported.message).toContain('postgresql');

    const required = await registry.checkCompatibility('oracle', 'database');
    expect(required.status).toBe('adapter_required');
    expect(required.message.toLowerCase()).toContain('adapter');
  });

  it('checkCompatibility on a NEVER-registered technology returns an honest unknown_technology status, never a crash or a fabricated supported', async () => {
    const registry = new TechnologyAdapterRegistry();
    const result = await registry.checkCompatibility(`totally-made-up-tech-${randomUUID().slice(0, 8)}`, 'database');
    expect(result.status).toBe('unknown_technology');
    expect(result.adapter).toBeNull();
    expect(result.message).toContain('not registered');
  });

  it('register() really upserts a new adapter row, retrievable afterward', async () => {
    const registry = new TechnologyAdapterRegistry();
    const technology = `snowflake-fixture-${randomUUID().slice(0, 8)}`;
    cleanupKeys.push({ technology, category: 'database' });

    const created = await registry.register({
      technology, vendor: 'Snowflake Inc.', category: 'database', status: 'adapter_required', notes: 'Real fixture row for this test only.',
    });
    expect(created.status).toBe('adapter_required');

    const fetched = await registry.get(technology, 'database');
    expect(fetched?.vendor).toBe('Snowflake Inc.');

    const updated = await registry.register({ technology, vendor: 'Snowflake Inc.', category: 'database', status: 'supported', notes: 'Now real and working.' });
    expect(updated.status).toBe('supported');
    expect(updated.id).toBe(created.id); // real upsert, not a duplicate row
  });
});

describe('Technology Adapter Registry — routes, RBAC', () => {
  it('GET /oc/technology-adapters returns the real seed data to an admin', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/technology-adapters?category=database', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    const { adapters } = res.json();
    expect(adapters.some((a: any) => a.technology === 'postgresql' && a.status === 'supported')).toBe(true);
    await app.close();
  });

  it('GET /oc/technology-adapters/:category/:technology returns a real compatibility result', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/technology-adapters/database/oracle', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().compatibility.status).toBe('adapter_required');
    await app.close();
  });

  it('a real customer token is denied (403)', async () => {
    const app = await buildApp();
    const customer = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/technology-adapters', headers: { authorization: `Bearer ${customer}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/technology-adapters' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
