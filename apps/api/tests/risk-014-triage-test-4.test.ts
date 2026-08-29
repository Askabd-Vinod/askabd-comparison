/**
 * risk_014_triage_test_4 — closes the last deliberately-left-OPEN item from
 * `risk_014_triage_test_1`: `POST /oc/service-actions` had no RBAC rule at
 * all, while its own GET sibling (`GET /oc/service-actions/:entityId`) was
 * already `Admin.Access`-gated — a real, asymmetric gap.
 *
 * `OperationsCenterService.recordServiceAction()` performs zero
 * entity-existence or ownership check on its caller-supplied
 * `entityType`/`entityId` (`oc_service_actions` has no FK to any real
 * entity table — verified by reading the INSERT directly) — so with only
 * `defaultPolicy:'authenticated'`, any authenticated identity (a real
 * customer token included) could POST an arbitrary
 * entityType/entityId/actor/previousState/newState, injecting a fabricated
 * service-state audit entry against ANY client or entity id, real or
 * invented. Confirmed via grep that this route's only real callers are
 * staff `(app)` pages (`applications`/`services`/`clients` list pages, via
 * `ServiceControlsInline`) — never the customer `(portal)` — so gating it
 * the same as its GET sibling breaks no live capability.
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

describe('RISK-014 triage pass 4 — POST /oc/service-actions asymmetric-RBAC gap, closed', () => {
  it('a real customer token is denied on POST /oc/service-actions (would otherwise let it inject a fabricated service-state entry against any client/entity id)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/service-actions', headers: { authorization: `Bearer ${token}` },
      payload: { entityType: 'client', entityId: 'some-other-clients-real-id', entityName: 'Forged', action: 'disabled', actor: 'customer-1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('unauthenticated requests are denied', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/service-actions', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('a real staff (admin) token is not blocked by RBAC', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/service-actions', headers: { authorization: `Bearer ${admin}` },
      payload: { entityType: 'service', entityId: 'svc-1', entityName: 'Test Service', action: 'restarted', actor: 'admin-1' },
    });
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
  });

  it('the GET sibling remains gated exactly as before (no regression on the already-fixed route)', async () => {
    const app = await buildApp();
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/service-actions/some-entity-id', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });
});
