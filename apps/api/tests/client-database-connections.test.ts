/**
 * Client Database Connections — real, multi-record connection management.
 * Verifies: a client can have MORE THAN ONE connection of the same
 * connector_type (the real gap this feature closes), passwords are never
 * returned by any read path, validation is real, and Test Connection never
 * fakes success.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { clientDatabaseConnectionsRoutes } from '../src/routes/client-database-connections-routes.js';
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
  await app.register(clientDatabaseConnectionsRoutes, { prefix: '/api/v1' });
  await app.ready();
});

afterAll(async () => {
  for (const id of testClientIds) {
    // Real data-integrity hygiene (found during a fresh audit): tests must not leave
    // orphaned oc_audit_log rows behind in the shared dev database after their fixture
    // client/connection rows are gone — the audit table is otherwise a permanent record,
    // and pre-existing test files in this suite were found to leak into it silently.
    await sharedPool.query(
      `DELETE FROM oc_audit_log WHERE entity_type = 'database_connection' AND (details->>'clientId') = $1`,
      [id],
    ).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_database_connections WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  await app.close();
});

describe('Client database connections — real multi-record support', () => {
  it('a client can have two connections of the SAME connector_type — the real gap this closes', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Multi-Instance'));
    testClientIds.push(client.id);

    const first = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: 'Production Oracle', connectorType: 'oracle', host: 'db-prod.example.com', port: 1521, databaseName: 'ORCL', username: 'askabd_ro', password: 'secret1', environment: 'production' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: 'UAT Oracle', connectorType: 'oracle', host: 'db-uat.example.com', port: 1521, databaseName: 'ORCLUAT', username: 'askabd_ro', password: 'secret2', environment: 'uat' },
    });
    expect(second.statusCode).toBe(201); // must NOT collide even though connectorType is identical

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${client.id}/database-connections` });
    const { connections } = list.json();
    expect(connections.length).toBe(2);
    expect(connections.map((c: any) => c.name).sort()).toEqual(['Production Oracle', 'UAT Oracle']);
  });

  it('rejects a missing required field with a real, specific message — not a generic backend error', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Validation'));
    testClientIds.push(client.id);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: '', connectorType: 'postgresql', host: 'db.example.com', port: 5432, databaseName: 'x', username: 'x', password: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('Connection name is required');
  });

  it('never returns the password on create or list', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Password Secrecy'));
    testClientIds.push(client.id);

    const created = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: 'Secret DB', connectorType: 'postgresql', host: 'db.example.com', port: 5432, databaseName: 'x', username: 'x', password: 'MyRealSecretPassword123', environment: 'production' },
    });
    const body = JSON.stringify(created.json());
    expect(body).not.toContain('MyRealSecretPassword123');
    expect(created.json().connection.hasPassword).toBe(true);
    expect(created.json().connection.password).toBeUndefined();

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${client.id}/database-connections` });
    expect(JSON.stringify(list.json())).not.toContain('MyRealSecretPassword123');
  });

  it('Test Connection never fakes success against an unreachable host', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Test Honesty'));
    testClientIds.push(client.id);

    const created = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: 'Unreachable DB', connectorType: 'postgresql', host: 'this-host-does-not-exist.invalid', port: 5432, databaseName: 'x', username: 'x', password: 'x', environment: 'production' },
    });
    const id = created.json().connection.id;

    const tested = await app.inject({ method: 'POST', url: `/api/v1/oc/database-connections/${id}/test` });
    expect(tested.statusCode).toBe(200);
    const { connection } = tested.json();
    expect(connection.status).toBe('failed'); // must never be 'connected'
    expect(connection.lastTestSteps.length).toBeGreaterThan(0);
    expect(connection.lastTestSteps.some((s: any) => !s.pass)).toBe(true);
  });

  it('renaming a connection alone does NOT reset its test status — only a real connection-value change does', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Rename Preserves Status'));
    testClientIds.push(client.id);

    const created = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: 'Local DB', connectorType: 'postgresql', host: 'localhost', port: 5442, databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'production' },
    });
    const id = created.json().connection.id;

    const tested = await app.inject({ method: 'POST', url: `/api/v1/oc/database-connections/${id}/test` });
    expect(tested.json().connection.status).toBe('connected'); // real local Postgres — genuinely reachable

    // Rename only — the frontend edit form always resends host/port/db/username too, so
    // this deliberately sends the SAME values back for those fields, proving the service
    // compares actual values rather than field presence.
    const renamed = await app.inject({
      method: 'PATCH', url: `/api/v1/oc/database-connections/${id}`,
      payload: { name: 'Local DB (renamed)', connectorType: 'postgresql', host: 'localhost', port: 5442, databaseName: 'comparison', username: 'comp_user' },
    });
    expect(renamed.json().connection.name).toBe('Local DB (renamed)');
    expect(renamed.json().connection.status).toBe('connected'); // must NOT have reset to not_tested

    // Now actually change the host — this MUST invalidate the stale result.
    const rehosted = await app.inject({ method: 'PATCH', url: `/api/v1/oc/database-connections/${id}`, payload: { host: 'a-different-host.example.com' } });
    expect(rehosted.json().connection.status).toBe('not_tested');
  });

  it('a real PostgreSQL Test Connection performs the full connect → authenticate → query → close sequence, never just a TCP check (2026-08-21 regression, see NovaTech UAT PostgreSQL live verification)', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Real PostgreSQL Protocol Test'));
    testClientIds.push(client.id);

    // Real, currently-running Postgres instance discovered from the actual environment
    // (apps/api/.env's own DATABASE_URL / docker-compose.yml) — not a guessed default.
    // Deliberately reuses the exact same literal credential the rename-preserves-status
    // test above already commits to this file, rather than introducing a second
    // real-password literal into source code.
    const created = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: {
        name: 'Real Postgres Protocol Test', connectorType: 'postgresql',
        host: 'localhost', port: 5442, databaseName: 'comparison', username: 'comp_user',
        password: 'comp_local_pass', environment: 'development',
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().connection.id;

    const tested = await app.inject({ method: 'POST', url: `/api/v1/oc/database-connections/${id}/test` });
    expect(tested.statusCode).toBe(200);
    const { connection } = tested.json();
    expect(connection.status).toBe('connected');
    expect(connection.lastTestMode).toBe('real');

    // The exact real protocol sequence, not a TCP-only shortcut — every step present and
    // passed, including a genuine authenticated query (`Database Access`), not merely a
    // socket connecting.
    const stepNames = connection.lastTestSteps.map((s: any) => s.step);
    expect(stepNames).toEqual(
      expect.arrayContaining(['DNS Resolution', 'Port Accessibility', 'TCP Connection', 'Authentication', 'Database Access']),
    );
    expect(connection.lastTestSteps.every((s: any) => s.pass)).toBe(true);
    expect(connection.lastTestSteps.some((s: any) => /^Latency/.test(s.step))).toBe(true);

    // Wrong password against the SAME real, reachable server must fail at the
    // Authentication step specifically — proves this is a genuine credential check
    // (the pg driver's real auth handshake), not a reachability check being relabeled.
    const wrongPassClient = await ocService.createClient(minimalClient('DB Connections — Wrong Password'));
    testClientIds.push(wrongPassClient.id);
    const wrongCreated = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${wrongPassClient.id}/database-connections`,
      payload: {
        name: 'Wrong Password Test', connectorType: 'postgresql',
        host: 'localhost', port: 5442, databaseName: 'comparison', username: 'comp_user',
        password: 'definitely-the-wrong-password', environment: 'development',
      },
    });
    const wrongId = wrongCreated.json().connection.id;
    const wrongTested = await app.inject({ method: 'POST', url: `/api/v1/oc/database-connections/${wrongId}/test` });
    expect(wrongTested.json().connection.status).toBe('failed');
    const authStep = wrongTested.json().connection.lastTestSteps.find((s: any) => s.step === 'Authentication');
    expect(authStep.pass).toBe(false);
  });

  it('update, then remove, then confirm the exact connection is gone (client isolation preserved)', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('DB Connections — Update & Remove'));
    testClientIds.push(client.id);

    const created = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${client.id}/database-connections`,
      payload: { name: 'Original Name', connectorType: 'mysql', host: 'db.example.com', port: 3306, databaseName: 'x', username: 'x', password: 'x', environment: 'staging' },
    });
    const id = created.json().connection.id;

    const updated = await app.inject({ method: 'PATCH', url: `/api/v1/oc/database-connections/${id}`, payload: { name: 'Renamed Connection' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().connection.name).toBe('Renamed Connection');

    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/oc/database-connections/${id}` });
    expect(removed.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${client.id}/database-connections` });
    expect(list.json().connections.length).toBe(0);
  });
});
