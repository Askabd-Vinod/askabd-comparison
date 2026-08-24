/**
 * change_management_test_1 — Change Management Engine (2026-08-24 master
 * completion directive, capability #71). Covers the real state machine,
 * real enforced assess-before-approval-content requirements, real
 * ownership-verified risk/deployment linkage, real ApprovalWorkflowEngine
 * reuse with self-approval prevention, real never-fabricated closure
 * evidence, and the Security Testing Addendum's minimum scenarios
 * including cross-client change-id IDOR.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { changeManagementRoutes } from '../src/routes/change-management-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { RiskEngine } from '../src/services/risk-engine.js';
import { ChangeManagementEngine, ChangeOwnershipError, InvalidChangeTransitionError, SelfApprovalError } from '../src/services/change-management-engine.js';

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
  await app.register(changeManagementRoutes, { prefix: '/api/v1' });
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
const changes = new ChangeManagementEngine();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

const assessFields = { impactAssessment: 'Real impact: brief downtime during deploy window.', implementationPlan: 'Real plan: blue/green swap.', rollbackPlan: 'Real plan: revert to previous image.' };

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM approval_workflows WHERE entity_id IN (SELECT id FROM oc_change_records WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_change_records WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_risks WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_client_requests WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('ChangeManagementEngine — real state machine + enforced content + real approval workflow', () => {
  it('createChange requires a real title', async () => {
    const clientId = await makeClient('Change — Required Fields');
    await expect(changes.createChange(clientId, { title: '' }, 'actor')).rejects.toThrow(/title/);
  });

  it('assess refuses without real, non-empty impact/implementation/rollback content', async () => {
    const clientId = await makeClient('Change — Assess Requires Content');
    const change = await changes.createChange(clientId, { title: 'Real Change A' }, 'requester-1');
    await expect(changes.assess(change.id, clientId, 'requester-1', { impactAssessment: '', implementationPlan: 'x', rollbackPlan: 'x' })).rejects.toThrow(/impact assessment/);
    await expect(changes.assess(change.id, clientId, 'requester-1', { impactAssessment: 'x', implementationPlan: '', rollbackPlan: 'x' })).rejects.toThrow(/implementation plan/);
    await expect(changes.assess(change.id, clientId, 'requester-1', { impactAssessment: 'x', implementationPlan: 'x', rollbackPlan: '' })).rejects.toThrow(/rollback plan/);
    const assessed = await changes.assess(change.id, clientId, 'requester-1', assessFields);
    expect(assessed.status).toBe('assessed');
    expect(assessed.impactAssessment).toBe(assessFields.impactAssessment);
  });

  it('the real state machine rejects an invalid transition (draft straight to approved)', async () => {
    const clientId = await makeClient('Change — Invalid Transition');
    const change = await changes.createChange(clientId, { title: 'Real Change B' }, 'requester-1');
    await expect(changes.decideApproval(change.id, clientId, 'approve', 'approver-1')).rejects.toThrow(/no pending approval/);
  });

  it('real, ownership-verified risk linkage — a foreign client\'s real risk id is refused', async () => {
    const a = await makeClient('Change — Risk Link A');
    const b = await makeClient('Change — Risk Link B');
    const change = await changes.createChange(a, { title: 'Real Change Risk Link' }, 'requester-1');
    const riskB = await risks.createRisk(b, { title: 'Real Risk B', source: 'security', probability: 'medium', impact: 'high' }, 'actor');
    await expect(changes.linkRisk(change.id, a, riskB.id, 'requester-1')).rejects.toThrow(ChangeOwnershipError);
    const riskA = await risks.createRisk(a, { title: 'Real Risk A', source: 'security', probability: 'medium', impact: 'high' }, 'actor');
    const linked = await changes.linkRisk(change.id, a, riskA.id, 'requester-1');
    expect(linked.riskIds).toContain(riskA.id);
    // Linking the same risk twice is idempotent, not a duplicate.
    const linkedAgain = await changes.linkRisk(change.id, a, riskA.id, 'requester-1');
    expect(linkedAgain.riskIds.filter(id => id === riskA.id)).toHaveLength(1);
  });

  it('real, ownership-verified deployment linkage — a foreign client\'s real deployment id is refused', async () => {
    const a = await makeClient('Change — Deployment Link A');
    const b = await makeClient('Change — Deployment Link B');
    const change = await changes.createChange(a, { title: 'Real Change Deployment Link' }, 'requester-1');
    const depB = await sharedPool.query<{ id: string }>(`INSERT INTO oc_deployments (client_id, environment, application, version) VALUES ($1, 'staging', 'App', '1.0.0') RETURNING id`, [b]);
    await expect(changes.linkDeployment(change.id, a, depB.rows[0]!.id, 'requester-1')).rejects.toThrow(ChangeOwnershipError);
    const depA = await sharedPool.query<{ id: string }>(`INSERT INTO oc_deployments (client_id, environment, application, version) VALUES ($1, 'staging', 'App', '1.0.0') RETURNING id`, [a]);
    const linked = await changes.linkDeployment(change.id, a, depA.rows[0]!.id, 'requester-1');
    expect(linked.deploymentId).toBe(depA.rows[0]!.id);
  });

  it('the real end-to-end approval flow, with real self-approval prevention', async () => {
    const clientId = await makeClient('Change — Real Approval Flow');
    const change = await changes.createChange(clientId, { title: 'Real Change Approval' }, 'requester-2');
    await changes.assess(change.id, clientId, 'requester-2', assessFields);
    const requested = await changes.requestApproval(change.id, clientId, 'requester-2');
    expect(requested.status).toBe('approval_pending');
    expect(requested.approvalWorkflowId).toBeTruthy();

    await expect(changes.decideApproval(change.id, clientId, 'approve', 'requester-2')).rejects.toThrow(SelfApprovalError);

    const approved = await changes.decideApproval(change.id, clientId, 'approve', 'approver-1', 'Looks good.');
    expect(approved.status).toBe('approved');

    const implementing = await changes.startImplementation(change.id, clientId, 'operator-1');
    expect(implementing.status).toBe('implementing');
    const validating = await changes.moveToValidating(change.id, clientId, 'operator-1', 'Verified via uat_test_1 cycle uat-xyz');
    expect(validating.status).toBe('validating');
    expect(validating.validationReference).toContain('uat_test_1');

    await expect(changes.close(change.id, clientId, 'operator-1', '')).rejects.toThrow(/validation evidence/);
    const closed = await changes.close(change.id, clientId, 'operator-1', 'Real post-change smoke tests passed, no incidents in the 24h monitoring window.');
    expect(closed.status).toBe('closed');
    expect(closed.postChangeValidation).toContain('smoke tests passed');
  });

  it('a rejected approval cancels the change with a real, required reason', async () => {
    const clientId = await makeClient('Change — Rejected Approval');
    const change = await changes.createChange(clientId, { title: 'Real Change Reject' }, 'requester-3');
    await changes.assess(change.id, clientId, 'requester-3', assessFields);
    await changes.requestApproval(change.id, clientId, 'requester-3');
    await expect(changes.decideApproval(change.id, clientId, 'reject', 'approver-2')).rejects.toThrow(/reason/);
    const rejected = await changes.decideApproval(change.id, clientId, 'reject', 'approver-2', 'Too risky for this window.');
    expect(rejected.status).toBe('cancelled');
  });

  it('a real originating client request is verified for ownership when linking', async () => {
    const a = await makeClient('Change — Client Request Link A');
    const b = await makeClient('Change — Client Request Link B');
    const reqA = await sharedPool.query<{ id: string }>(
      `INSERT INTO oc_client_requests (client_id, request_type, description, requested_by, requested_by_org_context, priority) VALUES ($1, 'change', 'Real request', 'client-user', 'org-a', 'normal') RETURNING id`,
      [a],
    );
    await expect(changes.createChange(b, { title: 'Real Change From Wrong Client', clientRequestId: reqA.rows[0]!.id }, 'attacker')).rejects.toThrow(ChangeOwnershipError);
    const change = await changes.createChange(a, { title: 'Real Change From Own Request', clientRequestId: reqA.rows[0]!.id }, 'staff');
    expect(change.clientRequestId).toBe(reqA.rows[0]!.id);
  });

  it('object-level ownership: Client A cannot read, assess, or cancel Client B\'s real change', async () => {
    const a = await makeClient('Change Ownership A');
    const b = await makeClient('Change Ownership B');
    const changeA = await changes.createChange(a, { title: 'Real Change Ownership' }, 'requester');
    await expect(changes.getChange(changeA.id, b)).rejects.toThrow(ChangeOwnershipError);
    await expect(changes.assess(changeA.id, b, 'attacker', assessFields)).rejects.toThrow(ChangeOwnershipError);
    await expect(changes.cancel(changeA.id, b, 'attacker', 'x')).rejects.toThrow(ChangeOwnershipError);
  });
});

describe('Change Management routes — RBAC + tenant isolation (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Change RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/changes` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Change RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/changes`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can create and read a real change -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Change RBAC — Staff Allowed');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/changes`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Real HTTP Change' } });
    expect(create.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/changes/${create.json().id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
  });

  it('4/6. cross-client change id -> DENIED (404, object-level ownership)', async () => {
    const app = await buildApp();
    const a = await makeClient('Change RBAC — Cross Client A');
    const b = await makeClient('Change RBAC — Cross Client B');
    const admin = await adminToken();
    const changeA = await changes.createChange(a, { title: 'Real Cross-Client Change' }, 'requester');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${b}/changes/${changeA.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
  });

  it('7. malformed change id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Change RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/changes/${encodeURIComponent("not-real; DROP TABLE oc_change_records;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('self-approval at the HTTP layer returns a real 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Change RBAC — Self Approval HTTP');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/changes`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Real Self Approval Change' } });
    const id = create.json().id;
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/changes/${id}/assess`, headers: { authorization: `Bearer ${admin}` }, payload: assessFields });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/changes/${id}/request-approval`, headers: { authorization: `Bearer ${admin}` } });
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/changes/${id}/approval/approve`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('self_approval_forbidden');
  });

  it('an empty-body POST to every change decision route is a safe 4xx, never an unhandled crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Change RBAC — Empty Body Audit');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/changes`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Real Empty Body Change' } });
    const id = create.json().id;
    const routes = [
      `/api/v1/oc/clients/${clientId}/changes/${id}/assess`,
      `/api/v1/oc/clients/${clientId}/changes/${id}/link-risk`,
      `/api/v1/oc/clients/${clientId}/changes/${id}/link-deployment`,
      `/api/v1/oc/clients/${clientId}/changes/${id}/close`,
      `/api/v1/oc/clients/${clientId}/changes/${id}/cancel`,
    ];
    for (const url of routes) {
      const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${admin}` } });
      expect(res.statusCode).toBeLessThan(500);
    }
  });
});
