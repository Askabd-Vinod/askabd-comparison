/**
 * RBAC — client service assignment governance, identity claim resolution
 *
 * This file was extended this milestone after fixing the root cause it originally only
 * documented: apps/api/src/middleware/auth.ts now reads `roles`/`permissions`/`scope`
 * claims from a verified token (previously always discarded, forcing every authenticated
 * user to the unprivileged 'customer' role). See docs/identity-rbac-architecture-audit.md
 * for the full trace. This remains a best-effort, standards-based read — NOT a confirmed
 * integration with the real askabd-identity service, whose actual claim format is outside
 * this repository. The tests below prove: (1) the declared policy is correct, (2) a token
 * WITH a real role claim is now correctly authorized, (3) a token WITHOUT one still safely
 * fails closed to 'customer' (never silently elevated), (4) unauthenticated/invalid/expired/
 * tampered tokens are still rejected exactly as before.
 */
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware, getAuth } from '../src/middleware/auth.js';
import {
  registerAuthorizationMiddleware,
  COMPARISON_API_RULES,
  buildAuthorizationContext,
  authorizeAny,
  ROLE_MAP,
} from '../src/platform/rbac/index.js';

const ENABLE_RULE = COMPARISON_API_RULES.find(r => r.path.endsWith('/services/:serviceId/enable'))!;
const DISABLE_RULE = COMPARISON_API_RULES.find(r => r.path.endsWith('/services/:serviceId/disable'))!;
const SECRET = 'test-secret-value-not-a-real-secret';

async function buildSecuredApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  app.get('/whoami', async (req) => ({ auth: getAuth(req) }));
  app.post('/api/v1/oc/clients/:clientId/services/:serviceId/enable', async () => ({ ok: true }));
  app.get('/api/v1/categories', async () => ({ categories: [] })); // a real customer-accessible read route, per rules.ts
  await app.ready();
  return app;
}

function signToken(claims: Record<string, unknown>, opts?: { expired?: boolean; wrongSecret?: boolean }) {
  const key = new TextEncoder().encode(opts?.wrongSecret ? 'a-completely-different-wrong-secret' : SECRET);
  let jwt = new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt();
  jwt = opts?.expired ? jwt.setExpirationTime('-10s') : jwt.setExpirationTime('5m');
  return jwt.sign(key);
}

describe('RBAC rule declaration — client service assignment', () => {
  it('enable and disable routes are declared with Admin.Access, matching the existing admin-gating pattern used elsewhere (e.g. Merchant.Approve)', () => {
    expect(ENABLE_RULE).toBeDefined();
    expect(DISABLE_RULE).toBeDefined();
    expect(ENABLE_RULE.permissions).toContain('Admin.Access');
    expect(DISABLE_RULE.permissions).toContain('Admin.Access');
  });
});

describe('RBAC engine correctness — Admin.Access evaluation (proves the policy itself is right)', () => {
  it('an admin-shaped role set is granted Admin.Access', () => {
    const ctx = buildAuthorizationContext('u-admin', 'org-1', ['admin'], ROLE_MAP);
    expect(authorizeAny(ctx, ENABLE_RULE.permissions).allowed).toBe(true);
  });

  it('a super_admin-shaped role set (wildcard permissions) is granted Admin.Access', () => {
    const ctx = buildAuthorizationContext('u-root', 'org-1', ['super_admin'], ROLE_MAP);
    expect(authorizeAny(ctx, ENABLE_RULE.permissions).allowed).toBe(true);
  });

  it('a customer-shaped role set is DENIED Admin.Access', () => {
    const ctx = buildAuthorizationContext('u-customer', 'org-1', ['customer'], ROLE_MAP);
    expect(authorizeAny(ctx, ENABLE_RULE.permissions).allowed).toBe(false);
  });

  it('a business_user-shaped role set (normal authenticated staff, no admin grant) is DENIED Admin.Access', () => {
    const ctx = buildAuthorizationContext('u-staff', 'org-1', ['business_user'], ROLE_MAP);
    expect(authorizeAny(ctx, ENABLE_RULE.permissions).allowed).toBe(false);
  });

  it('an unknown/unmapped role resolves to zero permissions and is denied (fails closed, not open)', () => {
    const ctx = buildAuthorizationContext('u-unknown', 'org-1', ['made-up-role-that-does-not-exist'], ROLE_MAP);
    expect(authorizeAny(ctx, ENABLE_RULE.permissions).allowed).toBe(false);
  });
});

describe('Identity claim resolution — the fix (roles/permissions now read from the verified token)', () => {
  it('a token with a real "roles":["admin"] claim is now correctly authorized for the gated route', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-admin', org: 'test-org', roles: ['admin'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('a token with a space-separated "scope" claim (OAuth2 convention) is also read correctly', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-2', org: 'test-org', scope: 'Admin.Access Product.Read' });
    const whoami = await app.inject({ method: 'GET', url: '/whoami', headers: { authorization: `Bearer ${token}` } });
    expect(whoami.json().auth.permissions).toContain('Admin.Access');
    await app.close();
  });

  it('a token with NO role/permission claim at all still safely resolves to customer (fails closed, never silently elevated)', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-1', org: 'test-org' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a token with an explicit "roles":["customer"] claim is denied the admin-only route', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-3', org: 'test-org', roles: ['customer'] });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a customer-role token can still access a real customer-allowed read route (fixing role resolution did not lock out legitimate non-admin users)', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-4', org: 'test-org', roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/categories', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('Negative security tests — authentication', () => {
  it('unauthenticated request (no Authorization header) → 401', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('expired token → 401', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'user-5', org: 'test-org', roles: ['admin'] }, { expired: true });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('tampered/forged token (signed with the wrong key) → 401, even claiming admin', async () => {
    const app = await buildSecuredApp();
    const token = await signToken({ sub: 'attacker', org: 'test-org', roles: ['super_admin'] }, { wrongSecret: true });
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('malformed token (not a JWT at all) → 401', async () => {
    const app = await buildSecuredApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: 'Bearer not.a.real.jwt.at.all' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a token claiming ["admin"] roles but signed by the wrong issuer is rejected', async () => {
    const app = await buildSecuredApp();
    const token = await new jose.SignJWT({ sub: 'user-6', org: 'test-org', roles: ['admin'] })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('some-other-issuer').setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/c1/services/s1/enable', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Audience validation — only enforced when explicitly configured', () => {
  it('a token with no "aud" claim is accepted when no audience is configured (current default — unset until the real value is known)', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' }); // no audience configured
    app.get('/protected', async () => ({ ok: true }));
    await app.ready();
    const token = await signToken({ sub: 'user-7' });
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('when an audience IS configured, a token with the wrong audience is rejected', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity', audience: 'askabd-api' });
    app.get('/protected', async () => ({ ok: true }));
    await app.ready();
    const token = await new jose.SignJWT({ sub: 'user-8' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setAudience('some-other-api').setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DEV bypass stays DEV-only', () => {
  it('production-shaped config (devBypass explicitly false) never bypasses auth, regardless of NODE_ENV at call time', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false });
    app.get('/protected', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
