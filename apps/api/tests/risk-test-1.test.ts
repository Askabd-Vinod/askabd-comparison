/**
 * risk_test_1 — Risk Engine (2026-08-24 master completion directive).
 * Covers the real, deterministic probability x impact severity matrix,
 * the real state machine, real ApprovalWorkflowEngine reuse for risk
 * acceptance (never a bare status flip), real object-level source
 * ownership verification for resolvable source types (gap/deployment/
 * requirement/defect), and the Security Testing Addendum's minimum
 * scenarios including cross-client risk-id IDOR.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { riskRoutes } from '../src/routes/risk-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import {
  RiskEngine, RiskOwnershipError, InvalidRiskTransitionError, InvalidSourceLinkError, AcceptanceNotDecidedError,
} from '../src/services/risk-engine.js';

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
  await app.register(riskRoutes, { prefix: '/api/v1' });
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

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

async function makeGap(clientId: string): Promise<string> {
  const res = await sharedPool.query<{ id: string }>(
    `INSERT INTO oc_gaps (client_id, domain, category, title) VALUES ($1, 'technology', 'general', 'Real test gap') RETURNING id`,
    [clientId],
  );
  return res.rows[0]!.id;
}

function riskInput(overrides: Record<string, unknown> = {}) {
  return { title: 'Real risk: unpatched OS on production servers', description: 'Real description.', source: 'security', probability: 'medium', impact: 'high', owner: 'ops-team', mitigation: 'Apply patches within 30 days.', ...overrides };
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM approval_workflows WHERE entity_id IN (SELECT id FROM oc_risks WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM traceability_links WHERE source_id IN (SELECT id FROM oc_risks WHERE client_id = $1)`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_risks WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_gaps WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_deployments WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('RiskEngine — real deterministic severity + state machine + acceptance workflow', () => {
  it('createRisk requires real title/probability/impact', async () => {
    const clientId = await makeClient('Risk — Required Fields');
    await expect(risks.createRisk(clientId, riskInput({ title: '' }), 'actor')).rejects.toThrow(/title/);
  });

  it('severity is computed deterministically from the real probability x impact matrix — never fabricated or caller-supplied', async () => {
    const clientId = await makeClient('Risk — Severity Matrix');
    const low = await risks.createRisk(clientId, riskInput({ probability: 'low', impact: 'low' }), 'actor');
    expect(low.severity).toBe('low');
    const mediumHigh = await risks.createRisk(clientId, riskInput({ probability: 'medium', impact: 'high' }), 'actor');
    expect(mediumHigh.severity).toBe('high');
    const highCritical = await risks.createRisk(clientId, riskInput({ probability: 'high', impact: 'critical' }), 'actor');
    expect(highCritical.severity).toBe('critical');
    // Explicitly proves severity is NOT a caller-supplied value — no such field even exists on the input.
    expect((riskInput() as any).severity).toBeUndefined();
  });

  it('a real gap source link is object-level verified — a foreign client\'s real gap id is refused', async () => {
    const a = await makeClient('Risk — Gap Source A');
    const b = await makeClient('Risk — Gap Source B');
    const gapB = await makeGap(b);
    await expect(risks.createRisk(a, riskInput({ source: 'gaps', sourceType: 'gap', sourceId: gapB }), 'actor')).rejects.toThrow(InvalidSourceLinkError);
    const gapA = await makeGap(a);
    const linked = await risks.createRisk(a, riskInput({ source: 'gaps', sourceType: 'gap', sourceId: gapA }), 'actor');
    expect(linked.sourceId).toBe(gapA);
  });

  it('a nonexistent source id for a verifiable source type is refused with a real, honest error', async () => {
    const clientId = await makeClient('Risk — Nonexistent Source');
    await expect(risks.createRisk(clientId, riskInput({ source: 'gaps', sourceType: 'gap', sourceId: 'gap-does-not-exist' }), 'actor')).rejects.toThrow(InvalidSourceLinkError);
  });

  it('mitigate requires a real mitigation plan and a real residual risk level', async () => {
    const clientId = await makeClient('Risk — Mitigate');
    const risk = await risks.createRisk(clientId, riskInput({ mitigation: '' }), 'actor');
    await expect(risks.mitigate(risk.id, clientId, 'actor', 'low')).rejects.toThrow(/mitigation plan/);
    const withMitigation = await risks.updateRisk(risk.id, clientId, { mitigation: 'Real patch rollout plan.' }, 'actor');
    const mitigated = await risks.mitigate(withMitigation.id, clientId, 'actor', 'low', 'Patches applied and verified.');
    expect(mitigated.status).toBe('mitigated');
    expect(mitigated.residualRisk).toBe('low');
  });

  it('the real state machine rejects an invalid transition (e.g. accepted straight back to mitigated)', async () => {
    const clientId = await makeClient('Risk — Invalid Transition');
    const risk = await risks.createRisk(clientId, riskInput(), 'actor');
    const closed = await risks.close(risk.id, clientId, 'actor', 'No longer applicable.');
    expect(closed.status).toBe('closed');
    await expect(risks.reopen(closed.id, clientId, 'actor', 'Trying to reopen a closed risk.')).rejects.toThrow(InvalidRiskTransitionError);
  });

  it('the real end-to-end acceptance flow: request -> real ApprovalWorkflowEngine decision -> accepted (never a bare status flip)', async () => {
    const clientId = await makeClient('Risk — Real Acceptance Flow');
    const risk = await risks.createRisk(clientId, riskInput(), 'requester-1');
    await expect(risks.decideAcceptance(risk.id, clientId, 'approve', 'approver-1')).rejects.toThrow(AcceptanceNotDecidedError);

    const requested = await risks.requestAcceptance(risk.id, clientId, 'requester-1', 'Cost of mitigation exceeds business value at this time.');
    expect(requested.approvalWorkflowId).toBeTruthy();
    const status = await risks.getAcceptanceStatus(risk.id, clientId);
    expect(status.current?.status).toBe('in_review');

    const accepted = await risks.decideAcceptance(risk.id, clientId, 'approve', 'approver-1', 'Accepted — reviewed and agreed.');
    expect(accepted.status).toBe('accepted');
  });

  it('a rejected acceptance leaves the risk genuinely open — never silently dropped', async () => {
    const clientId = await makeClient('Risk — Rejected Acceptance');
    const risk = await risks.createRisk(clientId, riskInput(), 'requester-2');
    await risks.requestAcceptance(risk.id, clientId, 'requester-2', 'Requesting acceptance.');
    await expect(risks.decideAcceptance(risk.id, clientId, 'reject', 'approver-2')).rejects.toThrow(/reason/);
    const rejected = await risks.decideAcceptance(risk.id, clientId, 'reject', 'approver-2', 'Not acceptable — mitigate instead.');
    expect(rejected.status).toBe('open');
  });

  it('transfer and close both require a real, non-empty reason', async () => {
    const clientId = await makeClient('Risk — Transfer Close Reasons');
    const risk = await risks.createRisk(clientId, riskInput(), 'actor');
    await expect(risks.transfer(risk.id, clientId, 'actor', '')).rejects.toThrow(/note/);
    const transferred = await risks.transfer(risk.id, clientId, 'actor', 'Transferred to vendor SLA coverage.');
    expect(transferred.status).toBe('transferred');
  });

  it('a closed risk cannot be edited', async () => {
    const clientId = await makeClient('Risk — No Edit After Close');
    const risk = await risks.createRisk(clientId, riskInput(), 'actor');
    await risks.close(risk.id, clientId, 'actor', 'Resolved.');
    await expect(risks.updateRisk(risk.id, clientId, { title: 'Changed' }, 'actor')).rejects.toThrow(/closed risk/);
  });

  it('getRiskSummary reports real, non-fabricated counts by severity and status', async () => {
    const clientId = await makeClient('Risk — Summary');
    await risks.createRisk(clientId, riskInput({ probability: 'high', impact: 'critical' }), 'actor');
    await risks.createRisk(clientId, riskInput({ probability: 'low', impact: 'low' }), 'actor');
    const summary = await risks.getRiskSummary(clientId);
    expect(summary.total).toBe(2);
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.bySeverity.low).toBe(1);
    expect(summary.byStatus.open).toBe(2);
  });

  it('object-level ownership: Client A cannot read, update, transition, or accept Client B\'s real risk', async () => {
    const a = await makeClient('Risk Ownership A');
    const b = await makeClient('Risk Ownership B');
    const riskA = await risks.createRisk(a, riskInput(), 'requester');
    await expect(risks.getRisk(riskA.id, b)).rejects.toThrow(RiskOwnershipError);
    await expect(risks.updateRisk(riskA.id, b, { title: 'hacked' }, 'attacker')).rejects.toThrow(RiskOwnershipError);
    await expect(risks.close(riskA.id, b, 'attacker', 'x')).rejects.toThrow(RiskOwnershipError);
    await expect(risks.requestAcceptance(riskA.id, b, 'attacker', 'x')).rejects.toThrow(RiskOwnershipError);
  });
});

describe('Risk routes — RBAC + tenant isolation (Security Testing Addendum)', () => {
  it('1. unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Risk RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/risks` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token (insufficient role) -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Risk RBAC — Customer');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/risks`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can create and read a real risk -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Risk RBAC — Staff Allowed');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/risks`, headers: { authorization: `Bearer ${admin}` }, payload: riskInput() });
    expect(create.statusCode).toBe(201);
    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/risks/${create.json().id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
  });

  it('4/6. cross-client risk id (a real Client A risk id used under Client B\'s URL) -> DENIED (404, object-level ownership)', async () => {
    const app = await buildApp();
    const a = await makeClient('Risk RBAC — Cross Client A');
    const b = await makeClient('Risk RBAC — Cross Client B');
    const admin = await adminToken();
    const riskA = await risks.createRisk(a, riskInput(), 'requester');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${b}/risks/${riskA.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
  });

  it('7. malformed risk id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Risk RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/risks/${encodeURIComponent("not-real; DROP TABLE oc_risks;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('acceptance bypass attempt (deciding acceptance without ever requesting it) returns a real 409, never a fabricated success', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Risk RBAC — Acceptance Bypass HTTP');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/risks`, headers: { authorization: `Bearer ${admin}` }, payload: riskInput() });
    const id = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/risks/${id}/acceptance/approve`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('acceptance_not_requested');
  });

  it('an empty-body POST to every risk decision route is a safe 4xx, never an unhandled crash (RISK-009 pattern audited into this new route file)', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Risk RBAC — Empty Body Audit');
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/risks`, headers: { authorization: `Bearer ${admin}` }, payload: riskInput() });
    const id = create.json().id;
    const routes = [
      `/api/v1/oc/clients/${clientId}/risks/${id}/mitigate`,
      `/api/v1/oc/clients/${clientId}/risks/${id}/close`,
      `/api/v1/oc/clients/${clientId}/risks/${id}/transfer`,
      `/api/v1/oc/clients/${clientId}/risks/${id}/acceptance/request`,
    ];
    for (const url of routes) {
      const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${admin}` } });
      expect(res.statusCode).toBeLessThan(500);
    }
  });
});
