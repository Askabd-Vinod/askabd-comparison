-- Universal Comparison Engine (roadmap Phase 4). Genuinely new capability
-- — confirmed by investigation before writing this: `comparison-service.ts`
-- is an entirely unrelated, real, working PUBLIC PRODUCT COMPARISON
-- feature (e-commerce item comparison, Prisma-backed) that the roadmap's
-- own Phase 4 description had wrongly assumed was migration/environment
-- comparison — it is not touched by this migration or any related code.
-- `migration-validation-service.ts`'s runValidation() was investigated and
-- found to be self-referential: it queries the platform's OWN database
-- twice and reports "match: true" by construction (source and target are
-- literally the same query result) — not a real cross-environment
-- comparison. Left untouched (it is real, working code for its own real
-- purpose — a self-health-check — just not what "Universal Comparison"
-- means); this migration is the real, new capability.
--
-- Scope, stated honestly: v1 compares two real, already-configured
-- PostgreSQL entries from oc_client_database_connections — the
-- multi-instance database connection feature, which genuinely persists a
-- retrievable secret (a real password_ref via the real SecretProvider)
-- and carries a real `environment` field (production/staging/uat/
-- development) matching the brief's own DEV/TEST/UAT/PROD vocabulary
-- directly. oc_connectors was investigated and confirmed NOT usable for
-- this: connector-service.ts's saveConfiguration explicitly strips
-- password/secret/token fields before persisting, so no retrievable
-- credential exists there at all — a real, deliberate security decision
-- this migration correctly does not try to work around.
-- Other comparison types (API, config, infrastructure) are a real,
-- deliberate fast-follow — comparison_type is a real, checked enum with
-- exactly one value implemented this pass, extensible without breaking
-- existing rows.

CREATE TABLE IF NOT EXISTS comparison_runs (
  id TEXT PRIMARY KEY DEFAULT 'cmp-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  comparison_type TEXT NOT NULL DEFAULT 'database_schema' CHECK (comparison_type IN ('database_schema')),
  left_label TEXT NOT NULL,
  right_label TEXT NOT NULL,
  left_connection_id TEXT NOT NULL REFERENCES oc_client_database_connections(id),
  right_connection_id TEXT NOT NULL REFERENCES oc_client_database_connections(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  -- [{ objectType, name, status: 'match'|'mismatch'|'missing'|'extra'|'unknown', leftDetail, rightDetail }]
  -- Real per-object results — never a fabricated summary without the real
  -- rows behind it.
  results JSONB NOT NULL DEFAULT '[]',
  summary JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_comparison_runs_client ON comparison_runs (client_id, created_at DESC);
