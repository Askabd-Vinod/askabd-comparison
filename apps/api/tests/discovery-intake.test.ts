/**
 * Universal Discovery — free-text intake (migration 042,
 * discovery-intake-service.ts, discovery-intake-routes.ts). Proves real DB
 * persistence, real RBAC gating, real tenant isolation, the real
 * evidence-quote verification rule on extractions, and real Traceability
 * Engine linkage between a source and its extractions.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { discoveryIntakeRoutes } from '../src/routes/discovery-intake-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { TraceabilityEngine } from '../src/services/traceability-engine.js';
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
  await app.register(discoveryIntakeRoutes, { prefix: '/api/v1' });
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

const RAW_CONTENT = 'Our checkout process is too slow and customers are abandoning their carts before completing payment. This has been happening since the last platform upgrade in March.';

describe('Discovery Intake — RBAC and tenant isolation', () => {
  it('a real customer token is denied submitting a discovery source (403) — staff-only', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Deny Fixture ${randomUUID().slice(0, 8)}`);
    const token = await customerToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`,
      headers: { authorization: `Bearer ${token}` }, payload: { title: 'X', rawContent: 'Y' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Anon Fixture ${randomUUID().slice(0, 8)}`);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/discovery-sources` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Discovery Intake — free-text source submission', () => {
  it('admin submits a real free-text problem statement, persisted and readable', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Submit Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Checkout abandonment issue', rawContent: RAW_CONTENT },
    });
    expect(create.statusCode).toBe(201);
    const source = create.json().source;
    expect(source.sourceType).toBe('free_text'); // default
    expect(source.status).toBe('submitted');
    expect(source.rawContent).toBe(RAW_CONTENT);
    expect(source.submittedBy).toBe('admin-1'); // real authenticated actor, never client-supplied

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().sources.some((s: any) => s.id === source.id)).toBe(true);

    await app.close();
  });

  it('empty raw content is rejected (400) — a discovery source must have real content', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Empty Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: '   ' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('an invalid sourceType is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Invalid Type Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: 'Y', sourceType: 'not-a-real-type' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('review and archive are real, distinct state transitions', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Lifecycle Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: RAW_CONTENT } });
    const id = create.json().source.id;

    const reviewed = await app.inject({ method: 'POST', url: `/api/v1/oc/discovery-sources/${id}/review`, headers: { authorization: `Bearer ${admin}` } });
    expect(reviewed.json().source.status).toBe('reviewed');

    const archived = await app.inject({ method: 'POST', url: `/api/v1/oc/discovery-sources/${id}/archive`, headers: { authorization: `Bearer ${admin}` } });
    expect(archived.json().source.status).toBe('archived');
  });
});

describe('Discovery Intake — real, evidence-verified extraction', () => {
  it('a staff member extracts a real structured field, with a real evidence quote verified against the raw text', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Extract Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: RAW_CONTENT } });
    const sourceId = create.json().source.id;

    const extract = await app.inject({
      method: 'POST', url: `/api/v1/oc/discovery-sources/${sourceId}/extractions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { fieldName: 'affected_area', fieldValue: 'Checkout / Payment', evidenceQuote: 'checkout process is too slow', confidence: 'high' },
    });
    expect(extract.statusCode).toBe(201);
    const extraction = extract.json().extraction;
    expect(extraction.fieldName).toBe('affected_area');
    expect(extraction.confidence).toBe('high');
    expect(extraction.extractedBy).toBe('admin-1');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/discovery-sources/${sourceId}/extractions`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().extractions).toHaveLength(1);
  });

  it('an evidence quote NOT actually present in the source raw text is rejected (400) — never an unverifiable claim', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Bad Quote Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: RAW_CONTENT } });
    const sourceId = create.json().source.id;

    const extract = await app.inject({
      method: 'POST', url: `/api/v1/oc/discovery-sources/${sourceId}/extractions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { fieldName: 'affected_area', fieldValue: 'Something else', evidenceQuote: 'this text does not appear anywhere in the source' },
    });
    expect(extract.statusCode).toBe(400);
  });

  it('an extraction with no evidence quote at all is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI No Quote Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: RAW_CONTENT } });
    const sourceId = create.json().source.id;

    const extract = await app.inject({
      method: 'POST', url: `/api/v1/oc/discovery-sources/${sourceId}/extractions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { fieldName: 'affected_area', fieldValue: 'Checkout' },
    });
    expect(extract.statusCode).toBe(400);
  });

  it('extracting from a nonexistent source returns 404', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/discovery-sources/dsrc-does-not-exist/extractions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { fieldName: 'x', fieldValue: 'y', evidenceQuote: 'z' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('a real extraction is genuinely linked to its source via the Traceability Engine (derives_from)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DI Trace Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', rawContent: RAW_CONTENT } });
    const sourceId = create.json().source.id;

    const extract = await app.inject({
      method: 'POST', url: `/api/v1/oc/discovery-sources/${sourceId}/extractions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { fieldName: 'affected_area', fieldValue: 'Checkout', evidenceQuote: 'checkout process is too slow' },
    });
    const extractionId = extract.json().extraction.id;

    const traceability = new TraceabilityEngine();
    const outbound = await traceability.getOutboundLinks('discovery_source', sourceId);
    expect(outbound).toHaveLength(1);
    expect(outbound[0].targetId).toBe(extractionId);
    expect(outbound[0].linkType).toBe('derives_from');
  });
});
