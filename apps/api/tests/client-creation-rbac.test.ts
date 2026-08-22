/**
 * Client creation/editing — RBAC gate.
 *
 * Found during the staff-workflow investigation pass: POST /oc/clients and
 * PUT /oc/clients/:id had NO explicit RBAC rule at all — any authenticated identity,
 * including a real customer, could create an arbitrary client or rewrite an existing
 * one's core record. Fixed in platform/rbac/rules.ts. These tests prove the fix
 * against the REAL route handlers (operations-center-routes.ts), not a stub.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
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

const createdClientIds: string[] = [];

afterAll(async () => {
  for (const id of createdClientIds) {
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('Client creation — the real gap, now closed', () => {
  it('unauthenticated create is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients', payload: { name: 'x' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a real customer token (no staff role) is denied client creation (403) — the actual defect this fixes', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: `customer-${randomUUID()}`, org: 'some-org' }); // real-shaped: no roles claim
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients', headers: { authorization: `Bearer ${token}` }, payload: { name: 'Attempted Client', industry: 'Technology', country: 'India' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('admin can create a real client', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients', headers: { authorization: `Bearer ${token}` }, payload: { name: 'RBAC Test Client', industry: 'Technology', country: 'India' } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    createdClientIds.push(body.client.id);
    await app.close();
  });
});

describe('Client editing — the real gap, now closed', () => {
  it('a real customer token is denied editing a client, even one they are mapped to (Admin.Access is independent of tenant-access)', async () => {
    const app = await buildApp();
    const clientId = (await sharedPool.query<{ id: string }>(
      `INSERT INTO oc_clients (name, logo, industry, country) VALUES ('RBAC Edit Test Client', '', 'Technology', 'India') RETURNING id`,
    )).rows[0]!.id;
    createdClientIds.push(clientId);

    const token = await signToken({ sub: `customer-${randomUUID()}`, org: 'some-org' });
    const res = await app.inject({ method: 'PUT', url: `/api/v1/oc/clients/${clientId}`, headers: { authorization: `Bearer ${token}` }, payload: { name: 'Hijacked Name' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('admin can edit a real client', async () => {
    const app = await buildApp();
    const clientId = (await sharedPool.query<{ id: string }>(
      `INSERT INTO oc_clients (name, logo, industry, country) VALUES ('RBAC Edit Admin Client', '', 'Technology', 'India') RETURNING id`,
    )).rows[0]!.id;
    createdClientIds.push(clientId);

    const token = await signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
    const res = await app.inject({ method: 'PUT', url: `/api/v1/oc/clients/${clientId}`, headers: { authorization: `Bearer ${token}` }, payload: { name: 'Renamed By Admin' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
