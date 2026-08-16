import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { sharedPool } from '../src/services/db-pool.js';

const TEST_CLIENT = 'demo-meridian-financial';
const ISOLATION_CLIENT_A = 'stable-0435';
const ISOLATION_CLIENT_B = 'guard-01';

let app: ReturnType<typeof Fastify>;
let engagementId: string;
let proposalId: string;

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();
});

afterAll(async () => {
  // Clean up test data
  if (engagementId) {
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [engagementId]);
    await sharedPool.query('DELETE FROM oc_engagement_services WHERE engagement_id = $1', [engagementId]);
    await sharedPool.query('DELETE FROM oc_engagement_pricing WHERE engagement_id = $1', [engagementId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [engagementId]);
  }
  await app.close();
});

describe('Commercial Engagement Service', () => {

  // ─── ENGAGEMENT CREATION ────────────────────────────────────────────────────

  it('creates an engagement for a client', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Test Engagement', description: 'Integration test', engagementType: 'transformation' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.engagement).toBeDefined();
    expect(body.engagement.name).toBe('Test Engagement');
    expect(body.engagement.client_id).toBe(TEST_CLIENT);
    expect(body.engagement.status).toBe('draft');
    engagementId = body.engagement.id;
  });

  it('rejects engagement creation without name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { description: 'Missing name' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── ENGAGEMENT RETRIEVAL ───────────────────────────────────────────────────

  it('retrieves a single engagement', async () => {
    const res = await app.inject({ method: 'GET', url: `/oc/engagements/${engagementId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().engagement.id).toBe(engagementId);
  });

  it('lists engagements for a client', async () => {
    const res = await app.inject({ method: 'GET', url: `/oc/clients/${TEST_CLIENT}/engagements` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.engagements).toBeDefined();
    expect(Array.isArray(body.engagements)).toBe(true);
    expect(body.engagements.some((e: any) => e.id === engagementId)).toBe(true);
  });

  it('returns 404 for non-existent engagement', async () => {
    const res = await app.inject({ method: 'GET', url: '/oc/engagements/non-existent-id' });
    expect(res.statusCode).toBe(404);
  });

  // ─── ENGAGEMENT LIFECYCLE TRANSITIONS ───────────────────────────────────────

  it('transitions engagement from draft to proposed', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'proposed', actor: 'test-user' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().engagement.status).toBe('proposed');
  });

  it('transitions engagement from proposed to approved', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'approved', actor: 'approver' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().engagement.status).toBe('approved');
  });

  it('rejects invalid engagement transition (approved → completed)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'completed', actor: 'test' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('invalid_transition');
  });

  it('transitions engagement through contracted → active → completed', async () => {
    // approved → contracted
    let res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'contracted' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().engagement.status).toBe('contracted');

    // contracted → active
    res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().engagement.status).toBe('active');

    // active → completed
    res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'completed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().engagement.status).toBe('completed');
  });

  it('rejects transition from completed (terminal state)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${engagementId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'active' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('invalid_transition');
  });

  // ─── SERVICE SELECTION ──────────────────────────────────────────────────────

  it('adds a service to engagement (requires new draft engagement)', async () => {
    // Create a fresh engagement in draft status for service tests
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Service Test Engagement' },
    });
    const freshEngId = createRes.json().engagement.id;

    // Get a known capability with no dependencies
    const capRes = await sharedPool.query(`SELECT id FROM oc_capabilities WHERE dependencies = '[]' OR dependencies IS NULL LIMIT 1`);
    if (capRes.rows.length === 0) {
      // Skip if no capabilities seeded
      await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [freshEngId]);
      return;
    }
    const serviceId = capRes.rows[0].id;

    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${freshEngId}/services`,
      payload: { clientId: TEST_CLIENT, serviceId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);

    // Verify service is listed
    const listRes = await app.inject({
      method: 'GET', url: `/oc/engagements/${freshEngId}/services?clientId=${TEST_CLIENT}`,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().services.length).toBeGreaterThanOrEqual(1);

    // Attempt duplicate add
    const dupRes = await app.inject({
      method: 'POST', url: `/oc/engagements/${freshEngId}/services`,
      payload: { clientId: TEST_CLIENT, serviceId },
    });
    expect(dupRes.statusCode).toBe(422);
    expect(dupRes.json().error).toBe('service_already_added');

    // Remove service
    const delRes = await app.inject({
      method: 'DELETE', url: `/oc/engagements/${freshEngId}/services/${serviceId}?clientId=${TEST_CLIENT}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);

    // Clean up
    await sharedPool.query('DELETE FROM oc_engagement_services WHERE engagement_id = $1', [freshEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [freshEngId]);
  });

  it('rejects adding non-existent service', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Invalid Service Engagement' },
    });
    const tempEngId = createRes.json().engagement.id;

    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${tempEngId}/services`,
      payload: { clientId: TEST_CLIENT, serviceId: 'nonexistent-service-xyz' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('service_not_found');

    // Clean up
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [tempEngId]);
  });

  // ─── PRICING ────────────────────────────────────────────────────────────────

  it('sets and retrieves pricing for an engagement', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Pricing Test Engagement' },
    });
    const pricingEngId = createRes.json().engagement.id;

    const setRes = await app.inject({
      method: 'POST', url: `/oc/engagements/${pricingEngId}/pricing`,
      payload: { clientId: TEST_CLIENT, subtotal: 100000, discount: 5000, tax: 9500, billingModel: 'FIXED_PRICE', paymentTerms: 'Net 30' },
    });
    expect(setRes.statusCode).toBe(201);
    expect(setRes.json().success).toBe(true);
    expect(parseFloat(setRes.json().pricing.total)).toBe(104500); // 100000 - 5000 + 9500

    const getRes = await app.inject({
      method: 'GET', url: `/oc/engagements/${pricingEngId}/pricing?clientId=${TEST_CLIENT}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().pricing).toBeDefined();

    // Clean up
    await sharedPool.query('DELETE FROM oc_engagement_pricing WHERE engagement_id = $1', [pricingEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [pricingEngId]);
  });

  // ─── ENGAGEMENT SUMMARY ────────────────────────────────────────────────────

  it('returns engagement summary with reused AskABD data', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Summary Test Engagement' },
    });
    const sumEngId = createRes.json().engagement.id;

    const res = await app.inject({
      method: 'GET', url: `/oc/engagements/${sumEngId}/summary?clientId=${TEST_CLIENT}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.engagement).toBeDefined();
    expect(body.services).toBeDefined();
    expect(body.financial).toBeDefined();
    expect(body.effort).toBeDefined();
    expect(body.problems).toBeDefined();
    expect(body.gaps).toBeDefined();

    // Clean up
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [sumEngId]);
  });

  // ─── PROPOSALS ──────────────────────────────────────────────────────────────

  it('creates a proposal for an engagement', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Proposal Test Engagement' },
    });
    const propEngId = createRes.json().engagement.id;

    const res = await app.inject({
      method: 'POST', url: `/oc/engagements/${propEngId}/proposals`,
      payload: { clientId: TEST_CLIENT, title: 'Test Proposal v1' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().proposal.version).toBe(1);
    expect(res.json().proposal.status).toBe('draft');
    proposalId = res.json().proposal.id;

    // Create a second version
    const v2Res = await app.inject({
      method: 'POST', url: `/oc/engagements/${propEngId}/proposals`,
      payload: { clientId: TEST_CLIENT, title: 'Test Proposal v2' },
    });
    expect(v2Res.json().proposal.version).toBe(2);

    // List proposals
    const listRes = await app.inject({
      method: 'GET', url: `/oc/engagements/${propEngId}/proposals?clientId=${TEST_CLIENT}`,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().proposals.length).toBe(2);

    // Get single proposal
    const getRes = await app.inject({
      method: 'GET', url: `/oc/proposals/${proposalId}?clientId=${TEST_CLIENT}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().proposal.id).toBe(proposalId);

    // Clean up
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [propEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [propEngId]);
  });

  // ─── PROPOSAL VERSIONING ───────────────────────────────────────────────────

  it('never overwrites existing proposal versions', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Versioning Test' },
    });
    const vEngId = createRes.json().engagement.id;

    // Create 3 versions
    for (let i = 1; i <= 3; i++) {
      const r = await app.inject({
        method: 'POST', url: `/oc/engagements/${vEngId}/proposals`,
        payload: { clientId: TEST_CLIENT, title: `Version ${i}` },
      });
      expect(r.json().proposal.version).toBe(i);
    }

    // Verify all 3 exist
    const listRes = await app.inject({
      method: 'GET', url: `/oc/engagements/${vEngId}/proposals?clientId=${TEST_CLIENT}`,
    });
    expect(listRes.json().proposals.length).toBe(3);
    const versions = listRes.json().proposals.map((p: any) => p.version).sort();
    expect(versions).toEqual([1, 2, 3]);

    // Clean up
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [vEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [vEngId]);
  });

  // ─── PROPOSAL LIFECYCLE ─────────────────────────────────────────────────────

  it('transitions proposal through lifecycle (draft → ready → sent → accepted)', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Proposal Lifecycle Test' },
    });
    const lcEngId = createRes.json().engagement.id;

    const propRes = await app.inject({
      method: 'POST', url: `/oc/engagements/${lcEngId}/proposals`,
      payload: { clientId: TEST_CLIENT, title: 'Lifecycle Proposal' },
    });
    const lcPropId = propRes.json().proposal.id;

    // draft → ready
    let res = await app.inject({
      method: 'POST', url: `/oc/proposals/${lcPropId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'ready' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposal.status).toBe('ready');

    // ready → sent
    res = await app.inject({
      method: 'POST', url: `/oc/proposals/${lcPropId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'sent' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposal.status).toBe('sent');

    // sent → accepted
    res = await app.inject({
      method: 'POST', url: `/oc/proposals/${lcPropId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'accepted', actor: 'client-ceo' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposal.status).toBe('accepted');
    expect(res.json().proposal.approved_by).toBe('client-ceo');

    // Clean up
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [lcEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [lcEngId]);
  });

  it('rejects invalid proposal transition', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Invalid Proposal Transition' },
    });
    const invEngId = createRes.json().engagement.id;

    const propRes = await app.inject({
      method: 'POST', url: `/oc/engagements/${invEngId}/proposals`,
      payload: { clientId: TEST_CLIENT },
    });
    const invPropId = propRes.json().proposal.id;

    // draft → accepted (invalid — must go through ready and sent)
    const res = await app.inject({
      method: 'POST', url: `/oc/proposals/${invPropId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'accepted' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('invalid_transition');

    // Clean up
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [invEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [invEngId]);
  });

  // ─── PROPOSAL GENERATION ────────────────────────────────────────────────────

  it('generates proposal content from existing AskABD data', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Generation Test' },
    });
    const genEngId = createRes.json().engagement.id;

    const propRes = await app.inject({
      method: 'POST', url: `/oc/engagements/${genEngId}/proposals`,
      payload: { clientId: TEST_CLIENT, title: 'Generated Proposal' },
    });
    const genPropId = propRes.json().proposal.id;

    const res = await app.inject({
      method: 'POST', url: `/oc/proposals/${genPropId}/generate`,
      payload: { clientId: TEST_CLIENT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().content).toBeDefined();
    expect(res.json().content.executiveSummary).toBeDefined();
    expect(res.json().content.financialImpact).toBeDefined();
    expect(res.json().content.effort).toBeDefined();

    // Clean up
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [genEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [genEngId]);
  });

  // ─── CLIENT ISOLATION ───────────────────────────────────────────────────────

  it('enforces client isolation — client A cannot see client B engagements', async () => {
    // Create engagement for client A
    const aRes = await app.inject({
      method: 'POST', url: `/oc/clients/${ISOLATION_CLIENT_A}/engagements`,
      payload: { name: 'Client A Private Engagement' },
    });
    const clientAEngId = aRes.json().engagement.id;

    // Client B should not see it in their list
    const bListRes = await app.inject({
      method: 'GET', url: `/oc/clients/${ISOLATION_CLIENT_B}/engagements`,
    });
    const bEngagements = bListRes.json().engagements || [];
    expect(bEngagements.some((e: any) => e.id === clientAEngId)).toBe(false);

    // Client B cannot access client A's engagement summary
    const bSummaryRes = await app.inject({
      method: 'GET', url: `/oc/engagements/${clientAEngId}/summary?clientId=${ISOLATION_CLIENT_B}`,
    });
    // Should return null/not found since clientId doesn't match
    expect(bSummaryRes.statusCode).toBe(404);

    // Clean up
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [clientAEngId]);
  });

  it('enforces client isolation on proposals', async () => {
    const aRes = await app.inject({
      method: 'POST', url: `/oc/clients/${ISOLATION_CLIENT_A}/engagements`,
      payload: { name: 'Isolation Proposal Test' },
    });
    const isoEngId = aRes.json().engagement.id;

    const propRes = await app.inject({
      method: 'POST', url: `/oc/engagements/${isoEngId}/proposals`,
      payload: { clientId: ISOLATION_CLIENT_A, title: 'Private Proposal' },
    });
    const isoPropId = propRes.json().proposal.id;

    // Client B cannot see the proposal
    const bGetRes = await app.inject({
      method: 'GET', url: `/oc/proposals/${isoPropId}?clientId=${ISOLATION_CLIENT_B}`,
    });
    expect(bGetRes.json().proposal).toBeUndefined();

    // Clean up
    await sharedPool.query('DELETE FROM oc_proposals WHERE engagement_id = $1', [isoEngId]);
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [isoEngId]);
  });

  // ─── AUDIT VERIFICATION ─────────────────────────────────────────────────────

  it('creates audit entries for commercial operations', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Audit Verification Engagement' },
    });
    const auditEngId = createRes.json().engagement.id;

    // Check audit log for this engagement
    const auditRes = await app.inject({
      method: 'GET', url: `/oc/audit?entityType=engagement&entityId=${auditEngId}&limit=5`,
    });
    expect(auditRes.statusCode).toBe(200);
    const entries = auditRes.json().entries || [];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e: any) => e.action === 'created')).toBe(true);

    // Clean up
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [auditEngId]);
  });

  // ─── WORKFLOW EVENT VERIFICATION ────────────────────────────────────────────

  it('emits workflow events for engagement operations', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/engagements`,
      payload: { name: 'Event Verification Engagement' },
    });
    const eventEngId = createRes.json().engagement.id;

    // Check events table
    const eventsRes = await sharedPool.query(
      `SELECT * FROM oc_events WHERE client_id = $1 AND entity_id = $2 AND event_type = 'ENGAGEMENT_CREATED' ORDER BY created_at DESC LIMIT 1`,
      [TEST_CLIENT, eventEngId]
    );
    expect(eventsRes.rows.length).toBe(1);
    expect(eventsRes.rows[0].event_type).toBe('ENGAGEMENT_CREATED');

    // Clean up
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [eventEngId]);
  });
});
