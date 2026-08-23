/**
 * connector_test_1 — Connector Security + Client Environment Addendum
 * (2026-08-24)
 *
 * Real, exploitable object-level-authorization (IDOR) bugs found and fixed
 * in `ClientDatabaseConnectionService` — the connector actually used by
 * every real comparison/discovery operation in this platform. `update`,
 * `remove`, and `test` looked up a connection by its opaque `id` ALONE —
 * no `client_id` check anywhere in the service, and their routes
 * (`PATCH/DELETE /oc/database-connections/:id`, `POST .../:id/test`) carry
 * no `:clientId` URL segment at all, so tenant-access.ts's own clientId
 * -membership check never even applied to them. Real impact: one client's
 * real database connection — host, port, username, and via `password_ref`
 * the actual secret — could be read, silently repointed to a different
 * host, or deleted by anyone who knew its opaque id, regardless of which
 * client they were authorized for. Fixed at the service/query layer with
 * a real ownership check, not just an RBAC rule (both routes were already
 * Admin.Access-gated — RBAC alone never protects against this class of
 * bug). Also found and fixed: 3 more `connector-service.ts` routes with no
 * RBAC rule at all, and applied `maskSecrets()` defense-in-depth to that
 * service's persisted/returned error text (no live exploit path found —
 * hardening, not a confirmed leak).
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { clientDatabaseConnectionsRoutes } from '../src/routes/client-database-connections-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { ClientDatabaseConnectionService } from '../src/services/client-database-connection-service.js';
import { sharedPool } from '../src/services/db-pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** The same disposable, publicly-committed, CN=localhost dev cert baked into
 * comparison-postgres by scripts/dev-tls/init-ssl.sh — never a real secret. */
const DEV_TLS_CA = path.join(__dirname, '..', '..', '..', 'scripts', 'dev-tls', 'server.crt');

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
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await app.register(clientDatabaseConnectionsRoutes, { prefix: '/api/v1' });
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

async function makeClient(name: string) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

afterAll(async () => {
  for (const id of cleanupClientIds) {
    await sharedPool.query('DELETE FROM oc_client_database_connections WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('connector_test_1 — real cross-client IDOR fixed: ClientDatabaseConnectionService ownership', () => {
  it('PATCH does not let Client A silently overwrite Client B\'s real database connection (host/port/credential ref)', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const service = new ClientDatabaseConnectionService();
    const clientA = await makeClient(`Connector IDOR A ${randomUUID().slice(0, 8)}`);
    const clientB = await makeClient(`Connector IDOR B ${randomUUID().slice(0, 8)}`);

    const created = await service.create({
      clientId: clientB, name: 'B real production DB', connectorType: 'postgresql',
      host: 'db-b-real.internal', port: 5432, databaseName: 'prod', username: 'b_user',
      password: 'b-real-secret-password', environment: 'production', createdBy: 'test',
    });
    if (!created.ok) throw new Error('setup failed');
    const connB = created.value.id;

    // Cross-client attempt: Client A's own (authorized) clientId, paired
    // with Client B's real connection id, trying to repoint it to an
    // attacker-controlled host. Before the fix this silently succeeded.
    const crossPatch = await app.inject({
      method: 'PATCH', url: `/api/v1/oc/database-connections/${connB}`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { clientId: clientA, host: 'attacker-controlled.example.com' },
    });
    expect(crossPatch.statusCode).toBe(404);

    // Confirm Client B's real connection was NOT changed by the blocked attempt.
    const stillIntact = await service.list(clientB);
    expect(stillIntact.find(c => c.id === connB)?.host).toBe('db-b-real.internal');

    // Same-client PATCH still works correctly.
    const samePatch = await app.inject({
      method: 'PATCH', url: `/api/v1/oc/database-connections/${connB}`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { clientId: clientB, description: 'updated for real' },
    });
    expect(samePatch.statusCode).toBe(200);

    await app.close();
  });

  it('DELETE does not let Client A delete Client B\'s real database connection', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const service = new ClientDatabaseConnectionService();
    const clientA = await makeClient(`Connector IDOR DELETE A ${randomUUID().slice(0, 8)}`);
    const clientB = await makeClient(`Connector IDOR DELETE B ${randomUUID().slice(0, 8)}`);

    const created = await service.create({
      clientId: clientB, name: 'B connection to protect', connectorType: 'postgresql',
      host: 'db-b.internal', port: 5432, databaseName: 'prod', username: 'b_user',
      password: 'b-secret', environment: 'production', createdBy: 'test',
    });
    if (!created.ok) throw new Error('setup failed');
    const connB = created.value.id;

    const crossDelete = await app.inject({
      method: 'DELETE', url: `/api/v1/oc/database-connections/${connB}?clientId=${clientA}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(crossDelete.statusCode).toBe(404);

    // Confirm it still genuinely exists.
    const stillThere = await service.list(clientB);
    expect(stillThere.some(c => c.id === connB)).toBe(true);

    // Real same-client delete still works.
    const sameDelete = await app.inject({
      method: 'DELETE', url: `/api/v1/oc/database-connections/${connB}?clientId=${clientB}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(sameDelete.statusCode).toBe(200);
    const goneNow = await service.list(clientB);
    expect(goneNow.some(c => c.id === connB)).toBe(false);

    await app.close();
  });

  it('test does not let Client A trigger a live connection test against Client B\'s real connection', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const service = new ClientDatabaseConnectionService();
    const clientA = await makeClient(`Connector IDOR TEST A ${randomUUID().slice(0, 8)}`);
    const clientB = await makeClient(`Connector IDOR TEST B ${randomUUID().slice(0, 8)}`);

    const created = await service.create({
      clientId: clientB, name: 'B connection', connectorType: 'postgresql',
      host: 'localhost', port: 5442, databaseName: 'comparison', username: 'comp_user',
      password: 'comp_local_pass', environment: 'development', createdBy: 'test',
    });
    if (!created.ok) throw new Error('setup failed');
    const connB = created.value.id;

    const crossTest = await app.inject({
      method: 'POST', url: `/api/v1/oc/database-connections/${connB}/test?clientId=${clientA}`,
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(crossTest.statusCode).toBe(404);

    await app.close();
  });

  it('a missing clientId is treated the same as a cross-client mismatch (404, never a silent same-client fallback)', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const service = new ClientDatabaseConnectionService();
    const clientB = await makeClient(`Connector IDOR NOID ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId: clientB, name: 'B connection', connectorType: 'postgresql',
      host: 'db-b.internal', port: 5432, databaseName: 'prod', username: 'b_user',
      password: 'b-secret', environment: 'production', createdBy: 'test',
    });
    if (!created.ok) throw new Error('setup failed');

    const noIdDelete = await app.inject({ method: 'DELETE', url: `/api/v1/oc/database-connections/${created.value.id}`, headers: { authorization: `Bearer ${admin}` } });
    expect(noIdDelete.statusCode).toBe(404);
    const stillThere = await service.list(clientB);
    expect(stillThere.some(c => c.id === created.value.id)).toBe(true);

    await app.close();
  });

  it('malformed / nonexistent connection id is a safe 404, never a 500 crash', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const clientId = await makeClient(`Connector IDOR Malformed ${randomUUID().slice(0, 8)}`);

    const res1 = await app.inject({ method: 'PATCH', url: `/api/v1/oc/database-connections/not-a-real-id`, headers: { authorization: `Bearer ${admin}` }, payload: { clientId, host: 'x' } });
    expect(res1.statusCode).toBe(404);
    const res2 = await app.inject({ method: 'DELETE', url: `/api/v1/oc/database-connections/not-a-real-id?clientId=${clientId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res2.statusCode).toBe(404);
    const res3 = await app.inject({ method: 'POST', url: `/api/v1/oc/database-connections/not-a-real-id/test?clientId=${clientId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(res3.statusCode).toBe(404);

    await app.close();
  });

  it('a genuinely deleted connection is a safe 404 on every subsequent operation', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`Connector IDOR Deleted ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'to be deleted', connectorType: 'postgresql', host: 'db.internal', port: 5432,
      databaseName: 'prod', username: 'u', password: 'p', environment: 'production', createdBy: 'test',
    });
    if (!created.ok) throw new Error('setup failed');
    const removed = await service.remove(created.value.id, clientId, 'test');
    expect(removed.ok).toBe(true);

    const afterDeletePatch = await app.inject({ method: 'PATCH', url: `/api/v1/oc/database-connections/${created.value.id}`, headers: { authorization: `Bearer ${admin}` }, payload: { clientId, host: 'x' } });
    expect(afterDeletePatch.statusCode).toBe(404);
    const afterDeleteTest = await app.inject({ method: 'POST', url: `/api/v1/oc/database-connections/${created.value.id}/test?clientId=${clientId}`, headers: { authorization: `Bearer ${admin}` } });
    expect(afterDeleteTest.statusCode).toBe(404);

    await app.close();
  });
});

describe('connector_test_1 — RBAC gaps found and fixed: connector-service.ts routes', () => {
  it('denies a customer token (403) for the 3 newly-gated connector routes', async () => {
    const app = await buildApp();
    const customer = await customerToken();
    const routes: Array<{ method: 'POST' | 'DELETE'; url: string; payload?: any }> = [
      { method: 'POST', url: '/api/v1/oc/connectors/test', payload: { provider: 'postgresql', clientId: 'client-not-mine', fields: {} } },
      { method: 'POST', url: '/api/v1/oc/connectors/save', payload: { provider: 'postgresql', clientId: 'client-not-mine', fields: {} } },
      { method: 'DELETE', url: '/api/v1/oc/connectors/some-id?clientId=client-not-mine' },
    ];
    for (const route of routes) {
      const res = await app.inject({ method: route.method, url: route.url, headers: { authorization: `Bearer ${customer}` }, payload: route.payload });
      expect(res.statusCode, `${route.method} ${route.url} should deny a customer token`).toBe(403);
    }
    await app.close();
  });

  it('denies an unauthenticated request (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/oc/connectors/test', payload: { provider: 'postgresql', clientId: 'client-not-mine', fields: {} } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('an admin token can genuinely test and save a real connector for a real client (not 403)', async () => {
    const app = await buildApp();
    const admin = await adminToken();
    const clientId = await makeClient(`Connector RBAC ${randomUUID().slice(0, 8)}`);

    const test = await app.inject({
      method: 'POST', url: '/api/v1/oc/connectors/test', headers: { authorization: `Bearer ${admin}` },
      payload: { provider: 'postgresql', clientId, fields: { host: 'localhost', port: '5442', database: 'comparison', username: 'comp_user', password: 'comp_local_pass' } },
    });
    expect(test.statusCode).toBe(200);
    // Real proof the connection genuinely reached the intended target, not
    // just that config was accepted — the real local Postgres is reachable.
    expect(test.json().status).toBe('connected');

    await app.close();
  });
});

/**
 * connector_test_1 TLS fast-follow (2026-08-24). Real, live proof — not
 * mocked — that TLS is genuinely negotiated and validated, using two real
 * local Postgres instances this repo's own docker-compose.yml provisions:
 * comparison-postgres (port 5442), which scripts/dev-tls/init-ssl.sh now
 * enables real SSL on automatically for every fresh volume (see that
 * script's own doc comment), and identity-postgres (port 5532, a sibling
 * service in this same local dev environment) which genuinely has SSL off
 * — the real "TLS required + absent" fixture, no fabrication needed.
 */
describe('connector_test_1 TLS fast-follow — real TLS negotiation and validation, not fabricated', () => {
  it('sslMode "disable" (default) behaves exactly as before — no TLS negotiated', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`TLS disable ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'disable mode', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'development',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('connected');
    expect(tested.value.lastTestSteps.some(s => s.step.startsWith('TLS Negotiated'))).toBe(false);
  });

  it('sslMode "require" against a real TLS-capable Postgres → PASS, with real, auditable proof TLS was negotiated', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`TLS require PASS ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'require mode, real TLS server', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'production',
      sslMode: 'require',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('connected');
    const tlsStep = tested.value.lastTestSteps.find(s => s.step.startsWith('TLS Negotiated'));
    expect(tlsStep?.pass).toBe(true);
    expect(tlsStep?.step).toMatch(/TLSv1/);
  });

  it('sslMode "require" against a real Postgres with SSL genuinely OFF → BLOCKED/FAILED closed, never a silent plaintext fallback', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`TLS require FAIL ${randomUUID().slice(0, 8)}`);
    // identity-postgres — a real, sibling local service with ssl=off,
    // confirmed live via `SHOW ssl;` before this suite was written.
    const created = await service.create({
      clientId, name: 'require mode, server has no TLS', connectorType: 'postgresql', host: 'localhost', port: 5532,
      databaseName: 'identity', username: 'identity_user', password: 'identity_local_pass', environment: 'production',
      sslMode: 'require',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('failed');
    expect(tested.value.lastTestError).toMatch(/TLS connection failed/i);
  });

  it('sslMode "verify-full" WITHOUT a trusted CA rejects the real server\'s self-signed certificate', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`TLS verify-full untrusted ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'verify-full, no CA provided', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'production',
      sslMode: 'verify-full',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('failed');
    expect(tested.value.lastTestError).toMatch(/TLS connection failed/i);
  });

  it('sslMode "verify-full" WITH the real trusted CA and matching hostname → PASS, real chain + hostname validation', async () => {
    const caCertificate = fs.readFileSync(DEV_TLS_CA, 'utf8');
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`TLS verify-full trusted ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'verify-full, real CA trusted', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'production',
      sslMode: 'verify-full', sslCaCertificate: caCertificate,
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('connected');
    const tlsStep = tested.value.lastTestSteps.find(s => s.step.startsWith('TLS Negotiated'));
    expect(tlsStep?.pass).toBe(true);
  });

  it('changing sslMode alone (no host/port/credential change) correctly invalidates a stale "Connected" status', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`TLS mode change invalidates ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'mode change test', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'development',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok || tested.value.status !== 'connected') throw new Error('setup test failed');

    const updated = await service.update(created.value.id, clientId, { sslMode: 'require' }, 'test');
    if (!updated.ok) throw new Error('update failed');
    expect(updated.value.status).toBe('not_tested');
  });
});

/**
 * connector_test_1 SSRF fast-follow (2026-08-24). Real, live proof through
 * the actual `ClientDatabaseConnectionService.test()` path (not just the
 * unit-level network-security-policy.test.ts) that a caller cannot use the
 * "test connection" feature as an unrestricted server-side request
 * primitive against AskABD's own infrastructure.
 */
describe('connector_test_1 SSRF fast-follow — real outbound destination policy enforced end-to-end', () => {
  it('a connection pointed at a cloud metadata address is BLOCKED before any real network attempt', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`SSRF metadata ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'metadata probe attempt', connectorType: 'postgresql', host: '169.254.169.254', port: 80,
      databaseName: 'x', username: 'x', password: 'x', environment: 'production',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('failed');
    const dnsStep = tested.value.lastTestSteps.find(s => s.step === 'DNS Resolution');
    expect(dnsStep?.pass).toBe(false);
    expect(dnsStep?.error).toMatch(/not permitted/i);
  });

  it('a connection pointed at a private RFC1918 address is BLOCKED before any real network attempt', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`SSRF private ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'private network probe attempt', connectorType: 'postgresql', host: '10.1.2.3', port: 5432,
      databaseName: 'x', username: 'x', password: 'x', environment: 'production',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('failed');
    expect(tested.value.lastTestSteps.find(s => s.step === 'DNS Resolution')?.pass).toBe(false);
  });

  it('a genuinely approved destination (the real local Postgres) is ALLOWED and reaches a real result', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`SSRF approved ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'approved destination', connectorType: 'postgresql', host: 'localhost', port: 5442,
      databaseName: 'comparison', username: 'comp_user', password: 'comp_local_pass', environment: 'development',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    if (!tested.ok) throw new Error('test failed');
    expect(tested.value.status).toBe('connected');
  });

  it('a malformed host is BLOCKED safely, never a crash', async () => {
    const service = new ClientDatabaseConnectionService();
    const clientId = await makeClient(`SSRF malformed ${randomUUID().slice(0, 8)}`);
    const created = await service.create({
      clientId, name: 'malformed host', connectorType: 'other', host: 'not a real host!!', port: 9999,
      databaseName: 'x', username: 'x', password: 'x', environment: 'production',
    });
    if (!created.ok) throw new Error('setup failed');
    const tested = await service.test(created.value.id, clientId);
    expect(tested.ok).toBe(true);
    if (tested.ok) expect(tested.value.status).toBe('failed');
  });
});
