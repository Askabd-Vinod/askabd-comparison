/**
 * Connector honesty — POST /oc/connectors/test, GET /oc/connectors/:clientId, POST /oc/connectors/save
 *
 * Verifies the "No False Green" rule for ConnectorService: a connection is never marked
 * 'connected' unless the real steps actually passed, saving configuration alone never marks
 * a connector 'connected' (only 'configured'), and per-client connector state is isolated.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
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
    // Real hygiene (found during the final hardening pass): clean up this test's own
    // audit-log rows too — oc_audit_log is otherwise a permanent record and test fixtures
    // must not leave orphaned rows behind in the shared dev database.
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_type = 'connector' AND entity_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_connectors WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_connection_tests WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('Connector multi-instance support (migration 035) — the real gap this pass closes', () => {
  it('a client can have TWO connectors of the SAME provider type simultaneously (e.g. AWS Production + AWS Development)', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Connector Multi-Instance — Same Provider Twice'));
    testClientIds.push(client.id);

    const prod = await app.inject({
      method: 'POST', url: '/oc/connectors/save',
      payload: { provider: 'aws', clientId: client.id, name: 'AWS Production', fields: { accountId: '111111111111', region: 'ap-southeast-2' } },
    });
    expect(prod.statusCode).toBe(200);
    expect(prod.json().name).toBe('AWS Production');

    const dev = await app.inject({
      method: 'POST', url: '/oc/connectors/save',
      payload: { provider: 'aws', clientId: client.id, name: 'AWS Development', fields: { accountId: '222222222222', region: 'ap-southeast-2' } },
    });
    expect(dev.statusCode).toBe(200); // must NOT collide even though provider is identical
    expect(dev.json().name).toBe('AWS Development');

    const list = await app.inject({ method: 'GET', url: `/oc/connectors/${client.id}` });
    const { connectors } = list.json();
    const awsRows = connectors.filter((c: any) => c.provider === 'aws');
    expect(awsRows.length).toBe(2);
    expect(awsRows.map((c: any) => c.name).sort()).toEqual(['AWS Development', 'AWS Production']);
  });

  it('every pre-existing single-instance caller (no name passed) keeps behaving exactly as before — name defaults to the provider id', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Connector Multi-Instance — Backward Compat'));
    testClientIds.push(client.id);

    const res = await app.inject({
      method: 'POST', url: '/oc/connectors/save',
      payload: { provider: 'github', clientId: client.id, fields: { token: 'x' } },
    });
    expect(res.json().name).toBe('github');

    // Re-saving with still no name updates the SAME row (true backward compat — a second
    // save of the same unnamed provider must not create a duplicate).
    const res2 = await app.inject({
      method: 'POST', url: '/oc/connectors/save',
      payload: { provider: 'github', clientId: client.id, fields: { token: 'y' } },
    });
    expect(res2.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: `/oc/connectors/${client.id}` });
    expect(list.json().connectors.filter((c: any) => c.provider === 'github').length).toBe(1);
  });

  it('DELETE /oc/connectors/:id removes exactly one named instance, leaving the others untouched, and is client-scoped', async () => {
    const ocService = new OperationsCenterService();
    const clientA = await ocService.createClient(minimalClient('Connector Multi-Instance — Delete A'));
    const clientB = await ocService.createClient(minimalClient('Connector Multi-Instance — Delete B'));
    testClientIds.push(clientA.id, clientB.id);

    await app.inject({ method: 'POST', url: '/oc/connectors/save', payload: { provider: 'kubernetes', clientId: clientA.id, name: 'K8s Prod', fields: { clusterEndpoint: 'https://prod.example.com' } } });
    const keep = await app.inject({ method: 'POST', url: '/oc/connectors/save', payload: { provider: 'kubernetes', clientId: clientA.id, name: 'K8s Staging', fields: { clusterEndpoint: 'https://staging.example.com' } } });
    void keep;

    const listBefore = await app.inject({ method: 'GET', url: `/oc/connectors/${clientA.id}` });
    const toRemove = listBefore.json().connectors.find((c: any) => c.name === 'K8s Prod');
    expect(toRemove).toBeDefined();

    // Client B cannot remove Client A's connector by ID.
    const wrongClient = await app.inject({ method: 'DELETE', url: `/oc/connectors/${toRemove.id}?clientId=${clientB.id}` });
    expect(wrongClient.statusCode).toBe(404);

    const removed = await app.inject({ method: 'DELETE', url: `/oc/connectors/${toRemove.id}?clientId=${clientA.id}` });
    expect(removed.statusCode).toBe(200);

    const listAfter = await app.inject({ method: 'GET', url: `/oc/connectors/${clientA.id}` });
    const names = listAfter.json().connectors.map((c: any) => c.name);
    expect(names).not.toContain('K8s Prod');
    expect(names).toContain('K8s Staging');
  });
});

describe('POST /oc/connectors/test — never fakes success', () => {
  it('a postgresql test against an unreachable host reports failed, with the real failing step', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Connector Honesty Test — Unreachable DB'));
    testClientIds.push(client.id);

    const res = await app.inject({
      method: 'POST', url: '/oc/connectors/test',
      payload: { provider: 'postgresql', clientId: client.id, fields: { host: 'this-host-does-not-exist.invalid', port: '5432', database: 'x', username: 'x', password: 'x' } },
    });
    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result.status).not.toBe('connected'); // must never be marked connected
    expect(result.status).toBe('failed');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.some((s: any) => !s.pass)).toBe(true);
  });

  it('a generic connector test with no host reports a real configuration error, not a fabricated pass', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Connector Honesty Test — No Host'));
    testClientIds.push(client.id);

    const res = await app.inject({
      method: 'POST', url: '/oc/connectors/test',
      payload: { provider: 'grafana', clientId: client.id, fields: {} },
    });
    const result = res.json();
    expect(result.status).toBe('failed');
    expect(result.steps[0].pass).toBe(false);
    expect(result.steps[0].error).toContain('required');
  });
});

describe('POST /oc/connectors/save — Configured ≠ Connected', () => {
  it('saving configuration alone marks the connector configured, never connected', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Connector Honesty Test — Save Only'));
    testClientIds.push(client.id);

    // Fields with no host/token/etc so save's best-effort auto-validate does not run.
    await app.inject({ method: 'POST', url: '/oc/connectors/save', payload: { provider: 'confluence', clientId: client.id, fields: { note: 'placeholder' } } });

    const res = await app.inject({ method: 'GET', url: `/oc/connectors/${client.id}` });
    const { connectors } = res.json();
    const saved = connectors.find((c: any) => c.provider === 'confluence');
    expect(saved).toBeDefined();
    expect(saved.status).toBe('configured');
    expect(saved.status).not.toBe('connected');
  });
});

describe('GET /oc/connectors/:clientId — client isolation', () => {
  it("client A's connector test result never appears under client B", async () => {
    const ocService = new OperationsCenterService();
    const clientA = await ocService.createClient(minimalClient('Connector Isolation A'));
    const clientB = await ocService.createClient(minimalClient('Connector Isolation B'));
    testClientIds.push(clientA.id, clientB.id);

    await app.inject({ method: 'POST', url: '/oc/connectors/test', payload: { provider: 'datadog', clientId: clientA.id, fields: { host: 'localhost', port: '9999' } } });

    const resA = await app.inject({ method: 'GET', url: `/oc/connectors/${clientA.id}` });
    const resB = await app.inject({ method: 'GET', url: `/oc/connectors/${clientB.id}` });
    expect(resA.json().connectors.some((c: any) => c.provider === 'datadog')).toBe(true);
    expect(resB.json().connectors.some((c: any) => c.provider === 'datadog')).toBe(false);
  });
});
