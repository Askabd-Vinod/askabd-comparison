/**
 * risk_014_triage_test_6 — dedicated live verification of the remaining
 * "22-route catalog/reference group" from the original RISK-014 audit
 * (2 of the 22 — `GET /oc/workflow/executions`, `GET /oc/platform
 * /commercial/summary` — were already fixed in `risk_014_triage_test_3`).
 *
 * Per-route classification, done by reading the real schema/handler for
 * each rather than trusting the earlier "plausibly public catalog data,
 * not individually confirmed" characterization:
 *
 * REAL GAPS FOUND, FIXED this pass:
 *   - `GET /oc/workflow/rules` — `risk_014_triage_test_3`'s own explicit
 *     decision to leave this ungated ("genuinely global reference/config
 *     data") is WRONG: `oc_workflow_rules` genuinely has a `client_id`
 *     column (`createRule()` inserts it), and `getRules()` has no
 *     client-scoping option — the same unscoped-aggregate-leak shape as
 *     the already-fixed `GET /oc/workflow/executions`. Not yet
 *     exploitable with real data (0 of 8 real rows currently have
 *     `client_id` set, verified via direct query), but latent and would
 *     leak the instant a real per-client rule is created.
 *   - `GET /oc/optimization/rules` — identical shape:
 *     `oc_optimization_rules` also has a real, currently-unused
 *     `client_id` column; `getRules()` has no client filter.
 *   - `POST /oc/optimization/rules` — had NO rule at all (its sibling
 *     `POST /oc/workflow/rules` already did) — an unprotected write to
 *     the platform's own optimization-rule definitions.
 *
 * CONFIRMED GENUINELY SAFE this pass (backing table/query chain verified
 * to have no `client_id` concept anywhere — not merely assumed): the full
 * `GET /oc/capabilities*` family (7 routes — `oc_capabilities` has no
 * `client_id`), `GET /oc/scheduler/jobs` (`oc_scheduled_jobs`, no
 * `client_id`), the `GET /oc/compliance/*` family (4 routes —
 * `oc_compliance_frameworks`/`oc_compliance_controls`/
 * `oc_control_mappings`, none have `client_id`), `GET /oc/service
 * -bundles*` (2 routes — `oc_service_bundles`, no `client_id`),
 * `GET /oc/client-services/definitions` (static in-memory, no args at
 * all).
 *
 * DELIBERATELY LEFT AS-IS (already independently triaged and accepted in
 * an earlier pass, re-confirmed not re-litigated without new evidence):
 * `GET /oc/jira/config` (auth token genuinely masked; only baseUrl/
 * authEmail visible — an already-documented, deliberate, accepted
 * low-severity decision from the 2026-08-24 triage pass).
 *
 * LIVE-VERIFIED, NOT PREVIOUSLY TESTED: `POST /oc/jira/issues`'s own
 * comment claims it's "already enforced by tenant-access" since it takes
 * a real `clientId` in its body — proven here rather than trusted.
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

describe('RISK-014 triage pass 6 — newly-gated latent leaks', () => {
  it('a real customer token is denied on GET /oc/workflow/rules (latent client_id leak, previously mis-classified as safe)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/rules', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a real customer token is denied on GET /oc/optimization/rules (same latent client_id leak shape)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/optimization/rules', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a real customer token is denied on POST /oc/optimization/rules (previously had no rule at all)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/optimization/rules', headers: { authorization: `Bearer ${token}` }, payload: { name: 'malicious-rule' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated requests are denied on all 3 newly-gated routes', async () => {
    const app = await buildApp();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/rules' });
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/oc/optimization/rules' });
    const r3 = await app.inject({ method: 'POST', url: '/api/v1/oc/optimization/rules', payload: {} });
    expect(r1.statusCode).toBe(401);
    expect(r2.statusCode).toBe(401);
    expect(r3.statusCode).toBe(401);
    await app.close();
  });

  it('a real staff (admin) token is not blocked by RBAC on any of the 3 newly-gated routes', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/oc/workflow/rules', headers: { authorization: `Bearer ${admin}` } });
    expect(r1.statusCode).not.toBe(403);
    expect(r1.statusCode).not.toBe(401);
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/oc/optimization/rules', headers: { authorization: `Bearer ${admin}` } });
    expect(r2.statusCode).not.toBe(403);
    expect(r2.statusCode).not.toBe(401);
    await app.close();
  });
});

describe('RISK-014 triage pass 6 — confirmed-safe global catalog routes remain reachable (no regression)', () => {
  const globalGetRoutes = [
    '/api/v1/oc/capabilities',
    '/api/v1/oc/capabilities/summary',
    '/api/v1/oc/capabilities/roadmap',
    '/api/v1/oc/capabilities/dependencies',
    '/api/v1/oc/capabilities/maturity',
    '/api/v1/oc/scheduler/jobs',
    '/api/v1/oc/compliance/frameworks',
    '/api/v1/oc/compliance/mappings',
    '/api/v1/oc/compliance/mappings/coverage',
    '/api/v1/oc/service-bundles',
    '/api/v1/oc/client-services/definitions',
  ];

  for (const url of globalGetRoutes) {
    it(`a real customer token can still read ${url} — genuinely global reference data, no client_id in its backing table(s)`, async () => {
      const app = await buildApp();
      const token = await customerToken();
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).not.toBe(403);
      await app.close();
    });
  }
});

describe('RISK-014 triage pass 6 — POST /oc/jira/issues tenant-access claim, live-verified for the first time', () => {
  it('a real customer token with a foreign clientId in the body is denied (previously only claimed safe via code comment, never tested)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/jira/issues', headers: { authorization: `Bearer ${token}` },
      payload: { clientId: 'some-other-clients-real-id', sourceType: 'defect', sourceId: 'd-1', summary: 'forged issue' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()?.error?.reasonCode).toBe('tenant_not_resolved');
    await app.close();
  });
});
