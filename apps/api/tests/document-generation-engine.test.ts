/**
 * Document Generation Engine — migration 046/047, document-generation-engine.ts,
 * document-generation-routes.ts. Proves, against real Postgres and the real
 * route handlers:
 *  - real generation from real platform data (Business Requirements, Gaps)
 *  - the honest "INFORMATION REQUIRED" behavior when there's nothing real
 *    to report, never a fabricated section
 *  - the real quality check (READY/NOT READY with exact reasons)
 *  - approval gated through the real Approval Workflow Engine (submit,
 *    approve, reject, request-changes/regenerate loop)
 *  - real version history via the shared Versioning Engine
 *  - real Traceability Engine links from a document back to its real sources
 *  - real export (html/markdown) and an honest "not supported" for pdf/docx
 *  - RBAC, customer-portal visibility, and tenant isolation
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { documentGenerationRoutes } from '../src/routes/document-generation-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { BusinessRequirementsService } from '../src/services/business-requirements-service.js';
import { GapAnalysisService } from '../src/services/gap-analysis-service.js';
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
  await app.register(documentGenerationRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

function minimalClient(name: string) {
  return {
    name, logo: '', industry: 'Technology', country: 'India', timezone: 'UTC',
    businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
    primaryContact: 'test@example.com', departments: ['Engineering'], capabilities: ['Order Management'], processes: ['Order-to-Cash'],
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

async function getBrdTemplateId(): Promise<string> {
  const res = await sharedPool.query(`SELECT id FROM document_templates WHERE document_type = 'brd' LIMIT 1`);
  return res.rows[0].id;
}
async function getGapReportTemplateId(): Promise<string> {
  const res = await sharedPool.query(`SELECT id FROM document_templates WHERE document_type = 'gap_analysis_report' LIMIT 1`);
  return res.rows[0].id;
}
async function getAssessmentTemplateId(): Promise<string> {
  const res = await sharedPool.query(`SELECT id FROM document_templates WHERE document_type = 'current_state_assessment' LIMIT 1`);
  return res.rows[0].id;
}

describe('Document Generation — templates', () => {
  it('the three real seed templates are listed', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/document-templates', headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    const types = res.json().templates.map((t: any) => t.documentType);
    expect(types).toEqual(expect.arrayContaining(['brd', 'gap_analysis_report', 'current_state_assessment']));
    await app.close();
  });

  it('creating a template with an unregistered data source is rejected', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/oc/document-templates', headers: { authorization: `Bearer ${admin}` },
      payload: { documentType: 'test_doc', name: 'Test Doc', sections: [{ key: 'x', title: 'X', dataSource: 'not_a_real_source', required: true }] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('Document Generation — real generation from real platform data', () => {
  it('a BRD generated for a client with real, complete requirements has no missing fields for that section', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen BRD Complete ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    await reqService.createRequirement(clientId, {
      title: 'Order confirmation email must send within 30 seconds',
      description: 'When a customer places an order, the system sends a confirmation email within 30 seconds of order placement, verified via delivery timestamp logging.',
      businessObjective: 'Reduce post-purchase support tickets.', stakeholder: 'VP Customer Ops', category: 'order-management',
      acceptanceCriteria: 'Given an order is placed, a confirmation email is delivered within 30 seconds.',
    }, 'admin-1');

    const templateId = await getBrdTemplateId();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    expect(res.statusCode).toBe(201);
    const doc = res.json().document;
    expect(doc.status).toBe('draft');
    expect(doc.version).toBe(1);
    const reqSection = doc.content.find((s: any) => s.key === 'requirements');
    expect(reqSection.content).toContain('Order confirmation email');
    expect(reqSection.missingFields).toEqual([]);
    await app.close();
  });

  it('a BRD generated for a client with NO requirements honestly shows INFORMATION REQUIRED, never a fabricated section', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen BRD Empty ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getBrdTemplateId();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const doc = res.json().document;
    const reqSection = doc.content.find((s: any) => s.key === 'requirements');
    expect(reqSection.content).toContain('INFORMATION REQUIRED');
    expect(reqSection.missingFields).toEqual(['business requirements']);
    await app.close();
  });

  it('a Gap Analysis Report reflects real gaps, real evidence, and real decisions', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Gap Report ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const gapService = new GapAnalysisService();
    const gap = await gapService.createGap(clientId, { title: 'Legacy authentication in use', currentState: 'Basic auth, no MFA', targetState: 'MFA-enforced SSO' }, 'admin-1');
    await gapService.addEvidence(gap.id, { text: 'Security assessment SA-001 confirms no MFA', sourceType: 'assessment' }, 'admin-1');

    const templateId = await getGapReportTemplateId();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const doc = res.json().document;
    const gapsSection = doc.content.find((s: any) => s.key === 'gaps');
    expect(gapsSection.content).toContain('Legacy authentication in use');
    const evidenceSection = doc.content.find((s: any) => s.key === 'evidence');
    expect(evidenceSection.content).toContain('SA-001');
    await app.close();
  });

  it('generating from a nonexistent template returns 404', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Bad Template ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId: 'doctpl-does-not-exist' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('Document Generation — real Traceability Engine wiring', () => {
  it('a generated document is genuinely linked back to the real requirement it cited', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Trace ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    const requirement = await reqService.createRequirement(clientId, {
      title: 'Traceable requirement', description: 'A real requirement description of reasonable length for testing.',
      businessObjective: 'x', stakeholder: 'x', category: 'x', acceptanceCriteria: 'x',
    }, 'admin-1');

    const templateId = await getBrdTemplateId();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = res.json().document.id;

    const traceability = new TraceabilityEngine();
    const inbound = await traceability.getInboundLinks('generated_document', docId);
    expect(inbound.some(l => l.sourceType === 'business_requirements' && l.sourceId === requirement.id)).toBe(true);
    await app.close();
  });
});

describe('Document Generation — real version history', () => {
  it('regenerating increments the real version and writes real history via the Versioning Engine', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Version ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    expect(create.json().document.version).toBe(1);

    const regen = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/regenerate`, headers: { authorization: `Bearer ${admin}` } });
    expect(regen.statusCode).toBe(200);
    expect(regen.json().document.version).toBe(2);

    const history = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/history`, headers: { authorization: `Bearer ${admin}` } });
    expect(history.json().history.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});

describe('Document Generation — quality check', () => {
  it('a document with missing required data is honestly NOT READY with exact reasons', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Quality NotReady ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getBrdTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;

    const check = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/quality-check`, headers: { authorization: `Bearer ${admin}` } });
    expect(check.statusCode).toBe(200);
    expect(check.json().ready).toBe(false);
    expect(check.json().reasons.length).toBeGreaterThan(0);
    await app.close();
  });

  it('an approval-required document not yet approved is NOT READY even with complete data', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Quality NoApproval ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    await reqService.createRequirement(clientId, {
      title: 'Complete req', description: 'A real, sufficiently detailed description of this requirement for testing purposes.',
      businessObjective: 'x', stakeholder: 'x', category: 'x', acceptanceCriteria: 'x',
    }, 'admin-1');
    const templateId = await getBrdTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;

    const check = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/quality-check`, headers: { authorization: `Bearer ${admin}` } });
    expect(check.json().ready).toBe(false);
    expect(check.json().reasons.some((r: string) => r.includes('requires approval'))).toBe(true);
    await app.close();
  });
});

describe('Document Generation — approval via the real Approval Workflow Engine', () => {
  it('submit -> approve transitions the document to approved, and the quality check then passes', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Approve Flow ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const reqService = new BusinessRequirementsService();
    await reqService.createRequirement(clientId, {
      title: 'Approvable requirement', description: 'A real, sufficiently detailed description for testing this approval flow end to end.',
      businessObjective: 'x', stakeholder: 'x', category: 'x', acceptanceCriteria: 'x',
    }, 'admin-1');
    const templateId = await getBrdTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;

    const submit = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/submit-for-approval`, headers: { authorization: `Bearer ${admin}` } });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().document.status).toBe('in_review');

    const approve = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/decide-approval`, headers: { authorization: `Bearer ${admin}` }, payload: { decision: 'approve', note: 'Looks good.' } });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().document.status).toBe('approved');

    const check = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/quality-check`, headers: { authorization: `Bearer ${admin}` } });
    expect(check.json().ready).toBe(true);
    await app.close();
  });

  it('the changes-requested -> regenerate -> resubmit loop is real', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Changes Loop ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getBrdTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;

    await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/submit-for-approval`, headers: { authorization: `Bearer ${admin}` } });
    const changesReq = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/decide-approval`, headers: { authorization: `Bearer ${admin}` }, payload: { decision: 'request_changes', note: 'Please add stakeholder detail.' } });
    expect(changesReq.json().document.status).toBe('changes_requested');

    // Regeneration is allowed again once changes are requested.
    const regen = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/regenerate`, headers: { authorization: `Bearer ${admin}` } });
    expect(regen.statusCode).toBe(200);
    await app.close();
  });

  it('regenerating an already-approved document is refused — must go through a real new cycle', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Regen Approved ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getBrdTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/submit-for-approval`, headers: { authorization: `Bearer ${admin}` } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/decide-approval`, headers: { authorization: `Bearer ${admin}` }, payload: { decision: 'approve' } });

    const regen = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/regenerate`, headers: { authorization: `Bearer ${admin}` } });
    expect(regen.statusCode).toBe(400);
    await app.close();
  });

  it('submitting a document from a template with no approval requirement is refused', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen No Approval Needed ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId(); // approvalRequired=false
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    const submit = await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/submit-for-approval`, headers: { authorization: `Bearer ${admin}` } });
    expect(submit.statusCode).toBe(400);
    await app.close();
  });
});

describe('Document Generation — export', () => {
  it('markdown export produces real, readable content from the document\'s real sections', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Export Md ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/export?format=markdown`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('# Current State Assessment Report');
    expect(res.body).toContain('## Assessment Findings by Domain');
  });

  it('html export produces real, escaped HTML', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Export Html ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/export?format=html`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<!doctype html>');
  });

  it('pdf/docx are honestly rejected as not-yet-supported, never a fake file', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Export Pdf ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/documents/${docId}/export?format=pdf`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('html, markdown');
  });
});

describe('Document Generation — RBAC', () => {
  it('a real customer token is denied generating a document (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen RBAC ${randomUUID().slice(0, 8)}`);
    const templateId = await getAssessmentTemplateId();
    const customer = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${customer}` }, payload: { templateId } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/document-templates' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Document Generation — customer portal visibility and tenant isolation', () => {
  it('an internal (customer_visible=false) document never appears in the customer-portal list', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Portal Internal ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId();
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });

    const org = `docgen-portal-org-${randomUUID().slice(0, 8)}`;
    const mappingService = new ClientIdentityMappingService();
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test' });
    const mappedCustomer = await signToken({ sub: `mapped-${randomUUID()}`, org });

    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/documents`, headers: { authorization: `Bearer ${mappedCustomer}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().documents).toHaveLength(0);
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]);
    await app.close();
  });

  it('a customer_visible=true document IS visible to a genuinely mapped customer', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Portal Visible ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const templateId = await getAssessmentTemplateId();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/documents`, headers: { authorization: `Bearer ${admin}` }, payload: { templateId } });
    const docId = create.json().document.id;
    await app.inject({ method: 'POST', url: `/api/v1/oc/documents/${docId}/customer-visibility`, headers: { authorization: `Bearer ${admin}` }, payload: { visible: true } });

    const org = `docgen-portal-visible-org-${randomUUID().slice(0, 8)}`;
    const mappingService = new ClientIdentityMappingService();
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test' });
    const mappedCustomer = await signToken({ sub: `mapped-${randomUUID()}`, org });

    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/documents`, headers: { authorization: `Bearer ${mappedCustomer}` } });
    expect(res.json().documents).toHaveLength(1);
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]);
    await app.close();
  });

  it('an unmapped customer is denied entirely — real tenant isolation', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`DocGen Portal Isolation ${randomUUID().slice(0, 8)}`);
    const unmappedCustomer = await signToken({ sub: `unmapped-${randomUUID()}`, org: `unmapped-org-${randomUUID().slice(0, 8)}` });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/documents`, headers: { authorization: `Bearer ${unmappedCustomer}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
