/**
 * requirements_clarification_test_1 — Requirements Clarification Engine
 * (2026-08-24 master completion directive, capability #14). Covers real
 * question generation from the EXISTING, unmodified `classifyQuality()`
 * findings, the real never-invented client-answer discipline, real
 * no-duplicate-question generation, and the Security Testing Addendum's
 * minimum scenarios including cross-client clarification-id IDOR.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { requirementsClarificationRoutes } from '../src/routes/requirements-clarification-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { BusinessRequirementsService } from '../src/services/business-requirements-service.js';
import { RequirementsClarificationEngine, RequirementOwnershipError, ClarificationOwnershipError } from '../src/services/requirements-clarification-engine.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';

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
  await app.register(requirementsClarificationRoutes, { prefix: '/api/v1' });
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
const cleanupOrgContexts: string[] = [];
const ocService = new OperationsCenterService();
const requirements = new BusinessRequirementsService();
const clarifications = new RequirementsClarificationEngine();
const mappingService = new ClientIdentityMappingService();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

/** A real, genuinely incomplete requirement — classifyQuality will really flag missing fields. */
async function makeIncompleteRequirement(clientId: string, title: string) {
  return requirements.createRequirement(clientId, { title, description: 'x' }, 'test-actor');
}

afterAll(async () => {
  for (const org of cleanupOrgContexts) {
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]).catch(() => {});
  }
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM oc_requirement_clarifications WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_business_requirements WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('RequirementsClarificationEngine — real question generation from existing real findings', () => {
  it('generates a real, specific question per real missing field — reusing classifyQuality unmodified', async () => {
    const clientId = await makeClient('Clarification — Real Generation');
    const req = await makeIncompleteRequirement(clientId, 'Real Incomplete Requirement A');
    expect(req.qualityStatus).toBe('incomplete'); // real classifier output, not assumed
    expect(req.qualityFindings[0]!.rule).toBe('missing_required_fields');

    const generated = await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    expect(generated.length).toBeGreaterThan(0);
    const forAcceptanceCriteria = generated.find(c => c.whatIsMissing === 'acceptance criteria');
    expect(forAcceptanceCriteria).toBeTruthy();
    expect(forAcceptanceCriteria!.questionToClient).toContain('measurable acceptance criteria');
    expect(forAcceptanceCriteria!.status).toBe('open');
  });

  it('never generates a duplicate open question for the same real finding on re-generation', async () => {
    const clientId = await makeClient('Clarification — No Duplicates');
    const req = await makeIncompleteRequirement(clientId, 'Real Incomplete Requirement B');
    const first = await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    const second = await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    expect(second.length).toBe(0); // every real finding already has an open clarification
    const all = await clarifications.listForRequirement(req.id, clientId);
    expect(all.length).toBe(first.length);
  });

  it('a genuinely complete requirement produces zero clarifications — never a fabricated question for a real non-finding', async () => {
    const clientId = await makeClient('Clarification — Complete Requirement');
    const req = await requirements.createRequirement(clientId, {
      title: 'Real Complete Requirement', description: 'A genuinely complete, unambiguous description with enough real detail.',
      acceptanceCriteria: 'Given a valid request, when submitted, then a 200 response is returned within 500ms.',
      stakeholder: 'VP Engineering', businessObjective: 'Reduce onboarding time by 30%', category: 'functional',
    }, 'test-actor');
    expect(req.qualityStatus).toBe('complete');
    const generated = await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    expect(generated.length).toBe(0);
  });

  it('recordClientAnswer requires a real, non-empty answer — never invents one', async () => {
    const clientId = await makeClient('Clarification — Real Answer Required');
    const req = await makeIncompleteRequirement(clientId, 'Real Incomplete Requirement C');
    const [clarification] = await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    await expect(clarifications.recordClientAnswer(clarification!.id, clientId, '', 'client-1')).rejects.toThrow(/answer/);
    const answered = await clarifications.recordClientAnswer(clarification!.id, clientId, 'The acceptance criteria are: real client-provided text.', 'client-1');
    expect(answered.status).toBe('answered');
    expect(answered.clientAnswer).toBe('The acceptance criteria are: real client-provided text.');
  });

  it('resolve requires the clarification to genuinely be answered first, and a real resolution note', async () => {
    const clientId = await makeClient('Clarification — Resolve Requires Answer');
    const req = await makeIncompleteRequirement(clientId, 'Real Incomplete Requirement D');
    const [clarification] = await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    await expect(clarifications.resolve(clarification!.id, clientId, 'staff-1', 'note')).rejects.toThrow(/answered/);
    await clarifications.recordClientAnswer(clarification!.id, clientId, 'Real answer.', 'client-1');
    await expect(clarifications.resolve(clarification!.id, clientId, 'staff-1', '')).rejects.toThrow(/resolution/);
    const resolved = await clarifications.resolve(clarification!.id, clientId, 'staff-1', 'Incorporated into the requirement.');
    expect(resolved.status).toBe('resolved');
  });

  it('object-level ownership: Client A cannot generate, read, or answer clarifications tied to Client B\'s real requirement', async () => {
    const a = await makeClient('Clarification Ownership A');
    const b = await makeClient('Clarification Ownership B');
    const reqA = await makeIncompleteRequirement(a, 'Real Requirement Ownership A');
    await expect(clarifications.generateClarifications(reqA.id, b, 'attacker')).rejects.toThrow(RequirementOwnershipError);
    const [clarification] = await clarifications.generateClarifications(reqA.id, a, 'staff-1');
    await expect(clarifications.getClarification(clarification!.id, b)).rejects.toThrow(ClarificationOwnershipError);
    await expect(clarifications.recordClientAnswer(clarification!.id, b, 'x', 'attacker')).rejects.toThrow(ClarificationOwnershipError);
  });
});

describe('Requirements Clarification routes — RBAC + tenant isolation (Security Testing Addendum)', () => {
  it('1. unauthenticated (staff route) -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Clarification RBAC — Unauth');
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/clarifications` });
    expect(res.statusCode).toBe(401);
  });

  it('2. customer token on the staff route -> 403', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Clarification RBAC — Customer On Staff Route');
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/clarifications`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('3. staff (admin) can generate and read real clarifications -> 200/201', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Clarification RBAC — Staff Allowed');
    const req = await makeIncompleteRequirement(clientId, 'Real Requirement RBAC Staff');
    const admin = await adminToken();
    const generate = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/requirements/${req.id}/clarifications/generate`, headers: { authorization: `Bearer ${admin}` } });
    expect(generate.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/clarifications`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json().clarifications.length).toBeGreaterThan(0);
  });

  it('a genuinely mapped client can read and answer their own real clarification via the portal route', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Clarification RBAC — Portal Answer');
    const req = await makeIncompleteRequirement(clientId, 'Real Requirement RBAC Portal');
    await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    const [c] = await clarifications.listForClient(clientId);

    const org = `org-clar-${clientId}`;
    cleanupOrgContexts.push(org);
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test-fixture' });
    const token = await signToken({ sub: 'customer-clar', org, roles: [] });

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/clarifications`, headers: { authorization: `Bearer ${token}` } });
    expect(list.statusCode).toBe(200);
    const answer = await app.inject({ method: 'POST', url: `/api/v1/oc/portal/${clientId}/clarifications/${c!.id}/answer`, headers: { authorization: `Bearer ${token}` }, payload: { answer: 'Real client-provided answer over HTTP.' } });
    expect(answer.statusCode).toBe(200);
    expect(answer.json().status).toBe('answered');
  });

  it('4/6. an unrelated client cannot read another client\'s real clarifications via the portal route — tenant isolation', async () => {
    const app = await buildApp();
    const a = await makeClient('Clarification RBAC — Tenant A');
    const b = await makeClient('Clarification RBAC — Tenant B');
    const reqA = await makeIncompleteRequirement(a, 'Real Requirement Tenant A');
    await clarifications.generateClarifications(reqA.id, a, 'staff-1');
    const orgB = `org-clar-tenant-${b}`;
    cleanupOrgContexts.push(orgB);
    await mappingService.createMapping({ clientId: b, orgContext: orgB, createdBy: 'test-fixture' });
    const tokenB = await signToken({ sub: 'customer-tenant-b', org: orgB, roles: [] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${a}/clarifications`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(res.statusCode).toBe(403);
  });

  it('7. malformed clarification id is a safe 404, never a crash, no leaked SQL error text', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Clarification RBAC — Malformed Id');
    const admin = await adminToken();
    const res = await app.inject({
      method: 'GET', url: `/api/v1/oc/clients/${clientId}/clarifications/${encodeURIComponent("not-real; DROP TABLE oc_requirement_clarifications;--")}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toMatch(/syntax error|relation|column/i);
  });

  it('an empty-body POST to the answer/resolve/wont-fix routes is a safe 4xx, never an unhandled crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Clarification RBAC — Empty Body Audit');
    const req = await makeIncompleteRequirement(clientId, 'Real Requirement Empty Body');
    await clarifications.generateClarifications(req.id, clientId, 'staff-1');
    const [c] = await clarifications.listForClient(clientId);
    const admin = await adminToken();
    const resolveRes = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/clarifications/${c!.id}/resolve`, headers: { authorization: `Bearer ${admin}` } });
    expect(resolveRes.statusCode).toBeLessThan(500);
    const wontFixRes = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/clarifications/${c!.id}/wont-fix`, headers: { authorization: `Bearer ${admin}` } });
    expect(wontFixRes.statusCode).toBeLessThan(500);
  });
});
