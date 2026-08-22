/**
 * Requirements Traceability Matrix routes (Phase 3, Part 8) —
 * traceability-routes.ts, entity-label-resolver.ts. Proves, against real
 * Postgres and the real route handler:
 *  - a real, genuine multi-hop chain (business_requirement -> gap ->
 *    transformation), built entirely through the real, already-existing
 *    services this session's prior passes wired up — not synthetic rows
 *    inserted directly
 *  - real, correct human-readable label resolution for every node
 *  - honest `null` labels for an entity type with no resolver — never a
 *    fabricated guess
 *  - honest empty chains for an entity with no links
 *  - RBAC denial and unauthenticated 401
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { traceabilityRoutes } from '../src/routes/traceability-routes.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { BusinessRequirementsService } from '../src/services/business-requirements-service.js';
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
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'unrelated-org' });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(traceabilityRoutes, { prefix: '/api/v1' });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' }); // needed to create real gaps/transformations via the real routes
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
afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query('DELETE FROM oc_transformations WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_gaps WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_business_requirements WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

async function makeClient(name: string) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

const COMPLETE_REQUIREMENT_PAYLOAD = {
  title: 'Order confirmation email must send within 30 seconds',
  description: 'When a customer places an order, the system sends a confirmation email within 30 seconds of order placement, verified via delivery timestamp logging.',
  businessObjective: 'Reduce post-purchase customer support tickets about missing order confirmation.',
  stakeholder: 'VP of Customer Operations',
  category: 'order-management',
  acceptanceCriteria: 'Given an order is placed, when payment is confirmed, then a confirmation email is delivered within 30 seconds, verified in the delivery log.',
};

describe('Traceability Matrix — real multi-hop chain, real labels', () => {
  it('a real business_requirement -> gap -> transformation chain resolves with real, correct labels at every hop', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Trace Chain ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, COMPLETE_REQUIREMENT_PAYLOAD, 'admin-1');

    const gapRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Traceable gap', relatedRequirementId: requirement.id },
    });
    expect(gapRes.statusCode).toBe(201);
    const gap = gapRes.json();

    const tfmRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/transformations`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Traceable transformation', gapId: gap.id },
    });
    expect(tfmRes.statusCode).toBe(201);
    const transformation = tfmRes.json();

    const traceRes = await app.inject({
      method: 'GET', url: `/api/v1/oc/traceability/business_requirement/${requirement.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(traceRes.statusCode).toBe(200);
    const body = traceRes.json();

    expect(body.entity.label).toBe(COMPLETE_REQUIREMENT_PAYLOAD.title);

    const gapHop = body.forwardChain.find((l: any) => l.targetType === 'gap' && l.targetId === gap.id);
    expect(gapHop).toBeTruthy();
    expect(gapHop.targetLabel).toBe('Traceable gap');
    expect(gapHop.depth).toBe(1);

    const tfmHop = body.forwardChain.find((l: any) => l.targetType === 'transformation' && l.targetId === transformation.id);
    expect(tfmHop).toBeTruthy();
    expect(tfmHop.targetLabel).toBe('Traceable transformation');
    expect(tfmHop.depth).toBe(2);
    expect(tfmHop.sourceLabel).toBe('Traceable gap'); // this hop's source is the gap — real label, real chain

    // Backward chain from the transformation should walk back up through the gap to the requirement.
    const backRes = await app.inject({
      method: 'GET', url: `/api/v1/oc/traceability/transformation/${transformation.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    const backBody = backRes.json();
    const reqHop = backBody.backwardChain.find((l: any) => l.sourceType === 'business_requirement' && l.sourceId === requirement.id);
    expect(reqHop).toBeTruthy();
    expect(reqHop.sourceLabel).toBe(COMPLETE_REQUIREMENT_PAYLOAD.title);
    expect(reqHop.depth).toBe(2);

    await app.close();
  });

  it('an entity type with no known resolver returns an honest null label, never a fabricated guess', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/traceability/some_unknown_entity_type/${randomUUID()}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().entity.label).toBeNull();
    await app.close();
  });

  it('an entity with no links returns honest empty outbound/inbound/chains, never a fabricated node', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/traceability/gap/${randomUUID()}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    const body = res.json();
    expect(body.outbound).toEqual([]);
    expect(body.inbound).toEqual([]);
    expect(body.forwardChain).toEqual([]);
    expect(body.backwardChain).toEqual([]);
    await app.close();
  });

  it('RBAC denies a customer token (403)', async () => {
    const app = await buildApp();
    const customer = await customerToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/traceability/gap/${randomUUID()}`,
      headers: { authorization: `Bearer ${customer}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated request is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/traceability/gap/${randomUUID()}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
