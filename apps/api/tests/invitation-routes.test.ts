/**
 * Invitation routes — RBAC gating + public-route reachability.
 *
 * Confirms the security boundary from the outside (real HTTP through the real
 * middleware stack), not just the service layer: admin-only routes reject non-admin
 * and unauthenticated callers; the two intentionally public routes (lookup, accept)
 * are reachable with NO token at all, since that is their entire purpose.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { invitationRoutes } from '../src/routes/invitation-routes.js';
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
  registerAuthMiddleware(app, {
    publicRoutes: ['/api/v1/oc/invitations/lookup', '/api/v1/oc/invitations/accept'],
    devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity',
  });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  await app.register(invitationRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

let clientId: string;
const createdClientIds: string[] = [];

beforeAll(async () => {
  const result = await sharedPool.query<{ id: string }>(
    `INSERT INTO oc_clients (name, logo, industry, country) VALUES ('Invitation Route Test Client', '', 'Technology', 'India') RETURNING id`,
  );
  clientId = result.rows[0]!.id;
  createdClientIds.push(clientId);
});

afterAll(async () => {
  for (const id of createdClientIds) {
    await sharedPool.query('DELETE FROM oc_invitations WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('Invitation routes — admin-only management is actually gated', () => {
  it('unauthenticated create is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/invitations`, payload: { email: 'x@example.com', orgContext: 'org-x' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('non-admin (customer role) create is rejected (403)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-1', org: 'org-x', roles: ['customer'] });
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/invitations`, headers: { authorization: `Bearer ${token}` }, payload: { email: 'x@example.com', orgContext: 'org-x' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('admin create succeeds (real row created)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'admin-1', org: 'org-admin', roles: ['admin'] });
    const email = `route-admin-${randomUUID()}@example.com`;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/invitations`, headers: { authorization: `Bearer ${token}` }, payload: { email, orgContext: 'org-created-by-admin' } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.invitation.status).toBe('invited');
    await app.close();
  });

  it('non-admin list/renew/link/revoke are all rejected (403)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-1', org: 'org-x', roles: ['business_user'] });
    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/invitations`, headers: { authorization: `Bearer ${token}` } });
    const renew = await app.inject({ method: 'POST', url: `/api/v1/oc/invitations/inv-fake/renew`, headers: { authorization: `Bearer ${token}` } });
    const link = await app.inject({ method: 'POST', url: `/api/v1/oc/invitations/inv-fake/link`, headers: { authorization: `Bearer ${token}` } });
    const revoke = await app.inject({ method: 'POST', url: `/api/v1/oc/invitations/inv-fake/revoke`, headers: { authorization: `Bearer ${token}` } });
    expect(list.statusCode).toBe(403);
    expect(renew.statusCode).toBe(403);
    expect(link.statusCode).toBe(403);
    expect(revoke.statusCode).toBe(403);
    await app.close();
  });

  it('admin create is idempotent: re-inviting the same live email returns 200 + reused:true, never a duplicate row', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'admin-1', org: 'org-admin', roles: ['admin'] });
    const email = `route-reuse-${randomUUID()}@example.com`;
    const first = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/invitations`, headers: { authorization: `Bearer ${token}` }, payload: { email, orgContext: 'org-reuse' } });
    const second = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/invitations`, headers: { authorization: `Bearer ${token}` }, payload: { email, orgContext: 'org-reuse' } });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.reused).toBe(true);
    expect(secondBody.invitation.id).toBe(firstBody.invitation.id);
    await app.close();
  });

  it('admin renew rotates the token and returns a fresh acceptUrl', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'admin-1', org: 'org-admin', roles: ['admin'] });
    const email = `route-renew-${randomUUID()}@example.com`;
    const created = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/invitations`, headers: { authorization: `Bearer ${token}` }, payload: { email, orgContext: 'org-renew' } });
    const { invitation } = JSON.parse(created.body);
    const renewed = await app.inject({ method: 'POST', url: `/api/v1/oc/invitations/${invitation.id}/renew`, headers: { authorization: `Bearer ${token}` } });
    expect(renewed.statusCode).toBe(200);
    const body = JSON.parse(renewed.body);
    expect(body.invitation.acceptUrl).toContain('/accept-invitation?token=');
    expect(body.invitation.acceptUrl).not.toContain(invitation.acceptUrl.split('token=')[1]);
    await app.close();
  });
});

describe('Invitation routes — public accept surface is reachable with NO token', () => {
  it('lookup with a bogus token returns 404, not 401 — proving it is genuinely public, not silently failing auth', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/invitations/lookup?token=bogus-token-value' });
    expect(res.statusCode).toBe(404); // reached the handler; handler says invalid — never 401
    await app.close();
  });

  it('accept with a bogus token returns 404, not 401', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/invitations/accept', payload: { token: 'bogus-token-value', credential: 'Str0ngP@ss!' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('lookup with no token query param at all is a 400 validation error, not a 401', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/invitations/lookup' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
