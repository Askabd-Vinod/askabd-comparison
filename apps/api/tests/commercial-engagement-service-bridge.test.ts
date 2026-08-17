/**
 * Commercial Engagement → Client Service bridge (Path A confirmation source).
 *
 * Verifies: a service selected on a REAL commercial engagement surfaces as PROPOSED
 * (never auto-activated as 'enabled') on the client's service list, with real evidence
 * (engagement id/name/status) attached — and confirming it writes a real oc_client_services
 * row through the existing, already-audited enable endpoint (Path B's mechanism, reused —
 * not a second confirmation engine). A client with zero commercial engagements shows zero
 * proposed services — nothing is fabricated when no real engagement exists.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { CommercialEngagementService } from '../src/services/commercial-engagement-service.js';
import { sharedPool } from '../src/services/db-pool.js';

let app: ReturnType<typeof Fastify>;
const testClientIds: string[] = [];
const testEngagementIds: string[] = [];

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

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();
});

afterAll(async () => {
  for (const id of testEngagementIds) {
    await sharedPool.query('DELETE FROM oc_engagement_services WHERE engagement_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_commercial_engagements WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of testClientIds) {
    await sharedPool.query('DELETE FROM oc_client_services WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('Commercial engagement bridge — Path A', () => {
  it('a client with zero commercial engagements shows zero proposed services (no fabrication)', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Commercial Bridge Test — No Engagement'));
    testClientIds.push(client.id);

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` });
    const body = res.json();
    expect(body.summary.proposed).toBe(0);
    expect(body.services.every((s: any) => s.clientStatus !== 'proposed')).toBe(true);
  });

  it('a service added to a real commercial engagement surfaces as PROPOSED with real evidence — never auto-enabled', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Commercial Bridge Test — Proposed'));
    testClientIds.push(client.id);

    const commercial = new CommercialEngagementService();
    const engagement = await commercial.createEngagement(client.id, { name: 'Test Engagement — Data Migration', engagementType: 'transformation', createdBy: 'qa-tester' });
    testEngagementIds.push(engagement.id);
    const addResult = await commercial.addService(engagement.id, client.id, { serviceId: 'cap-audit-trail' }); // dependency-free capability
    expect(addResult.success).toBe(true);

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` });
    const body = res.json();
    expect(body.summary.proposed).toBe(1);
    const proposed = body.services.find((s: any) => s.serviceId === 'cap-audit-trail');
    expect(proposed.clientStatus).toBe('proposed');
    expect(proposed.proposalSource.engagementId).toBe(engagement.id);
    expect(proposed.proposalSource.engagementName).toBe('Test Engagement — Data Migration');
    // Critical: proposing a service must never itself create an enabled oc_client_services row.
    const rawRow = await sharedPool.query('SELECT * FROM oc_client_services WHERE client_id = $1 AND service_id = $2', [client.id, 'cap-audit-trail']);
    expect(rawRow.rows.length).toBe(0);
  });

  it('confirming a proposed service reuses the existing real enable endpoint and produces a real, audited CONFIRMED (enabled) row', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Commercial Bridge Test — Confirm'));
    testClientIds.push(client.id);

    const commercial = new CommercialEngagementService();
    const engagement = await commercial.createEngagement(client.id, { name: 'Test Engagement — Confirm Flow', engagementType: 'transformation', createdBy: 'qa-tester' });
    testEngagementIds.push(engagement.id);
    const addResult = await commercial.addService(engagement.id, client.id, { serviceId: 'cap-audit-trail' });
    expect(addResult.success).toBe(true);

    // Path A confirmation reuses the exact same real, already-audited endpoint Path B uses —
    // no second confirmation mechanism was built.
    await app.inject({
      method: 'POST', url: `/oc/clients/${client.id}/services/cap-audit-trail/enable`,
      payload: { actor: 'account-manager-1', reason: `Confirmed from commercial engagement ${engagement.id}` },
    });

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` });
    const confirmed = res.json().services.find((s: any) => s.serviceId === 'cap-audit-trail');
    expect(confirmed.clientStatus).toBe('enabled');
    expect(confirmed.enabledBy).toBe('account-manager-1');
  });
});
