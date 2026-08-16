-- AskABD Client Service Enablement
-- Allows per-client configuration of which platform services are active.

CREATE TABLE IF NOT EXISTS oc_client_services (
  id TEXT PRIMARY KEY DEFAULT 'csvc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled',
  required BOOLEAN NOT NULL DEFAULT false,
  visible BOOLEAN NOT NULL DEFAULT true,
  configuration JSONB DEFAULT '{}',
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  enabled_by TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_client_svc_client ON oc_client_services(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_client_svc_service ON oc_client_services(service_id);
CREATE INDEX IF NOT EXISTS idx_oc_client_svc_status ON oc_client_services(status);
