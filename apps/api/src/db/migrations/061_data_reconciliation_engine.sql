-- Data Reconciliation Engine (data_reconciliation_test_1, 2026-08-24 master
-- completion directive, capability #38). Genuinely NEW — confirmed no
-- row-level reconciliation concept existed anywhere (only schema-level
-- comparison via the Universal Comparison Engine, migration 052 — a real,
-- distinct, coarser capability this engine does not duplicate: schema
-- comparison checks structure; this engine checks actual row-level data).
--
-- Real naming collision found and fixed BEFORE this migration ever ran a
-- second time: an `oc_reconciliation_runs` table already existed (migration
-- 021, real PAYMENT reconciliation — a completely different domain). The
-- first version of this file used `CREATE TABLE IF NOT EXISTS
-- oc_reconciliation_runs`, which silently no-op'd against the pre-existing
-- table instead of creating this engine's own schema — caught immediately
-- by this engine's own real tests failing with a real
-- "column does not exist" error, not discovered later. The migration's own
-- `_migrations` record was removed and this file corrected to a real,
-- non-colliding table name before being re-applied — no partial/broken
-- state was ever left applied.
CREATE TABLE IF NOT EXISTS oc_data_reconciliation_runs (
  id TEXT PRIMARY KEY DEFAULT ('drecon-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_connection_id TEXT NOT NULL,
  target_connection_id TEXT NOT NULL,
  tolerance_percent NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('completed', 'completed_with_differences', 'failed')),
  results JSONB NOT NULL DEFAULT '[]',
  summary JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_data_reconciliation_runs_client ON oc_data_reconciliation_runs(client_id);
