/**
 * Authentication/authorization error UX (Phase 0E, master platform-hardening milestone).
 * Every failure mode must be distinguishable to a real client via a safe, stable
 * `reasonCode` — without ever leaking JWT contents, signing details, stack traces, or
 * why exactly a forged/tampered token failed. This file proves the discriminator is
 * present and correct for each case; it does not test UI rendering (no real frontend
 * consumes these yet — see docs/authentication-missing-investigation.md).
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
  app.post('/api/v1/oc/clients/:clientId/services/:serviceId/enable', async () => ({ ok: true }));
  app.get('/api/v1/oc/clients/:clientId/services', async () => ({ ok: true }));
  await app.ready();
  return app;
}

function sign(claims: Record<string, unknown>, opts?: { expired?: boolean; wrongSecret?: boolean }) {
  const key = new TextEncoder().encode(opts?.wrongSecret ? 'wrong-secret' : SECRET);
  let jwt = new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt();
  jwt = opts?.expired ? jwt.setExpirationTime('-10s') : jwt.setExpirationTime('5m');
  return jwt.sign(key);
}

describe('401 reasonCode discriminates cause without leaking internals', () => {
  it('no Authorization header → reasonCode "not_authenticated"', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/c1/services' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.reasonCode).toBe('not_authenticated');
    await app.close();
  });

  it('expired token → reasonCode "token_expired", distinct message from a merely-invalid token', async () => {
    const app = await buildApp();
    const token = await sign({ sub: 'u1', roles: ['admin'] }, { expired: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/c1/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.reasonCode).toBe('token_expired');
    expect(body.error.message).toMatch(/expired/i);
    await app.close();
  });

  it('tampered/forged token → reasonCode "invalid_token" — never reveals WHY (no "signature" in the message)', async () => {
    const app = await buildApp();
    const token = await sign({ sub: 'attacker', roles: ['super_admin'] }, { wrongSecret: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/c1/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.reasonCode).toBe('invalid_token');
    expect(JSON.stringify(body)).not.toMatch(/signature/i);
    await app.close();
  });

  it('malformed (not a JWT) token → reasonCode "invalid_token"', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/c1/services', headers: { authorization: 'Bearer not-a-jwt' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.reasonCode).toBe('invalid_token');
    await app.close();
  });

  it('no 401 response body ever contains the submitted token value', async () => {
    const app = await buildApp();
    const secretLookingToken = 'Bearer eyFAKE.PAYLOAD.SIGNATURE';
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/c1/services', headers: { authorization: secretLookingToken } });
    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.json())).not.toContain('eyFAKE');
    await app.close();
  });
});

describe('403 reasonCode distinguishes a real permission denial from an unresolved tenant', () => {
  it('non-admin role on an Admin.Access-gated route → reasonCode "forbidden"', async () => {
    const app = await buildApp();
    const token = await sign({ sub: 'u2', roles: ['customer'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.reasonCode).toBe('forbidden');
    await app.close();
  });

  it('non-admin role on a client-scoped (tenant-access-gated) route → reasonCode "tenant_not_resolved"', async () => {
    const app = await buildApp();
    const token = await sign({ sub: 'u3', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/c1/services', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.reasonCode).toBe('tenant_not_resolved');
    await app.close();
  });
});
