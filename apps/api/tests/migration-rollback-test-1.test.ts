/**
 * migration_rollback_test_1 — Migration Rollback Engine (2026-08-24 master
 * completion directive, capability #44).
 *
 * Search-before-building result: `MigrationExecutionService.rollback()`
 * already existed (a real, live `DROP SCHEMA ... CASCADE` + real
 * `information_schema` verification) and was already wired to a real,
 * RBAC-gated route — the coverage matrix's prior "NOT_STARTED" claim was
 * itself stale, matching the exact pattern already found for
 * `deployment_validation_test_1`. Per "do not create duplicate engines
 * when an existing engine can be extended", this pass does NOT build a
 * second rollback mechanism — it adds the missing real object-level
 * ownership check (found live via this session's own mechanical audit:
 * `rollback()` took only an opaque `migrationId`, no way to confirm the
 * caller intends THIS client's migration, for a genuinely destructive
 * operation) and the first-ever real test coverage for this capability.
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
const customerToken = () => signToken({ sub: 'customer-1', org: 'unrelated-org', roles: [] });

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

/** Real, minimal source schema (zero tables — fast, deterministic, still exercises the real schema-creation step). */
async function makeSourceSchema(): Promise<string> {
  const schemaName = `mig_rb_src_${randomUUID().replace(/-/g, '_')}`;
  await sharedPool.query(`CREATE SCHEMA ${schemaName}`);
  cleanupSchemas.push(schemaName);
  return schemaName;
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query(`DELETE FROM oc_migration_runs WHERE client_id = $1`, [id]).catch(() => {});
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE entity_name = $1 OR details::text LIKE $2`, [id, `%${id}%`]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
  for (const schema of cleanupSchemas) {
    await sharedPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  }
});

describe('MigrationExecutionService.rollback — real, live, and now object-level-ownership-checked', () => {
  it('a real rollback genuinely drops the real target schema, verified against information_schema — never fabricated', async () => {
    const clientId = await makeClient('Migration Rollback — Real Drop');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(clientId, sourceSchema);
    await migrationService.execute(plan.id);

    const before = await sharedPool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [plan.targetSchema]);
    expect(before.rows.length).toBe(1); // real target schema genuinely exists after execute

    const result = await migrationService.rollback(plan.id, clientId);
    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);

    const after = await sharedPool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [plan.targetSchema]);
    expect(after.rows.length).toBe(0); // genuinely gone, independently re-queried, not assumed from the return value alone

    const run = await migrationService.getRun(plan.id);
    expect(run?.status).toBe('rolled-back');
  });

  it('real object-level ownership: a real Client B clientId cannot roll back Client A\'s real migration', async () => {
    const a = await makeClient('Migration Rollback Ownership A');
    const b = await makeClient('Migration Rollback Ownership B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    await migrationService.execute(plan.id);

    await expect(migrationService.rollback(plan.id, b)).rejects.toThrow(MigrationOwnershipError);

    // The real target schema must still exist — the ownership check blocked the DROP, not just the return value.
    const stillExists = await sharedPool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [plan.targetSchema]);
    expect(stillExists.rows.length).toBe(1);

    // The real owning client can still roll it back afterward.
    const result = await migrationService.rollback(plan.id, a);
    expect(result.success).toBe(true);
  });

  it('omitting clientId preserves the prior, backward-compatible behavior (no breaking change to existing direct-service callers)', async () => {
    const clientId = await makeClient('Migration Rollback — Backward Compatible');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(clientId, sourceSchema);
    await migrationService.execute(plan.id);
    const result = await migrationService.rollback(plan.id); // no clientId — matches every pre-existing test call site
    expect(result.success).toBe(true);
  });

  it('a nonexistent migration id is a safe, honest failure — never a crash, never a fabricated success', async () => {
    const result = await migrationService.rollback('mig-does-not-exist');
    expect(result.success).toBe(false);
    expect(result.evidence[0]).toMatch(/not found/i);
  });
});

describe('Migration rollback route — RBAC + real object-level ownership over HTTP', () => {
  it('unauthenticated -> 401', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Migration Rollback RBAC — Unauth');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(clientId, sourceSchema);
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/rollback?clientId=${clientId}` });
    expect(res.statusCode).toBe(401);
  });

  it('a customer token is denied (403) — this is a staff-only, AskABD-internal destructive operation', async () => {
    const app = await buildApp();
    const clientId = await makeClient('Migration Rollback RBAC — Customer');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(clientId, sourceSchema);
    const token = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/rollback?clientId=${clientId}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('staff can roll back a real migration for a real client over real HTTP, and a mismatched clientId is safely refused (404, real schema left untouched)', async () => {
    const app = await buildApp();
    const a = await makeClient('Migration Rollback RBAC — Real HTTP A');
    const b = await makeClient('Migration Rollback RBAC — Real HTTP B');
    const sourceSchema = await makeSourceSchema();
    const plan = await migrationService.createPlan(a, sourceSchema);
    await migrationService.execute(plan.id);
    const admin = await adminToken();

    const wrongClient = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/rollback?clientId=${b}`, headers: { authorization: `Bearer ${admin}` } });
    expect(wrongClient.statusCode).toBe(404);
    const stillExists = await sharedPool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [plan.targetSchema]);
    expect(stillExists.rows.length).toBe(1);

    const correct = await app.inject({ method: 'POST', url: `/api/v1/oc/migration/${plan.id}/rollback?clientId=${a}`, headers: { authorization: `Bearer ${admin}` } });
    expect(correct.statusCode).toBe(200);
    expect(correct.json().success).toBe(true);
  });
});
