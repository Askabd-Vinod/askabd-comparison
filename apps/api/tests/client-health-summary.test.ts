/**
 * Bulk client health summary — GET /oc/clients/health-summary
 *
 * Verifies: reuses the existing ClientHealthService (no duplicate calculation),
 * reads persisted snapshots rather than recomputing (no snapshot-spam on every
 * directory view), reports honestly (null, not a fabricated default) for a
 * client that has never had a snapshot computed, and every summary row's
 * clientId matches the client it was computed for (no cross-client leakage).
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { ClientHealthService } from '../src/services/client-health-service.js';
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
    await sharedPool.query('DELETE FROM oc_client_health_snapshots WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('GET /oc/clients/health-summary', () => {
  it('reports null (not a fabricated default) for a client with no computed snapshot yet', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Health Summary Test — No Snapshot'));
    testClientIds.push(client.id);

    const res = await app.inject({ method: 'GET', url: '/oc/clients/health-summary' });
    expect(res.statusCode).toBe(200);
    const row = res.json().summaries.find((s: any) => s.clientId === client.id);
    expect(row).toBeDefined();
    expect(row.overallScore).toBeNull();
    expect(row.computedAt).toBeNull();
  });

  it('reports the real persisted score after one has been computed — same value the single-client endpoint would show', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Health Summary Test — With Snapshot'));
    testClientIds.push(client.id);

    const healthService = new ClientHealthService();
    const computed = await healthService.computeHealth(client.id);

    const res = await app.inject({ method: 'GET', url: '/oc/clients/health-summary' });
    const row = res.json().summaries.find((s: any) => s.clientId === client.id);
    expect(row.overallScore).toBe(computed.overallScore);
    expect(row.computedAt).toBeTruthy();
  });

  it('client isolation — each row is computed from and matches only its own client', async () => {
    const ocService = new OperationsCenterService();
    const clientA = await ocService.createClient(minimalClient('Health Summary Isolation A'));
    const clientB = await ocService.createClient(minimalClient('Health Summary Isolation B'));
    testClientIds.push(clientA.id, clientB.id);

    const healthService = new ClientHealthService();
    await healthService.computeHealth(clientA.id);
    // clientB deliberately left with no snapshot

    const res = await app.inject({ method: 'GET', url: '/oc/clients/health-summary' });
    const rows = res.json().summaries;
    const rowA = rows.find((s: any) => s.clientId === clientA.id);
    const rowB = rows.find((s: any) => s.clientId === clientB.id);
    expect(rowA.overallScore).not.toBeNull();
    expect(rowB.overallScore).toBeNull(); // B's row must not pick up A's computed score
  });

  it('does not create a new snapshot as a side effect of listing (uses getLatestSnapshot, not computeHealth)', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Health Summary Test — No Spam'));
    testClientIds.push(client.id);

    const healthService = new ClientHealthService();
    await healthService.computeHealth(client.id); // one real snapshot

    const before = await sharedPool.query('SELECT count(*) FROM oc_client_health_snapshots WHERE client_id = $1', [client.id]);
    await app.inject({ method: 'GET', url: '/oc/clients/health-summary' });
    await app.inject({ method: 'GET', url: '/oc/clients/health-summary' });
    const after = await sharedPool.query('SELECT count(*) FROM oc_client_health_snapshots WHERE client_id = $1', [client.id]);

    expect(after.rows[0].count).toBe(before.rows[0].count); // unchanged — summary reads, never writes
  });
});
