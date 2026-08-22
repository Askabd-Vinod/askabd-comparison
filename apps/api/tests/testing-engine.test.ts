/**
 * Universal Testing & Validation Engine — migration 049, testing-engine.ts,
 * test-execution-service.ts, test-defect-service.ts, test-report-service.ts,
 * test-management-adapter.ts, testing-engine-routes.ts. Proves, against
 * real Postgres and the real route handlers:
 *  - real, rule-based (never fabricated) test case generation from a real
 *    business requirement, a real gap, and a real discovery extraction —
 *    every generated case carries a real reason and a real Traceability
 *    Engine link back to its source
 *  - "never mark PASS without evidence" is a real, enforced 422
 *  - a real FAIL automatically creates a real, reproducible defect
 *  - the defect state machine is real and enforced (no premature CLOSED)
 *  - the retest flow requires READY_FOR_RETEST first, and a real retest
 *    outcome drives the defect to RETEST_PASSED/RETEST_FAILED
 *  - a real requirement coverage matrix with real, computed percentages
 *  - a real migration validation using a genuine Universal Comparison
 *    Engine run (not fabricated)
 *  - RBAC and tenant isolation
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { testingEngineRoutes } from '../src/routes/testing-engine-routes.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { BusinessRequirementsService } from '../src/services/business-requirements-service.js';
import { DiscoveryIntakeService } from '../src/services/discovery-intake-service.js';
import { TraceabilityEngine } from '../src/services/traceability-engine.js';
import { ClientDatabaseConnectionService } from '../src/services/client-database-connection-service.js';
import { UniversalComparisonEngine } from '../src/services/universal-comparison-engine.js';
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
  await app.register(testingEngineRoutes, { prefix: '/api/v1' });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' }); // real gap creation
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
    await sharedPool.query('DELETE FROM test_defects WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM test_executions WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM test_runs WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM test_suites WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM test_cases WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM comparison_runs WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_database_connections WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_gaps WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_business_requirements WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM discovery_extractions WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM discovery_sources WHERE client_id = $1', [id]).catch(() => {});
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
  description: 'When a customer places an order, the system sends a confirmation email within 30 seconds of order placement.',
  businessObjective: 'Reduce post-purchase customer support tickets.',
  stakeholder: 'VP of Customer Operations',
  category: 'order-management',
  acceptanceCriteria: 'Given an order is placed, when payment is confirmed, then a confirmation email is delivered within 30 seconds.',
  requirementType: 'security',
};

describe('Test case generation — real, rule-based, always reasoned and traced', () => {
  it('generates multiple, distinct, reasoned test cases from a real business requirement, each linked via Traceability', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Gen BR ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, COMPLETE_REQUIREMENT_PAYLOAD, 'admin-1');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/generate/business-requirement/${requirement.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(201);
    const { generated } = res.json();
    expect(generated.length).toBeGreaterThanOrEqual(4); // positive, negative, boundary (30 seconds), security (requirementType)

    for (const tc of generated) {
      expect(tc.generationReason).toBeTruthy(); // never a meaningless, unreasoned test
      expect(tc.source).toBe('generated');
    }
    expect(generated.some((t: any) => t.category === 'positive')).toBe(true);
    expect(generated.some((t: any) => t.category === 'negative')).toBe(true);
    expect(generated.some((t: any) => t.category === 'boundary')).toBe(true);
    expect(generated.some((t: any) => t.category === 'security')).toBe(true);

    const traceability = new TraceabilityEngine();
    for (const tc of generated) {
      const outbound = await traceability.getOutboundLinks('test_case', tc.id);
      expect(outbound.some(l => l.targetType === 'business_requirement' && l.targetId === requirement.id && l.linkType === 'tests')).toBe(true);
    }
    await app.close();
  });

  it('generates real test cases from a real gap, including a security case when security_impact is recorded', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Gen Gap ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const gapRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Legacy auth gap', targetState: 'MFA enforced for all staff logins' },
    });
    expect(gapRes.statusCode).toBe(201);
    const gap = gapRes.json();
    // A real, pre-existing limitation found here, not caused by this pass: gap-analysis-service.ts's
    // createGap() hardcodes security_impact (and operational/compliance/financial_impact) to NULL —
    // there is no way to set it via the create payload today. Set directly for this fixture, and flag
    // the gap in docs/enterprise-operations-progress.md Pending Tasks rather than silently working around it.
    await sharedPool.query(`UPDATE oc_gaps SET security_impact = $1 WHERE id = $2`, ['Accounts without MFA are vulnerable to credential stuffing.', gap.id]);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/generate/gap/${gap.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(201);
    const { generated } = res.json();
    expect(generated.some((t: any) => t.category === 'validation')).toBe(true);
    expect(generated.some((t: any) => t.category === 'regression')).toBe(true);
    expect(generated.some((t: any) => t.category === 'security')).toBe(true);
    await app.close();
  });

  it('generates a real test case from a real discovery extraction, citing the real evidence quote', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Gen Discovery ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const discoveryService = new DiscoveryIntakeService();
    const source = await discoveryService.submitSource(clientId, { title: 'Client call notes', rawContent: 'Our checkout page must support Apple Pay for mobile customers.' }, 'admin-1');
    const extraction = await discoveryService.extractField(source.id, {
      fieldName: 'payment_method', fieldValue: 'Apple Pay support required on mobile checkout',
      evidenceQuote: 'Our checkout page must support Apple Pay for mobile customers.',
    }, 'admin-1');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/generate/discovery-extraction/${extraction.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(201);
    const { generated } = res.json();
    expect(generated).toHaveLength(1);
    expect(generated[0].testData).toContain('Apple Pay');
    await app.close();
  });

  it('an unknown source kind is rejected honestly, not silently generating nothing', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/x/test-cases/generate/nonsense-kind/${randomUUID()}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('Test execution — never PASS without evidence, real defect on FAIL', () => {
  it('rejects a PASS with no actualResult/evidence (422), never a bare status flip', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Exec Evidence ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const caseRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases`, headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Manual case', category: 'positive' },
    });
    const testCase = caseRes.json();

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/${testCase.id}/executions`,
      headers: { authorization: `Bearer ${admin}` }, payload: { status: 'pass' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('missing_evidence');
    await app.close();
  });

  it('a real FAIL with real evidence creates a real, reproducible defect', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Exec Fail ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const caseRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases`, headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Checkout total calculation', category: 'validation', expectedResult: 'Total includes tax', steps: ['Add item', 'Go to checkout', 'Read total'] },
    });
    const testCase = caseRes.json();

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/${testCase.id}/executions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'fail', actualResult: 'Total excludes tax entirely.', evidence: [{ type: 'screenshot', description: 'Checkout page showing wrong total' }] },
    });
    expect(res.statusCode).toBe(201);
    const execution = res.json();
    expect(execution.defectId).toBeTruthy();

    const defectRes = await app.inject({ method: 'GET', url: `/api/v1/oc/test-defects/${execution.defectId}`, headers: { authorization: `Bearer ${admin}` } });
    const defect = defectRes.json();
    expect(defect.status).toBe('open');
    expect(defect.stepsToReproduce).toContain('Add item');
    expect(defect.actualResult).toBe('Total excludes tax entirely.');
    await app.close();
  });
});

describe('Defect state machine — enforced, never prematurely CLOSED', () => {
  async function makeFailedDefect(app: any, clientId: string, admin: string) {
    const caseRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases`, headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Login flow', category: 'positive' },
    });
    const testCase = caseRes.json();
    const execRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/${testCase.id}/executions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'fail', actualResult: 'Login fails with 500.', evidence: [{ type: 'console_log', description: 'Stack trace' }] },
    });
    return execRes.json().defectId as string;
  }

  it('an invalid transition (OPEN -> CLOSED directly) is rejected', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Defect Invalid ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const defectId = await makeFailedDefect(app, clientId, admin);

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/oc/test-defects/${defectId}/status`, headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'closed' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_transition');
    await app.close();
  });

  it('retest is rejected until the defect is genuinely READY_FOR_RETEST', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Retest Gate ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const defectId = await makeFailedDefect(app, clientId, admin);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/test-defects/${defectId}/retest`, headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'pass', actualResult: 'Fixed.', evidence: [{ type: 'note', description: 'Verified manually' }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('the full real lifecycle: OPEN -> IN_PROGRESS -> FIXED -> READY_FOR_RETEST -> real retest PASS -> RETEST_PASSED -> CLOSED', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Defect Lifecycle ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const defectId = await makeFailedDefect(app, clientId, admin);

    for (const status of ['in_progress', 'fixed', 'ready_for_retest']) {
      const r = await app.inject({ method: 'PATCH', url: `/api/v1/oc/test-defects/${defectId}/status`, headers: { authorization: `Bearer ${admin}` }, payload: { status } });
      expect(r.statusCode).toBe(200);
      expect(r.json().status).toBe(status);
    }

    const retestRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/test-defects/${defectId}/retest`, headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'pass', actualResult: 'Login succeeds now.', evidence: [{ type: 'screenshot', description: 'Successful login' }] },
    });
    expect(retestRes.statusCode).toBe(201);
    expect(retestRes.json().defectStatus).toBe('retest_passed');
    expect(retestRes.json().execution.retestOfExecutionId).toBeTruthy();

    const closeRes = await app.inject({ method: 'PATCH', url: `/api/v1/oc/test-defects/${defectId}/status`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'closed' } });
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().status).toBe('closed');
    await app.close();
  });

  it('a failed retest moves the defect to RETEST_FAILED, never CLOSED — "do not close simply because code changed"', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Defect RetestFail ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const defectId = await makeFailedDefect(app, clientId, admin);
    for (const status of ['in_progress', 'fixed', 'ready_for_retest']) {
      await app.inject({ method: 'PATCH', url: `/api/v1/oc/test-defects/${defectId}/status`, headers: { authorization: `Bearer ${admin}` }, payload: { status } });
    }
    const retestRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/test-defects/${defectId}/retest`, headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'fail', actualResult: 'Still fails.', evidence: [{ type: 'console_log', description: 'Same error' }] },
    });
    expect(retestRes.json().defectStatus).toBe('retest_failed');
    const defectRes = await app.inject({ method: 'GET', url: `/api/v1/oc/test-defects/${defectId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(defectRes.json().status).toBe('retest_failed');
    expect(defectRes.json().status).not.toBe('closed');
    await app.close();
  });
});

describe('Requirement coverage matrix + report — real, computed, never fabricated', () => {
  it('coverage percentages are computed from real executions', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Coverage ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, COMPLETE_REQUIREMENT_PAYLOAD, 'admin-1');

    const genRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/generate/business-requirement/${requirement.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    const { generated } = genRes.json();
    expect(generated.length).toBeGreaterThan(0);

    // Execute only the first generated case, leave the rest NOT_EXECUTED — a real, partial coverage state.
    await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-cases/${generated[0].id}/executions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'pass', actualResult: 'Confirmed working.', evidence: [{ type: 'note', description: 'Manually verified' }] },
    });

    const covRes = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/test-coverage`, headers: { authorization: `Bearer ${admin}` } });
    const { coverage } = covRes.json();
    const row = coverage.find((c: any) => c.requirementId === requirement.id);
    expect(row).toBeTruthy();
    expect(row.totalCases).toBe(generated.length);
    expect(row.executed).toBe(1);
    expect(row.passed).toBe(1);
    expect(row.coveragePercent).toBeCloseTo((1 / generated.length) * 100, 1);

    const reportRes = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/test-report`, headers: { authorization: `Bearer ${admin}` } });
    const report = reportRes.json();
    expect(report.totals.pass).toBeGreaterThanOrEqual(1);
    expect(report.knownLimitations.length).toBeGreaterThan(0); // never claims full coverage it doesn't have

    const htmlRes = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/test-report/export?format=html`, headers: { authorization: `Bearer ${admin}` } });
    expect(htmlRes.statusCode).toBe(200);
    expect(htmlRes.body).toContain('Known Limitations');
    expect(htmlRes.body).toContain('Final Recommendation');
    await app.close();
  });
});

describe('Migration validation — real Universal Comparison Engine integration, not fabricated', () => {
  async function makeRealConnection(clientId: string, name: string) {
    const service = new ClientDatabaseConnectionService();
    const result = await service.create({
      clientId, name, connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass',
      environment: 'development', createdBy: 'test',
    });
    if (!result.ok) throw new Error('Failed to create real test connection: ' + JSON.stringify(result.error));
    return result.value.id;
  }

  it('validates a real, completed comparison run and records a real PASS when schemas genuinely match', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Testing Migration ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientId, 'Source');
    const rightId = await makeRealConnection(clientId, 'Target');
    const comparisonEngine = new UniversalComparisonEngine();
    const run = await comparisonEngine.runDatabaseSchemaComparison(clientId, leftId, rightId, 'admin-1');
    expect(run.status).toBe('completed');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/test-report/migration-validation`,
      headers: { authorization: `Bearer ${admin}` }, payload: { comparisonRunId: run.id },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.execution.status).toBe('pass'); // same real DB on both sides -> zero diffs -> real pass
    expect(body.execution.evidence[0].reference).toBe(run.id);
    await app.close();
  });
});

describe('RBAC and tenant isolation', () => {
  it('denies a customer token (403)', async () => {
    const app = await buildApp();
    const customer = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/x/test-cases`, headers: { authorization: `Bearer ${customer}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rejects an unauthenticated request (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/x/test-cases` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
