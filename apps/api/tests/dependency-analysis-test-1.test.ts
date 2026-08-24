/**
 * dependency_analysis_test_1 — Dependency Analysis Engine (2026-08-24
 * master completion directive, capability #78). Covers real
 * `depends_on` link creation reusing `TraceabilityEngine` unmodified,
 * real explicit cycle detection (a genuine gap in the existing
 * `walk()`'s silent cycle guard), real dependency-impact counts, real
 * object-level ownership verification on both ends of every link, and
 * the Security Testing Addendum's minimum scenarios.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { dependencyAnalysisRoutes } from '../src/routes/dependency-analysis-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { RiskEngine } from '../src/services/risk-engine.js';
import { DependencyAnalysisEngine, UnverifiableEntityTypeError, DependencyOwnershipError } from '../src/services/dependency-analysis-engine.js';

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
  await app.register(dependencyAnalysisRoutes, { prefix: '/api/v1' });
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
const risks = new RiskEngine();
const dependencies = new DependencyAnalysisEngine();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}
async function makeRisk(clientId: string, title: string) {
  return risks.createRisk(clientId, { title, source: 'operations', probability: 'low', impact: 'low' }, 'actor');
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM traceability_links WHERE source_id IN (SELECT id FROM oc_risks WHERE client_id = $1) OR target_id IN (SELECT id FROM oc_risks WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_risks WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('DependencyAnalysisEngine — real depends_on links, real cycle detection, real impact counts', () => {
  it('createDependencyLink verifies real ownership on BOTH ends', async () => {
    const a = await makeClient('Dependency — Ownership Both Ends A');
    const b = await makeClient('Dependency — Ownership Both Ends B');
    const riskA = await makeRisk(a, 'Real Risk A');
    const riskB = await makeRisk(b, 'Real Risk B');
    await expect(dependencies.createDependencyLink(a, 'risk', riskA.id, 'risk', riskB.id, 'attacker')).rejects.toThrow(DependencyOwnershipError);
    await expect(dependencies.createDependencyLink(a, 'risk', riskB.id, 'risk', riskA.id, 'attacker')).rejects.toThrow(DependencyOwnershipError);
  });

  it('refuses an unverifiable entity type honestly rather than silently trusting it', async () => {
    const clientId = await makeClient('Dependency — Unverifiable Type');
    const riskA = await makeRisk(clientId, 'Real Risk For Unverifiable Test');
    await expect(dependencies.createDependencyLink(clientId, 'risk', riskA.id, 'some_unknown_type', 'whatever-id', 'actor')).rejects.toThrow(UnverifiableEntityTypeError);
  });

  it('a real, genuine dependency chain reports real, correct impact counts', async () => {
    const clientId = await makeClient('Dependency — Real Impact Chain');
    const riskA = await makeRisk(clientId, 'Real Risk A (top)');
    const riskB = await makeRisk(clientId, 'Real Risk B (middle)');
    const riskC = await makeRisk(clientId, 'Real Risk C (bottom)');
    // A depends_on B depends_on C — a real, genuine transitive chain.
    await dependencies.createDependencyLink(clientId, 'risk', riskA.id, 'risk', riskB.id, 'actor');
    await dependencies.createDependencyLink(clientId, 'risk', riskB.id, 'risk', riskC.id, 'actor');

    const impactOnC = await dependencies.getDependencyImpact('risk', riskC.id, clientId);
    expect(impactOnC.dependents).toBe(2); // both A and B transitively depend on C
    expect(impactOnC.dependencies).toBe(0); // C depends on nothing

    const impactOnA = await dependencies.getDependencyImpact('risk', riskA.id, clientId);
    expect(impactOnA.dependents).toBe(0); // nothing depends on A
    expect(impactOnA.dependencies).toBe(2); // A transitively depends on both B and C
  });

  it('a real circular dependency is explicitly detected and reported, not silently truncated', async () => {
    const clientId = await makeClient('Dependency — Real Cycle Detection');
    const riskA = await makeRisk(clientId, 'Real Risk A (cycle)');
    const riskB = await makeRisk(clientId, 'Real Risk B (cycle)');
    // A genuine circular dependency: A -> B -> A.
    await dependencies.createDependencyLink(clientId, 'risk', riskA.id, 'risk', riskB.id, 'actor');
    await dependencies.createDependencyLink(clientId, 'risk', riskB.id, 'risk', riskA.id, 'actor');

    const cycleResult = await dependencies.detectCycles('risk', riskA.id, clientId);
    expect(cycleResult.hasCycle).toBe(true);
    expect(cycleResult.cyclePath.length).toBeGreaterThan(1);
    expect(cycleResult.cyclePath[0]).toBe(`risk:${riskA.id}`);
  });

  it('a real, genuinely acyclic dependency graph reports no cycle', async () => {
    const clientId = await makeClient('Dependency — No Cycle');
    const riskA = await makeRisk(clientId, 'Real Risk A (acyclic)');
    const riskB = await makeRisk(clientId, 'Real Risk B (acyclic)');
    await dependencies.createDependencyLink(clientId, 'risk', riskA.id, 'risk', riskB.id, 'actor');
    const result = await dependencies.detectCycles('risk', riskA.id, clientId);
    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toEqual([]);
  });

  it('object-level ownership: Client A cannot query cycles or impact for Client B\'s real entity', async () => {
    const a = await makeClient('Dependency Ownership Query A');
    const b = await makeClient('Dependency Ownership Query B');
    const riskA = await makeRisk(a, 'Real Risk Query A');
    await expect(dependencies.detectCycles('risk', riskA.id, b)).rejects.toThrow(DependencyOwnershipError);
    await expect(dependencies.getDependencyImpact('risk', riskA.id, b)).rejects.toThrow(DependencyOwnershipError);
  });
});

describe('Dependency Analysis routes — RBAC (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Dependency RBAC — Unauth');
    const riskA = await makeRisk(clientId, 'Real Risk RBAC Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/dependencies/risk/${riskA.id}/impact` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Dependency RBAC — Customer');
    const riskA = await makeRisk(clientId, 'Real Risk RBAC Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/dependencies/risk/${riskA.id}/impact`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can link and query a real dependency -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Dependency RBAC — Staff Allowed');
    const riskA = await makeRisk(clientId, 'Real Risk RBAC Staff A');
    const riskB = await makeRisk(clientId, 'Real Risk RBAC Staff B');
    const admin = await adminToken();
    const link = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/dependencies/link`, headers: { authorization: `Bearer ${admin}` }, payload: { sourceType: 'risk', sourceId: riskA.id, targetType: 'risk', targetId: riskB.id } });
    expect(link.statusCode).toBe(201);
    const impact = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/dependencies/risk/${riskB.id}/impact`, headers: { authorization: `Bearer ${admin}` } });
    expect(impact.statusCode).toBe(200);
    expect(impact.json().dependents).toBe(1);
  });

  it('4/6. cross-client dependency link attempt -> DENIED (404, object-level ownership on both ends)', async () => {
    const app = await buildApp();
    const a = await makeClient('Dependency RBAC — Cross Client A');
    const b = await makeClient('Dependency RBAC — Cross Client B');
    const admin = await adminToken();
    const riskA = await makeRisk(a, 'Real Risk Cross A');
    const riskB = await makeRisk(b, 'Real Risk Cross B');
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${a}/dependencies/link`, headers: { authorization: `Bearer ${admin}` }, payload: { sourceType: 'risk', sourceId: riskA.id, targetType: 'risk', targetId: riskB.id } });
    expect(res.statusCode).toBe(404);
  });

  it('7. a malformed entity id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Dependency RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/dependencies/risk/${encodeURIComponent("not-real; DROP TABLE oc_risks;--")}/impact`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('an empty-body POST to the link route is a safe 4xx, never an unhandled crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Dependency RBAC — Empty Body Audit');
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/dependencies/link`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBeLessThan(500);
  });
});
