-- AskABD Verification & Validation Automation Service (verification_service_test_1,
-- 2026-08-29 master directive). A real, reusable platform capability — a
-- registry of the platform's own real services/engines, a real orchestration
-- run history, and real per-check results — never a script or a one-off
-- dashboard over existing test output. Deliberately reuses existing engines
-- (health endpoints, RBAC rules, real DB queries) as the actual check
-- implementations rather than duplicating a second test framework.

CREATE TABLE IF NOT EXISTS oc_verification_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  criticality TEXT NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  owner TEXT,
  -- How this service's own real health/verification check is actually performed —
  -- never a hardcoded "always healthy". 'http' hits a real health endpoint;
  -- 'db_table' runs a real, bounded query against a real table; 'rbac_probe'
  -- exercises a real route with a real unauthorized token, expecting a real deny;
  -- 'manual' means no automated check exists yet — honestly disclosed, not faked.
  check_type TEXT NOT NULL DEFAULT 'manual' CHECK (check_type IN ('http', 'db_table', 'rbac_probe', 'manual')),
  check_config JSONB NOT NULL DEFAULT '{}',
  dependencies TEXT[] NOT NULL DEFAULT '{}',
  known_risks TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oc_verification_runs (
  id TEXT PRIMARY KEY DEFAULT ('vrun-' || gen_random_uuid()::text),
  scope TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'service', 'category')),
  target_service_id TEXT REFERENCES oc_verification_services(id) ON DELETE SET NULL,
  target_category TEXT,
  environment TEXT NOT NULL DEFAULT 'development',
  -- Optional — a run MAY be scoped to a real client (e.g. re-verifying after
  -- that client's own migration/deployment); null means platform-wide.
  client_id TEXT REFERENCES oc_clients(id) ON DELETE SET NULL,
  initiated_by TEXT,
  trigger TEXT NOT NULL DEFAULT 'on_demand' CHECK (trigger IN ('on_demand', 'after_deployment', 'after_migration', 'after_configuration_change', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  -- Real, computed summary counts — never hand-set; recomputed from
  -- oc_verification_checks by the service layer whenever a check completes.
  total_checks INT NOT NULL DEFAULT 0,
  passed_checks INT NOT NULL DEFAULT 0,
  failed_checks INT NOT NULL DEFAULT 0,
  warning_checks INT NOT NULL DEFAULT 0,
  blocked_checks INT NOT NULL DEFAULT 0,
  final_result TEXT CHECK (final_result IN ('GO', 'NO_GO', 'GO_WITH_RISKS', 'BLOCKED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_verification_runs_client ON oc_verification_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_verification_runs_started ON oc_verification_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS oc_verification_checks (
  id TEXT PRIMARY KEY DEFAULT ('vcheck-' || gen_random_uuid()::text),
  run_id TEXT NOT NULL REFERENCES oc_verification_runs(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES oc_verification_services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  -- The verification LEVEL this check belongs to (L1-L6 from the real
  -- directive: process/database/service/dependency/business-capability/
  -- end-to-end) — distinct from `failure_classification` below, which
  -- explains WHY a check failed, not what tier it operated at.
  level TEXT NOT NULL DEFAULT 'L2' CHECK (level IN ('L1', 'L2', 'L3', 'L4', 'L5', 'L6')),
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning', 'blocked')),
  failure_classification TEXT CHECK (failure_classification IN (
    'UI_FAILURE', 'API_FAILURE', 'AUTH_FAILURE', 'RBAC_FAILURE', 'DATABASE_FAILURE',
    'BUSINESS_LOGIC_FAILURE', 'INTEGRATION_FAILURE', 'EXTERNAL_DEPENDENCY',
    'DATA_FAILURE', 'CONFIGURATION_FAILURE', 'ENVIRONMENT_FAILURE', 'TEST_INFRASTRUCTURE_FAILURE'
  )),
  detail TEXT NOT NULL DEFAULT '',
  evidence TEXT[] NOT NULL DEFAULT '{}',
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_verification_checks_run ON oc_verification_checks(run_id);
CREATE INDEX IF NOT EXISTS idx_oc_verification_checks_service ON oc_verification_checks(service_id);
