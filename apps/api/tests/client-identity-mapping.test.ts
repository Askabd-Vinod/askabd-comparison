/**
 * Client ↔ Identity-Organization mapping — the real, database-backed tenant model.
 *
 * Covers both layers:
 *  1. ClientIdentityMappingService — the resolution/create/revoke/audit primitives,
 *     against the real database (migration 024_client_identity_mapping.sql).
 *  2. The tenant-access.ts middleware wired to it — real HTTP requests through a real
 *     Fastify app, real signed JWTs, real mapping rows.
 *
 * Every fixture (client, mapping) is created with a real INSERT and deleted by exact ID
 * in afterAll/afterEach — no other client's or org's data is ever touched.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { sharedPool } from '../src/services/db-pool.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';

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
  app.get('/api/v1/oc/clients/:clientId/services', async () => ({ ok: true }));
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

const service = new ClientIdentityMappingService();
const createdClientIds: string[] = [];
const usedOrgContexts: string[] = [];

afterAll(async () => {
  for (const org of usedOrgContexts) {
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]).catch(() => {});
  }
  for (const id of createdClientIds) {
    await sharedPool.query('DELETE FROM oc_audit_log WHERE entity_type = $1 AND details::text LIKE $2', ['client_identity_mapping', `%${id}%`]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('ClientIdentityMappingService', () => {
  it('resolves an empty set for an org_context with no mappings', async () => {
    const ids = await service.resolveAuthorizedClientIds(`e2e-unmapped-org-${randomUUID()}`);
    expect(ids).toEqual([]);
  });

  it('isAuthorized is false when no mapping exists', async () => {
    const clientId = await insertClient('CIM Test Client A');
    createdClientIds.push(clientId);
    const authorized = await service.isAuthorized(`e2e-org-${randomUUID()}`, clientId);
    expect(authorized).toBe(false);
  });

  it('createMapping fails honestly for a nonexistent client (never fabricates a row)', async () => {
    const result = await service.createMapping({ clientId: 'no-such-client-ever', orgContext: 'org-x', createdBy: 'test-admin' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('client_not_found');
  });

  it('createMapping creates a real, queryable, audited row', async () => {
    const clientId = await insertClient('CIM Test Client B');
    createdClientIds.push(clientId);
    const org = `e2e-org-${randomUUID()}`;
    usedOrgContexts.push(org);

    const result = await service.createMapping({ clientId, orgContext: org, createdBy: 'test-admin-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('active');
    expect(result.value.clientId).toBe(clientId);
    expect(result.value.orgContext).toBe(org);

    const authorized = await service.isAuthorized(org, clientId);
    expect(authorized).toBe(true);
  });

  it('org_context authorization is case-insensitive (2026-08-20) — closes a real gap where two invitations to the same organization typed in different casing would otherwise silently fail to combine', async () => {
    const clientId = await insertClient('CIM Test Client Case');
    createdClientIds.push(clientId);
    const org = `E2E-Case-Org-${randomUUID()}`;
    usedOrgContexts.push(org);

    const result = await service.createMapping({ clientId, orgContext: org, createdBy: 'test-admin-case' });
    expect(result.ok).toBe(true);

    expect(await service.isAuthorized(org.toUpperCase(), clientId)).toBe(true);
    expect(await service.isAuthorized(org.toLowerCase(), clientId)).toBe(true);
    expect(await service.resolveAuthorizedClientIds(org.toUpperCase())).toContain(clientId);

    const audit = await sharedPool.query(
      `SELECT * FROM oc_audit_log WHERE entity_type = 'client_identity_mapping' AND action = 'created' AND details::text LIKE $1`,
      [`%${clientId}%`],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('one org_context can be mapped to MULTIPLE clients', async () => {
    const clientA = await insertClient('CIM Multi Client A');
    const clientB = await insertClient('CIM Multi Client B');
    createdClientIds.push(clientA, clientB);
    const org = `e2e-multi-org-${randomUUID()}`;
    usedOrgContexts.push(org);

    await service.createMapping({ clientId: clientA, orgContext: org, createdBy: 'admin' });
    await service.createMapping({ clientId: clientB, orgContext: org, createdBy: 'admin' });

    const ids = await service.resolveAuthorizedClientIds(org);
    expect(ids.sort()).toEqual([clientA, clientB].sort());
  });

  it('revoking a mapping denies subsequent access (disabled/revoked mapping)', async () => {
    const clientId = await insertClient('CIM Revoke Client');
    createdClientIds.push(clientId);
    const org = `e2e-revoke-org-${randomUUID()}`;
    usedOrgContexts.push(org);

    await service.createMapping({ clientId, orgContext: org, createdBy: 'admin' });
    expect(await service.isAuthorized(org, clientId)).toBe(true);

    const revoked = await service.revokeMapping({ clientId, orgContext: org, revokedBy: 'admin-2' });
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.value.alreadyRevoked).toBe(false);

    expect(await service.isAuthorized(org, clientId)).toBe(false);

    const audit = await sharedPool.query(
      `SELECT * FROM oc_audit_log WHERE entity_type = 'client_identity_mapping' AND action = 'revoked' AND details::text LIKE $1`,
      [`%${clientId}%`],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('revoking an already-revoked mapping is an idempotent, honestly-reported no-op', async () => {
    const clientId = await insertClient('CIM Double Revoke Client');
    createdClientIds.push(clientId);
    const org = `e2e-double-revoke-org-${randomUUID()}`;
    usedOrgContexts.push(org);

    await service.createMapping({ clientId, orgContext: org, createdBy: 'admin' });
    await service.revokeMapping({ clientId, orgContext: org, revokedBy: 'admin' });
    const second = await service.revokeMapping({ clientId, orgContext: org, revokedBy: 'admin' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.alreadyRevoked).toBe(true);
  });

  it('revoking a nonexistent mapping is a real, honest failure (not a false success)', async () => {
    const result = await service.revokeMapping({ clientId: 'no-such-client', orgContext: 'no-such-org', revokedBy: 'admin' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('mapping_not_found');
  });

  it('re-creating a previously-revoked mapping reactivates it (upsert, not a duplicate row)', async () => {
    const clientId = await insertClient('CIM Reactivate Client');
    createdClientIds.push(clientId);
    const org = `e2e-reactivate-org-${randomUUID()}`;
    usedOrgContexts.push(org);

    await service.createMapping({ clientId, orgContext: org, createdBy: 'admin' });
    await service.revokeMapping({ clientId, orgContext: org, revokedBy: 'admin' });
    expect(await service.isAuthorized(org, clientId)).toBe(false);

    const reactivated = await service.createMapping({ clientId, orgContext: org, createdBy: 'admin-3' });
    expect(reactivated.ok).toBe(true);
    expect(await service.isAuthorized(org, clientId)).toBe(true);

    const rows = await sharedPool.query('SELECT id FROM client_identity_mapping WHERE client_id = $1 AND org_context = $2', [clientId, org]);
    expect(rows.rows.length).toBe(1); // exactly one row — reactivated, not duplicated
  });
});

describe('Tenant access middleware — real mapping-backed authorization (cross-tenant isolation)', () => {
  let clientAlpha: string;
  let clientBeta: string;
  const orgAlpha = `e2e-mw-org-alpha-${randomUUID()}`;
  const orgBeta = `e2e-mw-org-beta-${randomUUID()}`;

  beforeAll(async () => {
    clientAlpha = await insertClient('CIM MW Client Alpha');
    clientBeta = await insertClient('CIM MW Client Beta');
    createdClientIds.push(clientAlpha, clientBeta);
    usedOrgContexts.push(orgAlpha, orgBeta);

    await service.createMapping({ clientId: clientAlpha, orgContext: orgAlpha, createdBy: 'admin' });
    await service.createMapping({ clientId: clientBeta, orgContext: orgBeta, createdBy: 'admin' });
  });

  it('a customer mapped to client Alpha can access client Alpha', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-alpha-1', org: orgAlpha, roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('a customer mapped to client Alpha is DENIED client Beta — even though clientBeta is a real, valid client ID (the core acceptance test)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-alpha-1', org: orgAlpha, roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientBeta}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('symmetric: a customer mapped to client Beta is DENIED client Alpha', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-beta-1', org: orgBeta, roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('an org with no mapping at all is denied every client, including a real one (unauthorized org → client access)', async () => {
    const app = await buildApp();
    const orgUnmapped = `e2e-mw-org-unmapped-${randomUUID()}`;
    const token = await signToken({ sub: 'user-unmapped', org: orgUnmapped, roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('multiple different users (different sub) sharing the same org_context all get the same, correct access', async () => {
    const app = await buildApp();
    const tokenUser1 = await signToken({ sub: 'user-alpha-A', org: orgAlpha, roles: ['customer'] });
    const tokenUser2 = await signToken({ sub: 'user-alpha-B', org: orgAlpha, roles: ['business_user'] });
    const res1 = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${tokenUser1}` } });
    const res2 = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${tokenUser2}` } });
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    // Neither user gains access to the other org's client just by having a different sub.
    const resCross1 = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientBeta}/services`, headers: { authorization: `Bearer ${tokenUser1}` } });
    const resCross2 = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientBeta}/services`, headers: { authorization: `Bearer ${tokenUser2}` } });
    expect(resCross1.statusCode).toBe(403);
    expect(resCross2.statusCode).toBe(403);
    await app.close();
  });

  it('a revoked mapping immediately denies access on the very next request (no caching lag)', async () => {
    const app = await buildApp();
    const clientTemp = await insertClient('CIM MW Revoke-Live Client');
    createdClientIds.push(clientTemp);
    const orgTemp = `e2e-mw-org-revoke-live-${randomUUID()}`;
    usedOrgContexts.push(orgTemp);
    await service.createMapping({ clientId: clientTemp, orgContext: orgTemp, createdBy: 'admin' });

    const token = await signToken({ sub: 'user-temp', org: orgTemp, roles: ['customer'] });
    const before = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientTemp}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(before.statusCode).toBe(200);

    await service.revokeMapping({ clientId: clientTemp, orgContext: orgTemp, revokedBy: 'admin' });

    const after = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientTemp}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(after.statusCode).toBe(403);
    await app.close();
  });

  it('admin/super_admin still cross ALL client boundaries unconditionally, even with no mapping at all (existing documented behavior, still tested)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-admin', org: 'some-unrelated-org', roles: ['admin'] });
    const resAlpha = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${token}` } });
    const resBeta = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientBeta}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(resAlpha.statusCode).toBe(200);
    expect(resBeta.statusCode).toBe(200);
    await app.close();
  });

  it('a client-supplied clientId cannot expand access beyond the server-resolved set — requesting an org claim of "public" (the auth middleware default for a missing org) is still denied', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'user-no-org', roles: ['customer'] }); // no `org` claim at all
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientAlpha}/services`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('/api/v1/oc/me resolves the authorized client set server-side, never trusting a request-supplied value', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
    registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
    registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
    await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
    await app.ready();

    const token = await signToken({ sub: 'user-alpha-me', org: orgAlpha, roles: ['customer'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgContext).toBe(orgAlpha);
    expect(body.authorizedClientIds).toContain(clientAlpha);
    expect(body.authorizedClientIds).not.toContain(clientBeta);
    expect(body.crossClientAccess).toBe(false);
    await app.close();
  });

  it('/api/v1/oc/me reports crossClientAccess for admin without needing any mapping row', async () => {
    const app = Fastify();
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
    registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
    registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
    await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
    await app.ready();

    const token = await signToken({ sub: 'user-admin-me', org: 'unrelated-org', roles: ['admin'] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/oc/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.crossClientAccess).toBe(true);
    await app.close();
  });
});
