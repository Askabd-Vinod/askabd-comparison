-- AskABD Verification Service — Business Journey Validation (Priority 1,
-- 2026-08-29 continuation directive). A real, structured record of an
-- end-to-end business journey execution — distinct from
-- oc_verification_checks (a single technical check) because a journey has
-- real, separate preconditions/steps/API/database/security/audit results,
-- never collapsed into one pass/fail line.
CREATE TABLE IF NOT EXISTS oc_verification_journey_runs (
  id TEXT PRIMARY KEY DEFAULT ('vjourney-' || gen_random_uuid()::text),
  run_id TEXT REFERENCES oc_verification_runs(id) ON DELETE SET NULL,
  journey_id TEXT NOT NULL,
  journey_name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'development',
  -- The real, disposable client this journey created/used, if any — kept
  -- even after cleanup deletes the client row itself (ON DELETE SET NULL,
  -- never CASCADE, so the journey's own evidence survives its own cleanup).
  client_id TEXT REFERENCES oc_clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed', 'blocked')),
  preconditions JSONB NOT NULL DEFAULT '[]',
  steps JSONB NOT NULL DEFAULT '[]',
  expected_result TEXT NOT NULL DEFAULT '',
  actual_result TEXT NOT NULL DEFAULT '',
  api_result JSONB NOT NULL DEFAULT '{}',
  database_result JSONB NOT NULL DEFAULT '{}',
  security_result JSONB NOT NULL DEFAULT '{}',
  audit_result JSONB NOT NULL DEFAULT '{}',
  post_conditions JSONB NOT NULL DEFAULT '[]',
  evidence TEXT[] NOT NULL DEFAULT '{}',
  cleanup_performed BOOLEAN NOT NULL DEFAULT false,
  cleanup_evidence TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_verification_journey_runs_journey ON oc_verification_journey_runs(journey_id);
CREATE INDEX IF NOT EXISTS idx_oc_verification_journey_runs_run ON oc_verification_journey_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_oc_verification_journey_runs_started ON oc_verification_journey_runs(started_at DESC);
