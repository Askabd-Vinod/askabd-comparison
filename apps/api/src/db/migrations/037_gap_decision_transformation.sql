-- Gap Analysis → Decision → Transformation (2026-08-22, SDLC-completion pass).
--
-- Real gap found during a full source-level audit: GapAnalysisService and
-- DecisionTransformationService (apps/api/src/services/gap-analysis-service.ts,
-- decision-transformation-service.ts) are fully real and non-fabricated —
-- genuine parameterized queries, no Math.random, no hardcoded arrays — and are
-- fully wired through 21 real API routes (operations-center-routes.ts) with
-- real RBAC and a real UI (clients/[clientId]/gaps/page.tsx and
-- recommendations/page.tsx call these routes today). But the four tables they
-- depend on — oc_gaps, oc_gap_options, oc_decisions, oc_transformations — were
-- never created by any migration. Every one of these ~21 endpoints throws
-- "relation does not exist" against a database provisioned purely from this
-- repo's migrations. This migration adds exactly the tables the existing
-- (already-audited, already-tested-elsewhere) service code expects — no
-- service/route/UI code changes, no new architecture, no duplication of the
-- separate oc_recommendations flow (recommendation-service.ts), which already
-- self-provisions its own table and is unaffected by this migration.

-- ─── GAPS (current state vs target state) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_gaps (
  id TEXT PRIMARY KEY DEFAULT 'gap-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'other',
  category TEXT NOT NULL DEFAULT 'general',
  sub_category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  current_state TEXT,
  current_state_evidence JSONB DEFAULT '[]',
  target_state TEXT,
  target_date DATE,
  gap_description TEXT,
  business_impact TEXT,
  technical_impact TEXT,
  operational_impact TEXT,
  security_impact TEXT,
  compliance_impact TEXT,
  financial_impact TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  likelihood TEXT NOT NULL DEFAULT 'medium',
  current_maturity INTEGER NOT NULL DEFAULT 0,
  target_maturity INTEGER NOT NULL DEFAULT 3,
  root_cause TEXT,
  contributing_factors JSONB DEFAULT '[]',
  related_problem_id TEXT,
  related_finding_id TEXT,
  related_requirement_id TEXT,
  related_recommendation_id TEXT,
  dependencies JSONB DEFAULT '[]',
  evidence JSONB DEFAULT '[]',
  confidence TEXT NOT NULL DEFAULT 'medium',
  assumptions JSONB DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'identified',
  financial_estimate_id TEXT,
  effort_estimate_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_gaps_client ON oc_gaps(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_gaps_status ON oc_gaps(status);
CREATE INDEX IF NOT EXISTS idx_oc_gaps_severity ON oc_gaps(severity);
CREATE INDEX IF NOT EXISTS idx_oc_gaps_related_problem ON oc_gaps(related_problem_id);

-- ─── GAP OPTIONS (solution options considered for a gap) ───────────────────

CREATE TABLE IF NOT EXISTS oc_gap_options (
  id TEXT PRIMARY KEY DEFAULT 'opt-' || gen_random_uuid()::text,
  gap_id TEXT NOT NULL REFERENCES oc_gaps(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  solution_type TEXT NOT NULL DEFAULT 'general',
  technology TEXT,
  benefits JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  investment NUMERIC,
  annual_savings NUMERIC,
  annual_operating_cost NUMERIC,
  roi_percentage NUMERIC,
  payback_months NUMERIC,
  person_days NUMERIC,
  duration TEXT,
  team_size INTEGER,
  roles JSONB DEFAULT '[]',
  complexity TEXT NOT NULL DEFAULT 'medium',
  strategic_fit TEXT NOT NULL DEFAULT 'medium',
  confidence TEXT NOT NULL DEFAULT 'medium',
  assumptions JSONB DEFAULT '[]',
  score NUMERIC,
  selected BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_gap_options_gap ON oc_gap_options(gap_id);
CREATE INDEX IF NOT EXISTS idx_oc_gap_options_client ON oc_gap_options(client_id);

-- ─── DECISIONS (Proposed -> selected option -> approved/rejected) ──────────

CREATE TABLE IF NOT EXISTS oc_decisions (
  id TEXT PRIMARY KEY DEFAULT 'dec-' || gen_random_uuid()::text,
  gap_id TEXT NOT NULL REFERENCES oc_gaps(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  selected_option_id TEXT REFERENCES oc_gap_options(id),
  decision_maker TEXT,
  decision_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rationale TEXT,
  alternatives_considered JSONB DEFAULT '[]',
  risks_accepted JSONB DEFAULT '[]',
  assumptions JSONB DEFAULT '[]',
  evidence JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_decisions_gap ON oc_decisions(gap_id);
CREATE INDEX IF NOT EXISTS idx_oc_decisions_client ON oc_decisions(client_id);

-- ─── TRANSFORMATIONS (approved decision -> executable plan) ────────────────

CREATE TABLE IF NOT EXISTS oc_transformations (
  id TEXT PRIMARY KEY DEFAULT 'trans-' || gen_random_uuid()::text,
  gap_id TEXT REFERENCES oc_gaps(id),
  decision_id TEXT REFERENCES oc_decisions(id),
  client_id TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description TEXT,
  transformation_type TEXT NOT NULL DEFAULT 'general',
  phases JSONB DEFAULT '[]',
  tasks JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  milestones JSONB DEFAULT '[]',
  investment NUMERIC,
  expected_savings NUMERIC,
  expected_roi NUMERIC,
  person_days NUMERIC,
  duration TEXT,
  team_size INTEGER,
  roles JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  success_criteria JSONB DEFAULT '[]',
  rollback_strategy TEXT,
  expected_outcome TEXT,
  actual_outcome TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  owner TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_transformations_client ON oc_transformations(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_transformations_gap ON oc_transformations(gap_id);
CREATE INDEX IF NOT EXISTS idx_oc_transformations_status ON oc_transformations(status);
