-- Connector Configurations & Validation History
-- Stores connector state, validation results, and discovery output

-- Connector configurations (secrets stored encrypted, never in plaintext)
CREATE TABLE IF NOT EXISTS oc_connectors (
  id TEXT PRIMARY KEY DEFAULT 'conn-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- postgresql, aws, azure, github, kubernetes, etc.
  status TEXT NOT NULL DEFAULT 'not_configured', -- not_configured, configured, testing, connected, failed, expired, disabled
  security_level TEXT NOT NULL DEFAULT 'read-only', -- read-only, read-write, admin
  configuration JSONB NOT NULL DEFAULT '{}', -- non-secret fields only
  last_tested_at TIMESTAMPTZ,
  last_test_duration_ms INTEGER,
  last_test_mode TEXT DEFAULT 'real', -- real, demo
  validation_steps JSONB DEFAULT '[]', -- [{step, pass, durationMs, error}]
  error_message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, provider)
);

-- Connection test history (audit trail of all test attempts)
CREATE TABLE IF NOT EXISTS oc_connection_tests (
  id TEXT PRIMARY KEY DEFAULT 'ctest-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL, -- connected, failed, partial
  mode TEXT NOT NULL DEFAULT 'real',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  steps JSONB NOT NULL DEFAULT '[]',
  error_message TEXT DEFAULT '',
  correlation_id TEXT DEFAULT '',
  tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discovery runs
CREATE TABLE IF NOT EXISTS oc_discovery_runs (
  id TEXT PRIMARY KEY DEFAULT 'disc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, running, completed, failed
  connectors_used TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  resources_found INTEGER DEFAULT 0,
  warnings INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  results JSONB DEFAULT '{}', -- full discovery output
  evidence TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assessment results
CREATE TABLE IF NOT EXISTS oc_assessments (
  id TEXT PRIMARY KEY DEFAULT 'assess-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  discovery_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  risk_score INTEGER DEFAULT 0,
  complexity_score INTEGER DEFAULT 0,
  findings JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  evidence TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Client lifecycle state (server-side source of truth)
CREATE TABLE IF NOT EXISTS oc_lifecycle (
  client_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'organization-created',
  previous_status TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  verification_expiry TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_connectors_client ON oc_connectors(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_connectors_status ON oc_connectors(status);
CREATE INDEX IF NOT EXISTS idx_oc_connection_tests_client ON oc_connection_tests(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_discovery_runs_client ON oc_discovery_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_assessments_client ON oc_assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_lifecycle_status ON oc_lifecycle(status);
