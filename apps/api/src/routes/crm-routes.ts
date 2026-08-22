/**
 * CRM Routes — Contacts, Notes, Tasks (migration 030/031, crm-service.ts).
 *
 * Staff routes (`/oc/clients/:clientId/...`, `/oc/contacts|notes|tasks/:id`)
 * are client-scoped (`:clientId` param, or looked up before the entity-scoped
 * ones), so tenant-access.ts's boundary applies automatically, and are
 * additionally gated Admin.Access in platform/rbac/rules.ts — full CRM
 * management (including which records are marked customer-visible) is
 * staff-only.
 *
 * Customer-portal routes (`/oc/portal/:clientId/contacts|notes|tasks`) are
 * the ONLY read path a customer session ever uses — they call
 * `listCustomerVisible*` (crm-service.ts), which filters on
 * `visibility = 'customer'` at the query level, not a client-side filter a
 * customer's own browser could bypass. Tenant-scoped the same way every
 * other `/oc/portal/:clientId/*` route already is (see
 * operations-center-routes.ts) — no explicit RBAC rule needed, matching that
 * established pattern (defaultPolicy: 'authenticated' + tenant-access.ts).
 * See docs/crm-completeness.md.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CrmService, type Visibility } from '../services/crm-service.js';
import { getAuth } from '../middleware/auth.js';

function parseVisibility(v: unknown): Visibility | undefined {
  return v === 'internal' || v === 'customer' ? v : undefined;
}

export async function crmRoutes(server: FastifyInstance): Promise<void> {
  const crm = new CrmService();

  // ─── Contacts ─────────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/contacts', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { contacts: await crm.listContacts(clientId) };
  });

  server.post('/oc/clients/:clientId/contacts', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { name?: string; email?: string; phone?: string; title?: string; roleType?: string; isPrimary?: boolean; visibility?: string };
    if (!body.name || !body.name.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'name is required' } });
    }
    const auth = getAuth(req);
    const contact = await crm.createContact(clientId, { name: body.name.trim(), email: body.email, phone: body.phone, title: body.title, roleType: body.roleType as any, isPrimary: body.isPrimary, visibility: parseVisibility(body.visibility) }, auth?.userId ?? null);
    reply.status(201).send({ contact });
  });

  server.put('/oc/contacts/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const contact = await crm.updateContact(id, req.body as any, auth?.userId ?? null);
    if (!contact) return reply.status(404).send({ error: { code: 'not_found', message: 'Contact not found' } });
    reply.send({ contact });
  });

  server.post('/oc/contacts/:id/deactivate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const contact = await crm.deactivateContact(id, auth?.userId ?? null);
    if (!contact) return reply.status(404).send({ error: { code: 'not_found', message: 'Contact not found' } });
    reply.send({ contact });
  });

  // ─── Notes ────────────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/notes', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { notes: await crm.listNotes(clientId) };
  });

  server.post('/oc/clients/:clientId/notes', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { body?: string; visibility?: string };
    if (!body.body || !body.body.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'body is required' } });
    }
    const auth = getAuth(req);
    const note = await crm.createNote(clientId, auth?.userId ?? 'unknown', body.body.trim(), parseVisibility(body.visibility) ?? 'internal');
    reply.status(201).send({ note });
  });

  server.put('/oc/notes/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { body?: string };
    if (!body.body || !body.body.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'body is required' } });
    }
    const auth = getAuth(req);
    const note = await crm.updateNote(id, body.body.trim(), auth?.userId ?? null);
    if (!note) return reply.status(404).send({ error: { code: 'not_found', message: 'Note not found' } });
    reply.send({ note });
  });

  server.post('/oc/notes/:id/archive', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const note = await crm.archiveNote(id, auth?.userId ?? null);
    if (!note) return reply.status(404).send({ error: { code: 'not_found', message: 'Note not found' } });
    reply.send({ note });
  });

  // ─── Tasks ────────────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/tasks', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { tasks: await crm.listTasks(clientId) };
  });

  server.post('/oc/clients/:clientId/tasks', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { title?: string; description?: string; assignee?: string; dueDate?: string; priority?: string; visibility?: string };
    if (!body.title || !body.title.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'title is required' } });
    }
    const auth = getAuth(req);
    const task = await crm.createTask(clientId, { title: body.title.trim(), description: body.description, assignee: body.assignee, dueDate: body.dueDate, priority: body.priority as any, visibility: parseVisibility(body.visibility) }, auth?.userId ?? null);
    reply.status(201).send({ task });
  });

  server.put('/oc/tasks/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const task = await crm.updateTask(id, req.body as any, auth?.userId ?? null);
    if (!task) return reply.status(404).send({ error: { code: 'not_found', message: 'Task not found' } });
    reply.send({ task });
  });

  server.post('/oc/tasks/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status?: string };
    const allowed = ['open', 'in_progress', 'completed', 'cancelled'];
    if (!body.status || !allowed.includes(body.status)) {
      return reply.status(400).send({ error: { code: 'invalid_status', message: `status must be one of ${allowed.join(', ')}` } });
    }
    const auth = getAuth(req);
    const task = await crm.updateTaskStatus(id, body.status as any, auth?.userId ?? null);
    if (!task) return reply.status(404).send({ error: { code: 'not_found', message: 'Task not found' } });
    reply.send({ task });
  });

  // ─── Customer-portal read paths (visibility='customer' only) ────────────
  server.get('/oc/portal/:clientId/contacts', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { contacts: await crm.listCustomerVisibleContacts(clientId) };
  });
  server.get('/oc/portal/:clientId/notes', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { notes: await crm.listCustomerVisibleNotes(clientId) };
  });
  server.get('/oc/portal/:clientId/tasks', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { tasks: await crm.listCustomerVisibleTasks(clientId) };
  });
}
