/**
 * Authoritative client-service assignment — GET /oc/clients/:clientId/services
 *
 * Verifies the core fix: "this capability is operational on the platform" must never be
 * silently treated as "this client receives it". A client with no explicit oc_client_services
 * row for an operational capability must report NOT_CONFIRMED, never a fabricated ENABLED.
 * Only a real, explicit enable action can produce 'enabled'. Disabling a service must not
 * delete any previously-configured connector credentials (audit history preserved).
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { ConnectorService } from '../src/services/connector-service.js';
import { sharedPool } from '../src/services/db-pool.js';

let app: ReturnType<typeof Fastify>;
const testClientIds: string[] = [];

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
  for (const id of testClientIds) {
    await sharedPool.query('DELETE FROM oc_client_services WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_connectors WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query("DELETE FROM oc_audit_log WHERE entity_id = $1 AND entity_type = 'client_service'", [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('GET /oc/clients/:clientId/services — no fabricated service assignment', () => {
  it('a brand-new client with zero explicit service rows shows NOT_CONFIRMED for operational capabilities, never a fabricated ENABLED', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Service Assignment Test — Fresh'));
    testClientIds.push(client.id);

    const res = await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.enabled).toBe(0);
    expect(body.summary.notConfirmed).toBeGreaterThan(0);
    const operationalCaps = body.services.filter((s: any) => s.platformStatus === 'operational');
    expect(operationalCaps.length).toBeGreaterThan(0);
    for (const cap of operationalCaps) {
      expect(cap.clientStatus).toBe('not_confirmed');
      expect(cap.clientStatus).not.toBe('enabled');
    }
    // Non-operational capabilities (foundation/planned/concept) remain not_applicable —
    // a different fact from "not yet confirmed" (the platform doesn't offer them at all yet).
    const nonOperational = body.services.filter((s: any) => s.platformStatus !== 'operational');
    for (const cap of nonOperational) expect(cap.clientStatus).toBe('not_applicable');
  });

  it('explicitly enabling a capability produces real ENABLED status and updates the summary counts correctly', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Service Assignment Test — Confirm'));
    testClientIds.push(client.id);

    const before = (await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` })).json();
    const target = before.services.find((s: any) => s.platformStatus === 'operational');

    await app.inject({ method: 'POST', url: `/oc/clients/${client.id}/services/${target.serviceId}/enable`, payload: { actor: 'qa-tester', reason: 'test confirmation' } });

    const after = (await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` })).json();
    const confirmed = after.services.find((s: any) => s.serviceId === target.serviceId);
    expect(confirmed.clientStatus).toBe('enabled');
    expect(after.summary.enabled).toBe(before.summary.enabled + 1);
    expect(after.summary.notConfirmed).toBe(before.summary.notConfirmed - 1);
  });

  it('an audit entry is recorded for the confirmation with the real actor and reason', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Service Assignment Test — Audit'));
    testClientIds.push(client.id);
    const { services } = (await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` })).json();
    const target = services.find((s: any) => s.platformStatus === 'operational');

    await app.inject({ method: 'POST', url: `/oc/clients/${client.id}/services/${target.serviceId}/enable`, payload: { actor: 'audit-test-actor', reason: 'commercial engagement signed' } });

    // The audit write is deliberately best-effort/fire-and-forget (does not block the
    // enable response) — poll briefly rather than asserting immediately.
    let auditRes = { rows: [] as any[] };
    for (let i = 0; i < 10 && auditRes.rows.length === 0; i++) {
      auditRes = await sharedPool.query(
        `SELECT actor, action, details FROM oc_audit_log WHERE entity_type = 'client_service' AND entity_id = $1 AND action = 'service_enabled' ORDER BY created_at DESC LIMIT 1`,
        [client.id]
      );
      if (auditRes.rows.length === 0) await new Promise(r => setTimeout(r, 100));
    }
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].actor).toBe('audit-test-actor');
  });

  it('disabling a service does not delete previously-configured connector credentials', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Service Assignment Test — Disable Preserves Connectors'));
    testClientIds.push(client.id);
    const { services } = (await app.inject({ method: 'GET', url: `/oc/clients/${client.id}/services` })).json();
    const target = services.find((s: any) => s.platformStatus === 'operational');

    await app.inject({ method: 'POST', url: `/oc/clients/${client.id}/services/${target.serviceId}/enable`, payload: { actor: 'test' } });

    // A connector was configured while the service was enabled (e.g. during onboarding).
    const connectorService = new ConnectorService();
    await connectorService.saveConfiguration(client.id, 'postgresql', { host: 'db.example.com', port: '5432' });

    await app.inject({ method: 'POST', url: `/oc/clients/${client.id}/services/${target.serviceId}/disable`, payload: { actor: 'test' } });

    const connectors = await connectorService.getConnectors(client.id);
    expect(connectors.some(c => c.provider === 'postgresql')).toBe(true); // credential row preserved, not deleted
  });

  it('client isolation — one client\'s confirmed service never appears for another', async () => {
    const ocService = new OperationsCenterService();
    const clientA = await ocService.createClient(minimalClient('Service Assignment Isolation A'));
    const clientB = await ocService.createClient(minimalClient('Service Assignment Isolation B'));
    testClientIds.push(clientA.id, clientB.id);
    const { services } = (await app.inject({ method: 'GET', url: `/oc/clients/${clientA.id}/services` })).json();
    const target = services.find((s: any) => s.platformStatus === 'operational');

    await app.inject({ method: 'POST', url: `/oc/clients/${clientA.id}/services/${target.serviceId}/enable`, payload: { actor: 'test' } });

    const bServices = (await app.inject({ method: 'GET', url: `/oc/clients/${clientB.id}/services` })).json();
    const bTarget = bServices.services.find((s: any) => s.serviceId === target.serviceId);
    expect(bTarget.clientStatus).toBe('not_confirmed'); // never inherits A's confirmation
  });
});
