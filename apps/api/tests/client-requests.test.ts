/**
 * Client Requests — real customer self-service (service/connector requests),
 * 2026-08-20 master UAT pass. Covers the service layer's real state machine
 * and its real linkage into the EXISTING service-enablement/connector models
 * on approval, plus the HTTP routes' RBAC + tenant-isolation boundary.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { sharedPool } from '../src/services/db-pool.js';
import { ClientRequestService } from '../src/services/client-request-service.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { clientRequestsRoutes } from '../src/routes/client-requests-routes.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';

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
  await app.register(clientRequestsRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

async function insertClient(name: string): Promise<string> {
  const result = await sharedPool.query<{ id: string }>(
    `INSERT INTO oc_clients (name, logo, industry, country) VALUES ($1, '', 'Technology', 'India') RETURNING id`,
    [name],
  );
  return result.rows[0]!.id;
}

const service = new ClientRequestService();
const mappingService = new ClientIdentityMappingService();
const createdClientIds: string[] = [];
const createdOrgContexts: string[] = [];

afterAll(async () => {
  for (const org of createdOrgContexts) {
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]).catch(() => {});
  }
  for (const id of createdClientIds) {
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE details::text LIKE $1`, [`%${id}%`]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_requests WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_services WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_connectors WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('ClientRequestService — real state machine', () => {
  it('creates a real request and enforces a required description', async () => {
    const clientId = await insertClient('Request Test Client A');
    createdClientIds.push(clientId);

    const missing = await service.create({ clientId, requestType: 'service', description: '', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    expect(missing.ok).toBe(false);

    const created = await service.create({ clientId, requestType: 'service', targetKey: 'cap-optimization-engine', targetLabel: 'Continuous Optimization', description: 'We need this enabled', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe('requested');
    expect(created.value.requestedBy).toBe('identity-1');

    const audit = await sharedPool.query(`SELECT * FROM oc_audit_log WHERE entity_type = 'client_request' AND action = 'client_request.created' AND entity_id = $1`, [created.value.id]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('rejects an invalid status transition (requested → completed is not allowed to skip review)', async () => {
    const clientId = await insertClient('Request Test Client B');
    createdClientIds.push(clientId);
    const created = await service.create({ clientId, requestType: 'support', description: 'Need help', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    if (!created.ok) throw new Error('setup failed');

    const result = await service.transition(created.value.id, 'completed', 'staff-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_transition');
  });

  it('a second request for the SAME (client, type, target) while one is still pending reuses the existing row — never a duplicate (Phase 8/9, 2026-08-20)', async () => {
    const clientId = await insertClient('Request Test Client Dup');
    createdClientIds.push(clientId);
    const first = await service.create({ clientId, requestType: 'service', targetKey: 'cap-dup-test', description: 'first ask', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    const second = await service.create({ clientId, requestType: 'service', targetKey: 'cap-dup-test', description: 'second ask, same target', requestedBy: 'identity-2', requestedByOrgContext: 'org-1' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);

    const rows = await sharedPool.query(`SELECT id FROM oc_client_requests WHERE client_id = $1 AND target_key = $2`, [clientId, 'cap-dup-test']);
    expect(rows.rows.length).toBe(1);
  });

  it('a NEW request for the same target IS allowed once the prior one reached a terminal state (rejected)', async () => {
    const clientId = await insertClient('Request Test Client Dup Terminal');
    createdClientIds.push(clientId);
    const first = await service.create({ clientId, requestType: 'connector', targetKey: 'conn-dup-test', description: 'first ask', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    if (!first.ok) throw new Error('setup failed');
    await service.transition(first.value.id, 'rejected', 'staff-1');

    const second = await service.create({ clientId, requestType: 'connector', targetKey: 'conn-dup-test', description: 'retry after rejection', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.id).not.toBe(first.value.id);
  });

  it('refuses a new request for a service that is already active — no pointless duplicate work', async () => {
    const clientId = await insertClient('Request Test Client Already Active');
    createdClientIds.push(clientId);
    await sharedPool.query(`INSERT INTO oc_client_services (client_id, service_id, status, enabled_at) VALUES ($1, $2, 'enabled', NOW())`, [clientId, 'cap-already-active']);

    const result = await service.create({ clientId, requestType: 'service', targetKey: 'cap-already-active', description: 'please enable', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('already_active');
  });

  it('refuses a new request for a connector that is already connected', async () => {
    const clientId = await insertClient('Request Test Client Conn Already Active');
    createdClientIds.push(clientId);
    await sharedPool.query(`INSERT INTO oc_connectors (client_id, provider, status) VALUES ($1, $2, 'connected')`, [clientId, 'already-connected-provider']);

    const result = await service.create({ clientId, requestType: 'connector', targetKey: 'already-connected-provider', description: 'please connect', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('already_active');
  });

  it('approving a SERVICE request reuses the real oc_client_services enable path — a real row, not a fabricated status', async () => {
    const clientId = await insertClient('Request Test Client C');
    createdClientIds.push(clientId);
    const created = await service.create({ clientId, requestType: 'service', targetKey: 'cap-vuln-management', description: 'Please enable vulnerability management', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    if (!created.ok) throw new Error('setup failed');

    const approved = await service.transition(created.value.id, 'approved', 'staff-1', { resolutionNotes: 'Approved — enabling now' });
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(approved.value.status).toBe('approved');

    const svcRow = await sharedPool.query(`SELECT status, enabled_by FROM oc_client_services WHERE client_id = $1 AND service_id = $2`, [clientId, 'cap-vuln-management']);
    expect(svcRow.rows.length).toBe(1);
    expect(svcRow.rows[0]!.status).toBe('enabled');
    expect(svcRow.rows[0]!.enabled_by).toBe('staff-1');
  });

  it('approving a CONNECTOR request creates a real, honestly not_configured connector row — never fabricated "connected"', async () => {
    const clientId = await insertClient('Request Test Client D');
    createdClientIds.push(clientId);
    const created = await service.create({ clientId, requestType: 'connector', targetKey: 'snowflake', targetLabel: 'Snowflake', description: 'We use Snowflake for our warehouse', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    if (!created.ok) throw new Error('setup failed');

    await service.transition(created.value.id, 'approved', 'staff-1');

    const connRow = await sharedPool.query(`SELECT status FROM oc_connectors WHERE client_id = $1 AND provider = $2`, [clientId, 'snowflake']);
    expect(connRow.rows.length).toBe(1);
    expect(connRow.rows[0]!.status).toBe('not_configured');
  });

  it('the created connector row keeps the customer\'s human-readable label as `name` — not the raw provider/target_key slug (real bug found 2026-08-21: staff Connectors page renders by name, and a free-text customer request like "Snowflake — Finance Reporting Warehouse" was silently invisible when name == the machine slug)', async () => {
    const clientId = await insertClient('Request Test Client D2');
    createdClientIds.push(clientId);
    const created = await service.create({
      clientId, requestType: 'connector', targetKey: 'snowflake-—-finance-reporting-warehouse',
      targetLabel: 'Snowflake — Finance Reporting Warehouse',
      description: 'Free-text customer request for a connector outside the standard catalog',
      requestedBy: 'identity-1', requestedByOrgContext: 'org-1',
    });
    if (!created.ok) throw new Error('setup failed');

    await service.transition(created.value.id, 'approved', 'staff-1');

    const connRow = await sharedPool.query(
      `SELECT name FROM oc_connectors WHERE client_id = $1 AND provider = $2`,
      [clientId, 'snowflake-—-finance-reporting-warehouse'],
    );
    expect(connRow.rows.length).toBe(1);
    expect(connRow.rows[0]!.name).toBe('Snowflake — Finance Reporting Warehouse');
    expect(connRow.rows[0]!.name).not.toBe('snowflake-—-finance-reporting-warehouse');
  });

  it('a request cannot be revived once rejected or completed (terminal states)', async () => {
    const clientId = await insertClient('Request Test Client E');
    createdClientIds.push(clientId);
    const created = await service.create({ clientId, requestType: 'support', description: 'x', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    if (!created.ok) throw new Error('setup failed');
    await service.transition(created.value.id, 'rejected', 'staff-1');

    const revive = await service.transition(created.value.id, 'in_progress', 'staff-1');
    expect(revive.ok).toBe(false);
  });

  describe('Incident / Change request types (added 2026-08-22 — real post-delivery operations support, reusing this same request pipeline rather than a parallel ITSM system)', () => {
    it('an incident can be created with real severity and moves directly from requested to in_progress — no fake "approval" step', async () => {
      const clientId = await insertClient('Request Test Client — Incident Urgent');
      createdClientIds.push(clientId);
      const created = await service.create({
        clientId, requestType: 'incident', description: 'Production database connection pool exhausted, customer app returning 500s.',
        requestedBy: 'identity-1', requestedByOrgContext: 'org-1', priority: 'urgent',
      });
      if (!created.ok) throw new Error('setup failed');
      expect(created.value.requestType).toBe('incident');
      expect(created.value.priority).toBe('urgent');

      const started = await service.transition(created.value.id, 'in_progress', 'staff-1');
      expect(started.ok).toBe(true);
      if (started.ok) expect(started.value.status).toBe('in_progress');
    });

    it('an incident can also go through Triage (under_review) before Start Work, and resolving sets resolvedAt', async () => {
      const clientId = await insertClient('Request Test Client — Incident Triaged');
      createdClientIds.push(clientId);
      const created = await service.create({
        clientId, requestType: 'incident', description: 'Intermittent slow queries reported by customer.',
        requestedBy: 'identity-1', requestedByOrgContext: 'org-1', priority: 'high',
      });
      if (!created.ok) throw new Error('setup failed');

      const triaged = await service.transition(created.value.id, 'under_review', 'staff-1');
      expect(triaged.ok).toBe(true);
      const working = await service.transition(created.value.id, 'in_progress', 'staff-1');
      expect(working.ok).toBe(true);
      const resolved = await service.transition(created.value.id, 'completed', 'staff-1', { resolutionNotes: 'Added missing index; verified with customer.' });
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value.status).toBe('completed');
        expect(resolved.value.resolvedAt).not.toBeNull();
        expect(resolved.value.resolutionNotes).toContain('missing index');
      }
    });

    it('a change request follows the same real request pipeline', async () => {
      const clientId = await insertClient('Request Test Client — Change');
      createdClientIds.push(clientId);
      const created = await service.create({
        clientId, requestType: 'change', description: 'Request to increase the nightly backup retention window from 7 to 30 days.',
        requestedBy: 'identity-1', requestedByOrgContext: 'org-1',
      });
      if (!created.ok) throw new Error('setup failed');
      expect(created.value.requestType).toBe('change');
      expect(created.value.status).toBe('requested');
    });

    it('REAL INTEGRITY RULE, enforced server-side (not just hidden from the UI): a service/connector request cannot skip straight to in_progress — approval is what actually creates the real record, so bypassing it would leave a request showing "in progress" while nothing was ever enabled', async () => {
      const clientId = await insertClient('Request Test Client — Integrity Guard');
      createdClientIds.push(clientId);
      const svcRequest = await service.create({
        clientId, requestType: 'service', targetKey: 'cap-cloud-security', targetLabel: 'Cloud Security Assessment',
        description: 'Need this enabled', requestedBy: 'identity-1', requestedByOrgContext: 'org-1',
      });
      if (!svcRequest.ok) throw new Error('setup failed');

      // Even though the state machine now permits requested -> in_progress in
      // general (for incidents/support), a raw call attempting it on a
      // SERVICE request must still be rejected.
      const bypass = await service.transition(svcRequest.value.id, 'in_progress', 'staff-1');
      expect(bypass.ok).toBe(false);
      if (!bypass.ok) expect(bypass.error.code).toBe('approval_required');

      // The real, correct path still works.
      const approved = await service.transition(svcRequest.value.id, 'approved', 'staff-1');
      expect(approved.ok).toBe(true);
      const started = await service.transition(svcRequest.value.id, 'in_progress', 'staff-1');
      expect(started.ok).toBe(true);

      const svcRow = await sharedPool.query(`SELECT status FROM oc_client_services WHERE client_id = $1 AND service_id = $2`, [clientId, 'cap-cloud-security']);
      expect(svcRow.rows.length).toBe(1);
      expect(svcRow.rows[0]!.status).toBe('enabled');
    });
  });

  it('the full real approval workflow: requested → under_review → approved → in_progress → completed', async () => {
    const clientId = await insertClient('Request Test Client F');
    createdClientIds.push(clientId);
    const created = await service.create({ clientId, requestType: 'support', description: 'Full lifecycle test', requestedBy: 'identity-1', requestedByOrgContext: 'org-1' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.id;

    for (const status of ['under_review', 'approved', 'in_progress', 'completed'] as const) {
      const r = await service.transition(id, status, 'staff-1');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe(status);
    }
    const final = await service.getById(id);
    expect(final?.resolvedAt).toBeTruthy();
  });
});

describe('Client Requests routes — RBAC + tenant isolation', () => {
  let clientId: string;
  const org = `req-route-org-${randomUUID()}`;
  const otherOrg = `req-route-other-org-${randomUUID()}`;

  beforeAll(async () => {
    clientId = await insertClient('Request Route Test Client');
    createdClientIds.push(clientId);
    createdOrgContexts.push(org, otherOrg);
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test-fixture' });
  });

  it('unauthenticated create is rejected (401)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/portal/${clientId}/requests`, payload: { requestType: 'service', description: 'x' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('a customer genuinely mapped to this client can create and list a real request', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'customer-1', org, roles: [] });
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/portal/${clientId}/requests`, headers: { authorization: `Bearer ${token}` }, payload: { requestType: 'service', targetKey: 'cap-app-portfolio', description: 'Please enable this' } });
    expect(create.statusCode).toBe(201);
    const body = JSON.parse(create.body);
    expect(body.request.requestedBy).toBe('customer-1');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/requests`, headers: { authorization: `Bearer ${token}` } });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body).requests.some((r: any) => r.id === body.request.id)).toBe(true);
    await app.close();
  });

  it('a customer NOT mapped to this client is denied (tenant isolation, real 403)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'customer-2', org: otherOrg, roles: [] });
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/portal/${clientId}/requests`, headers: { authorization: `Bearer ${token}` }, payload: { requestType: 'service', description: 'should be denied' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('non-admin staff cannot list/transition (403) — only Admin.Access can manage requests', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'staff-1', org: 'org-staff', roles: ['business_user'] });
    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/requests`, headers: { authorization: `Bearer ${token}` } });
    const transition = await app.inject({ method: 'POST', url: `/api/v1/oc/client-requests/req-fake/transition`, headers: { authorization: `Bearer ${token}` }, payload: { status: 'approved' } });
    expect(list.statusCode).toBe(403);
    expect(transition.statusCode).toBe(403);
    await app.close();
  });

  it('admin staff can list and transition a real request end to end', async () => {
    const app = await buildApp();
    const customerToken = await signToken({ sub: 'customer-3', org, roles: [] });
    const adminToken = await signToken({ sub: 'admin-1', org: 'org-admin', roles: ['admin'] });

    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/portal/${clientId}/requests`, headers: { authorization: `Bearer ${customerToken}` }, payload: { requestType: 'connector', targetKey: 'databricks', targetLabel: 'Databricks', description: 'We need this connector' } });
    const { request } = JSON.parse(create.body);

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/requests`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body).requests.some((r: any) => r.id === request.id)).toBe(true);

    const approve = await app.inject({ method: 'POST', url: `/api/v1/oc/client-requests/${request.id}/transition`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'approved', resolutionNotes: 'Approved via UAT test' } });
    expect(approve.statusCode).toBe(200);
    expect(JSON.parse(approve.body).request.status).toBe('approved');
    await app.close();
  });
});
