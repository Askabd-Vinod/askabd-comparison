-- Deployment + Post-Deployment Validation Engine (deployment_validation_test_1 /
-- post_delivery_test_1, 2026-08-24). Genuinely NEW — confirmed before writing this
-- migration that no `oc_deployments` table, service, or route existed anywhere in
-- this codebase; the pre-existing "Deployments" UI pages read entirely fabricated
-- data from `mockClients` (see docs/enterprise-feature-gap-register.md's 2026-08-17
-- P1 finding and docs/eoc-feature-coverage-matrix.md row #52's 2026-08-24 correction).
--
-- Deliberately reuses, rather than duplicates:
--   - `test_suites` (migration 049) for post-deployment validation — a deployment's
--     `post_deployment_suite_id` points at a real `test_suites` row with
--     `category = 'post_deployment'` (already anticipated in that table's own CHECK
--     constraint, unused until this migration — same pattern as `uat_test_1`'s reuse
--     of `category = 'uat'`).
--   - `approval_workflows` (migration 040, generic) for the deployment approval
--     decision — `approval_workflow_id` stores the real workflow id
--     (`entity_type = 'deployment_approval'`); no FK since that table is
--     intentionally entity-agnostic (same as every other consumer this session).
--   - `oc_audit_log` (pre-existing, used ad-hoc via direct INSERT across this whole
--     codebase — confirmed no dedicated "AuditService" exists to reuse) for
--     durable audit rows, PLUS a real `events` JSONB column on this table itself
--     for a fast, self-contained transition history — mirrors `oc_lifecycle.events`
--     exactly (same established pattern, not a new convention).
--   - `comparison_runs` (Universal Comparison Engine) for optional before/after
--     deployment comparison — `pre_snapshot_id`/`post_snapshot_id`/
--     `comparison_run_id` reference real `config_snapshots`/`comparison_runs` rows
--     created and compared via the EXISTING, unmodified
--     `UniversalComparisonEngine.runConfigurationComparison`.

CREATE TABLE IF NOT EXISTS oc_deployments (
  id TEXT PRIMARY KEY DEFAULT ('dep-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  application TEXT NOT NULL,
  version TEXT NOT NULL,
  previous_version TEXT,
  source TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  deployment_type TEXT NOT NULL DEFAULT 'standard' CHECK (deployment_type IN (
    'standard', 'hotfix', 'emergency', 'rollback', 'config_only'
  )),
  planned_start TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_completion TIMESTAMPTZ,
  requested_by TEXT,
  -- Real, explicit state machine enforced in deployment-service.ts's own
  -- ALLOWED_TRANSITIONS table (mirrors approval-workflow-engine.ts's own
  -- pattern) — this CHECK is the real, durable backstop, not the only guard.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'planned', 'readiness_pending', 'approval_pending', 'approved',
    'in_progress', 'deployed', 'validation_pending', 'validated', 'failed',
    'rollback_pending', 'rolled_back', 'cancelled'
  )),
  risk TEXT NOT NULL DEFAULT 'medium' CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  -- A real, point-in-time snapshot of ReleaseReadinessService's own output at the
  -- moment readiness was last checked for this deployment — never re-fabricated
  -- later; a stale snapshot is honestly re-checked (blocking), never trusted forever.
  release_readiness_snapshot JSONB,
  release_readiness_checked_at TIMESTAMPTZ,
  approval_workflow_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  rollback_plan TEXT NOT NULL DEFAULT '',
  rollback_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (rollback_status IN (
    'not_applicable', 'available', 'not_available', 'rollback_pending', 'rolled_back', 'rollback_failed'
  )),
  post_deployment_suite_id TEXT REFERENCES test_suites(id) ON DELETE SET NULL,
  pre_snapshot_id TEXT,
  post_snapshot_id TEXT,
  comparison_run_id TEXT,
  -- Real, append-only transition history — same shape/pattern as
  -- oc_lifecycle.events, not a new convention.
  events JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_deployments_client ON oc_deployments(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_deployments_status ON oc_deployments(client_id, status);
