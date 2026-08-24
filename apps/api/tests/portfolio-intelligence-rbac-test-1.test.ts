/**
 * portfolio_intelligence_rbac_test_1 — real security fix found via this
 * session's own mechanical RBAC-gap audit (2026-08-24, continuation of
 * `executive_reporting_test_1`). `PortfolioIntelligenceService`'s real
 * routes carry real, genuine cross-client platform business intelligence
 * (per-client financial investment/savings/ROI, cross-client problem/gap/
 * technology patterns, resource allocation) — 7 of its 8 routes had NO
 * RBAC rule at all (only `/portfolio/clients/:clientId/health` was
 * gated), falling through to `defaultPolicy: 'authenticated'`. ANY
 * authenticated identity, staff or a real customer token, could read
 * AskABD's own aggregate portfolio-wide financial data. Fixed by adding
 * a real Admin.Access rule to all 7. See docs/security-risk-register.md
 * RISK-014 for the wider mechanical-audit finding (47 candidate routes
 * total; the other 46 require individual triage, not blindly fixed here).
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
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
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

const PORTFOLIO_ROUTES = [
  '/api/v1/oc/portfolio/health',
  '/api/v1/oc/portfolio/clients',
  '/api/v1/oc/portfolio/financial',
  '/api/v1/oc/portfolio/transformations',
  '/api/v1/oc/portfolio/patterns',
  '/api/v1/oc/portfolio/resources',
  '/api/v1/oc/portfolio/intelligence',
];

describe('Portfolio Intelligence routes — real RBAC gap found and fixed (cross-client platform business intelligence)', () => {
  it('a real customer token (no admin role) is denied on every real portfolio route — the actual gap this closes', async () => {
    const app = await buildApp();
    const token = await customerToken();
    for (const url of PORTFOLIO_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode, `${url} should deny a customer token`).toBe(403);
    }
  });

  it('an unauthenticated request is denied on every real portfolio route', async () => {
    const app = await buildApp();
    for (const url of PORTFOLIO_ROUTES) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} should reject unauthenticated`).toBe(401);
    }
  });

  it('a real staff (admin) token can still reach every real portfolio route — not over-blocked', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    for (const url of PORTFOLIO_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${admin}` } });
      expect(res.statusCode, `${url} should allow staff`).toBeLessThan(300);
    }
  });

  it('the pre-existing, already-protected client-health route is unaffected by this fix', async () => {
    const app = await buildApp();
    const customer = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/portfolio/clients/some-client-id/health', headers: { authorization: `Bearer ${customer}` } });
    expect(res.statusCode).toBe(403);
  });
});
