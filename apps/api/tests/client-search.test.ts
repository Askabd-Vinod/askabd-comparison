/**
 * Client-scoped search (Part 3/22, 2026-08-20 master UAT pass) — real results
 * from real tables, tenant-isolated, visibility-filtered for the customer scope.
 */
import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { sharedPool } from '../src/services/db-pool.js';
import { searchClientWorkspace } from '../src/services/client-search-service.js';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
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
  await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
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

const mappingService = new ClientIdentityMappingService();
const createdClientIds: string[] = [];
const createdOrgContexts: string[] = [];

afterAll(async () => {
  for (const org of createdOrgContexts) {
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]).catch(() => {});
  }
  for (const id of createdClientIds) {
    await sharedPool.query('DELETE FROM oc_contacts WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_client_notes WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_gaps WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('searchClientWorkspace — real results, visibility-scoped', () => {
  it('finds a real gap by title (staff scope)', async () => {
    const clientId = await insertClient('Search Test Client A');
    createdClientIds.push(clientId);
    await sharedPool.query(`INSERT INTO oc_gaps (client_id, title, status, domain, category, severity) VALUES ($1, 'Unique Searchable Gap Title Xyzzy', 'open', 'application', 'process', 'medium')`, [clientId]).catch(() => {});

    const result = await searchClientWorkspace(clientId, 'Xyzzy', 'staff');
    expect(result.results.some(r => r.type === 'gap' && r.name.includes('Xyzzy'))).toBe(true);
  });

  it('customer scope NEVER sees gaps/problems/incidents (internal-only search categories)', async () => {
    const clientId = await insertClient('Search Test Client B');
    createdClientIds.push(clientId);
    await sharedPool.query(`INSERT INTO oc_gaps (client_id, title, status, domain, category, severity) VALUES ($1, 'Internal Only Gap Foobar', 'open', 'application', 'process', 'medium')`, [clientId]).catch(() => {});

    const result = await searchClientWorkspace(clientId, 'Foobar', 'customer');
    expect(result.results.length).toBe(0);
  });

  it('customer scope only sees CRM notes explicitly marked visibility=customer — never internal ones', async () => {
    const clientId = await insertClient('Search Test Client C');
    createdClientIds.push(clientId);
    await sharedPool.query(`INSERT INTO oc_client_notes (client_id, author, body, visibility) VALUES ($1, 'staff-1', 'Internal Secret Note Quux', 'internal')`, [clientId]);
    await sharedPool.query(`INSERT INTO oc_client_notes (client_id, author, body, visibility) VALUES ($1, 'staff-1', 'Shared Customer Note Quux', 'customer')`, [clientId]);

    const staffResult = await searchClientWorkspace(clientId, 'Quux', 'staff');
    const customerResult = await searchClientWorkspace(clientId, 'Quux', 'customer');

    expect(staffResult.results.filter(r => r.type === 'note').length).toBe(2);
    expect(customerResult.results.filter(r => r.type === 'note').length).toBe(1);
    expect(customerResult.results.find(r => r.type === 'note')?.name).toContain('Shared Customer Note');
  });

  it('a query under 2 characters returns no results (not an unbounded scan)', async () => {
    const clientId = await insertClient('Search Test Client D');
    createdClientIds.push(clientId);
    const result = await searchClientWorkspace(clientId, 'a', 'staff');
    expect(result.results.length).toBe(0);
  });
});

describe('Client search routes — RBAC + tenant isolation', () => {
  let clientA: string;
  let clientB: string;
  const orgA = `search-org-a-${randomUUID()}`;

  beforeAll(async () => {
    clientA = await insertClient('Search Route Client A');
    clientB = await insertClient('Search Route Client B');
    createdClientIds.push(clientA, clientB);
    createdOrgContexts.push(orgA);
    await mappingService.createMapping({ clientId: clientA, orgContext: orgA, createdBy: 'test-fixture' });
    await sharedPool.query(`INSERT INTO oc_gaps (client_id, title, status, domain, category, severity) VALUES ($1, 'Client B Confidential Gap Waldo', 'open', 'application', 'process', 'medium')`, [clientB]).catch(() => {});
  });

  it('customer A cannot search client B (tenant isolation — real 403, not empty results that could be confused with "no matches")', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'customer-a', org: orgA, roles: [] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientB}/search?q=Waldo`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('customer A CAN search their own authorized client A', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'customer-a', org: orgA, roles: [] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientA}/search?q=xx`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('staff with Admin.Access can search client B and finds the real gap', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'admin-1', org: 'org-admin', roles: ['admin'] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientB}/search?q=Waldo`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.results.some((r: any) => r.name.includes('Waldo'))).toBe(true);
    await app.close();
  });

  it('non-admin staff cannot use the staff-scoped search (403)', async () => {
    const app = await buildApp();
    const token = await signToken({ sub: 'staff-2', org: 'org-staff', roles: ['business_user'] });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientA}/search?q=xx`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
