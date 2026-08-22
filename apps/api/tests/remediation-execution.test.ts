/**
 * Real remediation execution — proves the engine built to replace RemediationPanel's
 * previous client-side simulation (setInterval, fabricated durations/evidence,
 * hardcoded approver). Every assertion here is against the real route handlers, a
 * real Postgres row, and the real OperationService — no mocking.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
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

const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'some-unrelated-org' });

const cleanupClientIds: string[] = [];
const cleanupIncidentIds: string[] = [];
const cleanupRemediationIds: string[] = [];

afterAll(async () => {
  for (const id of cleanupRemediationIds) await sharedPool.query('DELETE FROM oc_operations WHERE source_id = $1', [id]).catch(() => {});
  for (const id of cleanupRemediationIds) await sharedPool.query('DELETE FROM oc_remediations WHERE id = $1', [id]).catch(() => {});
  for (const id of cleanupIncidentIds) await sharedPool.query('DELETE FROM oc_incidents WHERE id = $1', [id]).catch(() => {});
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

describe('Real remediation execution engine', () => {
  it('a real remediation executes step-by-step with real, operator-driven transitions and reaches genuine completion via the shared Operation model — never fake progress', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Remediation Execution Test'));
    cleanupClientIds.push(client.id);

    const incRes = await sharedPool.query(
      `INSERT INTO oc_incidents (client_id, severity, title, description, status) VALUES ($1,'critical',$2,'test incident','detected') RETURNING *`,
      [client.id, 'Test incident for remediation']
    );
    const incident = incRes.rows[0];
    cleanupIncidentIds.push(incident.id);

    const remediation = await ocService.createRemediation({
      incidentId: incident.id, clientId: client.id, title: 'Fix test incident',
      grade: 'standard', fixImmediate: 'restart service', fixPermanent: 'patch root cause',
      steps: [
        { id: 'step-1', label: 'Pre-flight checks', description: 'verify env', status: 'pending' },
        { id: 'step-2', label: 'Apply fix', description: 'apply the fix', status: 'pending' },
      ],
      owner: 'test-owner',
    });
    cleanupRemediationIds.push(remediation.id);

    const admin = await adminToken();
    const customer = await customerToken();

    // A real customer token is denied starting execution on another client's remediation.
    const deniedExec = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/execute`,
      headers: { authorization: `Bearer ${customer}` }, payload: { actor: 'attacker' },
    });
    expect(deniedExec.statusCode).toBe(403);

    // Real execution start — creates a genuine oc_operations row (visible via GET /oc/operations/:id).
    const execRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/execute`,
      headers: { authorization: `Bearer ${admin}` }, payload: { actor: 'staff-1' },
    });
    expect(execRes.statusCode).toBe(200);
    const execBody = execRes.json();
    expect(execBody.remediation.phase).toBe('executing');
    expect(execBody.operation.status).toBe('running');
    expect(execBody.operation.totalUnits).toBe(2);
    expect(execBody.operation.completedUnits).toBe(0);
    // Honest per this platform's standing rule: progressPercent stays NULL — "not yet
    // reported" — until the first real progress() call, rather than fabricating an
    // initial 0% the instant the row is created.
    expect(execBody.operation.progressPercent).toBeNull();

    // A second execute call while one is already running is rejected, not silently duplicated.
    const dupExec = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/execute`,
      headers: { authorization: `Bearer ${admin}` }, payload: { actor: 'staff-1' },
    });
    expect(dupExec.statusCode).toBe(409);

    // Real, operator-driven step 1: start then complete.
    const start1 = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/steps/step-1/start`,
      headers: { authorization: `Bearer ${admin}` }, payload: { actor: 'staff-1' },
    });
    expect(start1.statusCode).toBe(200);
    expect(start1.json().remediation.steps.find((s: any) => s.id === 'step-1').status).toBe('in-progress');

    const complete1 = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/steps/step-1/complete`,
      headers: { authorization: `Bearer ${admin}` }, payload: { actor: 'staff-1', evidence: 'Pre-flight checks passed' },
    });
    expect(complete1.statusCode).toBe(200);
    const step1 = complete1.json().remediation.steps.find((s: any) => s.id === 'step-1');
    expect(step1.status).toBe('passed');
    expect(step1.duration).toMatch(/^\d+s$/); // real measured elapsed time, not a fabricated string

    // Operation reflects real, incremental progress — 1 of 2 units, 50%.
    const midOp = await app.inject({
      method: 'GET', url: `/api/v1/oc/operations/${execBody.operation.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(midOp.json().operation.completedUnits).toBe(1);
    expect(midOp.json().operation.progressPercent).toBe(50);
    expect(midOp.json().operation.status).toBe('running'); // not yet fabricated-complete

    // Step 2: start then complete — this is the LAST step, so the operation and the
    // remediation phase must both genuinely transition, driven by the real route logic.
    await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/steps/step-2/start`,
      headers: { authorization: `Bearer ${admin}` }, payload: { actor: 'staff-1' },
    });
    const complete2 = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/steps/step-2/complete`,
      headers: { authorization: `Bearer ${admin}` }, payload: { actor: 'staff-1', evidence: 'Fix applied' },
    });
    expect(complete2.json().remediation.phase).toBe('validating'); // real auto-transition, all steps done

    const finalOp = await app.inject({
      method: 'GET', url: `/api/v1/oc/operations/${execBody.operation.id}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(finalOp.json().operation.status).toBe('completed');
    expect(finalOp.json().operation.progressPercent).toBe(100);
    expect(finalOp.json().operation.completedAt).not.toBeNull();

    // Real fixes found live during browser verification of this exact feature:
    // approved_by must reflect who actually clicked execute, and phase must genuinely
    // reach 'completed' (not stay stuck at 'validating' forever) once the ticket closes.
    expect(complete2.json().remediation.approved_by).toBe('staff-1');
    expect(complete2.json().remediation.completed_at).toBeNull(); // not yet — still awaiting verification

    const closeRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/remediations/${remediation.id}/close`,
      headers: { authorization: `Bearer ${admin}` }, payload: { verifiedBy: 'staff-1' },
    });
    expect(closeRes.json().remediation.ticket_closed).toBe(true);
    expect(closeRes.json().remediation.phase).toBe('completed');
    expect(closeRes.json().remediation.completed_at).not.toBeNull();

    await app.close();
  });

  it('findOrCreateRemediation is genuinely atomic — concurrent calls for the same incident never create a duplicate open remediation (the real race found live on the incident-detail page)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Remediation Idempotency Test'));
    cleanupClientIds.push(client.id);
    const incRes = await sharedPool.query(
      `INSERT INTO oc_incidents (client_id, severity, title, status) VALUES ($1,'high','Race test incident','detected') RETURNING *`,
      [client.id]
    );
    cleanupIncidentIds.push(incRes.rows[0].id);
    const admin = await adminToken();

    const payload = {
      incidentId: incRes.rows[0].id, clientId: client.id, title: 'Race test remediation',
      grade: 'standard', fixImmediate: 'x', fixPermanent: 'y', owner: 'test-owner',
    };

    // Ten genuinely concurrent requests — the real shape of the bug found live
    // (two near-simultaneous page loads), just amplified.
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      app.inject({ method: 'POST', url: '/api/v1/oc/remediations/find-or-create', headers: { authorization: `Bearer ${admin}` }, payload })
    ));
    const ids = new Set(results.map(r => r.json().remediation.id));
    expect(ids.size).toBe(1); // exactly one real row, never ten

    const dbCheck = await sharedPool.query('SELECT count(*) FROM oc_remediations WHERE incident_id = $1', [incRes.rows[0].id]);
    cleanupRemediationIds.push(...Array.from(ids) as string[]);
    expect(Number(dbCheck.rows[0].count)).toBe(1);

    await app.close();
  });

  it('a real customer token is denied reading another client\'s remediation and listing all remediations (403)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Remediation Read RBAC Test'));
    cleanupClientIds.push(client.id);
    const remediation = await ocService.createRemediation({
      incidentId: 'inc-does-not-exist', clientId: client.id, title: 'Read RBAC test',
      grade: 'standard', fixImmediate: 'x', fixPermanent: 'y', owner: 'test-owner',
    });
    cleanupRemediationIds.push(remediation.id);

    const token = await customerToken();
    const detailRes = await app.inject({ method: 'GET', url: `/api/v1/oc/remediations/${remediation.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(detailRes.statusCode).toBe(403);
    const listRes = await app.inject({ method: 'GET', url: `/api/v1/oc/remediations`, headers: { authorization: `Bearer ${token}` } });
    expect(listRes.statusCode).toBe(403);

    await app.close();
  });
});
