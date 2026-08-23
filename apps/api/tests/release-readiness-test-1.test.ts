/**
 * release_readiness_test_1 — Release Readiness Engine (2026-08-24, uat_test_1's follow-on).
 *
 * Real go/no-go aggregation over 5 already-existing signals (lifecycle
 * stage, migration validation, critical-test-case pass rate, open
 * critical/high defects, UAT sign-off) — see release-readiness-service.ts's
 * own doc comment for the full reuse rationale. No dimension is
 * fabricated: every one is computed from real, persisted rows, and a
 * dimension with no real data at all is reported `not_determined`, never
 * silently treated as a pass.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { releaseReadinessRoutes } from '../src/routes/release-readiness-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { TestCaseService } from '../src/services/testing-engine.js';
import { UatService } from '../src/services/uat-service.js';
import { ReleaseReadinessService, ReleaseNotReadyError } from '../src/services/release-readiness-service.js';

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
const customerToken = () => signToken({ sub: 'customer-1', org: 'unrelated-org', roles: [] });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(releaseReadinessRoutes, { prefix: '/api/v1' });
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
const cases = new TestCaseService();
const uat = new UatService();
const service = new ReleaseReadinessService();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    // Two distinct approval_workflows shapes get created by this file's own
    // fixtures: 'release_signoff' keyed by entity_id=clientId directly, AND
    // (via the "all 5 dimensions passing" test's own UAT setup)
    // 'uat_signoff' keyed by entity_id=<test_suites id>, NOT the clientId —
    // a real cleanup gap found live in this exact file (see
    // docs/security-risk-register.md RISK-006's 2026-08-24 update): the
    // single `entity_id = $1` delete below only ever caught the first
    // shape, silently orphaning every 'uat_signoff' row this file created.
    await sharedPool.query(`DELETE FROM approval_workflows WHERE entity_id IN (SELECT id::text FROM test_suites WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM approval_workflows WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_defects WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_executions WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_suites WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_cases WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_lifecycle WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

async function seedLifecycle(clientId: string, status: string): Promise<void> {
  await sharedPool.query(
    `INSERT INTO oc_lifecycle (client_id, status, previous_status, events, version)
     VALUES ($1, $2, 'x', '[]', 1)
     ON CONFLICT (client_id) DO UPDATE SET status = $2`,
    [clientId, status],
  );
}

async function seedMigrationValidation(clientId: string, action: 'validation_passed' | 'validation_failed'): Promise<void> {
  await sharedPool.query(
    `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details, evidence)
     VALUES ('validation', $1, $2, 'system', '{}', '{}')`,
    [clientId, action],
  );
}

describe('ReleaseReadinessService — real aggregation, never fabricated', () => {
  it('a brand-new client with zero real signals is honestly not_determined on every optional/required dimension, never a fabricated GO', async () => {
    const clientId = await makeClient('Release Readiness — Blank Client');
    const readiness = await service.getReadiness(clientId);
    expect(readiness.overall).toBe('no_go');
    const lifecycle = readiness.dimensions.find(d => d.name === 'Lifecycle Stage')!;
    expect(lifecycle.status).toBe('not_determined');
    const migration = readiness.dimensions.find(d => d.name === 'Migration Validation')!;
    expect(migration.status).toBe('not_determined');
    const uatDim = readiness.dimensions.find(d => d.name === 'UAT Sign-off')!;
    expect(uatDim.status).toBe('not_determined');
    expect(uatDim.blocking).toBe(false); // no UAT cycle exists — informational, not blocking
  });

  it('all 5 real dimensions genuinely passing -> overall GO, and only then can sign-off be requested', async () => {
    const clientId = await makeClient('Release Readiness — All Green');
    await seedLifecycle(clientId, 'audit-passed');
    await seedMigrationValidation(clientId, 'validation_passed');

    const testCase = await cases.createManual(clientId, { title: 'Critical path', category: 'positive', priority: 'critical', severity: 'critical', expectedResult: 'Works' }, 'test-actor');
    const { TestExecutionService } = await import('../src/services/test-execution-service.js');
    const executions = new TestExecutionService();
    await executions.recordExecution(clientId, testCase.id, { status: 'pass', actualResult: 'Real pass.', evidence: [{ type: 'note', description: 'Verified.' }] }, 'tester');

    const cycle = await uat.createCycle(clientId, 'Cycle', '', [testCase.id], 'staff');
    const workflow = await uat.requestSignoff(cycle.id, clientId, 'client-tester');
    await uat.approveSignoff(workflow.id, clientId, 'staff-approver');

    const readiness = await service.getReadiness(clientId);
    expect(readiness.overall).toBe('go');
    expect(readiness.dimensions.every(d => d.status === 'pass')).toBe(true);

    const signoff = await service.requestReleaseSignoff(clientId, 'staff-actor');
    expect(signoff.status).toBe('in_review');
    expect(signoff.entityId).toBe(clientId);
  });

  it('a single open critical defect blocks GO even when every other dimension passes', async () => {
    const clientId = await makeClient('Release Readiness — Open Critical Defect');
    await seedLifecycle(clientId, 'audit-passed');
    await seedMigrationValidation(clientId, 'validation_passed');

    const testCase = await cases.createManual(clientId, { title: 'Buggy path', category: 'positive', priority: 'critical', severity: 'critical', expectedResult: 'Works' }, 'test-actor');
    const { TestExecutionService } = await import('../src/services/test-execution-service.js');
    const executions = new TestExecutionService();
    // A real FAIL auto-creates a real, open, critical-severity defect (severity inherited from the test case).
    await executions.recordExecution(clientId, testCase.id, { status: 'fail', actualResult: 'Real observed failure.', evidence: [{ type: 'note', description: 'Screenshot.' }] }, 'tester');

    const readiness = await service.getReadiness(clientId);
    expect(readiness.overall).toBe('no_go');
    const defectDim = readiness.dimensions.find(d => d.name === 'Open Critical/High Defects')!;
    expect(defectDim.status).toBe('fail');
    const testingDim = readiness.dimensions.find(d => d.name === 'Testing (Critical Cases)')!;
    expect(testingDim.status).toBe('fail'); // the same case also fails the testing dimension

    await expect(service.requestReleaseSignoff(clientId, 'staff-actor')).rejects.toThrow(ReleaseNotReadyError);
  });

  it('a rejected migration validation blocks GO', async () => {
    const clientId = await makeClient('Release Readiness — Migration Failed');
    await seedLifecycle(clientId, 'audit-passed');
    await seedMigrationValidation(clientId, 'validation_failed');
    const readiness = await service.getReadiness(clientId);
    const migration = readiness.dimensions.find(d => d.name === 'Migration Validation')!;
    expect(migration.status).toBe('fail');
    expect(readiness.overall).toBe('no_go');
  });

  it('a lifecycle stage before the audit-passed gate blocks GO with an honest, specific reason', async () => {
    const clientId = await makeClient('Release Readiness — Early Stage');
    await seedLifecycle(clientId, 'discovery-running');
    const readiness = await service.getReadiness(clientId);
    const lifecycle = readiness.dimensions.find(d => d.name === 'Lifecycle Stage')!;
    expect(lifecycle.status).toBe('fail');
    expect(lifecycle.detail).toContain('discovery-running');
  });
});

describe('Release Readiness routes — RBAC (staff-only, Admin.Access)', () => {
  it('unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Release Readiness RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/release-readiness` });
    expect(res.statusCode).toBe(401);
  });

  it('a customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Release Readiness RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/release-readiness`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('staff (admin) -> 200, real computed readiness returned', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Release Readiness RBAC — Staff');
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/release-readiness`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().clientId).toBe(clientId);
    expect(res.json().overall).toBe('no_go'); // blank client — honest no_go, never a fabricated go
  });

  it('requesting sign-off before GO returns 409 with the real blocking dimension names, not a fabricated success', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Release Readiness RBAC — Not Ready HTTP');
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/release-readiness/signoff/request`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('release_not_ready');
    expect(res.json().error.blockers.length).toBeGreaterThan(0);
  });

  it('a malformed workflow id on the decision route is a safe 404, never a crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Release Readiness RBAC — Malformed');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/release-readiness/signoff/${encodeURIComponent('not-real; DROP TABLE approval_workflows;--')}/approve`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });
});
