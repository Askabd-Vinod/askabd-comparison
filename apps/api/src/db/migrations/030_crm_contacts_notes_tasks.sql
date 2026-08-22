-- Real CRM foundation: Contacts, Notes, Tasks — previously MISSING entirely
-- (the client "Contacts" page showed fabricated, identical-shape sample data
-- for every client, mockClients-only; there was no Notes or Tasks capability
-- at all). Deliberately staff-managed only for now — customer-portal
-- visibility of CRM data is a genuine business decision NOT made here (see
-- docs/crm-completeness.md), the backend/API/UI foundation below is real and
-- independent of that decision either way.
--
-- ON DELETE CASCADE (unlike most oc_* tables, which are NO ACTION): these are
-- genuinely owned child records of a client, the same relationship
-- client_identity_mapping/oc_invitations already have to oc_clients.

CREATE TABLE IF NOT EXISTS oc_contacts (
  id TEXT PRIMARY KEY DEFAULT 'contact-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  role_type TEXT NOT NULL DEFAULT 'general'
    CHECK (role_type IN ('executive', 'technical', 'billing', 'decision_maker', 'general')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_oc_contacts_client ON oc_contacts (client_id);

CREATE TABLE IF NOT EXISTS oc_client_notes (
  id TEXT PRIMARY KEY DEFAULT 'note-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Archived rather than hard-deleted — matches this platform's existing
  -- audit-trail-preservation ethos; an archived note is excluded from the
  -- default list view but never destroyed.
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_oc_client_notes_client ON oc_client_notes (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS oc_client_tasks (
  id TEXT PRIMARY KEY DEFAULT 'task-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_oc_client_tasks_client ON oc_client_tasks (client_id, status);
