-- Approved Baseline / Reusable Configuration / Environment Override /
-- Intentional Difference / Approved Exception (extends the Configuration
-- Comparison type added in migration 052 — same engine, same
-- comparison_runs table, richer classification logic, not a new engine).
--
-- Core product principle this implements literally: a difference is not
-- automatically a defect. "DIFFERENT" and "WRONG" are not the same —
-- see universal-comparison-engine.ts's classifyConfigFinding() for the
-- real, reusable decision tree (Steps 1-6) this data feeds.

CREATE TABLE IF NOT EXISTS oc_configuration_baselines (
  id TEXT PRIMARY KEY DEFAULT 'baseline-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  description TEXT NOT NULL DEFAULT '',
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  effective_date DATE,
  expiry_date DATE,
  classification TEXT NOT NULL DEFAULT 'application' CHECK (classification IN ('application', 'database', 'security', 'integration', 'infrastructure', 'other')),
  environment_scope TEXT[] NOT NULL DEFAULT '{}',
  application_scope TEXT NOT NULL DEFAULT '',
  -- Real per-key rules: { [configKey]: { approvedValue?, expectedToVaryByEnvironment?,
  --   overrides?: { [environment]: { value, reason, approvedBy, approvedAt, expiryDate? } } } }
  -- Sensitive-shaped keys are masked at render time (same regex as
  -- diffConfigs()), never stored differently — the real value here IS
  -- the approved value, needed for real comparison, but never displayed
  -- unmasked.
  rules JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, name, version)
);
CREATE INDEX IF NOT EXISTS idx_oc_configuration_baselines_client ON oc_configuration_baselines (client_id, created_at DESC);

-- Real, traceable exceptions — always references the SPECIFIC finding
-- (comparison_run_id + config_key) it covers, per the directive's own
-- "the original comparison finding must remain traceable" requirement.
-- One active exception per (run, key) — re-running the comparison
-- produces a NEW run, so an exception is scoped to the run it was
-- granted against, not silently carried forward to future runs.
CREATE TABLE IF NOT EXISTS oc_configuration_exceptions (
  id TEXT PRIMARY KEY DEFAULT 'cfgexc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  comparison_run_id TEXT NOT NULL REFERENCES comparison_runs(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  business_justification TEXT NOT NULL DEFAULT '',
  risk_acceptance TEXT NOT NULL DEFAULT '',
  owner TEXT,
  approver TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'expired', 'revoked')),
  mitigation TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  review_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comparison_run_id, config_key)
);
CREATE INDEX IF NOT EXISTS idx_oc_configuration_exceptions_run ON oc_configuration_exceptions (comparison_run_id);

-- Real baseline versioning traceability (directive Section 45) — every
-- comparison run records exactly which baseline (id + version) was
-- consulted, if any. NULL for runs that didn't use a baseline (the
-- pre-existing, still-real, baseline-agnostic match/mismatch/missing/
-- extra classification from migration 052).
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS baseline_id TEXT REFERENCES oc_configuration_baselines(id);
ALTER TABLE comparison_runs ADD COLUMN IF NOT EXISTS baseline_version TEXT;
