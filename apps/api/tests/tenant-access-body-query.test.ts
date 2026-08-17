/**
 * Tenant-access boundary extension (master product-completion pass): the
 * boundary previously only inspected the URL's own `:clientId`/`:id` route
 * params. This closed a real gap for routes that carry `clientId` in the
 * request BODY (e.g. connector test/save, Jira issue-create) or as an
 * OPTIONAL query-string filter (e.g. incidents/defects list — omitting the
 * filter previously returned every client's rows to any authenticated role).
 * See docs/resource-authorization-register.md for the pre-fix state.
 */
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';

const SECRET = 'test-secret-value-not-a-real-secret';

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  app.post('/api/v1/oc/connectors/test', async () => ({ ok: true }));
  app.get('/api/v1/oc/incidents', async () => ({ incidents: [] }));
  app.get('/api/v1/oc/defects', async () => ({ defects: [] }));
  await app.ready();
  return app;
}

function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}

describe('Tenant access now covers body-carried clientId (previously a bypass)', () => {
  it('a non-admin token is denied on a route with clientId only in the POST body', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'u1', roles: ['customer'] });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/connectors/test',
      headers: { authorization: `Bearer ${token}` },
      payload: { provider: 'postgresql', clientId: 'client-a', fields: {} },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.reasonCode).toBe('tenant_not_resolved');
    await app.close();
  });

  it('an admin token IS allowed through the same body-carried-clientId route', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'u2', roles: ['admin'] });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/connectors/test',
      headers: { authorization: `Bearer ${token}` },
      payload: { provider: 'postgresql', clientId: 'client-a', fields: {} },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('Cross-client aggregate list routes now require Admin.Access outright', () => {
  it('GET /oc/incidents with no ?clientId= filter (previously returned every client) is denied to a non-admin', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'u3', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/incidents', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('GET /oc/incidents WITH a ?clientId= filter is also denied to a non-admin (tenant-access now inspects query too)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'u4', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/incidents?clientId=client-a', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('GET /oc/defects is denied to a non-admin', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'u5', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/defects', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('an admin can still list all incidents unfiltered — the documented cross-client privileged capability', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'u6', roles: ['super_admin'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/incidents', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
