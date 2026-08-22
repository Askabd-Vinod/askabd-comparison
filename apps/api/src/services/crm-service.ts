/**
 * AskABD CRM Service — Contacts, Notes, Tasks.
 *
 * Real, database-backed client-relationship records (oc_contacts,
 * oc_client_notes, oc_client_tasks — migration 030). Previously the
 * "Contacts" page showed fabricated, identical-shape sample data for every
 * client; there was no Notes or Tasks capability at all.
 *
 * Customer visibility (migration 031, `docs/crm-completeness.md`): every
 * record has a real `visibility` field, `'internal'` by default — nothing is
 * ever customer-visible unless a real staff member explicitly marks it so.
 * `listCustomerVisible*` methods are the only read path the customer portal
 * uses; they filter on `visibility = 'customer'` at the query level (not a
 * client-side filter a customer's own browser could bypass).
 */
import { sharedPool } from './db-pool.js';

export type Visibility = 'internal' | 'customer';

export interface Contact {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  roleType: 'executive' | 'technical' | 'billing' | 'decision_maker' | 'general';
  isPrimary: boolean;
  status: 'active' | 'inactive';
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface ClientNote {
  id: string;
  clientId: string;
  author: string;
  body: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ClientTask {
  id: string;
  clientId: string;
  title: string;
  description: string;
  assignee: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  visibility: Visibility;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

type ContactRow = {
  id: string; client_id: string; name: string; email: string; phone: string; title: string;
  role_type: string; is_primary: boolean; status: string; visibility: string;
  created_at: Date; updated_at: Date; created_by: string | null;
};
function toContact(r: ContactRow): Contact {
  return {
    id: r.id, clientId: r.client_id, name: r.name, email: r.email, phone: r.phone, title: r.title,
    roleType: r.role_type as Contact['roleType'], isPrimary: r.is_primary, status: r.status as Contact['status'],
    visibility: r.visibility as Visibility,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), createdBy: r.created_by,
  };
}

type NoteRow = { id: string; client_id: string; author: string; body: string; visibility: string; created_at: Date; updated_at: Date; archived_at: Date | null };
function toNote(r: NoteRow): ClientNote {
  return {
    id: r.id, clientId: r.client_id, author: r.author, body: r.body, visibility: r.visibility as Visibility,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
    archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
  };
}

type TaskRow = {
  id: string; client_id: string; title: string; description: string; assignee: string | null;
  due_date: Date | null; priority: string; status: string; visibility: string; completed_at: Date | null;
  created_at: Date; updated_at: Date; created_by: string | null;
};
function toTask(r: TaskRow): ClientTask {
  return {
    id: r.id, clientId: r.client_id, title: r.title, description: r.description, assignee: r.assignee,
    dueDate: r.due_date ? r.due_date.toISOString().slice(0, 10) : null,
    priority: r.priority as ClientTask['priority'], status: r.status as ClientTask['status'],
    visibility: r.visibility as Visibility,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), createdBy: r.created_by,
  };
}

async function audit(entityType: string, entityId: string, action: string, actor: string | null, details: Record<string, unknown>): Promise<void> {
  try {
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details) VALUES ($1, $2, $3, $4, $5)`,
      [entityType, entityId, action, actor ?? 'system', JSON.stringify(details)],
    );
  } catch { /* best-effort, matches the platform-wide audit pattern — never blocks the real mutation */ }
}

export class CrmService {
  // ─── Contacts ───────────────────────────────────────────────────────────
  async listContacts(clientId: string): Promise<Contact[]> {
    const res = await sharedPool.query<ContactRow>(
      `SELECT * FROM oc_contacts WHERE client_id = $1 ORDER BY is_primary DESC, created_at ASC`, [clientId],
    );
    return res.rows.map(toContact);
  }

  /** Real customer-portal read path — only ever returns rows a staff member explicitly
   *  marked visibility='customer' AND status='active'. The caller (portal route) is
   *  additionally tenant-scoped via tenant-access.ts's :clientId boundary. */
  async listCustomerVisibleContacts(clientId: string): Promise<Contact[]> {
    const res = await sharedPool.query<ContactRow>(
      `SELECT * FROM oc_contacts WHERE client_id = $1 AND visibility = 'customer' AND status = 'active' ORDER BY is_primary DESC, created_at ASC`,
      [clientId],
    );
    return res.rows.map(toContact);
  }

  async createContact(clientId: string, input: { name: string; email?: string; phone?: string; title?: string; roleType?: Contact['roleType']; isPrimary?: boolean; visibility?: Visibility }, actorId: string | null): Promise<Contact> {
    const res = await sharedPool.query<ContactRow>(
      `INSERT INTO oc_contacts (client_id, name, email, phone, title, role_type, is_primary, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [clientId, input.name, input.email ?? '', input.phone ?? '', input.title ?? '', input.roleType ?? 'general', !!input.isPrimary, input.visibility ?? 'internal', actorId],
    );
    const contact = toContact(res.rows[0]!);
    await audit('contact', contact.id, 'contact.created', actorId, { clientId, name: contact.name, visibility: contact.visibility });
    return contact;
  }

  async updateContact(id: string, input: Partial<{ name: string; email: string; phone: string; title: string; roleType: Contact['roleType']; isPrimary: boolean; status: Contact['status']; visibility: Visibility }>, actorId: string | null): Promise<Contact | null> {
    const existing = await sharedPool.query<ContactRow>('SELECT * FROM oc_contacts WHERE id = $1', [id]);
    if (existing.rows.length === 0) return null;
    const cur = existing.rows[0]!;
    const res = await sharedPool.query<ContactRow>(
      `UPDATE oc_contacts SET name = $2, email = $3, phone = $4, title = $5, role_type = $6, is_primary = $7, status = $8, visibility = $9, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? cur.name, input.email ?? cur.email, input.phone ?? cur.phone, input.title ?? cur.title,
       input.roleType ?? cur.role_type, input.isPrimary ?? cur.is_primary, input.status ?? cur.status, input.visibility ?? cur.visibility],
    );
    const contact = toContact(res.rows[0]!);
    await audit('contact', id, 'contact.updated', actorId, { clientId: contact.clientId });
    return contact;
  }

  /** Soft delete — sets status='inactive'. Real deactivation, not a fabricated success; the
   *  row and its history remain for audit purposes rather than being hard-deleted. */
  async deactivateContact(id: string, actorId: string | null): Promise<Contact | null> {
    const res = await sharedPool.query<ContactRow>(
      `UPDATE oc_contacts SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`, [id],
    );
    if (res.rows.length === 0) return null;
    const contact = toContact(res.rows[0]!);
    await audit('contact', id, 'contact.deactivated', actorId, { clientId: contact.clientId });
    return contact;
  }

  // ─── Notes ──────────────────────────────────────────────────────────────
  async listNotes(clientId: string, includeArchived = false): Promise<ClientNote[]> {
    const res = await sharedPool.query<NoteRow>(
      includeArchived
        ? `SELECT * FROM oc_client_notes WHERE client_id = $1 ORDER BY created_at DESC`
        : `SELECT * FROM oc_client_notes WHERE client_id = $1 AND archived_at IS NULL ORDER BY created_at DESC`,
      [clientId],
    );
    return res.rows.map(toNote);
  }

  /** Real customer-portal read path — see listCustomerVisibleContacts's doc comment. */
  async listCustomerVisibleNotes(clientId: string): Promise<ClientNote[]> {
    const res = await sharedPool.query<NoteRow>(
      `SELECT * FROM oc_client_notes WHERE client_id = $1 AND visibility = 'customer' AND archived_at IS NULL ORDER BY created_at DESC`,
      [clientId],
    );
    return res.rows.map(toNote);
  }

  async createNote(clientId: string, author: string, body: string, visibility: Visibility = 'internal'): Promise<ClientNote> {
    const res = await sharedPool.query<NoteRow>(
      `INSERT INTO oc_client_notes (client_id, author, body, visibility) VALUES ($1, $2, $3, $4) RETURNING *`,
      [clientId, author, body, visibility],
    );
    const note = toNote(res.rows[0]!);
    await audit('note', note.id, 'note.created', author, { clientId, visibility });
    return note;
  }

  async updateNote(id: string, body: string, actorId: string | null): Promise<ClientNote | null> {
    const res = await sharedPool.query<NoteRow>(
      `UPDATE oc_client_notes SET body = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, body],
    );
    if (res.rows.length === 0) return null;
    const note = toNote(res.rows[0]!);
    await audit('note', id, 'note.updated', actorId, { clientId: note.clientId });
    return note;
  }

  async archiveNote(id: string, actorId: string | null): Promise<ClientNote | null> {
    const res = await sharedPool.query<NoteRow>(
      `UPDATE oc_client_notes SET archived_at = NOW() WHERE id = $1 RETURNING *`, [id],
    );
    if (res.rows.length === 0) return null;
    const note = toNote(res.rows[0]!);
    await audit('note', id, 'note.archived', actorId, { clientId: note.clientId });
    return note;
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────
  async listTasks(clientId: string): Promise<ClientTask[]> {
    const res = await sharedPool.query<TaskRow>(
      `SELECT * FROM oc_client_tasks WHERE client_id = $1
       ORDER BY (status = 'completed' OR status = 'cancelled') ASC, due_date ASC NULLS LAST, created_at DESC`,
      [clientId],
    );
    return res.rows.map(toTask);
  }

  /** Real customer-portal read path — see listCustomerVisibleContacts's doc comment. */
  async listCustomerVisibleTasks(clientId: string): Promise<ClientTask[]> {
    const res = await sharedPool.query<TaskRow>(
      `SELECT * FROM oc_client_tasks WHERE client_id = $1 AND visibility = 'customer'
       ORDER BY (status = 'completed' OR status = 'cancelled') ASC, due_date ASC NULLS LAST, created_at DESC`,
      [clientId],
    );
    return res.rows.map(toTask);
  }

  async createTask(clientId: string, input: { title: string; description?: string; assignee?: string; dueDate?: string; priority?: ClientTask['priority']; visibility?: Visibility }, actorId: string | null): Promise<ClientTask> {
    const res = await sharedPool.query<TaskRow>(
      `INSERT INTO oc_client_tasks (client_id, title, description, assignee, due_date, priority, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [clientId, input.title, input.description ?? '', input.assignee ?? null, input.dueDate ?? null, input.priority ?? 'medium', input.visibility ?? 'internal', actorId],
    );
    const task = toTask(res.rows[0]!);
    await audit('task', task.id, 'task.created', actorId, { clientId, title: task.title, visibility: task.visibility });
    return task;
  }

  async updateTaskStatus(id: string, status: ClientTask['status'], actorId: string | null): Promise<ClientTask | null> {
    const res = await sharedPool.query<TaskRow>(
      `UPDATE oc_client_tasks SET status = $2, completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status],
    );
    if (res.rows.length === 0) return null;
    const task = toTask(res.rows[0]!);
    await audit('task', id, 'task.status_changed', actorId, { clientId: task.clientId, status });
    return task;
  }

  async updateTask(id: string, input: Partial<{ title: string; description: string; assignee: string | null; dueDate: string | null; priority: ClientTask['priority']; visibility: Visibility }>, actorId: string | null): Promise<ClientTask | null> {
    const existing = await sharedPool.query<TaskRow>('SELECT * FROM oc_client_tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) return null;
    const cur = existing.rows[0]!;
    const res = await sharedPool.query<TaskRow>(
      `UPDATE oc_client_tasks SET title = $2, description = $3, assignee = $4, due_date = $5, priority = $6, visibility = $7, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, input.title ?? cur.title, input.description ?? cur.description,
       input.assignee !== undefined ? input.assignee : cur.assignee,
       input.dueDate !== undefined ? input.dueDate : cur.due_date, input.priority ?? cur.priority, input.visibility ?? cur.visibility],
    );
    const task = toTask(res.rows[0]!);
    await audit('task', id, 'task.updated', actorId, { clientId: task.clientId });
    return task;
  }
}
