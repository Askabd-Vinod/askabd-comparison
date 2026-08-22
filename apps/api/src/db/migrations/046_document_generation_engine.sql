-- Document Generation Engine (roadmap Phase 3). Genuinely new capability —
-- confirmed by search before writing this: no document-template or
-- document-generation concept exists anywhere in this codebase. Reuses
-- the Phase 1 shared engines rather than building parallel ones:
--   - Version HISTORY of a document's content lives in entity_versions
--     (migration 039, entity_type='generated_document') — NOT a second
--     history table.
--   - Formal APPROVAL of a document (when its template requires one) is a
--     real approval_workflows row (migration 040, entity_type=
--     'generated_document') — generated_documents.status is written FROM
--     that workflow's real decision, in the same service call, never a
--     bare `approved=true` flag maintained independently.
--   - Traceability from a generated document back to the real platform
--     data it was built from uses traceability_links (migration 041) —
--     not a second traceability model.

CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY DEFAULT 'doctpl-' || gen_random_uuid()::text,
  -- Free-text, not a fixed enum — new document types can be added by
  -- inserting a new template row + registering its sections' data-source
  -- keys, without changing the generation engine's own code.
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  -- [{ key, title, dataSource, required }] — dataSource is a key into the
  -- engine's real, registered data-fetcher functions (see
  -- document-generation-engine.ts's DATA_SOURCES map). An unregistered
  -- dataSource fails generation loudly, never silently.
  sections JSONB NOT NULL DEFAULT '[]',
  approval_required BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_type, version)
);
CREATE INDEX IF NOT EXISTS idx_document_templates_type ON document_templates (document_type) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS generated_documents (
  id TEXT PRIMARY KEY DEFAULT 'doc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES document_templates(id),
  document_type TEXT NOT NULL, -- denormalized for real history even if the template later changes
  title TEXT NOT NULL,
  -- Real lifecycle. For an approval_required template, this is written
  -- FROM the linked approval_workflows row's real decision (see
  -- document-generation-engine.ts's decideApproval) — never maintained
  -- independently. For a template with no approval requirement, only
  -- draft/archived are ever used.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_review', 'changes_requested', 'approved', 'rejected', 'superseded', 'archived'
  )),
  -- The current populated content: [{ key, title, content, missingFields: [],
  -- sourceType, sourceIds: [] }] — real data pulled at generation time via
  -- the engine's registered fetchers, or an honest "INFORMATION REQUIRED"
  -- marker per section, never fabricated. Full history of every past
  -- version of this same JSONB shape lives in entity_versions, not here.
  content JSONB NOT NULL DEFAULT '[]',
  customer_visible BOOLEAN NOT NULL DEFAULT false,
  approval_workflow_id TEXT,
  -- Mirrors the real current version number already tracked by
  -- entity_versions, kept here too only so list/detail reads don't need a
  -- join for the single most common display need.
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generated_documents_client ON generated_documents (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_documents_status ON generated_documents (client_id, status);
CREATE INDEX IF NOT EXISTS idx_generated_documents_customer_visible ON generated_documents (client_id, customer_visible) WHERE customer_visible = true;
