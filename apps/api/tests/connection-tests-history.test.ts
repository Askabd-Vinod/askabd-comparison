/**
 * GET /oc/clients/:clientId/connection-tests — real connection-test history, added this
 * milestone to replace the client "Testing" page's previously fully-fabricated,
 * identical-for-every-client hardcoded test-suite list.
 *
 * Builds its own scoped app with an explicit HS256 test token (the same pattern
 * global-search.test.ts and most other route tests use) instead of the full
 * production createServer() — this used to hit createServer() with zero
 * Authorization header, which only ever passed because this process's real
 * devBypass was accidentally active (no JWKS_URL/JWT_SECRET configured — see
 * docs/local-development-runbook.md). Now that real auth is correctly enforced
 * by default, an unauthenticated request against the full app would genuinely
 * 401 — this rewrite tests the real route logic with a real, valid admin token
 * instead, which is what this test was always meant to prove.
 */
import Fastify from 'fastify';
import { describe, it, expect, afterAll } from 'vitest';
import * as jose from 'jose';
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

const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });

describe('GET /oc/clients/:clientId/connection-tests', () => {
  afterAll(async () => { await sharedPool.end().catch(() => {}); });

  it('returns an empty array (not fabricated placeholder rows) for a client with no test history', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/clients/no-such-client-ever/connection-tests', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().tests).toEqual([]);
    await app.close();
  });

  it('returns a real, previously-persisted connection test row, matching what testConnection() actually wrote', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const clientId = `test-conntest-${Date.now()}`;
    await sharedPool.query(
      `INSERT INTO oc_connection_tests (client_id, provider, status, mode, duration_ms, steps, error_message, correlation_id)
       VALUES ($1, 'postgresql', 'connected', 'real', 120, '[{"step":"TCP Connect","pass":true,"durationMs":10}]', '', 'corr-1')`,
      [clientId],
    );

    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/connection-tests`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tests).toHaveLength(1);
    expect(body.tests[0].provider).toBe('postgresql');
    expect(body.tests[0].status).toBe('connected');
    expect(body.tests[0].mode).toBe('real');

    await sharedPool.query('DELETE FROM oc_connection_tests WHERE client_id = $1', [clientId]);
    await app.close();
  });
});
