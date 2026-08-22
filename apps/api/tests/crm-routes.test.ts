/**
 * Real CRM (Contacts/Notes/Tasks) — migration 030, crm-service.ts,
 * crm-routes.ts. Proves real DB persistence, real RBAC gating (staff-only,
 * customer denied), and real tenant-access enforcement on the client-scoped
 * routes.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { crmRoutes } from '../src/routes/crm-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';
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
  await app.register(crmRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });
const customerToken = () => signToken({ sub: `customer-${randomUUID()}`, org: 'unrelated-org' });

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
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

async function makeClient(name: string) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

describe('CRM Contacts', () => {
  it('admin creates a real contact, persisted and readable', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Contact Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/contacts`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { name: 'Jane Smith', email: 'jane@example.com', roleType: 'decision_maker', isPrimary: true },
    });
    expect(create.statusCode).toBe(201);
    const contact = create.json().contact;
    expect(contact.name).toBe('Jane Smith');
    expect(contact.isPrimary).toBe(true);

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json().contacts.some((c: any) => c.id === contact.id)).toBe(true);

    await app.close();
  });

  it('a real customer token is denied creating a contact (403) — staff-only CRM data', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Contact Deny Fixture ${randomUUID().slice(0, 8)}`);
    const token = await customerToken();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/clients/${clientId}/contacts`,
      headers: { authorization: `Bearer ${token}` }, payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('unauthenticated is rejected (401)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Contact Anon Fixture ${randomUUID().slice(0, 8)}`);
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/contacts` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('deactivating a contact is real (status flips, not deleted)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Contact Deactivate Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` }, payload: { name: 'To Deactivate' } });
    const id = create.json().contact.id;

    const deactivate = await app.inject({ method: 'POST', url: `/api/v1/oc/contacts/${id}/deactivate`, headers: { authorization: `Bearer ${admin}` } });
    expect(deactivate.statusCode).toBe(200);
    expect(deactivate.json().contact.status).toBe('inactive');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` } });
    const found = list.json().contacts.find((c: any) => c.id === id);
    expect(found.status).toBe('inactive'); // still present — soft delete, not gone

    await app.close();
  });
});

describe('CRM Notes', () => {
  it('admin creates a real note; author is the real authenticated identity, never client-supplied', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Note Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'Kickoff call scheduled for next week.' } });
    expect(create.statusCode).toBe(201);
    expect(create.json().note.author).toBe('admin-1');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().notes).toHaveLength(1);
    await app.close();
  });

  it('an empty note body is rejected (400), never silently stored', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Note Empty Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: '   ' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('archiving a note removes it from the default list but not the database', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Note Archive Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'to archive' } });
    const id = create.json().note.id;

    await app.inject({ method: 'POST', url: `/api/v1/oc/notes/${id}/archive`, headers: { authorization: `Bearer ${admin}` } });
    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().notes.find((n: any) => n.id === id)).toBeUndefined();

    const raw = await sharedPool.query('SELECT archived_at FROM oc_client_notes WHERE id = $1', [id]);
    expect(raw.rows[0].archived_at).not.toBeNull();
    await app.close();
  });
});

describe('CRM Tasks', () => {
  it('admin creates a real task and transitions its status through a real state machine', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Task Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/tasks`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'Follow up on proposal', priority: 'high', dueDate: '2026-09-01' } });
    expect(create.statusCode).toBe(201);
    const task = create.json().task;
    expect(task.status).toBe('open');
    expect(task.completedAt).toBeNull();

    const complete = await app.inject({ method: 'POST', url: `/api/v1/oc/tasks/${task.id}/status`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'completed' } });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().task.status).toBe('completed');
    expect(complete.json().task.completedAt).not.toBeNull();

    await app.close();
  });

  it('an invalid status value is rejected (400)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Task Invalid Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const create = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/tasks`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'X' } });
    const id = create.json().task.id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/tasks/${id}/status`, headers: { authorization: `Bearer ${admin}` }, payload: { status: 'not-a-real-status' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('a real customer token is denied listing tasks (403)', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Task Deny Fixture ${randomUUID().slice(0, 8)}`);
    const token = await customerToken();
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/tasks`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('CRM customer visibility (migration 031)', () => {
  it('new contacts/notes/tasks default to internal visibility — never customer-visible unless staff explicitly marks them', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Visibility Default Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    const contact = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` }, payload: { name: 'Default Vis' } });
    expect(contact.json().contact.visibility).toBe('internal');

    const note = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'internal by default' } });
    expect(note.json().note.visibility).toBe('internal');

    const task = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/tasks`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'internal by default' } });
    expect(task.json().task.visibility).toBe('internal');

    await app.close();
  });

  it('the real customer-portal read routes only ever return visibility=customer records, never internal ones', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Visibility Filter Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();

    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` }, payload: { name: 'Internal Contact' } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` }, payload: { name: 'Customer-Visible Contact', visibility: 'customer' } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'internal note' } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'customer note', visibility: 'customer' } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/tasks`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'internal task' } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/tasks`, headers: { authorization: `Bearer ${admin}` }, payload: { title: 'customer task', visibility: 'customer' } });

    const contacts = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/contacts`, headers: { authorization: `Bearer ${admin}` } });
    expect(contacts.json().contacts).toHaveLength(1);
    expect(contacts.json().contacts[0].name).toBe('Customer-Visible Contact');

    const notes = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` } });
    expect(notes.json().notes).toHaveLength(1);
    expect(notes.json().notes[0].body).toBe('customer note');

    const tasks = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/tasks`, headers: { authorization: `Bearer ${admin}` } });
    expect(tasks.json().tasks).toHaveLength(1);
    expect(tasks.json().tasks[0].title).toBe('customer task');

    await app.close();
  });

  it('a real customer, genuinely mapped to this exact client, can read only the customer-visible note via the real portal route', async () => {
    const app = await buildApp();
    const clientId = await makeClient(`Visibility Tenant Fixture ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const org = `visibility-tenant-org-${randomUUID().slice(0, 8)}`;

    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'staff-only note' } });
    await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/notes`, headers: { authorization: `Bearer ${admin}` }, payload: { body: 'shared note', visibility: 'customer' } });

    const mappingService = new ClientIdentityMappingService();
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test' });

    const mappedCustomer = await signToken({ sub: `mapped-customer-${randomUUID()}`, org });
    const res = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/notes`, headers: { authorization: `Bearer ${mappedCustomer}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().notes).toHaveLength(1);
    expect(res.json().notes[0].body).toBe('shared note');

    // Symmetric proof: a DIFFERENT, unmapped org is denied entirely (tenant isolation).
    const unmappedCustomer = await signToken({ sub: `unmapped-customer-${randomUUID()}`, org: `unmapped-org-${randomUUID().slice(0, 8)}` });
    const denied = await app.inject({ method: 'GET', url: `/api/v1/oc/portal/${clientId}/notes`, headers: { authorization: `Bearer ${unmappedCustomer}` } });
    expect(denied.statusCode).toBe(403);

    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]);
    await app.close();
  });
});
