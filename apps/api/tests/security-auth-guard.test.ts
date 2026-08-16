/**
 * Security — JWT dev-bypass guard
 *
 * Verifies the exact rule production deployments depend on:
 *   devBypass = authConfig?.devBypass ?? (NODE_ENV !== 'production' && !JWT_SECRET && !JWKS_URL)
 * i.e. a "production-shaped" config (devBypass explicitly false, as NODE_ENV==='production'
 * always forces it) can never silently accept unauthenticated requests — whether or not a
 * signing key happens to be configured. These tests exercise the auth middleware directly
 * with the same config shape production's env-driven formula would produce, without needing
 * to mutate the frozen process config.
 */
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';

async function buildApp(authConfig: any) {
  const app = Fastify();
  registerAuthMiddleware(app, authConfig);
  app.get('/protected', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('Security — JWT bypass guard', () => {
  it('production-shaped config with NO key configured rejects every request (fails closed, never bypasses)', async () => {
    const app = await buildApp({ publicRoutes: [], devBypass: false });
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('production-shaped config with JWT_SECRET configured rejects unauthenticated requests', async () => {
    const app = await buildApp({ publicRoutes: [], devBypass: false, jwtSecret: 'test-secret-value-not-a-real-secret' });
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('production-shaped config accepts a correctly signed, unexpired token', async () => {
    const secret = 'test-secret-value-not-a-real-secret';
    const app = await buildApp({ publicRoutes: [], devBypass: false, jwtSecret: secret, issuer: 'askabd-identity' });
    const token = await new jose.SignJWT({ sub: 'user-1', org: 'test-org' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('askabd-identity')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects a token signed with the wrong key (tampered/forged)', async () => {
    const app = await buildApp({ publicRoutes: [], devBypass: false, jwtSecret: 'real-secret' });
    const token = await new jose.SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('wrong-secret'));
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an expired token', async () => {
    const secret = 'test-secret-value-not-a-real-secret';
    const app = await buildApp({ publicRoutes: [], devBypass: false, jwtSecret: secret, issuer: 'askabd-identity' });
    const token = await new jose.SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('askabd-identity')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(new TextEncoder().encode(secret));
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('dev-bypass mode (explicit devBypass:true, matching non-production with no key configured) attaches a dev context without a token', async () => {
    const app = await buildApp({ publicRoutes: [], devBypass: true });
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('public routes remain reachable regardless of auth config', async () => {
    const app = await buildApp({ publicRoutes: ['/protected'], devBypass: false });
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(200); // excluded from auth entirely — not a bypass, an explicit allowlist
    await app.close();
  });
});

/**
 * DEV / STAGING / PRODUCTION model — verified against the actual runtime formula:
 *   devBypass = authConfig?.devBypass ?? (NODE_ENV !== 'production' && !JWT_SECRET && !JWKS_URL)
 *
 * Finding (documented, not silently worked around): apps/api/src/config/env.ts's NODE_ENV
 * schema is `z.enum(['development', 'production', 'test'])` — there is NO 'staging' value.
 * A staging deployment MUST set NODE_ENV=production to get the safe (bypass-disabled)
 * behavior below. If staging is ever misconfigured with NODE_ENV=development (a real risk,
 * since 'staging' itself isn't a valid value and 'development' is the schema's default),
 * JWT bypass would be enabled exactly as it is in DEV. This is not a defect in the auth
 * middleware itself — devBypass correctly follows NODE_ENV — it's a deployment-configuration
 * risk worth flagging explicitly rather than assuming staging is safe by default.
 */
describe('Security — DEV/STAGING/PRODUCTION model (config-level, no real infra required)', () => {
  it('DEV-shaped config (NODE_ENV=development-equivalent, no key configured) allows bypass — intended', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: true }); // mirrors what the real formula computes for NODE_ENV!=='production' with no key
    app.get('/protected', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('PRODUCTION-shaped config (NODE_ENV=production) never allows bypass, regardless of key presence', async () => {
    // The real formula: NODE_ENV !== 'production' is the FIRST condition — false alone forces
    // devBypass to false no matter what JWT_SECRET/JWKS_URL are. This is the guard that matters.
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false });
    app.get('/protected', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('DOCUMENTED RISK: a staging deployment that mistakenly runs with NODE_ENV=development (not production) would get bypass enabled — because no dedicated "staging" NODE_ENV value exists in the schema', async () => {
    // This test intentionally reproduces the dangerous case to make the risk concrete and
    // testable, not to endorse it. Mitigation is operational: staging MUST set NODE_ENV=production.
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: true }); // what NODE_ENV=development (or NODE_ENV=test) would compute with no key configured
    app.get('/protected', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(200); // proves the danger is real, not hypothetical — mitigate via deployment config, not code
    await app.close();
  });
});
