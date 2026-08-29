/**
 * risk_014_triage_test_5 — real, first-class live verification of the
 * "6-route body-clientId-scoped lifecycle/discovery/assessment group"
 * (`/oc/lifecycle/init`, `/oc/lifecycle/transition`, `/oc/discovery/start`,
 * `/oc/assessment/start`, `/oc/assessment/domain/start`,
 * `/oc/recommendations/generate`) that `risk_014_triage_test_3`'s summary
 * described as "now confirmed safe" — investigated before trusting that
 * claim at face value, per the master directive's own "never say tests
 * passed without actually running them" rule. No dedicated test actually
 * exercised these SPECIFIC routes through the real, registered handlers
 * before this pass (`tenant-access-body-query.test.ts` proves the generic
 * mechanism against dummy routes, not these real ones) — this file closes
 * that gap with real `app.inject` calls against the actual
 * `operationsCenterRoutes` registration.
 *
 * Confirmed by reading each handler directly (all in
 * `operations-center-routes.ts`): every one of the 6 destructures
 * `clientId` from `req.body` in the standard shape
 * `tenant-access.ts`'s `extractClientId` already reads generically — no
 * route-specific wiring exists or is needed. `registerTenantAccessMiddleware`
 * runs as a `preHandler` hook, firing before any route handler body
 * executes, so a real cross-tenant 403 is provable with no DB fixtures at
 * all (the handler's own logic — and any real service/DB call — never
 * runs for a denied request).
 */
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const customerToken = () => signToken({ sub: 'customer-1', org: 'unrelated-org', roles: [] });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('RISK-014 triage pass 5 — lifecycle/discovery/assessment body-clientId group, live-verified for the first time', () => {
  const cases: Array<{ url: string; payload: Record<string, unknown> }> = [
    { url: '/api/v1/oc/lifecycle/init', payload: { clientId: 'some-other-clients-real-id', initialStatus: 'organization-created' } },
    { url: '/api/v1/oc/lifecycle/transition', payload: { clientId: 'some-other-clients-real-id', event: 'discovery_started' } },
    { url: '/api/v1/oc/discovery/start', payload: { clientId: 'some-other-clients-real-id' } },
    { url: '/api/v1/oc/assessment/start', payload: { clientId: 'some-other-clients-real-id', discoveryRunId: 'run-1' } },
    { url: '/api/v1/oc/assessment/domain/start', payload: { clientId: 'some-other-clients-real-id', domain: 'security' } },
    { url: '/api/v1/oc/recommendations/generate', payload: { clientId: 'some-other-clients-real-id' } },
  ];

  for (const { url, payload } of cases) {
    it(`a real customer token with a foreign clientId in the body is denied on POST ${url}`, async () => {
      const app = await buildApp();
      const token = await customerToken();
      const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload });
      expect(res.statusCode).toBe(403);
      expect(res.json()?.error?.reasonCode).toBe('tenant_not_resolved');
      await app.close();
    });
  }

  it('unauthenticated requests are denied on all 6 routes', async () => {
    const app = await buildApp();
    for (const { url, payload } of cases) {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(401);
    }
    await app.close();
  });
});
