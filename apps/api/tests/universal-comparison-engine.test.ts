/**
 * Universal Comparison Engine — migration 048, universal-comparison-engine.ts,
 * universal-comparison-routes.ts. Proves, against real Postgres and the
 * real route handlers:
 *  - a real, genuinely-connected schema comparison (using this environment's
 *    own real dev database credentials for both sides — a real, independent
 *    round trip each time, not a mocked or self-referential result)
 *  - an honest UNKNOWN/failed result when a connection's credential is
 *    genuinely unavailable, never a fabricated match
 *  - self-comparison rejection
 *  - RBAC and tenant isolation
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { universalComparisonRoutes } from '../src/routes/universal-comparison-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { ClientDatabaseConnectionService } from '../src/services/client-database-connection-service.js';
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
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'unrelated-org' });

async function buildApp() {
  const app = Fastify();
  registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
  registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
  registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
  await app.register(universalComparisonRoutes, { prefix: '/api/v1' });
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
afterAll(async () => {
  // Two real gaps found while writing this suite's cleanup, not assumed
  // correct on the first attempt:
  // 1. oc_client_database_connections has no ON DELETE CASCADE from
  //    oc_clients (confirmed via the migration — client_id is a plain
  //    column, not a foreign key) — needs explicit deletion.
  // 2. comparison_runs.left_connection_id/right_connection_id are real
  //    foreign keys INTO oc_client_database_connections with no cascade —
  //    deleting a connection row while a comparison_runs row still
  //    references it fails with a real FK violation. A first version of
  //    this cleanup deleted connections before runs and silently ate that
  //    error via .catch(() => {}), leaving real orphan rows — caught by
  //    directly querying for orphans after a real run, not assumed clean.
  // Correct order: comparison_runs (cascades from oc_clients anyway, but
  // deleted explicitly here for clarity) -> connections -> the client.
  for (const id of cleanupClientIds) {
    await sharedPool.query('DELETE FROM comparison_runs WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_database_connections WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

async function makeClient(name: string) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

/** Real connection row pointing at THIS environment's own real dev Postgres — a genuine, independently-resolvable credential. */
async function makeRealConnection(clientId: string, name: string) {
  const service = new ClientDatabaseConnectionService();
  const result = await service.create({
    clientId, name, connectorType: 'postgresql', host: 'localhost', port: 5442,
    databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass',
    environment: 'development', createdBy: 'test',
  });
  if (!result.ok) throw new Error('Failed to create real test connection: ' + JSON.stringify(result.error));
  return result.value.id;
}

/** A real row with a genuinely unresolvable secret reference — proves the honest-failure path, not mocked. */
async function makeUnresolvableConnection(clientId: string, name: string) {
  const res = await sharedPool.query(
    `INSERT INTO oc_client_database_connections (client_id, name, connector_type, host, port, database_name, username, password_ref, environment)
     VALUES ($1, $2, 'postgresql', 'localhost', 5442, 'comparison', 'comp_user', $3, 'development') RETURNING id`,
    [clientId, name, `nonexistent-secret-ref-${randomUUID()}`]
  );
  return res.rows[0].id;
}

/** A real row for a connector_type this platform has no real adapter for yet — proves the Technology Adapter Registry gate (migration 051), not mocked. */
async function makeUnsupportedConnection(clientId: string, name: string, connectorType: 'oracle' | 'mongodb') {
  const res = await sharedPool.query(
    `INSERT INTO oc_client_database_connections (client_id, name, connector_type, host, port, database_name, username, password_ref, environment)
     VALUES ($1, $2, $3, 'localhost', 5442, 'comparison', 'comp_user', NULL, 'development') RETURNING id`,
    [clientId, name, connectorType]
  );
  return res.rows[0].id;
}

describe('Universal Comparison Engine — real, independently-connected schema comparison', () => {
  it('comparing the same real database against itself via two SEPARATE real connections reports a real MATCH on every real table', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Match ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientId, 'Dev Instance A');
    const rightId = await makeRealConnection(clientId, 'Dev Instance B');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: leftId, rightConnectionId: rightId },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json().run;
    expect(run.status).toBe('completed');
    expect(run.summary.total).toBeGreaterThan(0); // this environment's real schema has real tables
    expect(run.summary.missing).toBe(0);
    expect(run.summary.extra).toBe(0);
    expect(run.summary.match).toBe(run.summary.total); // every real table matched itself, via two real independent connections
    expect(run.results.every((r: any) => r.status === 'match')).toBe(true);
    // Confirms this genuinely queried a known real table, not a fabricated list.
    expect(run.results.some((r: any) => r.name.includes('oc_clients'))).toBe(true);
    await app.close();
  });

  it('a connection with a genuinely unresolvable credential produces an honest failed run, never a fabricated match', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Unresolvable ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientId, 'Real Instance');
    const rightId = await makeUnresolvableConnection(clientId, 'Unresolvable Instance');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: leftId, rightConnectionId: rightId },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json().run;
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toBeTruthy();
    expect(run.results).toEqual([]); // never a fabricated partial result set
    await app.close();
  });

  it('a connector_type with no real adapter yet (oracle) produces a real, persisted failed run with an honest ADAPTER_REQUIRED diagnostic — never a bare exception, never a fabricated result', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Adapter Required ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientId, 'Real Postgres Side');
    const rightId = await makeUnsupportedConnection(clientId, 'Oracle Side', 'oracle');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: leftId, rightConnectionId: rightId },
    });
    expect(res.statusCode).toBe(201); // a real run record is created — never a bare 400 with nothing persisted
    const run = res.json().run;
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toContain('ADAPTER_REQUIRED');
    expect(run.errorMessage).toContain('oracle');
    expect(run.results).toEqual([]); // never a fabricated partial result set

    // Real persistence check, independent of the HTTP response.
    const persisted = await sharedPool.query('SELECT status, error_message FROM comparison_runs WHERE id = $1', [run.id]);
    expect(persisted.rows[0].status).toBe('failed');
    expect(persisted.rows[0].error_message).toContain('ADAPTER_REQUIRED');
    await app.close();
  });

  it('a connector_type never registered in the Technology Adapter Registry at all produces an honest UNKNOWN_TECHNOLOGY diagnostic, never a crash', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Unknown Tech ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientId, 'Real Postgres Side');
    const rightId = await makeUnsupportedConnection(clientId, 'Mystery Side', 'mongodb' as any);
    // Overwrite to a genuinely unregistered technology string (not even a seeded adapter_required row).
    await sharedPool.query(`UPDATE oc_client_database_connections SET connector_type = $1 WHERE id = $2`, [`made-up-tech-${randomUUID().slice(0, 8)}`, rightId]);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: leftId, rightConnectionId: rightId },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json().run;
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toContain('UNKNOWN_TECHNOLOGY');
    await app.close();
  });

  it('comparing a connection against itself is refused (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Self ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const connId = await makeRealConnection(clientId, 'Solo Instance');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: connId, rightConnectionId: connId },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('a connectionId belonging to a DIFFERENT client is refused — real tenant isolation', async () => {
    const app = await buildApp();
    const clientA = await makeClient(`Compare Cross A ${randomUUID().slice(0, 8)}`);
    const clientB = await makeClient(`Compare Cross B ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientA, 'Client A Instance');
    const rightId = await makeRealConnection(clientB, 'Client B Instance');

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientA}/comparisons/database-schema`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: leftId, rightConnectionId: rightId },
    });
    expect(res.statusCode).toBe(400); // rightId doesn't belong to clientA — resolveConnectionConfig returns null for it
    await app.close();
  });

  it('missing fields are rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Missing Fields ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`, headers: { authorization: `Bearer ${admin}` }, payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('Universal Comparison Engine — persistence', () => {
  it('a real comparison run is persisted and retrievable by id and by client list', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Persist ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeRealConnection(clientId, 'A');
    const rightId = await makeRealConnection(clientId, 'B');
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`, headers: { authorization: `Bearer ${admin}` }, payload: { leftConnectionId: leftId, rightConnectionId: rightId } });
    const runId = create.json().run.id;

    const get = await app.inject({ method: 'GET', url: `/api/v1/oc/comparisons/${runId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(get.statusCode).toBe(200);
    expect(get.json().run.id).toBe(runId);

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/comparisons`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().runs.some((r: any) => r.id === runId)).toBe(true);
    await app.close();
  });

  it('a nonexistent comparison run returns 404', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/comparisons/cmp-does-not-exist`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('Universal Comparison Engine — RBAC', () => {
  it('a real customer token is denied running a comparison (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare RBAC ${randomUUID().slice(0, 8)}`);
    const customer = await customerToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/database-schema`, headers: { authorization: `Bearer ${customer}` }, payload: { leftConnectionId: 'x', rightConnectionId: 'y' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Compare Anon ${randomUUID().slice(0, 8)}`);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/comparisons` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('Configuration Comparison (migration 052) — real key-value diff, extending this same engine', () => {
  async function makeSnapshot(app: Awaited<ReturnType<typeof buildApp>>, admin: string, clientId: string, name: string, environment: string, config: Record<string, string>) {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/configuration-snapshots`,
      headers: { authorization: `Bearer ${admin}` }, payload: { name, environment, config },
    });
    expect(res.statusCode).toBe(201);
    return res.json().snapshot.id as string;
  }

  it('a real, deliberately-constructed diff (added/removed/changed/unchanged) is detected correctly', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Config Compare ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Prod Config', 'production', {
      FEATURE_FLAG_X: 'true', LOG_LEVEL: 'info', API_TIMEOUT_MS: '3000',
    });
    const rightId = await makeSnapshot(app, admin, clientId, 'Staging Config', 'staging', {
      FEATURE_FLAG_X: 'true', LOG_LEVEL: 'debug', NEW_FEATURE_Y: 'enabled',
    });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId },
    });
    expect(res.statusCode).toBe(201);
    const run = res.json().run;
    expect(run.comparisonType).toBe('configuration');
    expect(run.status).toBe('completed');
    // objectContaining, not a brittle exact match — migration 053 added
    // real new summary fields (expectedDifference/approvedOverride/etc.)
    // that this baseline-agnostic run correctly leaves at 0; asserting
    // the exact full shape here would make this test fail every time a
    // real new classification dimension is added, for no real reason.
    expect(run.summary).toEqual(expect.objectContaining({ total: 4, match: 1, mismatch: 1, missing: 1, extra: 1, unknown: 0 }));

    const byKey = Object.fromEntries(run.results.map((r: any) => [r.name, r]));
    expect(byKey.FEATURE_FLAG_X.status).toBe('match'); // unchanged
    expect(byKey.LOG_LEVEL.status).toBe('mismatch'); // changed: info -> debug
    expect(byKey.LOG_LEVEL.leftDetail).toBe('info');
    expect(byKey.LOG_LEVEL.rightDetail).toBe('debug');
    expect(byKey.API_TIMEOUT_MS.status).toBe('missing'); // only in prod (left)
    expect(byKey.NEW_FEATURE_Y.status).toBe('extra'); // only in staging (right)
    await app.close();
  });

  it('a secret-shaped key name is masked in the displayed value, but its real change is still honestly reported', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Config Compare Secret ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Left', 'production', { DB_PASSWORD: 'old-real-value-1234' });
    const rightId = await makeSnapshot(app, admin, clientId, 'Right', 'staging', { DB_PASSWORD: 'new-real-value-5678' });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId },
    });
    const run = res.json().run;
    const dbPassword = run.results.find((r: any) => r.name === 'DB_PASSWORD');
    expect(dbPassword.status).toBe('mismatch'); // honestly reported as changed
    expect(dbPassword.leftDetail).toBe('••••••••'); // but never the real value
    expect(dbPassword.rightDetail).toBe('••••••••');
    expect(JSON.stringify(run)).not.toContain('old-real-value-1234');
    expect(JSON.stringify(run)).not.toContain('new-real-value-5678');
    await app.close();
  });

  it('comparing a snapshot against itself is refused (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Config Compare Self ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const id = await makeSnapshot(app, admin, clientId, 'Solo', 'production', { A: '1' });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: id, rightSnapshotId: id },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rejects a non-string config value (400), never silently coercing it', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Config Compare Invalid ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/configuration-snapshots`,
      headers: { authorization: `Bearer ${admin}` }, payload: { name: 'Bad', environment: 'production', config: { X: 123 } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('a real customer token is denied creating a snapshot (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Config Compare RBAC ${randomUUID().slice(0, 8)}`);
    const customer = await customerToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/configuration-snapshots`,
      headers: { authorization: `Bearer ${customer}` }, payload: { name: 'X', environment: 'production', config: {} },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('Configuration Baselines / Overrides / Exceptions (migration 053) — DIFFERENT is not automatically WRONG', () => {
  async function makeSnapshot(app: Awaited<ReturnType<typeof buildApp>>, admin: string, clientId: string, name: string, environment: string, config: Record<string, string>) {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/configuration-snapshots`,
      headers: { authorization: `Bearer ${admin}` }, payload: { name, environment, config },
    });
    expect(res.statusCode).toBe(201);
    return res.json().snapshot.id as string;
  }
  async function makeBaseline(app: Awaited<ReturnType<typeof buildApp>>, admin: string, clientId: string, rules: any) {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/configuration-baselines`,
      headers: { authorization: `Bearer ${admin}` }, payload: { name: `Baseline ${randomUUID().slice(0, 8)}`, rules },
    });
    expect(res.statusCode).toBe(201);
    return res.json().baseline.id as string;
  }

  it('a key with NO baseline rule falls back to the original, real, baseline-agnostic "mismatch" — never fabricated approval', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline None ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Left', 'production', { UNRULED_KEY: 'a' });
    const rightId = await makeSnapshot(app, admin, clientId, 'Right', 'staging', { UNRULED_KEY: 'b' });
    const baselineId = await makeBaseline(app, admin, clientId, {}); // real baseline, but no rule for this key

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId, baselineId },
    });
    const run = res.json().run;
    expect(run.baselineId).toBe(baselineId);
    expect(run.results.find((r: any) => r.name === 'UNRULED_KEY').status).toBe('mismatch');
    await app.close();
  });

  it('expectedToVaryByEnvironment: real difference is classified expected_difference, never flagged as a problem', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline Expected ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Prod', 'production', { API_URL: 'https://api.company.com' });
    const rightId = await makeSnapshot(app, admin, clientId, 'Staging', 'staging', { API_URL: 'https://staging-api.company.com' });
    const baselineId = await makeBaseline(app, admin, clientId, { API_URL: { expectedToVaryByEnvironment: true } });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId, baselineId },
    });
    const run = res.json().run;
    expect(run.results.find((r: any) => r.name === 'API_URL').status).toBe('expected_difference');
    expect(run.summary.expectedDifference).toBe(1);
    await app.close();
  });

  it('a real, approved per-environment override: both sides match their OWN approved value -> approved_override', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline Override ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Prod', 'production', { CONN_TIMEOUT: '60' });
    const rightId = await makeSnapshot(app, admin, clientId, 'Staging', 'staging', { CONN_TIMEOUT: '30' });
    const baselineId = await makeBaseline(app, admin, clientId, {
      CONN_TIMEOUT: { approvedValue: '30', overrides: { production: { value: '60', reason: 'Higher production workload', approvedBy: 'ops-lead', approvedAt: new Date().toISOString() } } },
    });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId, baselineId },
    });
    const run = res.json().run;
    const finding = run.results.find((r: any) => r.name === 'CONN_TIMEOUT');
    expect(finding.status).toBe('approved_override');
    expect(finding.baselineValue).toBe('30');
    expect(finding.overrideReason).toBe('Higher production workload');
    expect(run.summary.approvedOverride).toBe(1);
    await app.close();
  });

  it('a real, unapproved difference against a baseline that HAS a rule for the key -> unapproved_difference, distinct from plain mismatch', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline Unapproved ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Prod', 'production', { JWT_ALGORITHM: 'HS256' });
    const rightId = await makeSnapshot(app, admin, clientId, 'Staging', 'staging', { JWT_ALGORITHM: 'RS256' });
    const baselineId = await makeBaseline(app, admin, clientId, { JWT_ALGORITHM: { approvedValue: 'RS256' } });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId, baselineId },
    });
    const run = res.json().run;
    const finding = run.results.find((r: any) => r.name === 'JWT_ALGORITHM');
    expect(finding.status).toBe('unapproved_difference');
    expect(finding.baselineValue).toBe('RS256');
    expect(run.summary.unapprovedDifference).toBe(1);
    await app.close();
  });

  it('a real "Mark as Intentional" exception reclassifies the SAME existing finding in place — approved_exception, traceable to the real run', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline Exception ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'Prod', 'production', { WORKER_COUNT: '100' });
    const rightId = await makeSnapshot(app, admin, clientId, 'Staging', 'staging', { WORKER_COUNT: '10' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`,
      headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId },
    });
    const runId = create.json().run.id;
    expect(create.json().run.results.find((r: any) => r.name === 'WORKER_COUNT').status).toBe('mismatch'); // real, plain mismatch before any exception

    const exceptionRes = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/${runId}/exceptions`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { configKey: 'WORKER_COUNT', reason: 'Staging uses reduced capacity for cost control.', owner: 'ops-manager', approver: 'ops-manager', reviewDate: '2026-12-01' },
    });
    expect(exceptionRes.statusCode).toBe(201);
    const body = exceptionRes.json();
    expect(body.exception.configKey).toBe('WORKER_COUNT');
    expect(body.exception.comparisonRunId).toBe(runId);
    expect(body.run.results.find((r: any) => r.name === 'WORKER_COUNT').status).toBe('approved_exception');

    // Real, independent re-fetch — the SAME run, not a new one, now reflects the real approval.
    const refetch = await app.inject({ method: 'GET', url: `/api/v1/oc/comparisons/${runId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(refetch.json().run.results.find((r: any) => r.name === 'WORKER_COUNT').status).toBe('approved_exception');
    expect(refetch.json().run.summary.approvedException).toBe(1);
    await app.close();
  });

  it('an exception without a real reason is rejected (400) — never a silent exception', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline Exception No Reason ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const leftId = await makeSnapshot(app, admin, clientId, 'A', 'production', { X: '1' });
    const rightId = await makeSnapshot(app, admin, clientId, 'B', 'staging', { X: '2' });
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/configuration`, headers: { authorization: `Bearer ${admin}` }, payload: { leftSnapshotId: leftId, rightSnapshotId: rightId } });
    const runId = create.json().run.id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/comparisons/${runId}/exceptions`, headers: { authorization: `Bearer ${admin}` }, payload: { configKey: 'X' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('a real baseline can be approved through its own real endpoint', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Baseline Approve ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const baselineId = await makeBaseline(app, admin, clientId, {});
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/configuration-baselines/${baselineId}/approve`, headers: { authorization: `Bearer ${admin}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().baseline.status).toBe('approved');
    expect(res.json().baseline.approvedBy).toBe('admin-1');
    await app.close();
  });
});
