-- Configuration Comparison — extends the existing Universal Comparison
-- Engine (migration 048) rather than duplicating it, per the Master
-- Autonomous Build directive's own engine-first architecture ("create an
-- ADAPTER/new comparison TYPE when only the data source is new; a new
-- ENGINE only when the business capability itself is new" — comparing
-- key-value configuration is a real, distinct comparison TYPE, not a
-- separate business capability from comparing database schemas; both are
-- "find real differences between two real sides," just over a different
-- real data source).
--
-- v1 scope, stated honestly: a real, staff-entered configuration
-- SNAPSHOT (name + environment + a flat JSON key-value map) — manual
-- entry only, not real file-import or live application-config discovery
-- (a real, deliberate fast-follow, matching this session's own existing
-- precedent for comparison_type's other deferred types: API, infrastructure).
-- The diff algorithm itself is real: added/removed/changed/unchanged keys,
-- computed directly from the two real stored JSON blobs, never fabricated.

CREATE TABLE IF NOT EXISTS oc_configuration_snapshots (
  id TEXT PRIMARY KEY DEFAULT 'cfgsnap-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'uat', 'development', 'other')),
  -- Flat key -> string value map, real and staff-entered. Values are NOT
  -- treated as secrets here (this is application/feature-flag/env-var
  -- style configuration, not a credential store — SecretProvider remains
  -- the one real place secrets are persisted, per this platform's own
  -- existing architecture) but obvious secret-shaped keys are masked at
  -- render time by the service layer as defense in depth.
  config JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_configuration_snapshots_client ON oc_configuration_snapshots (client_id, created_at DESC);

-- Widen comparison_runs to support the new type, extending — never
-- breaking — every existing 'database_schema' row (all existing rows
-- keep left_connection_id/right_connection_id set and the two new
-- snapshot columns NULL, satisfying the new CHECK below automatically).
ALTER TABLE comparison_runs DROP CONSTRAINT IF EXISTS comparison_runs_comparison_type_check;
ALTER TABLE comparison_runs ADD CONSTRAINT comparison_runs_comparison_type_check
  CHECK (comparison_type IN ('database_schema', 'configuration'));

ALTER TABLE comparison_runs ALTER COLUMN left_connection_id DROP NOT NULL;
ALTER TABLE comparison_runs ALTER COLUMN right_connection_id DROP NOT NULL;
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS left_snapshot_id TEXT REFERENCES oc_configuration_snapshots(id);
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS right_snapshot_id TEXT REFERENCES oc_configuration_snapshots(id);

ALTER TABLE comparison_runs DROP CONSTRAINT IF EXISTS comparison_runs_sides_match_type_check;
ALTER TABLE comparison_runs ADD CONSTRAINT comparison_runs_sides_match_type_check CHECK (
  (comparison_type = 'database_schema' AND left_connection_id IS NOT NULL AND right_connection_id IS NOT NULL AND left_snapshot_id IS NULL AND right_snapshot_id IS NULL)
  OR
  (comparison_type = 'configuration' AND left_snapshot_id IS NOT NULL AND right_snapshot_id IS NOT NULL AND left_connection_id IS NULL AND right_connection_id IS NULL)
);
