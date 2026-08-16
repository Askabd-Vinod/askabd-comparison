-- AskABD Commercial Engagement & Proposal Management

CREATE TABLE IF NOT EXISTS oc_commercial_engagements (
  id TEXT PRIMARY KEY DEFAULT 'eng-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  engagement_number TEXT NOT NULL DEFAULT 'ENG-' || to_char(NOW(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text from 1 for 4),
  name TEXT NOT NULL,
  description TEXT,
  engagement_type TEXT NOT NULL DEFAULT 'transformation',
  status TEXT NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date DATE,
  target_end_date DATE,
  owner TEXT,
  total_investment NUMERIC(15,2),
  total_expected_value NUMERIC(15,2),
  total_effort_days NUMERIC(8,1),
  created_by TEXT DEFAULT 'admin',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_eng_client ON oc_commercial_engagements(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_eng_status ON oc_commercial_engagements(status);

CREATE TABLE IF NOT EXISTS oc_engagement_services (
  id TEXT PRIMARY KEY DEFAULT 'esvc-' || gen_random_uuid()::text,
  engagement_id TEXT NOT NULL REFERENCES oc_commercial_engagements(id),
  client_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  bundle_id TEXT,
  status TEXT NOT NULL DEFAULT 'selected',
  scope_description TEXT,
  assumptions JSONB DEFAULT '[]',
  exclusions JSONB DEFAULT '[]',
  estimated_effort NUMERIC(8,1),
  estimated_investment NUMERIC(15,2),
  expected_value NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_esvc_eng ON oc_engagement_services(engagement_id);
CREATE INDEX IF NOT EXISTS idx_oc_esvc_client ON oc_engagement_services(client_id);

CREATE TABLE IF NOT EXISTS oc_engagement_pricing (
  id TEXT PRIMARY KEY DEFAULT 'epr-' || gen_random_uuid()::text,
  engagement_id TEXT NOT NULL REFERENCES oc_commercial_engagements(id),
  subtotal NUMERIC(15,2),
  discount NUMERIC(15,2) DEFAULT 0,
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_model TEXT NOT NULL DEFAULT 'FIXED_PRICE',
  payment_terms TEXT,
  pricing_assumptions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_epr_eng ON oc_engagement_pricing(engagement_id);

CREATE TABLE IF NOT EXISTS oc_proposals (
  id TEXT PRIMARY KEY DEFAULT 'prop-' || gen_random_uuid()::text,
  engagement_id TEXT NOT NULL REFERENCES oc_commercial_engagements(id),
  client_id TEXT NOT NULL,
  proposal_number TEXT NOT NULL DEFAULT 'PROP-' || to_char(NOW(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text from 1 for 4),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  executive_summary TEXT,
  scope_summary TEXT,
  investment_summary TEXT,
  value_summary TEXT,
  assumptions JSONB DEFAULT '[]',
  exclusions JSONB DEFAULT '[]',
  payment_terms TEXT,
  valid_until DATE,
  created_by TEXT DEFAULT 'admin',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_prop_eng ON oc_proposals(engagement_id);
CREATE INDEX IF NOT EXISTS idx_oc_prop_client ON oc_proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_prop_status ON oc_proposals(status);
