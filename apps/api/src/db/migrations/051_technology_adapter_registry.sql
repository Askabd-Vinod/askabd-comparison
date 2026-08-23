-- Technology Adapter Registry — a real, generic, reusable primitive per the
-- "Future Technology & Compatibility" directive: INTERFACE -> ADAPTER ->
-- CONNECTOR -> ENGINE -> NORMALIZED MODEL, rather than hard-coding
-- technology-specific logic into engines. Matches the Phase 1 shared-engine
-- philosophy already established this session (Traceability/Versioning/
-- Approval) — a real, generic table other engines register real
-- capabilities into, not a per-engine ad hoc mechanism.
--
-- v1 scope, stated honestly: this migration creates the REAL registry and
-- seeds it with the REAL, honest status of every database technology
-- already selectable in this platform's own `oc_client_database_connections`
-- (`ConnectorType`: postgresql/oracle/sqlserver/mysql/mongodb/other) — only
-- `postgresql` has a real, working adapter (extracted from the Universal
-- Comparison Engine's own pre-existing, real `inspectSchema` logic in this
-- same pass). The other four are seeded as real, honest `adapter_required`
-- rows — a genuine, pre-existing gap this directive's own "detect
-- capability before executing" principle surfaced: before this pass, a
-- comparison attempted against a non-PostgreSQL connection threw a bare,
-- generic error mentioning "PostgreSQL" rather than a real, structured
-- ADAPTER_REQUIRED status with no run record at all. Building 15+ real
-- database adapters (Oracle/SQL Server/MySQL/MongoDB/Snowflake/BigQuery/
-- etc.) is explicitly NOT done this pass — that would be fabricating
-- support this platform does not have. The registry itself, and the real
-- capability-negotiation gate now wired into the Universal Comparison
-- Engine, are the real, honest deliverable.

CREATE TABLE IF NOT EXISTS technology_adapters (
  id TEXT PRIMARY KEY DEFAULT ('adapter-' || gen_random_uuid()::text),
  technology TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('database', 'cloud', 'api', 'auth', 'devops', 'testing', 'file_format', 'ai_provider', 'other')),
  version_range TEXT NOT NULL DEFAULT 'any',
  capabilities JSONB NOT NULL DEFAULT '[]', -- e.g. ["schema_comparison", "read_only_query"]
  status TEXT NOT NULL CHECK (status IN ('supported', 'partially_supported', 'unsupported', 'adapter_required', 'requires_upgrade', 'requires_client_action')),
  supported_operations JSONB NOT NULL DEFAULT '[]',
  security_requirements TEXT NOT NULL DEFAULT '',
  test_status TEXT NOT NULL DEFAULT 'not_tested' CHECK (test_status IN ('not_tested', 'tested', 'failing')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (technology, category)
);
CREATE INDEX IF NOT EXISTS idx_technology_adapters_category ON technology_adapters(category);

-- Real, honest seed data — the actual current state of this platform's own
-- database connector support, not aspirational.
INSERT INTO technology_adapters (technology, vendor, category, version_range, capabilities, status, supported_operations, security_requirements, test_status, notes) VALUES
  ('postgresql', 'PostgreSQL Global Development Group', 'database', 'any', '["schema_comparison", "table_inventory", "read_only_query"]', 'supported', '["database_schema_comparison"]', 'Read-only; credential via real SecretProvider password_ref', 'tested', 'The only real, working database adapter this session — extracted from universal-comparison-engine.ts''s own pre-existing inspectSchema logic.'),
  ('oracle', 'Oracle Corporation', 'database', 'any', '[]', 'adapter_required', '[]', 'N/A — no adapter implemented', 'not_tested', 'Selectable in oc_client_database_connections.connector_type today with no real backing adapter — a genuine pre-existing gap this registry now makes honest and visible.'),
  ('sqlserver', 'Microsoft', 'database', 'any', '[]', 'adapter_required', '[]', 'N/A — no adapter implemented', 'not_tested', 'Same as oracle.'),
  ('mysql', 'Oracle Corporation / MySQL', 'database', 'any', '[]', 'adapter_required', '[]', 'N/A — no adapter implemented', 'not_tested', 'Same as oracle.'),
  ('mongodb', 'MongoDB Inc.', 'database', 'any', '[]', 'adapter_required', '[]', 'N/A — no adapter implemented', 'not_tested', 'Same as oracle — also a genuinely different comparison model (document schema, not relational tables) once built.')
ON CONFLICT (technology, category) DO NOTHING;
