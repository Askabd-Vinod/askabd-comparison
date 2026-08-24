/**
 * risk_014_triage_test_3 — found via a CORRECTED mechanical RBAC-gap sweep
 * (2026-08-24, continuation of `risk_014_triage_test_2`). The sweep used
 * for `dependency_analysis_test_1`'s "final mechanical audit — 451 routes,
 * only 2 more candidates" claim is now known to have had incomplete method
 * coverage — re-running a version that actually parses every
 * `server.<method>()` registration (GET/POST/PUT/PATCH/DELETE, not just
 * GET/POST) across all route files finds 512 real registered routes, not
 * 451, and a materially larger real candidate set. See
 * docs/security-risk-register.md's RISK-014 update for the full,
 * corrected accounting and the honest note about the earlier undercount.
 *
 * Three real, confirmed, previously-undisclosed gaps from that corrected
 * sweep, all in `operations-center-routes.ts`, all confirmed via grep to
 * be called only by staff `(app)/platform/*` pages, never the customer
 * `(portal)`:
 *   - GET /oc/platform/commercial/summary — real, cross-client AskABD
 *     commercial/financial data (every engagement's real investment/
 *     contracted/realized values, itemized with real client names) — same
 *     shape and severity as the already-fixed Portfolio Intelligence gap.
 *   - GET /oc/workflow/executions — every client's real automation
 *     -execution history when no `?clientId=` filter is supplied — the
 *     same unscoped-aggregate-leak shape already fixed for
 *     GET /oc/notifications.
 *   - POST /oc/workflow/rules / PATCH /oc/workflow/rules/:ruleId/toggle —
 *     unprotected WRITES to the platform's own automation-rule
 *     definitions (create arbitrary rules, or disable real ones such as
 *     escalation/notification automation) — an integrity risk, not a read
 *     -exposure one.
 *
 * GET /oc/workflow/rules (read-only rule definitions, no client data) was
 * investigated and left deliberately ungated — genuinely global reference
 * /config data, the same reasoning already applied to GET /oc/capabilities
 * and GET /oc/compliance/frameworks.
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

describe('RISK-014 triage pass 3 — platform/commercial + workflow executions/rules, closed', () => {
  it('a real customer token is denied on GET /oc/platform/commercial/summary', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/platform/commercial/summary', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('a real customer token is denied on GET /oc/workflow/executions (would otherwise return every client\'s history)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/executions', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('a real customer token is denied on POST /oc/workflow/rules (would otherwise let it create arbitrary automation rules)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/workflow/rules', headers: { authorization: `Bearer ${token}` }, payload: { name: 'malicious-rule', eventType: 'x' } });
    expect(res.statusCode).toBe(403);
  });

  it('a real customer token is denied on PATCH /oc/workflow/rules/:ruleId/toggle (would otherwise let it disable real automation rules)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/oc/workflow/rules/some-rule-id/toggle', headers: { authorization: `Bearer ${token}` }, payload: { enabled: false } });
    expect(res.statusCode).toBe(403);
  });

  it('unauthenticated requests are denied on all 4 newly-gated routes', async () => {
    const app = await buildApp();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/oc/platform/commercial/summary' });
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/executions' });
    const r3 = await app.inject({ method: 'POST', url: '/api/v1/oc/workflow/rules', payload: {} });
    const r4 = await app.inject({ method: 'PATCH', url: '/api/v1/oc/workflow/rules/x/toggle', payload: {} });
    expect(r1.statusCode).toBe(401);
    expect(r2.statusCode).toBe(401);
    expect(r3.statusCode).toBe(401);
    expect(r4.statusCode).toBe(401);
  });

  it('a real staff (admin) token is not blocked by RBAC on any of the 4 newly-gated routes', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/oc/platform/commercial/summary', headers: { authorization: `Bearer ${admin}` } });
    expect(r1.statusCode).not.toBe(403);
    expect(r1.statusCode).not.toBe(401);
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/executions', headers: { authorization: `Bearer ${admin}` } });
    expect(r2.statusCode).not.toBe(403);
    expect(r2.statusCode).not.toBe(401);
  });

  it('GET /oc/workflow/rules (read-only rule definitions) is deliberately still reachable to any authenticated identity — not a client-data leak, matching the GET /oc/capabilities precedent', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/rules', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).not.toBe(403);
  });
});
