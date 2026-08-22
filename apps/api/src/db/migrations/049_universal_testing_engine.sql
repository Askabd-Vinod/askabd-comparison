-- Universal Testing & Validation Engine — a real, reusable QA platform,
-- explicitly requested as NOT "a simple collection of unit tests." Full
-- spec: Requirement -> Acceptance Criteria -> Test Scenario -> Test Case ->
-- Test Data -> Environment -> Execution -> Evidence -> PASS/FAIL/BLOCKED/
-- NOT_EXECUTED -> Defect -> Retest -> Regression -> Final Validation ->
-- Report.
--
-- v1 scope, stated honestly (see docs/enterprise-operations-progress.md
-- for the full architecture write-up): real test-case model, real
-- rule-based (never AI-fabricated) generation from business requirements,
-- gaps, and discovery extractions with mandatory reason + Traceability
-- Engine linkage; real execution recording (never a fabricated PASS —
-- evidence is required); real defect creation on FAIL with a real,
-- enforced retest workflow; real requirement-coverage aggregation; a real
-- HTML/Markdown report (matching Document Generation Engine's own
-- PDF-not-built-yet precedent — DOCX/PDF binary export is a real,
-- deliberate fast-follow, never fabricated); a real, working default
-- report adapter plus an architecture-only stub for named external tools
-- (TestRail/Jira/Azure DevOps) with no live credentials wired up this
-- pass. Automated Playwright execution against arbitrary client
-- environments, live cross-browser/device matrix execution, a real
-- physical device farm, and video/trace evidence capture are NOT built
-- this pass — the data model has real fields to RECORD that evidence
-- once a caller (human or a future automation pass) supplies it, but this
-- engine does not fabricate having executed them.
--
-- A real, deliberate decision, matching this session's own "Evidence
-- engine audit" precedent (Phase 1): `oc_defects` (defect-detection-
-- service.ts) is a genuinely different, existing concept — auto-detected,
-- fingerprinted, occurrence-counted OPERATIONAL/production defects with
-- its own status vocabulary (detected/acknowledged/investigating/
-- mitigating/resolved/verified/closed). A QA test-execution-failure
-- defect is tied to one specific test case and execution, needs a real
-- enforced retest state machine, and has a genuinely different status
-- vocabulary (per this engine's own spec) — forcing it into oc_defects
-- would strip that real, working table's own model down or bloat it with
-- fields only this engine uses. `test_defects` is therefore a new,
-- separate table, not a reuse.

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY DEFAULT ('tc-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('business_requirement', 'gap', 'discovery_extraction', 'manual')),
  source_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  preconditions TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  test_data TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL DEFAULT '[]',
  expected_result TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN (
    'positive', 'negative', 'boundary', 'validation', 'permission', 'security',
    'integration', 'regression', 'error_handling', 'data_validation',
    'performance', 'accessibility', 'cross_browser', 'cross_device'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source TEXT NOT NULL CHECK (source IN ('generated', 'manual')),
  generation_reason TEXT NOT NULL DEFAULT '', -- required, real, non-fabricated reason — "never blindly generate meaningless tests"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deprecated')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_cases_client ON test_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_source ON test_cases(source_type, source_id);

CREATE TABLE IF NOT EXISTS test_suites (
  id TEXT PRIMARY KEY DEFAULT ('tsu-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'smoke', 'sanity', 'functional', 'integration', 'regression', 'security',
    'performance', 'uat', 'release', 'migration', 'post_deployment'
  )),
  description TEXT NOT NULL DEFAULT '',
  test_case_ids TEXT[] NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_suites_client ON test_suites(client_id);

CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY DEFAULT ('tr-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  suite_id TEXT REFERENCES test_suites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  triggered_by TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_test_runs_client ON test_runs(client_id);

CREATE TABLE IF NOT EXISTS test_executions (
  id TEXT PRIMARY KEY DEFAULT ('tex-' || gen_random_uuid()::text),
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES test_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'blocked', 'skipped', 'not_executed', 'not_applicable')),
  environment TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  actual_result TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '[]', -- [{type, description, reference}] — screenshot/video/console_log/network_log/api_response/database_evidence/note
  executed_by TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  defect_id TEXT, -- FK added below, after test_defects exists
  retest_of_execution_id TEXT REFERENCES test_executions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_executions_case ON test_executions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_executions_client ON test_executions(client_id);
CREATE INDEX IF NOT EXISTS idx_test_executions_run ON test_executions(run_id);

CREATE TABLE IF NOT EXISTS test_defects (
  id TEXT PRIMARY KEY DEFAULT ('tdf-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  requirement_source_type TEXT,
  requirement_source_id TEXT,
  environment TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  steps_to_reproduce TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  actual_result TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'fixed', 'ready_for_retest', 'retest_failed',
    'retest_passed', 'closed', 'wont_fix', 'duplicate'
  )),
  assigned_owner TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_defects_client ON test_defects(client_id);
CREATE INDEX IF NOT EXISTS idx_test_defects_case ON test_defects(test_case_id);

ALTER TABLE test_executions ADD CONSTRAINT fk_test_executions_defect
  FOREIGN KEY (defect_id) REFERENCES test_defects(id) ON DELETE SET NULL;
