/**
 * Platform-wide migration portfolio — GET /oc/migrations and GET /oc/migrations/:migrationId
 *
 * Verifies: real oc_migration_runs rows are returned (created via the real
 * MigrationExecutionService.createPlan — not sample data), client isolation, and an
 * honest 404 for an unknown migration id rather than a fabricated placeholder.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { MigrationExecutionService } from '../src/services/migration-execution-service.js';
import { sharedPool } from '../src/services/db-pool.js';

let app: ReturnType<typeof Fastify>;
const testClientIds: string[] = [];
const testMigrationIds: string[] = [];

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
  for (const id of testMigrationIds) await sharedPool.query('DELETE FROM oc_migration_runs WHERE id = $1', [id]).catch(() => {});
  for (const id of testClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  await app.close();
});

describe('GET /oc/migrations', () => {
  it('lists real migration runs created via MigrationExecutionService.createPlan — not sample data', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Migrations Route Test Client'));
    testClientIds.push(client.id);

    const migrationService = new MigrationExecutionService();
    const plan = await migrationService.createPlan(client.id);
    testMigrationIds.push(plan.id);

    const res = await app.inject({ method: 'GET', url: `/oc/migrations?clientId=${client.id}` });
    expect(res.statusCode).toBe(200);
    const { migrations } = res.json();
    const found = migrations.find((m: any) => m.id === plan.id);
    expect(found).toBeDefined();
    expect(found.clientId).toBe(client.id);
    expect(found.status).toBe('planning'); // real status from the plan, not fabricated
  });

  it('client isolation — filtering by clientId does not leak another client\'s migration runs', async () => {
    const ocService = new OperationsCenterService();
    const clientA = await ocService.createClient(minimalClient('Migrations Isolation A'));
    const clientB = await ocService.createClient(minimalClient('Migrations Isolation B'));
    testClientIds.push(clientA.id, clientB.id);

    const migrationService = new MigrationExecutionService();
    const planA = await migrationService.createPlan(clientA.id);
    const planB = await migrationService.createPlan(clientB.id);
    testMigrationIds.push(planA.id, planB.id);

    const res = await app.inject({ method: 'GET', url: `/oc/migrations?clientId=${clientA.id}` });
    const { migrations } = res.json();
    expect(migrations.some((m: any) => m.id === planA.id)).toBe(true);
    expect(migrations.some((m: any) => m.id === planB.id)).toBe(false);
  });
});

describe('GET /oc/migrations/:migrationId', () => {
  it('returns the real migration run with its actual plan and progress — nothing fabricated', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Migrations Detail Test Client'));
    testClientIds.push(client.id);

    const migrationService = new MigrationExecutionService();
    const plan = await migrationService.createPlan(client.id);
    testMigrationIds.push(plan.id);

    const res = await app.inject({ method: 'GET', url: `/oc/migrations/${plan.id}` });
    expect(res.statusCode).toBe(200);
    const { migration } = res.json();
    expect(migration.id).toBe(plan.id);
    expect(migration.plan.totalSteps).toBe(plan.plan.totalSteps);
    expect(migration.progress.percentage).toBe(0); // freshly planned, nothing executed yet
  });

  it('404s honestly for an id that does not exist, rather than returning a fabricated placeholder', async () => {
    const res = await app.inject({ method: 'GET', url: '/oc/migrations/mig-does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
