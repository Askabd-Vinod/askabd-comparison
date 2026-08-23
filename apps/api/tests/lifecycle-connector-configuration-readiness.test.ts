/**
 * Real bug found live during the 2026-08-21 NovaTech UAT database-connection pass:
 * `POST /oc/lifecycle/transition` with event `connectors_configured` used to gate
 * readiness against requirements-service.ts's STALE, pre-multi-record
 * 'connector-configuration' service definition (flat `database_host` /
 * `database_port` / `database_name` / `database_username` / `database_password`
 * requirement keys) — a schema nothing in the app has written to since the real
 * `oc_client_database_connections` multi-record feature (DatabaseConnectionsManager)
 * replaced it. A client with a real, live-tested, Connected database connection
 * still got a hard 422 with five phantom "required" fields. The frontend's own
 * client-side gate was already correctly special-cased to check real connections;
 * this server-side transition endpoint — the actual authority — was not, until
 * lifecycle-service.ts's fix this pass. These tests guard against that regression.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { sharedPool } from '../src/services/db-pool.js';
import { LifecycleService } from '../src/services/lifecycle-service.js';
import { ClientDatabaseConnectionService } from '../src/services/client-database-connection-service.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';

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

async function seedAtEnvironmentRegistered(clientId: string): Promise<void> {
  await sharedPool.query(
    `INSERT INTO oc_lifecycle (client_id, status, previous_status, events, version)
     VALUES ($1, 'environment-registered', 'security-validated', '[]', 1)
     ON CONFLICT (client_id) DO UPDATE SET status = 'environment-registered', previous_status = 'security-validated', version = 1`,
    [clientId],
  );
}

afterAll(async () => {
  for (const id of testClientIds) {
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE details::text LIKE $1`, [`%${id}%`]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_database_connections WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_lifecycle WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('Lifecycle transition — connector-configuration readiness (real database_connections table, not the stale requirement keys)', () => {
  it('blocks connectors_configured with an honest, connection-specific reason when zero connections exist', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Lifecycle Readiness — No Connections'));
    testClientIds.push(client.id);
    await seedAtEnvironmentRegistered(client.id);

    const lifecycleService = new LifecycleService();
    const result = await lifecycleService.transition(client.id, 'connectors_configured', 'test-actor');

    expect(result.success).toBe(false);
    expect(result.error).toBe('lifecycle_prerequisites_not_met');
    expect(result.readiness.blockers).toHaveLength(1);
    expect(result.readiness.blockers[0].message).toContain('database connection must pass a real connection test');
    // Must NOT be the stale requirement-key blockers this bug used to produce.
    expect(JSON.stringify(result.readiness.blockers)).not.toContain('database_host');
    expect(JSON.stringify(result.readiness.blockers)).not.toContain('database_password');
  });

  it('blocks connectors_configured when a connection exists but has never passed a real test', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Lifecycle Readiness — Untested Connection'));
    testClientIds.push(client.id);
    await seedAtEnvironmentRegistered(client.id);

    const dbConnService = new ClientDatabaseConnectionService();
    await dbConnService.create({
      clientId: client.id, name: 'Untested', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'development',
      createdBy: 'test-actor',
    });

    const lifecycleService = new LifecycleService();
    const result = await lifecycleService.transition(client.id, 'connectors_configured', 'test-actor');
    expect(result.success).toBe(false);
    expect(result.error).toBe('lifecycle_prerequisites_not_met');
  });

  it('allows connectors_configured once at least one connection has genuinely passed a real test — the real fix, live-verified end-to-end on the NovaTech UAT client with this exact code path', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Lifecycle Readiness — Real Connected Connection'));
    testClientIds.push(client.id);
    await seedAtEnvironmentRegistered(client.id);

    const dbConnService = new ClientDatabaseConnectionService();
    const created = await dbConnService.create({
      clientId: client.id, name: 'Real Local Postgres', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'development',
      createdBy: 'test-actor',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await dbConnService.test(created.value.id, client.id);
    if (!tested.ok) throw new Error('test setup failed');
    expect(tested.value.status).toBe('connected'); // real local Postgres — genuinely reachable

    const lifecycleService = new LifecycleService();
    const result = await lifecycleService.transition(client.id, 'connectors_configured', 'test-actor');
    expect(result.success).toBe(true);
    expect(result.lifecycle?.status).toBe('connectors-configured');
  });
});
