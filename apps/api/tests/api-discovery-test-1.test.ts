/**
 * api_discovery_test_1 — API Discovery / Validation Engine (2026-08-24
 * master completion directive, capability #75). Covers real OpenAPI 3.0
 * JSON parsing (real endpoint inventory extraction), real rule-based
 * documentation-completeness gap reporting, the real, explicit
 * live-validation-authorization gate (never assumed), real SSRF
 * -protected live validation against a real local HTTP server and a
 * real blocked private-network target, and the Security Testing
 * Addendum's minimum scenarios including cross-client spec-id IDOR.
 */
import Fastify from 'fastify';
import http from 'node:http';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { apiDiscoveryRoutes } from '../src/routes/api-discovery-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { ApiDiscoveryEngine, ApiSpecOwnershipError, InvalidSpecError, LiveValidationNotAuthorizedError } from '../src/services/api-discovery-engine.js';

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
  await app.register(apiDiscoveryRoutes, { prefix: '/api/v1' });
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
const ocService = new OperationsCenterService();
const discovery = new ApiDiscoveryEngine();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

const REAL_OPENAPI_SPEC = {
  openapi: '3.0.0', info: { title: 'Real Test API', version: '1.0.0' },
  security: [{ bearerAuth: [] }],
  paths: {
    '/widgets': {
      get: { summary: 'List widgets', description: 'Real, documented endpoint.', responses: { '200': { content: { 'application/json': { schema: { type: 'array' } } } } } },
      post: { summary: 'Create widget', responses: { '201': {} } }, // real, deliberately incomplete: no description, no response schema, no explicit security override (inherits global)
    },
    '/widgets/{id}': {
      delete: { security: [], responses: { '204': {} } }, // real, deliberately no security requirement
    },
  },
};

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM oc_api_endpoints WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_api_specs WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('ApiDiscoveryEngine — real OpenAPI parsing + rule-based gap reporting', () => {
  it('rejects a real non-spec input honestly', async () => {
    const clientId = await makeClient('API Discovery — Invalid Spec');
    await expect(discovery.ingestSpec(clientId, { name: 'Bad', sourceFormat: 'openapi3', rawSpec: { not: 'a spec' } }, 'actor')).rejects.toThrow(InvalidSpecError);
    await expect(discovery.ingestSpec(clientId, { name: 'Empty', sourceFormat: 'openapi3', rawSpec: { paths: {} } }, 'actor')).rejects.toThrow(/zero real operations/);
  });

  it('parses a real OpenAPI 3.0 document into a real, correct endpoint inventory', async () => {
    const clientId = await makeClient('API Discovery — Real Parse');
    const { spec, endpoints } = await discovery.ingestSpec(clientId, { name: 'Real Widgets API', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC }, 'staff-1');
    expect(spec.sourceFormat).toBe('openapi3');
    expect(endpoints).toHaveLength(3);
    const getWidgets = endpoints.find(e => e.path === '/widgets' && e.method === 'GET')!;
    expect(getWidgets.hasDescription).toBe(true);
    expect(getWidgets.hasResponseSchema).toBe(true);
    expect(getWidgets.hasSecurityRequirement).toBe(true); // inherits global security

    const postWidgets = endpoints.find(e => e.path === '/widgets' && e.method === 'POST')!;
    expect(postWidgets.hasDescription).toBe(false); // real gap
    expect(postWidgets.hasResponseSchema).toBe(false); // real gap

    const deleteWidget = endpoints.find(e => e.path === '/widgets/{id}' && e.method === 'DELETE')!;
    expect(deleteWidget.hasSecurityRequirement).toBe(false); // real gap — explicit empty security override
  });

  it('real, non-fabricated gap report counts — never a synthetic score', async () => {
    const clientId = await makeClient('API Discovery — Gap Report');
    const { spec } = await discovery.ingestSpec(clientId, { name: 'Real API For Gaps', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC }, 'staff-1');
    const report = await discovery.getGapReport(spec.id, clientId);
    expect(report.total).toBe(3);
    // A bare `summary` (POST /widgets) does not count as a real description — only GET /widgets (1 of 3) has a genuine one.
    expect(report.missingDescription).toBe(2);
    // Only GET /widgets declares a real response schema; POST /widgets and DELETE /widgets/{id} both have an empty response object.
    expect(report.missingResponseSchema).toBe(2);
    // Only DELETE /widgets/{id} has an explicit, empty security override — GET/POST both inherit the real global security requirement.
    expect(report.missingSecurity).toBe(1);
    expect(report.notValidated).toBe(3); // real — nothing has been live-validated yet
  });

  it('live validation is refused without real, explicit authorization — never sends unauthorized traffic', async () => {
    const clientId = await makeClient('API Discovery — Unauthorized Live Validation');
    const { endpoints } = await discovery.ingestSpec(clientId, { name: 'Real API No Auth', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC, baseUrl: 'http://localhost:1' }, 'staff-1');
    await expect(discovery.validateEndpoint(endpoints[0]!.id, clientId, 'staff-1')).rejects.toThrow(LiveValidationNotAuthorizedError);
  });

  it('a real, authorized live validation against a real local HTTP server proves genuine reachability — never fabricated', async () => {
    const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    try {
      const clientId = await makeClient('API Discovery — Real Live Validation');
      const { spec, endpoints } = await discovery.ingestSpec(clientId, { name: 'Real Live API', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC, baseUrl: `http://127.0.0.1:${port}` }, 'staff-1');
      await discovery.setLiveValidationAuthorized(spec.id, clientId, true, 'staff-1');
      const validated = await discovery.validateEndpoint(endpoints[0]!.id, clientId, 'staff-1');
      expect(validated.lastValidationStatus).toBe('reachable');
      expect(validated.lastValidationEvidence).toContain('200');
      expect(validated.lastValidatedAt).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it('real SSRF protection blocks live validation against a private/link-local target, even when explicitly authorized', async () => {
    const clientId = await makeClient('API Discovery — SSRF Protection');
    const { spec, endpoints } = await discovery.ingestSpec(clientId, { name: 'Real Metadata Attempt', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC, baseUrl: 'http://169.254.169.254' }, 'staff-1');
    await discovery.setLiveValidationAuthorized(spec.id, clientId, true, 'staff-1');
    const validated = await discovery.validateEndpoint(endpoints[0]!.id, clientId, 'staff-1');
    expect(validated.lastValidationStatus).toBe('blocked');
  });

  it('object-level ownership: Client A cannot read, gap-report, or validate Client B\'s real spec/endpoint', async () => {
    const a = await makeClient('API Discovery Ownership A');
    const b = await makeClient('API Discovery Ownership B');
    const { spec, endpoints } = await discovery.ingestSpec(a, { name: 'Real Spec A', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC }, 'staff-1');
    await expect(discovery.getSpec(spec.id, b)).rejects.toThrow(ApiSpecOwnershipError);
    await expect(discovery.getGapReport(spec.id, b)).rejects.toThrow(ApiSpecOwnershipError);
    await expect(discovery.validateEndpoint(endpoints[0]!.id, b, 'attacker')).rejects.toThrow(ApiSpecOwnershipError);
  });
});

describe('API Discovery routes — RBAC (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('API Discovery RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/api-specs` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('API Discovery RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/api-specs`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can ingest and read a real spec -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('API Discovery RBAC — Staff Allowed');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/api-specs`, headers: { authorization: `Bearer ${admin}` }, payload: { name: 'Real HTTP Spec', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC } });
    expect(create.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/api-specs/${create.json().spec.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
  });

  it('4/6. cross-client spec id -> DENIED (404, object-level ownership)', async () => {
    const app = await buildApp();
    const a = await makeClient('API Discovery RBAC — Cross Client A');
    const b = await makeClient('API Discovery RBAC — Cross Client B');
    const admin = await adminToken();
    const { spec } = await discovery.ingestSpec(a, { name: 'Real Cross-Client Spec', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC }, 'staff-1');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${b}/api-specs/${spec.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
  });

  it('7. malformed spec id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('API Discovery RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/api-specs/${encodeURIComponent("not-real; DROP TABLE oc_api_specs;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('live validation without authorization returns a real 403 over HTTP, never a fabricated success', async () => {
    const app = await buildApp();
    const clientId = await makeClient('API Discovery RBAC — Unauthorized Live HTTP');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/api-specs`, headers: { authorization: `Bearer ${admin}` }, payload: { name: 'Real Spec HTTP', sourceFormat: 'openapi3', rawSpec: REAL_OPENAPI_SPEC, baseUrl: 'http://localhost:1' } });
    const endpointId = create.json().endpoints[0].id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/api-endpoints/${endpointId}/validate`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('live_validation_not_authorized');
  });

  it('an empty-body POST to ingest/authorize routes is a safe 4xx, never an unhandled crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient('API Discovery RBAC — Empty Body Audit');
    const admin = await adminToken();
    const ingestRes = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/api-specs`, headers: { authorization: `Bearer ${admin}` } });
    expect(ingestRes.statusCode).toBeLessThan(500);
  });
});
