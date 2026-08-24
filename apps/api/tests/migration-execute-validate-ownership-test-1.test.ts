/**
 * migration_execute_validate_ownership_test_1 — RISK-013 follow-up
 * (docs/security-risk-register.md): applies the exact same optional
 * -clientId object-level ownership pattern already proven for
 * `MigrationExecutionService.rollback()` to its siblings —
 * `getRun`/`validate`/`dryRun`/`execute` — plus the real route the web
 * app's migration detail view actually calls for execution
 * (`execute-async`, not the synchronous `/execute`), extended for the
 * same reason even though it wasn't in the original disclosure's named
 * list: leaving the route real callers actually use unprotected would
 * make the `execute` fix real in name only.
 *
 * `clientId` is optional everywhere (exactly matching `rollback`'s own
 * already-shipped, backward-compatible shape) — every pre-existing direct
 * -service test/caller that omits it is completely unaffected.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { sharedPool } from '../src/services/db-pool.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { MigrationExecutionService, MigrationOwnershipError } from '../src/services/migration-execution-service.js';

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });

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
const cleanupSchemas: string[] = [];
const ocService = new OperationsCenterService();
const migrationService = new MigrationExecutionService();

async function makeClient(name: string): Promise<string> {
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

async function makeSourceSchema(): Promise<string> {
  const schemaName = `mig_ev_src_${randomUUID().replace(/-/g, '_')}`;
  await sharedPool.query(`CREATE SCHEMA ${schemaName}`);
  cleanupSchemas.push(schemaName);
  return schemaName;
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM oc_migration_runs WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_operations WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
    // Real target schemas are named `mig_<clientId>_<timestamp>` by
    // createPlan (migration-execution-service.ts) — a fixed prefix per
    // client, not a name derivable from the source schema's own name (an
    // earlier version of this cleanup guessed `_src_` -> `_tgt_`, which
    // never matched the real naming convention at all — found and fixed
    // before any orphan actually resulted, by reading the real service
    // code rather than assuming). A wildcard match against
    // information_schema.schemata catches every real target schema this
    // file's own createPlan calls created, regardless of timing relative
    // to any fire-and-forget async execution.
    const prefix = `mig_${id.replace(/[^a-z0-9]/g, '_')}_`;
    const targets = await sharedPool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE $1`,
      [`${prefix}%`]
    ).catch(() => ({ rows: [] as { schema_name: string }[] }));
    for (const row of targets.rows) {
      await sharedPool.query(`DROP SCHEMA IF EXISTS ${row.schema_name} CASCADE`).catch(() => {});
    }
  }
  for (const schema of cleanupSchemas) {
    await sharedPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  }
});

describe('getRun — real object-level ownership', () => {
  it('a real Client B clientId cannot read Client A\'s real migration run', async () => {
    const a = await makeClient('Migration GetRun Ownership A');
    const b = await makeClient('Migration GetRun Ownership B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);

    await expect(migrationService.getRun(plan.id, b)).rejects.toThrow(MigrationOwnershipError);
    const own = await migrationService.getRun(plan.id, a);
    expect(own?.id).toBe(plan.id);
  });

  it('omitting clientId preserves prior behavior — every existing internal caller in this file is unaffected', async () => {
    const clientId = await makeClient('Migration GetRun Backward Compatible');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(clientId, sourceSchema);
    const run = await migrationService.getRun(plan.id); // no clientId
    expect(run?.id).toBe(plan.id);
  });

  it('a genuinely nonexistent migration id returns null, not an ownership error, regardless of clientId', async () => {
    const result = await migrationService.getRun('mig-does-not-exist-at-all', 'some-client');
    expect(result).toBeNull();
  });
});

describe('validate — real object-level ownership', () => {
  it('a real Client B clientId cannot validate Client A\'s real migration', async () => {
    const a = await makeClient('Migration Validate Ownership A');
    const b = await makeClient('Migration Validate Ownership B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    await migrationService.execute(plan.id);

    await expect(migrationService.validate(plan.id, b)).rejects.toThrow(MigrationOwnershipError);
    const result = await migrationService.validate(plan.id, a);
    expect(result.status).toBeTruthy();
  });
});

describe('dryRun — real object-level ownership', () => {
  it('a real Client B clientId cannot dry-run Client A\'s real migration', async () => {
    const a = await makeClient('Migration DryRun Ownership A');
    const b = await makeClient('Migration DryRun Ownership B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);

    await expect(migrationService.dryRun(plan.id, b)).rejects.toThrow(MigrationOwnershipError);
    const result = await migrationService.dryRun(plan.id, a);
    expect(result.status).toMatch(/dry-run/);
  });
});

describe('execute — real object-level ownership', () => {
  it('a real Client B clientId cannot execute Client A\'s real migration', async () => {
    const a = await makeClient('Migration Execute Ownership A');
    const b = await makeClient('Migration Execute Ownership B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);

    await expect(migrationService.execute(plan.id, undefined, b)).rejects.toThrow(MigrationOwnershipError);

    // The real target schema must never have been created — the ownership
    // check blocked execution before any real work happened.
    const exists = await sharedPool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [plan.targetSchema]);
    expect(exists.rows.length).toBe(0);

    const result = await migrationService.execute(plan.id, undefined, a);
    expect(result.status).toBe('completed');
  });
});

describe('HTTP routes — real object-level ownership over real HTTP, mismatched clientId safely refused (404)', () => {
  it('POST /oc/migration/dry-run — mismatched clientId in body is refused', async () => {
    const app = await buildApp();
    const a = await makeClient('Migration HTTP DryRun A');
    const b = await makeClient('Migration HTTP DryRun B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    const admin = await adminToken();

    const wrong = await app.inject({ method: 'POST', url: '/api/v1/oc/migration/dry-run', headers: { authorization: `Bearer ${admin}` }, payload: { migrationId: plan.id, clientId: b } });
    expect(wrong.statusCode).toBe(404);

    const correct = await app.inject({ method: 'POST', url: '/api/v1/oc/migration/dry-run', headers: { authorization: `Bearer ${admin}` }, payload: { migrationId: plan.id, clientId: a } });
    expect(correct.statusCode).toBe(200);
  });

  it('POST /oc/migration/:migrationId/validate — mismatched clientId in query is refused', async () => {
    const app = await buildApp();
    const a = await makeClient('Migration HTTP Validate A');
    const b = await makeClient('Migration HTTP Validate B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    await migrationService.execute(plan.id);
    const admin = await adminToken();

    const wrong = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/validate?clientId=${b}`, headers: { authorization: `Bearer ${admin}` } });
    expect(wrong.statusCode).toBe(404);

    const correct = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/validate?clientId=${a}`, headers: { authorization: `Bearer ${admin}` } });
    expect(correct.statusCode).toBe(200);
  });

  it('GET /oc/migrations/:migrationId — mismatched clientId in query is refused', async () => {
    const app = await buildApp();
    const a = await makeClient('Migration HTTP GetRun A');
    const b = await makeClient('Migration HTTP GetRun B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    const admin = await adminToken();

    const wrong = await app.inject({ method: 'GET', url: `/api/v1/oc/migrations/${plan.id}?clientId=${b}`, headers: { authorization: `Bearer ${admin}` } });
    expect(wrong.statusCode).toBe(404);

    const correct = await app.inject({ method: 'GET', url: `/api/v1/oc/migrations/${plan.id}?clientId=${a}`, headers: { authorization: `Bearer ${admin}` } });
    expect(correct.statusCode).toBe(200);
    expect(correct.json().migration.id).toBe(plan.id);
  });

  it('POST /oc/migration/:migrationId/execute-async — mismatched clientId in body is refused; the target schema is never created', async () => {
    const app = await buildApp();
    const a = await makeClient('Migration HTTP ExecuteAsync A');
    const b = await makeClient('Migration HTTP ExecuteAsync B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    const admin = await adminToken();

    const wrong = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/execute-async`, headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' }, payload: { clientId: b } });
    expect(wrong.statusCode).toBe(404);
    const exists = await sharedPool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [plan.targetSchema]);
    expect(exists.rows.length).toBe(0); // never started — ownership blocked it before any operation was created

    const correct = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/execute-async`, headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' }, payload: { clientId: a } });
    expect(correct.statusCode).toBe(202); // real async-accepted status, not 200 — see the route's own reply.status(202)
    expect(correct.json().operation).toBeTruthy();

    // Real completion wait, not a fabricated "it probably finished" assumption
    // — the route's own execution continues fire-and-forget after the HTTP
    // response returns (see operations-center-routes.ts's own comment on
    // execute-async); poll the real oc_operations row until it genuinely
    // leaves 'running', so afterAll's cleanup never races a still-in-flight
    // schema creation.
    const operationId = correct.json().operation.id as string;
    for (let i = 0; i < 50; i++) {
      const opRes = await sharedPool.query('SELECT status FROM oc_operations WHERE id = $1', [operationId]);
      if (opRes.rows[0]?.status && opRes.rows[0].status !== 'running' && opRes.rows[0].status !== 'pending') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
});
