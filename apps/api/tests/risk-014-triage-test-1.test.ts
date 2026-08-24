/**
 * risk_014_triage_test_1 — real security fix from the RISK-014 individual
 * -triage pass (2026-08-24, continuation after `dependency_analysis_test_1`
 * closed the coverage matrix's last NOT_STARTED row). RISK-014's own
 * mechanical audit had flagged 46 candidate routes as "not yet
 * individually triaged" rather than blindly fixed; this pass reads each
 * flagged handler in full and confirms — for 7 of them — a real gap of the
 * exact same shape as the already-fixed Portfolio Intelligence finding:
 * genuine, platform-wide, cross-client data with NO clientId in the path,
 * NO RBAC rule, and NO tenant-access.ts backstop, falling through to
 * `defaultPolicy: 'authenticated'`.
 *
 * Confirmed exposure before fixing (see docs/security-risk-register.md
 * RISK-014's 2026-08-24 triage-pass update for the full per-route
 * reasoning):
 *   - GET  /oc/clients               — lists every client on the platform
 *   - GET  /oc/clients/:id           — fetches ANY client by id, no
 *                                       ownership check (unlike PUT :id,
 *                                       which already had both an
 *                                       Admin.Access rule AND a
 *                                       tenant-access.ts backstop)
 *   - GET  /oc/clients/health-summary — every client's real health score
 *                                       in one response
 *   - GET  /oc/audit                 — the full platform audit log, every
 *                                       client, every entity
 *   - POST /oc/audit                 — write access to inject fabricated
 *                                       audit entries for any actor/entity
 *   - GET  /oc/notifications         — every client's notifications when
 *                                       no clientId query param is given
 *   - POST /oc/notifications         — create a notification for an
 *                                       arbitrary clientId, no ownership
 *                                       check
 *
 * Also independently confirmed (grep across apps/web/src/app/(portal))
 * that the customer-facing portal frontend never calls any of these 7
 * routes — only staff `(app)` pages/components do — so gating them
 * Admin.Access-only does not remove any real customer-portal capability.
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

const GET_ROUTES = [
  '/api/v1/oc/clients',
  '/api/v1/oc/clients/some-client-id',
  '/api/v1/oc/clients/health-summary',
  '/api/v1/oc/audit',
  '/api/v1/oc/notifications',
];
const POST_ROUTES = [
  '/api/v1/oc/audit',
  '/api/v1/oc/notifications',
];

describe('RISK-014 triage pass — 7 real cross-client routes found with no RBAC, fixed', () => {
  it('a real customer token (no admin role) is denied on every newly-gated GET route', async () => {
    const app = await buildApp();
    const token = await customerToken();
    for (const url of GET_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode, `${url} should deny a customer token`).toBe(403);
    }
  });

  it('a real customer token is denied on every newly-gated POST route', async () => {
    const app = await buildApp();
    const token = await customerToken();
    for (const url of POST_ROUTES) {
      const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode, `POST ${url} should deny a customer token`).toBe(403);
    }
  });

  it('an unauthenticated request is denied on every newly-gated route', async () => {
    const app = await buildApp();
    for (const url of GET_ROUTES) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, `${url} should reject unauthenticated`).toBe(401);
    }
    for (const url of POST_ROUTES) {
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode, `POST ${url} should reject unauthenticated`).toBe(401);
    }
  });

  it('a real staff (admin) token can still reach every newly-gated GET route — not over-blocked', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    for (const url of GET_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${admin}` } });
      expect(res.statusCode, `${url} should allow staff`).toBeLessThan(500);
      expect(res.statusCode, `${url} should not be 401/403 for staff`).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    }
  });

  it('the pre-existing sibling rules (POST/PUT /oc/clients) are unaffected by this pass', async () => {
    const app = await buildApp();
    const customer = await customerToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/clients', headers: { authorization: `Bearer ${customer}` }, payload: {} });
    expect(res.statusCode).toBe(403);
  });
});
