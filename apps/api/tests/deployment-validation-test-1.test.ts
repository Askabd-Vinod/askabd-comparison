/**
 * deployment_validation_test_1 — Deployment Engine (2026-08-24 master
 * directive continuation). Covers the real state machine, the
 * ReleaseReadinessService gate (at both the approval AND execution
 * checkpoints), ApprovalWorkflowEngine reuse (including real
 * self-approval prevention), the deployment-safety boundary (never
 * fabricates a successful external deployment), rollback, and the
 * Security Testing Addendum's minimum scenarios including cross-client
 * deployment-id IDOR.
 *
 * post_delivery_test_1 (post-deployment validation, comparison reuse) is
 * covered in its own sibling file, post-delivery-test-1.test.ts.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { deploymentRoutes } from '../src/routes/deployment-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import {
  DeploymentService, DeploymentOwnershipError, InvalidDeploymentTransitionError,
  ReadinessGateError, SelfApprovalError, RollbackNotAvailableError, DeploymentNotDeletableError,
} from '../src/services/deployment-service.js';

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
  await app.register(deploymentRoutes, { prefix: '/api/v1' });
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
const deployments = new DeploymentService();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

/** Seeds real lifecycle + persisted migration validation so ReleaseReadinessService.getReadiness() returns 'go' with zero test cases/UAT (both non-blocking when absent). */
async function makeReadyClient(name: string): Promise<string> {
  const clientId = await makeClient(name);
  await sharedPool.query(
    `INSERT INTO oc_lifecycle (client_id, status, previous_status, events, version) VALUES ($1, 'audit-passed', 'x', '[]', 1)`,
    [clientId],
  );
  await sharedPool.query(
    `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details, evidence) VALUES ('validation', $1, 'validation_passed', 'system', '{}', '{}')`,
    [clientId],
  );
  return clientId;
}

function depInput(overrides: Record<string, unknown> = {}) {
  return { environment: 'staging', application: 'AskABD Comparison API', version: '1.2.0', previousVersion: '1.1.0', deploymentType: 'standard', risk: 'medium', rollbackPlan: 'Redeploy previous tagged image via CI.', ...overrides };
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM approval_workflows WHERE entity_id IN (SELECT id FROM oc_deployments WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_defects WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_executions WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_deployments WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_suites WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM test_cases WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_lifecycle WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('DeploymentService — real state machine + readiness gate + approval reuse', () => {
  it('createDeployment requires real environment/application/version', async () => {
    const clientId = await makeClient('Deployment — Required Fields');
    await expect(deployments.createDeployment(clientId, depInput({ environment: '' }), 'actor')).rejects.toThrow(/environment/);
    await expect(deployments.createDeployment(clientId, depInput({ application: '' }), 'actor')).rejects.toThrow(/application/);
    await expect(deployments.createDeployment(clientId, depInput({ version: '' }), 'actor')).rejects.toThrow(/version/);
  });

  it('the real state machine rejects an invalid transition (e.g. draft straight to in_progress)', async () => {
    const clientId = await makeClient('Deployment — Invalid Transition');
    const dep = await deployments.createDeployment(clientId, depInput(), 'actor');
    await expect(deployments.startExecution(dep.id, clientId, 'actor')).rejects.toThrow(InvalidDeploymentTransitionError);
  });

  it('the readiness gate blocks requestApproval when release readiness is genuinely NOT go, with real named blockers', async () => {
    const clientId = await makeClient('Deployment — Readiness Blocks Approval'); // NOT ready — no lifecycle/validation seeded
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-1');
    await deployments.planDeployment(dep.id, clientId, 'requester-1');
    await deployments.checkReadiness(dep.id, clientId, 'requester-1');
    let caught: ReadinessGateError | null = null;
    try { await deployments.requestApproval(dep.id, clientId, 'requester-1'); } catch (e) { caught = e as ReadinessGateError; }
    expect(caught).toBeInstanceOf(ReadinessGateError);
    expect(caught!.blockers.length).toBeGreaterThan(0);
  });

  it('the real end-to-end happy path: create -> plan -> readiness(go) -> approval -> execution -> real reported deployed outcome', async () => {
    const clientId = await makeReadyClient('Deployment — Happy Path');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-2');
    await deployments.planDeployment(dep.id, clientId, 'requester-2');
    const withReadiness = await deployments.checkReadiness(dep.id, clientId, 'requester-2');
    expect((withReadiness.releaseReadinessSnapshot as any).overall).toBe('go');

    const approvalRequested = await deployments.requestApproval(dep.id, clientId, 'requester-2');
    expect(approvalRequested.status).toBe('approval_pending');
    expect(approvalRequested.approvalWorkflowId).toBeTruthy();

    const approved = await deployments.decideApproval(dep.id, clientId, 'approve', 'approver-1', 'Looks safe.');
    expect(approved.status).toBe('approved');

    const started = await deployments.startExecution(dep.id, clientId, 'operator-1');
    expect(started.status).toBe('in_progress');
    expect(started.actualStart).toBeTruthy();

    const deployed = await deployments.recordDeploymentOutcome(dep.id, clientId, 'deployed', 'Real CI pipeline reported deployment #4821 succeeded, verified via pipeline dashboard.', 'operator-1');
    expect(deployed.status).toBe('deployed');
    expect(deployed.actualCompletion).toBeTruthy();
    expect(deployed.events.length).toBeGreaterThanOrEqual(5); // planned, readiness_pending, approval_pending, approved, in_progress, deployed
  });

  it('recordDeploymentOutcome refuses without real evidence — never a bare status flip, and never fabricates success', async () => {
    const clientId = await makeReadyClient('Deployment — No Evidence');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-3');
    await deployments.planDeployment(dep.id, clientId, 'requester-3');
    await deployments.checkReadiness(dep.id, clientId, 'requester-3');
    await deployments.requestApproval(dep.id, clientId, 'requester-3');
    await deployments.decideApproval(dep.id, clientId, 'approve', 'approver-2');
    await deployments.startExecution(dep.id, clientId, 'requester-3');
    await expect(deployments.recordDeploymentOutcome(dep.id, clientId, 'deployed', '', 'requester-3')).rejects.toThrow(/evidence/i);
  });

  it('a real self-approval attempt is refused — the requester cannot approve their own deployment', async () => {
    const clientId = await makeReadyClient('Deployment — Self Approval');
    const dep = await deployments.createDeployment(clientId, depInput(), 'same-person');
    await deployments.planDeployment(dep.id, clientId, 'same-person');
    await deployments.checkReadiness(dep.id, clientId, 'same-person');
    await deployments.requestApproval(dep.id, clientId, 'same-person');
    await expect(deployments.decideApproval(dep.id, clientId, 'approve', 'same-person', 'note')).rejects.toThrow(SelfApprovalError);
  });

  it('the readiness gate is re-checked fresh at the EXECUTION boundary too, not just at approval — conditions can drift between the two', async () => {
    const clientId = await makeReadyClient('Deployment — Execution Boundary Readiness Drift');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-4');
    await deployments.planDeployment(dep.id, clientId, 'requester-4');
    await deployments.checkReadiness(dep.id, clientId, 'requester-4');
    await deployments.requestApproval(dep.id, clientId, 'requester-4');
    await deployments.decideApproval(dep.id, clientId, 'approve', 'approver-3');
    // Readiness genuinely regresses after approval — revert the real lifecycle stage.
    await sharedPool.query(`UPDATE oc_lifecycle SET status = 'discovery-running' WHERE client_id = $1`, [clientId]);
    let caught: ReadinessGateError | null = null;
    try { await deployments.startExecution(dep.id, clientId, 'operator-2'); } catch (e) { caught = e as ReadinessGateError; }
    expect(caught).toBeInstanceOf(ReadinessGateError);
  });

  it('a rejected approval cancels the deployment with a real, required reason', async () => {
    const clientId = await makeReadyClient('Deployment — Rejected Approval');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-5');
    await deployments.planDeployment(dep.id, clientId, 'requester-5');
    await deployments.checkReadiness(dep.id, clientId, 'requester-5');
    await deployments.requestApproval(dep.id, clientId, 'requester-5');
    await expect(deployments.decideApproval(dep.id, clientId, 'reject', 'approver-4')).rejects.toThrow(/reason/);
    const rejected = await deployments.decideApproval(dep.id, clientId, 'reject', 'approver-4', 'Risk too high for this window.');
    expect(rejected.status).toBe('cancelled');
  });

  it('"request changes" loops the deployment back to planned, allowing a real re-submission', async () => {
    const clientId = await makeReadyClient('Deployment — Request Changes Loop');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-6');
    await deployments.planDeployment(dep.id, clientId, 'requester-6');
    await deployments.checkReadiness(dep.id, clientId, 'requester-6');
    await deployments.requestApproval(dep.id, clientId, 'requester-6');
    const changed = await deployments.decideApproval(dep.id, clientId, 'request_changes', 'approver-5', 'Add a maintenance window first.');
    expect(changed.status).toBe('planned');
    // Real re-submission works from here.
    await deployments.checkReadiness(dep.id, clientId, 'requester-6');
    const reRequested = await deployments.requestApproval(dep.id, clientId, 'requester-6');
    expect(reRequested.status).toBe('approval_pending');
  });

  it('rollback: initiateRollback refuses when no real rollback plan exists — honest ROLLBACK_NOT_AVAILABLE, never a fabricated attempt', async () => {
    const clientId = await makeReadyClient('Deployment — No Rollback Plan');
    const dep = await deployments.createDeployment(clientId, depInput({ rollbackPlan: '' }), 'requester-7');
    await deployments.planDeployment(dep.id, clientId, 'requester-7');
    await deployments.checkReadiness(dep.id, clientId, 'requester-7');
    await deployments.requestApproval(dep.id, clientId, 'requester-7');
    await deployments.decideApproval(dep.id, clientId, 'approve', 'approver-6');
    await deployments.startExecution(dep.id, clientId, 'requester-7');
    const failedDep = await deployments.recordDeploymentOutcome(dep.id, clientId, 'failed', 'Real pipeline reported a failed health check post-push.', 'requester-7');
    expect(failedDep.status).toBe('failed');
    await expect(deployments.initiateRollback(dep.id, clientId, 'operator-3')).rejects.toThrow(RollbackNotAvailableError);
  });

  it('rollback: the real, evidence-enforced rollback flow reaches rolled_back honestly', async () => {
    const clientId = await makeReadyClient('Deployment — Real Rollback');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-8');
    await deployments.planDeployment(dep.id, clientId, 'requester-8');
    await deployments.checkReadiness(dep.id, clientId, 'requester-8');
    await deployments.requestApproval(dep.id, clientId, 'requester-8');
    await deployments.decideApproval(dep.id, clientId, 'approve', 'approver-7');
    await deployments.startExecution(dep.id, clientId, 'requester-8');
    await deployments.recordDeploymentOutcome(dep.id, clientId, 'failed', 'Real pipeline reported a failed smoke test.', 'requester-8');
    const rollbackStarted = await deployments.initiateRollback(dep.id, clientId, 'operator-4');
    expect(rollbackStarted.status).toBe('rollback_pending');
    expect(rollbackStarted.rollbackStatus).toBe('rollback_pending');
    await expect(deployments.recordRollbackOutcome(dep.id, clientId, 'rolled_back', '', 'operator-4')).rejects.toThrow(/evidence/i);
    const rolledBack = await deployments.recordRollbackOutcome(dep.id, clientId, 'rolled_back', 'Real CI rollback job #991 confirmed previous version 1.1.0 redeployed and serving traffic.', 'operator-4');
    expect(rolledBack.status).toBe('rolled_back');
    expect(rolledBack.rollbackStatus).toBe('rolled_back');
  });

  it('cancelDeployment requires a real reason and works from an early state', async () => {
    const clientId = await makeClient('Deployment — Cancel');
    const dep = await deployments.createDeployment(clientId, depInput(), 'requester-9');
    await expect(deployments.cancelDeployment(dep.id, clientId, 'requester-9', '')).rejects.toThrow(/reason/);
    const cancelled = await deployments.cancelDeployment(dep.id, clientId, 'requester-9', 'No longer needed this release.');
    expect(cancelled.status).toBe('cancelled');
  });

  it('deleteDeployment only allows draft/cancelled deployments — never an in-flight or completed one', async () => {
    const clientId = await makeReadyClient('Deployment — Delete Guard');
    const draftDep = await deployments.createDeployment(clientId, depInput(), 'requester-10');
    await deployments.deleteDeployment(draftDep.id, clientId);
    await expect(deployments.getDeployment(draftDep.id, clientId)).rejects.toThrow(DeploymentOwnershipError);

    const activeDep = await deployments.createDeployment(clientId, depInput(), 'requester-11');
    await deployments.planDeployment(activeDep.id, clientId, 'requester-11');
    await expect(deployments.deleteDeployment(activeDep.id, clientId)).rejects.toThrow(DeploymentNotDeletableError);
  });

  it('object-level ownership: Client A cannot read, update, transition, or delete Client B\'s real deployment via the service layer', async () => {
    const a = await makeReadyClient('Deployment Ownership A');
    const b = await makeReadyClient('Deployment Ownership B');
    const depA = await deployments.createDeployment(a, depInput(), 'requester-a');
    await expect(deployments.getDeployment(depA.id, b)).rejects.toThrow(DeploymentOwnershipError);
    await expect(deployments.updateDeployment(depA.id, b, { notes: 'hacked' }, 'attacker')).rejects.toThrow(DeploymentOwnershipError);
    await expect(deployments.planDeployment(depA.id, b, 'attacker')).rejects.toThrow(DeploymentOwnershipError);
    await expect(deployments.deleteDeployment(depA.id, b)).rejects.toThrow(DeploymentOwnershipError);
  });
});

describe('Deployment routes — RBAC + tenant isolation (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/deployments` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role — deployments are staff-only, AskABD-internal) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can create and read a real deployment for a real client -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — Staff Allowed');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${admin}` }, payload: depInput() });
    expect(create.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/deployments/${create.json().id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
  });

  it('4/6. cross-client deployment id (a real deployment id from Client A used under Client B\'s URL) -> DENIED (404, object-level ownership — even for staff)', async () => {
    const app = await buildApp();
    const a = await makeClient('Deployment RBAC — Cross Client A');
    const b = await makeClient('Deployment RBAC — Cross Client B');
    const admin = await adminToken();
    const depA = await deployments.createDeployment(a, depInput(), 'requester-x');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${b}/deployments/${depA.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
  });

  it('5. insufficient role: a customer with a real, mapped identity to a DIFFERENT concern still cannot reach any staff deployment route (no portal path exists for deployments at all)', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — No Portal Path');
    const token = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${token}` }, payload: depInput() });
    expect(res.statusCode).toBe(403);
  });

  it('7. malformed deployment id is a safe 404, never a 500 crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/deployments/${encodeURIComponent("not-real; DROP TABLE oc_deployments;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('readiness bypass attempt at the HTTP layer returns a real 409 with named blockers, never a fabricated success', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — Readiness Bypass HTTP'); // not ready
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${admin}` }, payload: depInput() });
    const id = create.json().id;
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/plan`, headers: { authorization: `Bearer ${admin}` } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/check-readiness`, headers: { authorization: `Bearer ${admin}` } });
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/request-approval`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('readiness_not_met');
    expect(res.json().error.blockers.length).toBeGreaterThan(0);
  });

  it('approval bypass attempt (calling start-execution without ever being approved) returns a real 409, never a fabricated success', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Deployment RBAC — Approval Bypass HTTP');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${admin}` }, payload: depInput() });
    const id = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/start-execution`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('invalid_transition');
  });

  it('self-approval at the HTTP layer returns a real 403', async () => {
    const app = await buildApp();
    const clientId = await makeReadyClient('Deployment RBAC — Self Approval HTTP');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${admin}` }, payload: depInput() });
    const id = create.json().id;
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/plan`, headers: { authorization: `Bearer ${admin}` } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/check-readiness`, headers: { authorization: `Bearer ${admin}` } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/request-approval`, headers: { authorization: `Bearer ${admin}` } });
    // admin-1 is BOTH the requester (createDeployment's actor comes from the auth token) and the approver here.
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments/${id}/approval/approve`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('self_approval_forbidden');
  });

  it('an empty-body POST to every deployment decision/outcome route is a safe 4xx, never an unhandled crash (mechanical audit of RISK-009 applied to this new route file too)', async () => {
    const app = await buildApp();
    const clientId = await makeReadyClient('Deployment RBAC — Empty Body Audit');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/deployments`, headers: { authorization: `Bearer ${admin}` }, payload: depInput() });
    const id = create.json().id;
    const routes = [
      ['POST', `/api/v1/oc/clients/${clientId}/deployments/${id}/outcome`],
      ['POST', `/api/v1/oc/clients/${clientId}/deployments/${id}/rollback/outcome`],
      ['POST', `/api/v1/oc/clients/${clientId}/deployments/${id}/approval/approve`],
      ['POST', `/api/v1/oc/clients/${clientId}/deployments/${id}/cancel`],
      ['POST', `/api/v1/oc/clients/${clientId}/deployments/${id}/compare`],
      ['PATCH', `/api/v1/oc/clients/${clientId}/deployments/${id}`],
    ] as const;
    for (const [method, url] of routes) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${admin}` } });
      expect(res.statusCode).toBeLessThan(500);
    }
  });
});
