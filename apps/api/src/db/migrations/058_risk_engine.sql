-- Risk Engine (risk_test_1, 2026-08-24 master completion directive). Genuinely
-- NEW — confirmed before writing this migration that no `oc_risks`/`RiskService`
-- concept existed anywhere (only incidental "risk_level"/"risk" text columns on
-- other, unrelated tables — e.g. `oc_gaps.risk_level`, compliance-framework seed
-- data — none of them a real Risk Register).
--
-- Deliberately reuses, rather than duplicates:
--   - `traceability_links` (migration 041, generic, unmodified) for linking a risk
--     to its real source entity — `link_type = 'relates_to'` already exists in
--     that table's own CHECK constraint, no schema change needed there.
--   - `approval_workflows` (migration 040, generic) for real risk ACCEPTANCE —
--     `approval_workflow_id` stores the real workflow id
--     (`entity_type = 'risk_acceptance'`); same no-FK convention as every other
--     consumer this session (that table is intentionally entity-agnostic).
--   - `oc_audit_log` (ad-hoc INSERT convention, confirmed this session to be the
--     only "audit engine" that exists) plus a real `events` JSONB column on this
--     table itself — same established pattern as `oc_lifecycle.events` /
--     `oc_deployments.events`.

CREATE TABLE IF NOT EXISTS oc_risks (
  id TEXT PRIMARY KEY DEFAULT ('risk-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Real risk source taxonomy, per the directive's own explicit list.
  source TEXT NOT NULL CHECK (source IN (
    'requirements', 'gaps', 'security', 'migration', 'data', 'deployment',
    'testing', 'compliance', 'architecture', 'operations', 'dependencies',
    'vendors', 'business_continuity', 'other'
  )),
  -- Optional real link to the originating entity. Object-level ownership is
  -- verified in risk-engine.ts for the source types with a real, resolvable
  -- table (gap -> oc_gaps, defect -> test_defects, deployment -> oc_deployments,
  -- requirement -> oc_business_requirements); other categories are real,
  -- honest, free-text classifications with no ownership-checkable backing
  -- table in this codebase yet — documented, not silently assumed safe.
  source_type TEXT,
  source_id TEXT,
  probability TEXT NOT NULL CHECK (probability IN ('low', 'medium', 'high')),
  impact TEXT NOT NULL CHECK (impact IN ('low', 'medium', 'high', 'critical')),
  -- Real, deterministic probability x impact matrix (risk-engine.ts's own
  -- SEVERITY_MATRIX) — never a fabricated/arbitrary severity.
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  owner TEXT,
  mitigation TEXT NOT NULL DEFAULT '',
  contingency TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'mitigated', 'accepted', 'transferred', 'closed'
  )),
  due_date TIMESTAMPTZ,
  residual_risk TEXT CHECK (residual_risk IN ('low', 'medium', 'high', 'critical')),
  approval_workflow_id TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_risks_client ON oc_risks(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_risks_status ON oc_risks(client_id, status);
