/**
 * Governance mutations keyed by an opaque, non-clientId resource ID — the real
 * tenant-isolation gap found during the Fortune-500 security audit pass (same root
 * cause as the earlier migration-routes finding): tenant-access.ts only recognizes
 * `clientId` in params/body/query, so routes identified only by an opaque
 * gapId/problemId/defectId/engagementId/etc. silently bypassed it entirely, falling
 * through to `defaultPolicy: 'authenticated'` — any authenticated identity, including
 * a real customer with no relationship to the target client at all, could mutate
 * another client's gaps, problems, engagements, and pricing. Proves the fix against
 * the REAL route handlers, not a stub, for a representative sample across each
 * affected service.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { GapAnalysisService } from '../src/services/gap-analysis-service.js';
import { ProblemUniverseService } from '../src/services/problem-universe-service.js';
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

function minimalClient(name: string) {
  return {
    name, logo: '', industry: 'Technology', country: 'India', timezone: 'UTC',
    businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
    primaryContact: 'test@example.com', departments: [], capabilities: [], processes: [],
    applications: [], techApps: [], techServices: [], techApis: [], techDatabases: [],
    techServers: [], techCloud: [], techInfrastructure: [], environments: {}, monitoring: {},
    enabledServices: [],
  };
}

const cleanupClientIds: string[] = [];

// Found during the 2026-08-22 SDLC-completion pass's data-integrity audit:
// this afterAll only ever deleted the client row itself — every gap, problem,
// payment method, service action, transformation, and metric this file's
// tests create via the real service layer (createGap/createProblem/
// addPaymentMethod/recordServiceAction/createTransformation/createMetric) has
// no ON DELETE CASCADE back to oc_clients, so each test run silently left a
// fresh batch of orphaned rows (dangling client_id, no matching oc_clients
// row) behind in the shared dev database — confirmed via a live count: 145
// orphaned oc_gaps rows alone, each traceable to a random per-run client_id
// from exactly this pattern. Deleting child rows first, client row last.
afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query('DELETE FROM oc_gaps WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_problems WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_payment_methods WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_service_actions WHERE entity_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_transformations WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_metric_definitions WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'some-unrelated-org' }); // real-shaped: no roles claim

describe('Opaque-ID governance routes — the real gap, now closed', () => {
  it('gap mutation: a real customer token is denied changing another client\'s gap status (403)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Opaque ID RBAC — Gaps'));
    cleanupClientIds.push(client.id);
    const gapService = new GapAnalysisService();
    const gap = await gapService.createGap(client.id, { title: 'Test Gap', domain: 'security', severity: 'high', currentState: 'x', targetState: 'y', category: 'process' } as any);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/gaps/${gap.id}/status`,
      headers: { authorization: `Bearer ${await customerToken()}` }, payload: { status: 'in-progress' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('gap mutation: an admin token IS allowed (the route still genuinely works)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Opaque ID RBAC — Gaps Admin'));
    cleanupClientIds.push(client.id);
    const gapService = new GapAnalysisService();
    const gap = await gapService.createGap(client.id, { title: 'Test Gap 2', domain: 'security', severity: 'high', currentState: 'x', targetState: 'y', category: 'process' } as any);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/gaps/${gap.id}/status`,
      headers: { authorization: `Bearer ${await adminToken()}` }, payload: { status: 'in_progress' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('problem mutation: a real customer token is denied updating another client\'s problem (403)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Opaque ID RBAC — Problems'));
    cleanupClientIds.push(client.id);
    const problemService = new ProblemUniverseService();
    const problem = await problemService.createProblem(client.id, { title: 'Test Problem', domain: 'security', severity: 'high', description: 'x' } as any);

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/oc/problems/${problem.id}`,
      headers: { authorization: `Bearer ${await customerToken()}` }, payload: { title: 'Hijacked' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('defect verification: a real customer token is denied (403)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/defects/def-does-not-exist/verify',
      headers: { authorization: `Bearer ${await customerToken()}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('scheduler run-all: a real customer token is denied triggering a global platform job sweep (403)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/scheduler/run-all',
      headers: { authorization: `Bearer ${await customerToken()}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('capability catalog: a real customer token is denied creating a new global capability (403)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/capabilities',
      headers: { authorization: `Bearer ${await customerToken()}` }, payload: { name: 'Fake Capability' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401) on every route in this set, before any tenant/permission check runs', async () => {
    const app = await buildApp();
    const routes: Array<{ method: 'POST' | 'PATCH'; url: string }> = [
      { method: 'POST', url: '/api/v1/oc/gaps/gap-x/status' },
      { method: 'PATCH', url: '/api/v1/oc/problems/prob-x' },
      { method: 'POST', url: '/api/v1/oc/defects/def-x/verify' },
      { method: 'POST', url: '/api/v1/oc/scheduler/run-all' },
      { method: 'POST', url: '/api/v1/oc/capabilities' },
    ];
    for (const r of routes) {
      const res = await app.inject({ method: r.method, url: r.url });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
    }
    await app.close();
  });
});

describe('Opaque-ID governance READS — the query-param-omission bypass, now closed', () => {
  it('GET /oc/payment-methods/:id — the most severe finding: omitting the OPTIONAL ?clientId= query param previously bypassed tenant-access entirely and returned any client\'s real payment method. A real customer token is now denied (403) regardless of whether clientId is supplied', async () => {
    const app = await buildApp();
    const { PaymentMethodService } = await import('../src/services/payment-method-service.js');
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Opaque ID RBAC — Payment Methods'));
    cleanupClientIds.push(client.id);
    const pmService = new PaymentMethodService();
    const added = await pmService.addPaymentMethod(client.id, { type: 'credit_card', displayName: 'Test Card', last4: '4242' });
    if (!added.success) throw new Error('fixture setup failed: ' + JSON.stringify(added));
    const pmId = (added as any).paymentMethod.id;

    // The exact bypass: no ?clientId= query param at all.
    const resNoQuery = await app.inject({
      method: 'GET', url: `/api/v1/oc/payment-methods/${pmId}`,
      headers: { authorization: `Bearer ${await customerToken()}` },
    });
    expect(resNoQuery.statusCode).toBe(403);

    // Also denied even when a (wrong) clientId is supplied.
    const resWithQuery = await app.inject({
      method: 'GET', url: `/api/v1/oc/payment-methods/${pmId}?clientId=${client.id}`,
      headers: { authorization: `Bearer ${await customerToken()}` },
    });
    expect(resWithQuery.statusCode).toBe(403);

    // Admin can still genuinely read it.
    const resAdmin = await app.inject({
      method: 'GET', url: `/api/v1/oc/payment-methods/${pmId}`,
      headers: { authorization: `Bearer ${await adminToken()}` },
    });
    expect(resAdmin.statusCode).toBe(200);
    const body = resAdmin.json();
    expect(body.paymentMethod.id).toBe(pmId);
    await app.close();
  });

  it('GET /oc/gaps/:gapId and GET /oc/engagements/:id are denied to a real customer token (403)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Opaque ID RBAC — Reads'));
    cleanupClientIds.push(client.id);
    const gapService = new GapAnalysisService();
    const gap = await gapService.createGap(client.id, { title: 'Read Test Gap', domain: 'security', severity: 'high', currentState: 'x', targetState: 'y', category: 'process' } as any);

    const token = await customerToken();
    const gapRes = await app.inject({ method: 'GET', url: `/api/v1/oc/gaps/${gap.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(gapRes.statusCode).toBe(403);

    const engRes = await app.inject({ method: 'GET', url: `/api/v1/oc/engagements/eng-does-not-exist`, headers: { authorization: `Bearer ${token}` } });
    expect(engRes.statusCode).toBe(403); // denied before the handler even runs a lookup

    await app.close();
  });

  it('GET /oc/service-actions/:entityId, GET /oc/transformations/:id, GET /oc/optimization/metrics/:metricId — found during the route×page enumeration pass, closed the same way: real customer token denied (403), admin token still genuinely allowed (200)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Opaque ID RBAC — Actions/Transformations/Metrics'));
    cleanupClientIds.push(client.id);

    const action = await ocService.recordServiceAction({
      entityType: 'client', entityId: client.id, entityName: client.name,
      action: 'enabled', actor: 'admin',
    } as any);

    const { DecisionTransformationService } = await import('../src/services/decision-transformation-service.js');
    const decisionService = new DecisionTransformationService();
    const tfm = await decisionService.createTransformation(client.id, { title: 'Test Transformation', domain: 'process' } as any);

    const { ContinuousOptimizationService } = await import('../src/services/continuous-optimization-service.js');
    const optimizationService = new ContinuousOptimizationService();
    const metric = await optimizationService.createMetric(client.id, { name: 'Test Metric' } as any);

    const token = await customerToken();
    const admin = await adminToken();

    const actionRes = await app.inject({ method: 'GET', url: `/api/v1/oc/service-actions/${action.entity_id}`, headers: { authorization: `Bearer ${token}` } });
    expect(actionRes.statusCode).toBe(403);
    const actionAdminRes = await app.inject({ method: 'GET', url: `/api/v1/oc/service-actions/${action.entity_id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(actionAdminRes.statusCode).toBe(200);

    const tfmRes = await app.inject({ method: 'GET', url: `/api/v1/oc/transformations/${tfm.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(tfmRes.statusCode).toBe(403);
    const tfmAdminRes = await app.inject({ method: 'GET', url: `/api/v1/oc/transformations/${tfm.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(tfmAdminRes.statusCode).toBe(200);
    expect(tfmAdminRes.json().clientId).toBe(client.id);

    const metricRes = await app.inject({ method: 'GET', url: `/api/v1/oc/optimization/metrics/${metric.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(metricRes.statusCode).toBe(403);
    const metricAdminRes = await app.inject({ method: 'GET', url: `/api/v1/oc/optimization/metrics/${metric.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(metricAdminRes.statusCode).toBe(200);
    expect(metricAdminRes.json().clientId).toBe(client.id);

    await app.close();
  });
});
