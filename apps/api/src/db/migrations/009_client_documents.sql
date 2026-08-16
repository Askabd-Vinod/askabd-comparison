-- Client Service Documents
-- Stores document metadata for client requirement evidence.
-- Actual file content stored on filesystem (dev) or object storage (prod).

CREATE TABLE IF NOT EXISTS oc_client_service_documents (
  id TEXT PRIMARY KEY DEFAULT 'doc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  document_name TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  storage_reference TEXT NOT NULL, -- path or object key
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded, validating, valid, invalid, rejected, expired, replaced
  validation_status TEXT DEFAULT 'pending',
  required BOOLEAN NOT NULL DEFAULT true,
  expiry_date TIMESTAMPTZ,
  uploaded_by TEXT NOT NULL DEFAULT 'admin',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  replaced_by TEXT, -- points to newer version document id
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_oc_csd_client ON oc_client_service_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_csd_client_service ON oc_client_service_documents(client_id, service_id);
CREATE INDEX IF NOT EXISTS idx_oc_csd_requirement ON oc_client_service_documents(client_id, service_id, requirement_key);
CREATE INDEX IF NOT EXISTS idx_oc_csd_status ON oc_client_service_documents(status);
