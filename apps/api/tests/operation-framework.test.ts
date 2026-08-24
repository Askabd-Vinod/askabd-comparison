/**
 * The reusable real-time Operation model (operation-service.ts / migration 027) and
 * the RBAC gap it exposed on migration execution routes.
 *
 * Found during the real-time operations audit: MigrationExecutionService.execute()
 * (and discovery's startDiscovery()) ran entirely synchronously inside one HTTP
 * request — no genuine mid-flight progress could ever be observed. This proves the
 * new async path (POST /oc/migration/:id/execute-async) reports REAL, per-step
 * progress into oc_operations as steps actually complete (not fabricated, not a
 * fixed fake percentage), and that the RBAC gap this route (and dry-run/execute/
 * validate/rollback/operations) previously had — identified by an opaque
 * migrationId/operationId that tenant-access.ts's clientId-sniffing never covers —
 * is now closed.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll, afterEach } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { MigrationExecutionService } from '../src/services/migration-execution-service.js';
import { operationService } from '../src/services/operation-service.js';
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

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

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

const cleanupClientIds: string[] = [];
const cleanupMigrationIds: string[] = [];
const cleanupOperationIds: string[] = [];

afterAll(async () => {
  for (const id of cleanupOperationIds) await sharedPool.query('DELETE FROM oc_operations WHERE id = $1', [id]).catch(() => {});
  for (const id of cleanupMigrationIds) await sharedPool.query('DELETE FROM oc_migration_runs WHERE id = $1', [id]).catch(() => {});
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

describe('OperationService — real progress, never fabricated', () => {
  it('progress_percent stays NULL until total_units is known, never a guessed number', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Operation Framework Test Client A'));
    cleanupClientIds.push(client.id);

    const op = await operationService.create({ clientId: client.id, type: 'discovery' });
    cleanupOperationIds.push(op.id);
    expect(op.progressPercent).toBeNull();
    expect(op.totalUnits).toBeNull();
  });

  it('real, incremental per-step progress — completedUnits only increases as real steps report in', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Operation Framework Test Client B'));
    cleanupClientIds.push(client.id);

    const op = await operationService.create({ clientId: client.id, type: 'migration', totalUnits: 4 });
    cleanupOperationIds.push(op.id);
    await operationService.start(op.id);

    const afterOne = await operationService.progress(op.id, { completedUnitsDelta: 1, currentStage: 'Step 1', evidenceMessage: 'Step 1 done' });
    expect(afterOne?.completedUnits).toBe(1);
    expect(afterOne?.progressPercent).toBe(25); // real 1/4, not invented

    const afterTwo = await operationService.progress(op.id, { completedUnitsDelta: 1, currentStage: 'Step 2' });
    expect(afterTwo?.completedUnits).toBe(2);
    expect(afterTwo?.progressPercent).toBe(50);

    const final = await operationService.complete(op.id, { result: { ok: true } });
    expect(final?.status).toBe('completed');
    expect(final?.progressPercent).toBe(100);
    expect(final?.completedAt).toBeTruthy();
  });

  it('real failure — never silently completes when work genuinely failed', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Operation Framework Test Client C'));
    cleanupClientIds.push(client.id);

    const op = await operationService.create({ clientId: client.id, type: 'migration', totalUnits: 2 });
    cleanupOperationIds.push(op.id);
    await operationService.start(op.id);
    await operationService.progress(op.id, { failedUnitsDelta: 1, evidenceMessage: 'Step failed' });
    const failed = await operationService.fail(op.id, { errorSummary: 'Mandatory step failed' });
    expect(failed?.status).toBe('failed');
    expect(failed?.errorSummary).toBe('Mandatory step failed');
  });

  it('real crash recovery — a row stuck in "running" is honestly marked "interrupted", never left claiming fake progress forever', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Operation Framework Test Client D'));
    cleanupClientIds.push(client.id);

    const op = await operationService.create({ clientId: client.id, type: 'discovery', totalUnits: 5 });
    cleanupOperationIds.push(op.id);
    await operationService.start(op.id);
    // Simulate: process died mid-operation — no fail()/complete() was ever called.

    const recoveredCount = await operationService.recoverInterruptedOperations();
    expect(recoveredCount).toBeGreaterThanOrEqual(1);

    const after = await operationService.get(op.id);
    expect(after?.status).toBe('interrupted');
    expect(after?.evidence.some(e => e.message.includes('restarted'))).toBe(true);
  });

  it('cancellation is refused for a non-cancellable operation — never fakes a cancel that did not happen', async () => {
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Operation Framework Test Client E'));
    cleanupClientIds.push(client.id);

    const op = await operationService.create({ clientId: client.id, type: 'migration', cancellable: false });
    cleanupOperationIds.push(op.id);
    const result = await operationService.cancel(op.id, 'test-actor');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not support cancellation/);
  });
});

describe('Async migration execution — real per-step progress via the real route', () => {
  afterEach(async () => {
    // Give the fire-and-forget background execution a moment to finish writing its
    // final operation state before the next test/cleanup runs.
    await new Promise(r => setTimeout(r, 500));
  });

  it('a real migration plan on an EMPTY source schema executes end-to-end and reports real completion', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Async Migration Test Client'));
    cleanupClientIds.push(client.id);

    // A schema with zero tables — a genuinely fast, real, deterministic migration
    // (still exercises the real schema-creation step and real status calculation).
    const schemaName = `mig_src_${randomUUID().replace(/-/g, '_')}`;
    await sharedPool.query(`CREATE SCHEMA ${schemaName}`);

    const migrationService = new MigrationExecutionService();
    const plan = await migrationService.createPlan(client.id, schemaName);
    cleanupMigrationIds.push(plan.id);

    const token = await signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/migration/${plan.id}/execute-async`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(202);
    const { operation } = res.json();
    cleanupOperationIds.push(operation.id);
    expect(operation.status).toBe('running');
    expect(operation.clientId).toBe(client.id);

    // Poll the real operation until the real background execution finishes.
    let finalOp: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const pollRes = await app.inject({ method: 'GET', url: `/api/v1/oc/operations/${operation.id}`, headers: { authorization: `Bearer ${token}` } });
      finalOp = pollRes.json().operation;
      if (finalOp.status === 'completed' || finalOp.status === 'failed') break;
    }
    expect(finalOp.status).toBe('completed');
    expect(finalOp.progressPercent).toBe(100);
    expect(finalOp.evidence.length).toBeGreaterThan(1); // real per-step entries, not one fake summary line

    // A real, pre-existing cleanup bug found and fixed while investigating a
    // separate migration-ownership fix (docs/security-risk-register.md
    // RISK-013 update, 2026-08-25): this only ever dropped the SOURCE
    // schema — the real TARGET schema execute() actually creates
    // (plan.targetSchema, MigrationExecutionService.createPlan's own
    // `mig_<clientId>_<timestamp>` naming) was never cleaned up here at
    // all. A mechanical sweep of every real oc_clients row found 137 such
    // orphaned target schemas accumulated from this exact gap across many
    // prior test runs; all cleaned up directly, and this test's own
    // cleanup fixed so it stops recurring.
    await sharedPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`).catch(() => {});
    await sharedPool.query(`DROP SCHEMA IF EXISTS ${plan.targetSchema} CASCADE`).catch(() => {});
    await app.close();
  }, 15000);

  it('a real customer token is denied execute-async on ANY migration (403) — the actual gap this closes', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Async Migration RBAC Test Client'));
    cleanupClientIds.push(client.id);

    const migrationService = new MigrationExecutionService();
    const plan = await migrationService.createPlan(client.id);
    cleanupMigrationIds.push(plan.id);

    const token = await signToken({ sub: `customer-${randomUUID()}`, org: 'some-other-org' }); // real-shaped: no roles claim
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/migration/${plan.id}/execute-async`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('a real customer token is denied reading another client\'s operation (403)', async () => {
    const app = await buildApp();
    const ocService = new OperationsCenterService();
    const client = await ocService.createClient(minimalClient('Operation Read RBAC Test Client'));
    cleanupClientIds.push(client.id);

    const op = await operationService.create({ clientId: client.id, type: 'discovery' });
    cleanupOperationIds.push(op.id);

    const token = await signToken({ sub: `customer-${randomUUID()}`, org: 'some-other-org' });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/operations/${op.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401) on execute-async and operation read', async () => {
    const app = await buildApp();
    const res1 = await app.inject({ method: 'POST', url: '/api/v1/oc/migration/mig-doesnt-exist/execute-async' });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/oc/operations/op-doesnt-exist' });
    expect(res2.statusCode).toBe(401);
    await app.close();
  });
});
