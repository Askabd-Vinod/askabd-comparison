-- AskABD P1: Problem Universe + Financial Impact + Effort Foundation
-- Reusable enterprise problem discovery, decision and transformation data model.

-- ─── PROBLEM UNIVERSE ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_problems (
  id TEXT PRIMARY KEY DEFAULT 'prob-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'OTHER',
  category TEXT NOT NULL DEFAULT 'general',
  sub_category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  risk_level TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'identified',
  confidence TEXT NOT NULL DEFAULT 'medium',
  source_type TEXT NOT NULL DEFAULT 'assessment',
  source_id TEXT,
  business_impact TEXT,
  technical_impact TEXT,
  operational_impact TEXT,
  security_impact TEXT,
  compliance_impact TEXT,
  financial_impact_summary TEXT,
  affected_resources JSONB DEFAULT '[]',
  affected_applications JSONB DEFAULT '[]',
  affected_databases JSONB DEFAULT '[]',
  affected_services JSONB DEFAULT '[]',
  evidence JSONB DEFAULT '[]',
  root_cause TEXT,
  recommendation_ids JSONB DEFAULT '[]',
  financial_estimate_id TEXT,
  effort_estimate_id TEXT,
  owner TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_detected_at TIMESTAMPTZ,
  last_detected_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_problems_client ON oc_problems(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_problems_domain ON oc_problems(domain);
CREATE INDEX IF NOT EXISTS idx_oc_problems_status ON oc_problems(status);
CREATE INDEX IF NOT EXISTS idx_oc_problems_severity ON oc_problems(severity);
CREATE INDEX IF NOT EXISTS idx_oc_problems_priority ON oc_problems(priority);

-- ─── FINANCIAL ESTIMATES ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_financial_estimates (
  id TEXT PRIMARY KEY DEFAULT 'fin-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  problem_id TEXT,
  recommendation_id TEXT,
  current_cost NUMERIC(15,2),
  future_cost NUMERIC(15,2),
  implementation_cost NUMERIC(15,2),
  migration_cost NUMERIC(15,2),
  operational_cost NUMERIC(15,2),
  license_cost NUMERIC(15,2),
  infrastructure_cost NUMERIC(15,2),
  annual_savings NUMERIC(15,2),
  one_time_savings NUMERIC(15,2),
  recurring_savings NUMERIC(15,2),
  cost_of_delay NUMERIC(15,2),
  roi_percentage NUMERIC(8,2),
  payback_months NUMERIC(6,1),
  currency TEXT NOT NULL DEFAULT 'USD',
  confidence TEXT NOT NULL DEFAULT 'medium',
  calculation_method TEXT DEFAULT 'estimated',
  assumptions JSONB DEFAULT '[]',
  source TEXT DEFAULT 'system',
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_financial_client ON oc_financial_estimates(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_financial_problem ON oc_financial_estimates(problem_id);

-- ─── EFFORT ESTIMATES ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_effort_estimates (
  id TEXT PRIMARY KEY DEFAULT 'eff-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  problem_id TEXT,
  recommendation_id TEXT,
  estimated_duration TEXT,
  duration_unit TEXT DEFAULT 'days',
  person_days NUMERIC(8,1),
  team_size INTEGER,
  roles JSONB DEFAULT '[]',
  skills JSONB DEFAULT '[]',
  complexity TEXT DEFAULT 'medium',
  confidence TEXT NOT NULL DEFAULT 'medium',
  assumptions JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  estimated_start DATE,
  estimated_end DATE,
  source TEXT DEFAULT 'system',
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_effort_client ON oc_effort_estimates(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_effort_problem ON oc_effort_estimates(problem_id);
