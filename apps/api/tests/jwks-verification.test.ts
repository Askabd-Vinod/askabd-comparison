/**
 * JWKS verification — real HTTP, real EdDSA signatures, real jose.createRemoteJWKSet.
 *
 * Verifies the actual production path for real askabd-identity tokens: identity signs
 * with EdDSA and publishes its public key(s) at GET /.well-known/jwks.json; this API
 * verifies via `jose.createRemoteJWKSet(new URL(jwksUrl))` (apps/api/src/middleware/auth.ts).
 * HS256/JWT_SECRET can never verify a real askabd-identity token — these tests exercise
 * the JWKS mode specifically, over a genuine local HTTP server (Node's built-in `http`
 * module — no new dependency, no mocking of jose internals), matching identity's actual
 * key-rotation design (askabd-identity/src/services/token-service.ts:
 * `getPublicJwks` — publishes active + recently-retired keys) and its real claim shape
 * (iss: 'askabd-identity', aud: TOKEN_AUDIENCE, alg: 'EdDSA', a `kid` per key).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { describe, it, expect, afterEach } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';

async function buildApp(authConfig: any) {
  const app = Fastify();
  registerAuthMiddleware(app, authConfig);
  app.get('/protected', async () => ({ ok: true }));
  await app.ready();
  return app;
}

/** A real HTTP server serving whatever JWKS JSON `getBody()` currently returns —
 *  lets a test change the published keyset mid-test (simulating rotation) without
 *  restarting the server or the client's cached jose.createRemoteJWKSet instance. */
function startJwksServer(getBody: () => string, options?: { malformed?: boolean }) {
  const server: Server = createServer((_req, res) => {
    if (options?.malformed) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{ this is not valid json');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(getBody());
  });
  return new Promise<{ server: Server; url: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/.well-known/jwks.json` });
    });
  });
}

async function makeKeyPair() {
  const { privateKey, publicKey } = await jose.generateKeyPair('EdDSA', { extractable: true });
  const kid = randomUUID();
  const publicJwk = { ...(await jose.exportJWK(publicKey)), kid, alg: 'EdDSA', use: 'sig' };
  return { privateKey, publicKey, kid, publicJwk };
}

async function signToken(
  privateKey: jose.CryptoKey,
  kid: string,
  overrides: { issuer?: string; audience?: string; expired?: boolean } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ sub: 'id_1', org: 'org_1' })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuedAt(overrides.expired ? now - 3600 : now)
    .setExpirationTime(overrides.expired ? now - 1800 : now + 900)
    .setIssuer(overrides.issuer ?? 'askabd-identity')
    .setAudience(overrides.audience ?? 'askabd-platform')
    .sign(privateKey);
}

describe('JWKS verification — real HTTP + real EdDSA (askabd-identity token shape)', () => {
  let cleanup: (() => void)[] = [];

  afterEach(async () => {
    for (const fn of cleanup.splice(0)) fn();
  });

  it('accepts a token whose EdDSA signature matches the published JWKS key', async () => {
    const key = await makeKeyPair();
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [key.publicJwk] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid);
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a token signed by a key never published in the JWKS (unknown kid)', async () => {
    const publishedKey = await makeKeyPair();
    const attackerKey = await makeKeyPair(); // never included in the served JWKS
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [publishedKey.publicJwk] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(attackerKey.privateKey, attackerKey.kid);
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with the wrong issuer, even with a genuinely valid signature', async () => {
    const key = await makeKeyPair();
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [key.publicJwk] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid, { issuer: 'some-other-issuer' });
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with the wrong audience when JWT_AUDIENCE is configured', async () => {
    const key = await makeKeyPair();
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [key.publicJwk] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid, { audience: 'some-other-audience' });
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a token with any audience when JWT_AUDIENCE is left unconfigured (documented — matches existing HS256 behavior)', async () => {
    const key = await makeKeyPair();
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [key.publicJwk] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity' }); // no audience configured
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid, { audience: 'whatever' });
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });

  it('rejects an expired token', async () => {
    const key = await makeKeyPair();
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [key.publicJwk] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid, { expired: true });
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('fails closed (401, not a crash) when the JWKS endpoint is unreachable', async () => {
    const key = await makeKeyPair();
    // A JWKS URL pointing at a port nothing is listening on.
    const unreachableUrl = 'http://127.0.0.1:1/.well-known/jwks.json';
    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: unreachableUrl, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid);
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('fails closed (401, not a crash) when the JWKS endpoint returns malformed JSON', async () => {
    const key = await makeKeyPair();
    const { server, url } = await startJwksServer(() => '', { malformed: true });
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    const token = await signToken(key.privateKey, key.kid);
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('a rotated-in key (added to the JWKS after the client already cached the old set) is picked up automatically', async () => {
    const keyA = await makeKeyPair();
    const keyB = await makeKeyPair();
    let published = [keyA.publicJwk];
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: published }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url, issuer: 'askabd-identity', audience: 'askabd-platform' });
    cleanup.push(() => app.close());

    // Token signed with the original key verifies and populates jose's internal cache.
    const tokenA = await signToken(keyA.privateKey, keyA.kid);
    const resA = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${tokenA}` } });
    expect(resA.statusCode).toBe(200);

    // Rotation: the server now publishes both the still-active old key and the new one —
    // matches askabd-identity's real getPublicJwks (active + recently-retired).
    published = [keyA.publicJwk, keyB.publicJwk];

    // A token signed with the NEW key, whose kid the client has never seen, must still
    // verify — jose.createRemoteJWKSet automatically refetches on an unrecognized kid.
    const tokenB = await signToken(keyB.privateKey, keyB.kid);
    const resB = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${tokenB}` } });
    expect(resB.statusCode).toBe(200);

    // And the pre-rotation token, signed with the still-published retired key, remains valid.
    const resAAgain = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${tokenA}` } });
    expect(resAAgain.statusCode).toBe(200);
  });

  it('production-shaped config (devBypass:false) with JWKS_URL configured never falls back to dev bypass for a missing token', async () => {
    const { server, url } = await startJwksServer(() => JSON.stringify({ keys: [] }));
    cleanup.push(() => server.close());

    const app = await buildApp({ publicRoutes: [], devBypass: false, jwksUrl: url });
    cleanup.push(() => app.close());

    const res = await app.inject({ method: 'GET', url: '/protected' }); // no Authorization header
    expect(res.statusCode).toBe(401);
  });
});
