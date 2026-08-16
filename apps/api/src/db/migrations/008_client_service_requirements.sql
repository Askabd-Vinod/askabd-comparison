-- Client Service Requirements
-- Stores what information each client has provided for each service stage.
-- Separates PROVIDED from VALIDATED — providing data does not mean it's valid.

CREATE TABLE IF NOT EXISTS oc_client_service_requirements (
  id TEXT PRIMARY KEY DEFAULT 'req-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  requirement_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  field_type TEXT NOT NULL DEFAULT 'text', -- text, textarea, email, number, url, select, checkbox, secret
  required BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'not_provided', -- not_provided, provided, validation_pending, valid, invalid, outdated, blocked
  value TEXT DEFAULT '',
  value_metadata JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending', -- pending, passed, failed, outdated, not_applicable
  validation_message TEXT DEFAULT '',
  evidence_reference TEXT DEFAULT '',
  security_classification TEXT DEFAULT 'internal', -- public, internal, confidential, secret
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',
  updated_by TEXT DEFAULT 'system',
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(client_id, service_id, requirement_key)
);

-- History for auditable requirement changes
CREATE TABLE IF NOT EXISTS oc_client_service_requirement_history (
  id TEXT PRIMARY KEY DEFAULT 'reqhist-' || gen_random_uuid()::text,
  requirement_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  old_status TEXT DEFAULT '',
  new_status TEXT DEFAULT '',
  changed_by TEXT NOT NULL DEFAULT 'system',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_reason TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_oc_csr_client ON oc_client_service_requirements(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_csr_client_service ON oc_client_service_requirements(client_id, service_id);
CREATE INDEX IF NOT EXISTS idx_oc_csr_status ON oc_client_service_requirements(status);
CREATE INDEX IF NOT EXISTS idx_oc_csrh_requirement ON oc_client_service_requirement_history(requirement_id);
CREATE INDEX IF NOT EXISTS idx_oc_csrh_client ON oc_client_service_requirement_history(client_id);
