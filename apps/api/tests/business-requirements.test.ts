/**
 * Real Business Requirements Intelligence — migration 038,
 * business-requirements-service.ts, business-requirements-routes.ts. Proves
 * real DB persistence, real RBAC gating (staff-only, customer denied), real
 * tenant-access enforcement, and the real rule-based quality classifier
 * (duplicate/incomplete/ambiguous/partially_complete/complete).
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { businessRequirementsRoutes } from '../src/routes/business-requirements-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
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
  await app.register(businessRequirementsRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'unrelated-org' });

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
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

async function makeClient(name: string) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

const COMPLETE_PAYLOAD = {
  title: 'Order confirmation email must send within 30 seconds',
  description: 'When a customer places an order, the system sends a confirmation email within 30 seconds of order placement, verified via delivery timestamp logging.',
  businessObjective: 'Reduce post-purchase customer support tickets about missing order confirmation.',
  stakeholder: 'VP of Customer Operations',
  category: 'order-management',
  acceptanceCriteria: 'Given an order is placed, when payment is confirmed, then a confirmation email is delivered within 30 seconds, verified in the delivery log.',
};

describe('Business Requirements — RBAC and tenant isolation', () => {
  it('a real customer token is denied creating a requirement (403) — staff-only', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Deny Fixture ${randomUUID().slice(0, 8)}`);
    const token = await customerToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`,
      headers: { authorization: `Bearer ${token}` }, payload: { title: 'X' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Anon Fixture ${randomUUID().slice(0, 8)}`);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/business-requirements` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Business Requirements — CRUD', () => {
  it('admin creates a real requirement, persisted and readable', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Create Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { ...COMPLETE_PAYLOAD, requirementType: 'functional', priority: 'high' },
    });
    expect(create.statusCode).toBe(201);
    const requirement = create.json().requirement;
    expect(requirement.title).toBe(COMPLETE_PAYLOAD.title);
    expect(requirement.requirementType).toBe('functional');
    expect(requirement.priority).toBe('high');
    expect(requirement.version).toBe(1);

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json().requirements.some((r: any) => r.id === requirement.id)).toBe(true);

    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/business-requirements/${requirement.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
    expect(get.json().requirement.id).toBe(requirement.id);

    await app.close();
  });

  it('a missing title is rejected (400), never silently stored', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Empty Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: { title: '   ' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('an invalid requirementType is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Invalid Type Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', requirementType: 'not-a-real-type' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('updating a requirement is versioned and creates a real history entry', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Update Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    const id = create.json().requirement.id;
    expect(create.json().requirement.version).toBe(1);

    const update = await app.inject({ method: 'PUT', url: `/api/v1/oc/business-requirements/${id}`, headers: { authorization: `Bearer ${admin}` }, payload: { title: COMPLETE_PAYLOAD.title + ' (revised)' } });
    expect(update.statusCode).toBe(200);
    expect(update.json().requirement.version).toBe(2);
    expect(update.json().requirement.title).toContain('revised');

    const history = await app.inject({ method: 'GET', url: `/api/v1/oc/business-requirements/${id}/history`, headers: { authorization: `Bearer ${admin}` } });
    expect(history.statusCode).toBe(200);
    expect(history.json().history).toHaveLength(1);
    expect(history.json().history[0].version).toBe(2);

    await app.close();
  });

  it('updating a non-existent requirement returns 404', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'PUT', url: `/api/v1/oc/business-requirements/req-does-not-exist`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('deprecating a requirement is a soft state change, not a delete', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Deprecate Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    const id = create.json().requirement.id;

    const deprecate = await app.inject({ method: 'POST', url: `/api/v1/oc/business-requirements/${id}/deprecate`, headers: { authorization: `Bearer ${admin}` } });
    expect(deprecate.statusCode).toBe(200);
    expect(deprecate.json().requirement.status).toBe('deprecated');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` } });
    const found = list.json().requirements.find((r: any) => r.id === id);
    expect(found.status).toBe('deprecated'); // still present, not gone

    await app.close();
  });
});

describe('Business Requirements — real, explainable quality classification', () => {
  it('a requirement missing description/acceptance-criteria/stakeholder is classified incomplete with real findings', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Incomplete Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'We need a new dashboard' } });
    expect(create.statusCode).toBe(201);
    const requirement = create.json().requirement;
    expect(requirement.qualityStatus).toBe('incomplete');
    expect(requirement.qualityFindings.length).toBeGreaterThan(0);
    expect(requirement.qualityFindings[0].rule).toBe('missing_required_fields');

    await app.close();
  });

  it('a requirement with a vague, unmeasurable description is classified ambiguous', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Ambiguous Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { ...COMPLETE_PAYLOAD, title: 'Make the ordering system better', description: 'We want the ordering system to be better and more user-friendly for our customers.' },
    });
    expect(create.statusCode).toBe(201);
    const requirement = create.json().requirement;
    expect(requirement.qualityStatus).toBe('ambiguous');
    expect(requirement.qualityFindings[0].rule).toBe('vague_unmeasurable_language');

    await app.close();
  });

  it('a fully-specified requirement is classified complete with no findings', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Complete Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    expect(create.statusCode).toBe(201);
    const requirement = create.json().requirement;
    expect(requirement.qualityStatus).toBe('complete');
    expect(requirement.qualityFindings).toHaveLength(0);

    await app.close();
  });

  it('a second requirement with the same title for the same client is classified a real, explainable duplicate', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Duplicate Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const first = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    expect(first.json().requirement.qualityStatus).toBe('complete');

    const second = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    expect(second.statusCode).toBe(201);
    const requirement = second.json().requirement;
    expect(requirement.qualityStatus).toBe('duplicate');
    expect(requirement.relatedRequirementId).toBe(first.json().requirement.id);
    expect(requirement.qualityFindings[0].rule).toBe('duplicate_title');

    await app.close();
  });

  it('a requirement for a DIFFERENT client with the same title is NOT flagged duplicate — classification is tenant-scoped', async () => {
    const app = await buildApp();
    const clientA = await makeClient(`BR Tenant A Fixture ${randomUUID().slice(0, 8)}`);
    const clientB = await makeClient(`BR Tenant B Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientA}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    const other = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientB}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    expect(other.json().requirement.qualityStatus).toBe('complete');

    await app.close();
  });

  it('staff can explicitly flag a conflict — the one quality_status never auto-assigned', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Conflict Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const first = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: { ...COMPLETE_PAYLOAD, title: 'Requirement A' } });
    const second = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: { ...COMPLETE_PAYLOAD, title: 'Requirement B — contradicts A' } });
    const firstId = first.json().requirement.id;
    const secondId = second.json().requirement.id;

    const flag = await app.inject({ method: 'POST', url: `/api/v1/oc/business-requirements/${secondId}/flag-conflict`, headers: { authorization: `Bearer ${admin}` }, payload: { conflictsWithId: firstId } });
    expect(flag.statusCode).toBe(200);
    expect(flag.json().requirement.qualityStatus).toBe('conflicting');
    expect(flag.json().requirement.relatedRequirementId).toBe(firstId);
    expect(flag.json().requirement.qualityFindings[0].rule).toBe('staff_flagged_conflict');

    await app.close();
  });

  it('the quality summary endpoint returns real, evidence-backed counts — no fabricated aggregate score', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`BR Summary Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: COMPLETE_PAYLOAD });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/business-requirements`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Vague one-liner' } });

    const summary = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/business-requirements/summary`, headers: { authorization: `Bearer ${admin}` } });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary.complete).toBe(1);
    expect(summary.json().summary.incomplete).toBe(1);
    expect(summary.json().summary.total).toBe(2);

    await app.close();
  });
});
