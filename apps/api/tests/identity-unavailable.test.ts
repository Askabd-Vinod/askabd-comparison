/**
 * Phase 19 (master platform-hardening milestone) — what happens when identity
 * authorization infrastructure is unavailable. Today, apps/api never calls a
 * remote askabd-identity endpoint per-request (no JWKS_URL is configured in
 * any environment — see docs/identity-real-contract.md), so there is no live
 * network dependency to fail. These tests instead prove the CODE PATH that
 * would run if JWKS_URL were ever configured is fail-closed by construction —
 * not fail-open — using a real (but intentionally unreachable/invalid) JWKS
 * endpoint, so this is verified behavior, not a read of the code alone.
 */
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';

async function buildApp(jwksUrl: string) {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwksUrl, issuer: 'askabd-identity' });
  app.get('/protected', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('Identity authorization infrastructure unavailable — must fail closed', () => {
  it('JWKS endpoint connection refused (nothing listening on the port) → 401, never a silent pass-through', async () => {
    // An unused local port — guaranteed connection-refused, not a real dependency on any running service.
    const app = await buildApp('http://127.0.0.1:1/.well-known/jwks.json');
    const token = await new jose.SignJWT({ sub: 'user-1', roles: ['admin'] })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode('irrelevant-since-jwks-fetch-fails-first'));
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('JWKS endpoint returns a malformed (non-JWKS) response → 401, never a silent pass-through', async () => {
    // Point at a real, reachable HTTP endpoint that does NOT serve a valid JWKS document
    // (this test file's own describe block has no server, so use a throwaway local Fastify
    // instance that returns plain JSON with no `keys` array).
    const fakeIdentity = Fastify();
    fakeIdentity.get('/.well-known/jwks.json', async () => ({ notAJwks: true }));
    const address = await fakeIdentity.listen({ port: 0 });

    const app = await buildApp(`${address}/.well-known/jwks.json`);
    const token = await new jose.SignJWT({ sub: 'user-1', roles: ['admin'] })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode('irrelevant'));
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);

    await app.close();
    await fakeIdentity.close();
  });
});
