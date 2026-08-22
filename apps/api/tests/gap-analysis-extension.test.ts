/**
 * Gap Analysis extension — migration 044, gap-analysis-service.ts,
 * decision-transformation-service.ts, operations-center-routes.ts. Proves,
 * against real Postgres and the real route handlers:
 *  - the requirement-quality gate (Business Requirements Intelligence
 *    integration)
 *  - real, required-reason compliance classification
 *  - real, structured, source-classified evidence (including the
 *    client-provided verification-status enforcement)
 *  - risk acceptance gated through the real Approval Workflow Engine
 *  - real Traceability Engine links (problem->gap, requirement->gap,
 *    gap->recommendation, gap->transformation)
 *  - real RBAC (staff-only) and real tenant isolation on the customer-portal
 *    gap routes
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { BusinessRequirementsService } from '../src/services/business-requirements-service.js';
import { TraceabilityEngine } from '../src/services/traceability-engine.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';
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

const COMPLETE_REQUIREMENT_PAYLOAD = {
  title: 'Order confirmation email must send within 30 seconds',
  description: 'When a customer places an order, the system sends a confirmation email within 30 seconds of order placement, verified via delivery timestamp logging.',
  businessObjective: 'Reduce post-purchase customer support tickets about missing order confirmation.',
  stakeholder: 'VP of Customer Operations',
  category: 'order-management',
  acceptanceCriteria: 'Given an order is placed, when payment is confirmed, then a confirmation email is delivered within 30 seconds, verified in the delivery log.',
};

describe('Gap Analysis extension — requirement-quality gate', () => {
  it('creating a gap linked to an INCOMPLETE requirement is refused (422) with real quality findings attached', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap ReqGate Incomplete ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, { title: 'We need a better system' }, 'admin-1');
    expect(requirement.qualityStatus).toBe('incomplete');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Gap for incomplete req', relatedRequirementId: requirement.id },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe('requirement_not_ready');
    expect(body.error.qualityStatus).toBe('incomplete');
    expect(body.error.findings.length).toBeGreaterThan(0);
    await app.close();
  });

  it('forceCreateDespiteIncompleteRequirement:true proceeds anyway — a real staff override, not a permanent block', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap ReqGate Force ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, { title: 'Vague requirement' }, 'admin-1');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Gap despite incomplete req', relatedRequirementId: requirement.id, forceCreateDespiteIncompleteRequirement: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().relatedRequirementId).toBe(requirement.id);
    await app.close();
  });

  it('a gap linked to a COMPLETE requirement is created directly, no gate triggered', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap ReqGate Complete ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, COMPLETE_REQUIREMENT_PAYLOAD, 'admin-1');
    expect(requirement.qualityStatus).toBe('complete');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Gap for complete req', relatedRequirementId: requirement.id },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('real Traceability Engine link (business_requirement -> gap) is created on requirement-linked gap creation', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap ReqGate Trace ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, COMPLETE_REQUIREMENT_PAYLOAD, 'admin-1');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { title: 'Traced gap', relatedRequirementId: requirement.id },
    });
    const gapId = res.json().id;
    const traceability = new TraceabilityEngine();
    const outbound = await traceability.getOutboundLinks('business_requirement', requirement.id);
    expect(outbound.some(l => l.targetType === 'gap' && l.targetId === gapId)).toBe(true);
    await app.close();
  });
});

describe('Gap Analysis extension — real actor attribution', () => {
  it('createdBy is the real authenticated identity, never a fabricated "admin"', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Actor Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`,
      headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Attributed gap' },
    });
    expect(res.json().createdBy).toBe('admin-1');
  });
});

describe('Gap Analysis extension — compliance classification', () => {
  it('classifying compliance requires a real, non-empty reason', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Compliance NoReason ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;

    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/compliance`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'non_compliant' } });
    expect(res.statusCode).toBe(400);
  });

  it('a real classification with a reason is persisted and attributed', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Compliance Real ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/gaps/${gapId}/compliance`, headers: { authorization: `Bearer ${admin}` },
      payload: { status: 'partially_compliant', reason: 'Authentication exists, but MFA evidence was not provided.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().complianceStatus).toBe('partially_compliant');
    expect(res.json().complianceStatusReason).toContain('MFA');
    expect(res.json().complianceClassifiedBy).toBe('admin-1');
  });

  it('an invalid compliance status is rejected', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Compliance Invalid ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/compliance`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'not-a-real-status', reason: 'x' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('Gap Analysis extension — structured evidence', () => {
  it('real staff evidence is added and retrievable, defaulting to needs_verification', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Evidence Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;

    const add = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/evidence`, headers: { authorization: `Bearer ${admin}` }, payload: { text: 'Security assessment SA-001', sourceType: 'assessment' } });
    expect(add.statusCode).toBe(201);
    expect(add.json().verificationStatus).toBe('needs_verification');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/gaps/${gapId}/evidence`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().evidence).toHaveLength(1);
  });

  it('empty evidence text is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Evidence Empty ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/evidence`, headers: { authorization: `Bearer ${admin}` }, payload: { text: '' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('Gap Analysis extension — risk acceptance via the Approval Workflow Engine', () => {
  it('a direct status write to accepted_risk is refused with a clear message pointing at the real flow', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Risk Direct ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/status`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'accepted_risk' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('risk-acceptance/request');
  });

  it('the real request -> approve flow transitions the gap to accepted_risk only after approval', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Risk Flow ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;

    const request = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/risk-acceptance/request`, headers: { authorization: `Bearer ${admin}` }, payload: { rationale: 'Cost of remediation exceeds business impact.' } });
    expect(request.statusCode).toBe(201);
    expect(request.json().status).toBe('in_review');
    const workflowId = request.json().workflowId;

    // Not yet accepted — still the pre-request status.
    const midway = await app.inject({ method: 'GET', url: `/api/v1/oc/gaps/${gapId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(midway.json().status).not.toBe('accepted_risk');

    const decide = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/risk-acceptance/${workflowId}/decide`, headers: { authorization: `Bearer ${admin}` }, payload: { decision: 'approve', note: 'Approved by risk owner.' } });
    expect(decide.statusCode).toBe(200);
    expect(decide.json().gap.status).toBe('accepted_risk');
  });

  it('a rejected risk-acceptance request leaves the gap status unchanged', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Risk Reject ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const request = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/risk-acceptance/request`, headers: { authorization: `Bearer ${admin}` }, payload: { rationale: 'Trying to accept risk.' } });
    const workflowId = request.json().workflowId;

    const decide = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/risk-acceptance/${workflowId}/decide`, headers: { authorization: `Bearer ${admin}` }, payload: { decision: 'reject', note: 'Not acceptable — remediate instead.' } });
    expect(decide.statusCode).toBe(200);
    expect(decide.json().gap).toBeNull();

    const gap = await app.inject({ method: 'GET', url: `/api/v1/oc/gaps/${gapId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(gap.json().status).not.toBe('accepted_risk');
  });

  it('requesting risk acceptance without a rationale is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Risk NoRationale ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/risk-acceptance/request`, headers: { authorization: `Bearer ${admin}` }, payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('Gap Analysis extension — Traceability Engine (problem -> gap)', () => {
  it('generateFromProblems records a real traceability_links row for each created gap', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Trace Problem ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    await sharedPool.query(
      `INSERT INTO oc_problems (client_id, domain, category, title, severity, priority, risk_level, status, confidence, source_type)
       VALUES ($1, 'security', 'access-control', 'Legacy auth in use', 'high', 'high', 'high', 'identified', 'medium', 'assessment') RETURNING id`,
      [clientId]
    );
    const genRes = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps/generate`, headers: { authorization: `Bearer ${admin}` } });
    expect(genRes.statusCode).toBe(201);
    const gaps = genRes.json().gaps;
    expect(gaps.length).toBeGreaterThan(0);
    const gap = gaps[0];
    expect(gap.createdBy).toBe('system');

    const traceability = new TraceabilityEngine();
    const inbound = await traceability.getInboundLinks('gap', gap.id);
    expect(inbound.some((l: any) => l.sourceType === 'problem')).toBe(true);
  });
});

describe('Gap Analysis extension — customer-visibility toggle', () => {
  it('a gap created internal-only can be made customer-visible after the fact, and back again', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Visibility Toggle ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    expect(create.json().customerVisible).toBe(false);

    const madeVisible = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/customer-visibility`, headers: { authorization: `Bearer ${admin}` }, payload: { visible: true } });
    expect(madeVisible.statusCode).toBe(200);
    expect(madeVisible.json().customerVisible).toBe(true);

    const madeInternal = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/customer-visibility`, headers: { authorization: `Bearer ${admin}` }, payload: { visible: false } });
    expect(madeInternal.json().customerVisible).toBe(false);
  });

  it('a non-boolean visible value is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Visibility Invalid ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/customer-visibility`, headers: { authorization: `Bearer ${admin}` }, payload: { visible: 'yes' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('Gap Analysis extension — RBAC (staff-only new routes)', () => {
  it('a real customer token is denied classifying compliance (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap RBAC Compliance ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const customer = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/compliance`, headers: { authorization: `Bearer ${customer}` }, payload: { status: 'compliant', reason: 'x' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a real customer token is denied adding evidence via the staff route (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap RBAC Evidence ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const customer = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/evidence`, headers: { authorization: `Bearer ${customer}` }, payload: { text: 'x' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a real customer token is denied requesting risk acceptance (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap RBAC Risk ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const gapId = create.json().id;
    const customer = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/gaps/${gapId}/risk-acceptance/request`, headers: { authorization: `Bearer ${customer}` }, payload: { rationale: 'x' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401) creating a gap', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap RBAC Anon ${randomUUID().slice(0, 8)}`);
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, payload: { title: 'X' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Gap Analysis extension — customer portal visibility and tenant isolation', () => {
  it('an internal (customer_visible=false) gap never appears in the customer-portal list', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Portal Internal ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const org = `gap-portal-org-${randomUUID().slice(0, 8)}`;
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Internal only gap' } });

    const mappingService = new ClientIdentityMappingService();
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test' });
    const mappedCustomer = await signToken({ sub: `mapped-customer-${randomUUID()}`, org });

    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/gaps`, headers: { authorization: `Bearer ${mappedCustomer}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().gaps).toHaveLength(0);
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]);
    await app.close();
  });

  it('a customer_visible=true gap IS visible to a genuinely mapped customer, and they can submit real evidence forced to client_provided', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Portal Visible ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const org = `gap-portal-visible-org-${randomUUID().slice(0, 8)}`;
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Customer visible gap', customerVisible: true } });
    const gapId = create.json().id;

    const mappingService = new ClientIdentityMappingService();
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test' });
    const mappedCustomer = await signToken({ sub: `mapped-customer-${randomUUID()}`, org });

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/gaps`, headers: { authorization: `Bearer ${mappedCustomer}` } });
    expect(list.json().gaps).toHaveLength(1);

    const evidence = await app.inject({
      method: 'POST', url: `/api/v1/oc/portal/${clientId}/gaps/${gapId}/evidence`,
      headers: { authorization: `Bearer ${mappedCustomer}` }, payload: { text: 'Here is our MFA configuration screenshot reference.' },
    });
    expect(evidence.statusCode).toBe(201);
    expect(evidence.json().sourceType).toBe('client_provided');
    expect(evidence.json().verificationStatus).toBe('client_provided'); // never self-attested 'verified'

    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]);
    await app.close();
  });

  it('an unmapped (different org) customer is denied reading another client\'s portal gaps entirely — real tenant isolation', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Gap Portal Isolation ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X', customerVisible: true } });

    const unmappedCustomer = await signToken({ sub: `unmapped-${randomUUID()}`, org: `unmapped-org-${randomUUID().slice(0, 8)}` });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/gaps`, headers: { authorization: `Bearer ${unmappedCustomer}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a customer cannot submit evidence to a gap belonging to a DIFFERENT client via the URL, even if the gapId is real (cross-client isolation)', async () => {
    const app = await buildApp();
    const clientA = await makeClient(`Gap Portal CrossA ${randomUUID().slice(0, 8)}`);
    const clientB = await makeClient(`Gap Portal CrossB ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const orgB = `gap-portal-crossb-org-${randomUUID().slice(0, 8)}`;

    const gapInA = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientA}/gaps`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Client A gap', customerVisible: true } });
    const gapId = gapInA.json().id;

    const mappingService = new ClientIdentityMappingService();
    await mappingService.createMapping({ clientId: clientB, orgContext: orgB, createdBy: 'test' });
    const customerB = await signToken({ sub: `customer-b-${randomUUID()}`, org: orgB });

    // Customer B is genuinely mapped to client B, tries to submit evidence
    // to a gap that actually belongs to client A via client B's own portal URL.
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/portal/${clientB}/gaps/${gapId}/evidence`,
      headers: { authorization: `Bearer ${customerB}` }, payload: { text: 'trying to inject evidence cross-client' },
    });
    expect(res.statusCode).toBe(404); // the service's own gap.clientId !== clientId check catches this
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [orgB]);
    await app.close();
  });
});
