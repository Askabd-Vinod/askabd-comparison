/**
 * Tenant/client access boundary — the third independent security question
 * ("which client's data may this identity access"), enforced by
 * platform/rbac/tenant-access.ts after authentication and RBAC.
 *
 * See docs/tenant-authorization-matrix.md and
 * docs/identity-tenant-security-final-report.md for the full rationale.
 * Summary: neither the real askabd-identity token nor this app's database
 * contains a mapping from an authenticated identity to a specific
 * oc_clients.client_id, so the only safe rule available today is:
 * admin/super_admin may cross client boundaries (documented, tested,
 * existing roles); every other role is denied by default (fail closed).
 */
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';

const SECRET = 'test-secret-value-not-a-real-secret';

async function buildApp(opts?: { devBypass?: boolean }) {
  const app = Fastify();
  const devBypass = opts?.devBypass ?? false;
  registerAuthMiddleware(app, { publicRoutes: [], devBypass, jwtSecret: devBypass ? undefined : SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass });
  app.get('/api/v1/oc/clients/:clientId/services', async () => ({ ok: true }));
  app.get('/api/v1/oc/clients/:id', async () => ({ ok: true })); // the one route using `id` not `clientId`
  app.get('/api/v1/oc/capabilities', async () => ({ ok: true })); // not client-scoped — outside this boundary
  await app.ready();
  return app;
}

function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('askabd-identity')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

describe('Tenant access — negative (non-admin roles denied cross-client access)', () => {
  it('customer-role token is denied on a client-scoped route', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-customer', org: 'org-x', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('business_user-role token (real authenticated staff, non-admin) is denied on a client-scoped route', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-staff', org: 'org-x', roles: ['business_user'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a token with no role claim at all is denied (fails closed, never silently elevated)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-norole', org: 'org-x' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('denial is symmetric across different client IDs — a customer token is denied client-a AND client-b equally (not client-specific, role-based)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-customer', org: 'org-x', roles: ['customer'] });
    const resA = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    const resB = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-b/services', headers: { authorization: `Bearer ${token}` } });
    expect(resA.statusCode).toBe(403);
    expect(resB.statusCode).toBe(403);
    await app.close();
  });

  it('customer-role token is denied on the `:id`-named client route (/oc/clients/:id)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-customer', org: 'org-x', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated request to a client-scoped route is 401, not 403 (auth still runs first)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Tenant access — positive (admin/super_admin cross-client access, documented privileged capability)', () => {
  it('admin-role token is allowed on a client-scoped route', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-admin', org: 'org-x', roles: ['admin'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('super_admin-role token is allowed on a client-scoped route', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-root', org: 'org-x', roles: ['super_admin'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('admin-role token is allowed to access a DIFFERENT client (documented cross-client capability, not a bug)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-admin', org: 'org-x', roles: ['admin'] });
    const resA = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    const resB = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-b/services', headers: { authorization: `Bearer ${token}` } });
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    await app.close();
  });
});

describe('Tenant access — routes without a clientId param are unaffected', () => {
  it('a customer-role token can still reach a non-client-scoped oc route (this boundary only applies where a client is named in the URL)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-customer', org: 'org-x', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/capabilities', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('Tenant access — DEV bypass stays DEV-only', () => {
  it('DEV bypass identity (dev-user-000) is allowed on any client-scoped route, unaffected by this boundary', async () => {
    const app = await buildApp({ devBypass: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('production-shaped config (devBypass explicitly false) never grants the dev-user-000 shortcut — a matching sub claim on a REAL signed token still goes through the normal role check and is denied without an admin role', async () => {
    const app = await buildApp({ devBypass: false });
    const token = await signToken({ sub: 'dev-user-000', org: 'org-x', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/client-a/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
