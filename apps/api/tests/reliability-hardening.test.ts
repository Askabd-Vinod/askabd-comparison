/**
 * Reliability Hardening — Phase 1
 * Covers: transaction atomicity/rollback, idempotent duplicate-save protection,
 * additive enriched save response, client isolation, and retryable-failure contract.
 * See .kiro/specs/reliability-hardening/design.md
 */
import Fastify from 'fastify';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { RequirementsService } from '../src/services/requirements-service.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { sharedPool } from '../src/services/db-pool.js';

// RISK-012 platform-wide fix (migration 067, 2026-08-25) added a real
// client_id -> oc_clients(id) foreign key to oc_client_service_requirements
// (and 38 other tables) — these two constants used to be bare, non-existent
// client ids, which the new FK now correctly rejects. Real clients created
// in beforeAll below; the FK's own ON DELETE CASCADE cleans every row this
// file creates when the client itself is deleted in afterAll, the same
// convention already established elsewhere this session (e.g.
// otp-security.test.ts's minimalClient() pattern).
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

let CLIENT_A: string;
let CLIENT_B: string;
const SERVICE_ID = 'discovery';
const REQ_KEY = 'discovery_scope';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();

  const ocService = new OperationsCenterService();
  const clientA = await ocService.createClient(minimalClient('Reliability Hardening Test A'));
  const clientB = await ocService.createClient(minimalClient('Reliability Hardening Test B'));
  CLIENT_A = clientA.id;
  CLIENT_B = clientB.id;
});

afterAll(async () => {
  // Clean up test-only client data — never touches real/regression clients.
  // Deleting the real client rows cascades (ON DELETE CASCADE, migration 067)
  // to every row this file created in oc_client_service_requirements and
  // oc_client_service_requirement_history — no manual per-table cleanup needed.
  for (const clientId of [CLIENT_A, CLIENT_B]) {
    if (clientId) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [clientId]);
  }
  await app.close();
});

describe('Reliability Hardening — Requirement Save', () => {
  it('saves a value and returns an authoritative, additively-enriched response', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'All production databases', actor: 'test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Existing contract fields — unchanged
    expect(body.value).toBe('All production databases');
    expect(body.status).toBeDefined();
    expect(body.version).toBeGreaterThan(0);
    // New additive fields — present without displacing anything existing
    expect(body.readiness).toBeDefined();
    expect(Array.isArray(body.blockers)).toBe(true);
    expect(body.requestId).toBeTruthy();
  });

  it('is idempotent — an identical repeated save is a no-op (no version bump, no duplicate history)', async () => {
    const first = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'idempotent-value', actor: 'test' },
    });
    const firstVersion = first.json().version;

    const second = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'idempotent-value', actor: 'test' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().version).toBe(firstVersion); // unchanged — genuinely nothing to save

    const history = await sharedPool.query(
      `SELECT count(*) FROM oc_client_service_requirement_history
       WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 AND new_value = $4`,
      [CLIENT_A, SERVICE_ID, REQ_KEY, 'idempotent-value']
    );
    expect(Number(history.rows[0].count)).toBe(1); // exactly one entry, not duplicated by the retry
  });

  it('a genuine change increments version and writes exactly one new history row', async () => {
    const before = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'value-v1', actor: 'test' },
    });
    const v1 = before.json().version;

    const after = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'value-v2', actor: 'test' },
    });
    expect(after.json().version).toBe(v1 + 1);

    const history = await sharedPool.query(
      `SELECT count(*) FROM oc_client_service_requirement_history
       WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 AND version = $4`,
      [CLIENT_A, SERVICE_ID, REQ_KEY, v1 + 1]
    );
    expect(Number(history.rows[0].count)).toBe(1);
  });

  it('rolls back cleanly on a mid-transaction failure — no partial write, connection always released', async () => {
    const svc = new RequirementsService();
    await svc.updateRequirement(CLIENT_A, SERVICE_ID, REQ_KEY, 'baseline-before-failure', 'test');
    const before = await sharedPool.query(
      'SELECT value, version FROM oc_client_service_requirements WHERE client_id=$1 AND service_id=$2 AND requirement_key=$3',
      [CLIENT_A, SERVICE_ID, REQ_KEY]
    );

    const releaseFn = vi.fn();
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO oc_client_service_requirement_history')) {
          throw new Error('Simulated failure between UPDATE and history INSERT');
        }
        return { rows: [] };
      }),
      release: releaseFn,
    };
    // pg-pool's own Pool.query() calls this.connect(callback) internally for every plain
    // dbPool.query(...) call (including the read-only lookups this service also makes) —
    // only intercept the no-argument, promise-style connect() the write transaction uses;
    // pass every callback-style call straight through to the real pool.
    const originalConnect = sharedPool.connect.bind(sharedPool);
    const connectSpy = vi.spyOn(sharedPool, 'connect').mockImplementation((cb?: any) => {
      if (typeof cb === 'function') return originalConnect(cb);
      connectSpy.mockRestore(); // one-shot — restore immediately so nothing else is affected
      return Promise.resolve(fakeClient as any);
    });

    await expect(
      svc.updateRequirement(CLIENT_A, SERVICE_ID, REQ_KEY, 'should-not-persist', 'test')
    ).rejects.toThrow('Simulated failure between UPDATE and history INSERT');
    connectSpy.mockRestore();

    expect(fakeClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(releaseFn).toHaveBeenCalled(); // connection always released, even on failure

    const after = await sharedPool.query(
      'SELECT value, version FROM oc_client_service_requirements WHERE client_id=$1 AND service_id=$2 AND requirement_key=$3',
      [CLIENT_A, SERVICE_ID, REQ_KEY]
    );
    expect(after.rows[0].value).toBe(before.rows[0].value); // no partial write survived
    expect(after.rows[0].version).toBe(before.rows[0].version);
  });

  it('surfaces a retryable 500 with a request id when the save fails — never a silent partial success', async () => {
    const spy = vi.spyOn(RequirementsService.prototype, 'updateRequirement').mockRejectedValueOnce(new Error('simulated DB outage'));
    const res = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'x', actor: 'test' },
    });
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.json().requestId).toBeTruthy();
  });

  it('preserves client isolation — updating client A never affects client B\'s same requirement', async () => {
    await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_B}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'client-b-value', actor: 'test' },
    });
    await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/${REQ_KEY}`,
      payload: { value: 'client-a-value-changed', actor: 'test' },
    });
    const bRes = await app.inject({ method: 'GET', url: `/oc/client-services/${CLIENT_B}/${SERVICE_ID}/requirements` });
    const bReq = bRes.json().requirements.find((r: any) => r.requirementKey === REQ_KEY);
    expect(bReq.value).toBe('client-b-value');
  });

  it('returns 404 for a genuinely unknown requirement key (unchanged existing behavior)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/oc/client-services/${CLIENT_A}/${SERVICE_ID}/requirements/not_a_real_requirement_key`,
      payload: { value: 'x', actor: 'test' },
    });
    expect(res.statusCode).toBe(404);
  });
});
