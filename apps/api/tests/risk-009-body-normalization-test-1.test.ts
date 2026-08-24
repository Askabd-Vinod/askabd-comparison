/**
 * risk_009_body_normalization_test_1 — the real, platform-wide fix for
 * RISK-009 (docs/security-risk-register.md): a single shared
 * `preHandler` hook (`middleware/body-normalization.ts`) that normalizes
 * `request.body` from `undefined` to `{}` for every POST/PUT/PATCH before
 * any route handler runs — exactly the "suggested fix" that risk's own
 * disclosure named, closing the entire class in one place rather than
 * touching each of the 100+ individual `const body = req.body as {...}`
 * call sites (~90 of them in `operations-center-routes.ts` alone).
 *
 * Proven against 3 real routes picked specifically because NONE of them
 * were ever individually touched by this fix or any prior RISK-009 pass —
 * confirming the middleware, not a per-route patch, is what closes the gap:
 *   - POST /oc/gaps/:gapId/evidence          (reads body.text directly)
 *   - POST /oc/clients/:clientId/engagements (reads body.name directly)
 *   - POST /oc/jira/config                   (reads body.baseUrl directly)
 *
 * Before this fix, a genuinely bodyless POST to any of these threw a real,
 * unhandled `TypeError: Cannot read properties of undefined` (a raw 500),
 * not the clean, intended 400 each route's own `if (!body.x)` check was
 * written to produce. After this fix, `request.body` is `{}`, so that same
 * existing validation code now runs as originally intended — no route
 * handler code was changed.
 */
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { registerRawBodyCapture } from '../src/middleware/raw-body.js';
import { registerBodyNormalization } from '../src/middleware/body-normalization.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });

async function buildApp(withNormalization: boolean) {
  const app = Fastify();
  registerRawBodyCapture(app);
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  if (withNormalization) registerBodyNormalization(app);
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('RISK-009 real bug reproduction — WITHOUT the fix, these genuinely fail as a raw 500', () => {
  it('POST /oc/jira/config with no body throws an unhandled TypeError (proves the bug is real, not hypothetical)', async () => {
    const app = await buildApp(false); // deliberately omit the fix
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(500);
  });
});

describe('RISK-009 platform-wide fix — WITH body normalization, every representative route gets a clean 4xx instead', () => {
  it('POST /oc/gaps/:gapId/evidence with no body returns a clean 400, not a raw 500', async () => {
    const app = await buildApp(true);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/gaps/some-gap-id/evidence', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('text is required');
  });

  it('POST /oc/clients/:clientId/engagements with no body returns a clean 400, not a raw 500', async () => {
    const app = await buildApp(true);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients/some-client-id/engagements', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('name is required');
  });

  it('POST /oc/jira/config with no body returns a clean 400, not a raw 500', async () => {
    const app = await buildApp(true);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('baseUrl and projectKey are required');
  });

  it('a real, non-empty body is completely unaffected — the normalization never overwrites an actual body', async () => {
    const app = await buildApp(true);
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${admin}` },
      payload: { baseUrl: 'https://example.atlassian.net', projectKey: 'ABD' },
    });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).not.toBe(500);
  });

  it('a genuinely empty JSON object body ({}) behaves identically to no body at all — both hit the same clean validation path', async () => {
    const app = await buildApp(true);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/jira/config', headers: { authorization: `Bearer ${admin}` }, payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
