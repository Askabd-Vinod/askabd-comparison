-- AskABD Payment Methods, Financial Transactions & Reconciliation
-- Supports provider-agnostic payment method management and financial reconciliation.
-- NEVER stores: full PAN, CVV, PIN, banking passwords, provider secrets.

-- ─── PAYMENT METHODS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_payment_methods (
  id TEXT PRIMARY KEY DEFAULT 'pm-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  engagement_id TEXT,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_payment_method_id TEXT,
  type TEXT NOT NULL DEFAULT 'bank_transfer',
  brand TEXT,
  last4 TEXT,
  expiry_month INTEGER,
  expiry_year INTEGER,
  display_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  is_default BOOLEAN NOT NULL DEFAULT false,
  billing_name TEXT,
  billing_country TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_pm_client ON oc_payment_methods(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_pm_status ON oc_payment_methods(status);
CREATE INDEX IF NOT EXISTS idx_oc_pm_engagement ON oc_payment_methods(engagement_id);

-- ─── FINANCIAL TRANSACTIONS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_financial_transactions (
  id TEXT PRIMARY KEY DEFAULT 'txn-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  engagement_id TEXT,
  proposal_id TEXT,
  payment_method_id TEXT,
  external_transaction_id TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'payment',
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settlement_date TIMESTAMPTZ,
  provider TEXT,
  reference TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_txn_client ON oc_financial_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_txn_engagement ON oc_financial_transactions(engagement_id);
CREATE INDEX IF NOT EXISTS idx_oc_txn_status ON oc_financial_transactions(status);
CREATE INDEX IF NOT EXISTS idx_oc_txn_external ON oc_financial_transactions(external_transaction_id);
CREATE INDEX IF NOT EXISTS idx_oc_txn_date ON oc_financial_transactions(transaction_date);

-- ─── RECONCILIATION RUNS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_reconciliation_runs (
  id TEXT PRIMARY KEY DEFAULT 'recon-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  matched INTEGER DEFAULT 0,
  unmatched INTEGER DEFAULT 0,
  exceptions INTEGER DEFAULT 0,
  total_expected NUMERIC(15,2) DEFAULT 0,
  total_actual NUMERIC(15,2) DEFAULT 0,
  variance NUMERIC(15,2) DEFAULT 0,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_recon_client ON oc_reconciliation_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_recon_status ON oc_reconciliation_runs(status);

-- ─── RECONCILIATION ITEMS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_reconciliation_items (
  id TEXT PRIMARY KEY DEFAULT 'ri-' || gen_random_uuid()::text,
  run_id TEXT NOT NULL REFERENCES oc_reconciliation_runs(id),
  client_id TEXT NOT NULL,
  transaction_id TEXT,
  external_reference TEXT,
  expected_amount NUMERIC(15,2),
  actual_amount NUMERIC(15,2),
  variance NUMERIC(15,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  match_status TEXT NOT NULL DEFAULT 'pending',
  match_reason TEXT,
  confidence NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_ri_run ON oc_reconciliation_items(run_id);
CREATE INDEX IF NOT EXISTS idx_oc_ri_client ON oc_reconciliation_items(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_ri_status ON oc_reconciliation_items(match_status);

-- ─── RECONCILIATION EXCEPTIONS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oc_reconciliation_exceptions (
  id TEXT PRIMARY KEY DEFAULT 'rex-' || gen_random_uuid()::text,
  run_id TEXT NOT NULL REFERENCES oc_reconciliation_runs(id),
  item_id TEXT REFERENCES oc_reconciliation_items(id),
  client_id TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  description TEXT,
  expected_amount NUMERIC(15,2),
  actual_amount NUMERIC(15,2),
  variance NUMERIC(15,2),
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_rex_client ON oc_reconciliation_exceptions(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_rex_status ON oc_reconciliation_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_oc_rex_run ON oc_reconciliation_exceptions(run_id);


-- ─── REGISTER NEW CAPABILITIES ───────────────────────────────────────────────

INSERT INTO oc_capabilities (id, name, description, category, domain, business_problem, business_value, maturity, status, dependencies, related_services, related_apis, known_gaps, evidence, limitations, roadmap_phase, priority, owner, external_dependencies)
VALUES
('cap-payment-methods', 'Financial Payment Methods', 'Provider-agnostic payment method management for commercial engagements', 'commercial', 'financial', 'No structured payment method management for client engagements', 'Configurable payment methods with provider abstraction and security', 2, 'operational', '["cap-client-onboarding","cap-audit-trail"]', '["payment-method-service"]', '["/oc/clients/:clientId/payment-methods"]', '["No real provider integration yet — mock/manual only"]', '["Client isolation verified","Audit trail active","No sensitive data stored"]', '["Provider abstraction ready for Stripe/Adyen/PayPal"]', 'current', 'high', 'platform-team', '["Payment provider (Stripe/Adyen) for production"]'),

('cap-financial-reconciliation', 'Financial Reconciliation', 'Compare expected vs actual financial transactions with exception management', 'commercial', 'financial', 'No way to verify if actual payments match expected commercial values', 'Deterministic reconciliation identifies variances, underpayments, and exceptions', 2, 'operational', '["cap-payment-methods","cap-audit-trail"]', '["financial-reconciliation-service"]', '["/oc/clients/:clientId/reconciliation", "/oc/clients/:clientId/transactions"]', '["No external provider import yet — manual transaction entry"]', '["Reconciliation engine verified","Exception lifecycle active","Scheduler integration ready"]', '["External transaction import via webhook","Provider auto-reconciliation"]', 'current', 'high', 'platform-team', '["External transaction source for production"]'),

('cap-financial-transactions', 'Financial Transactions', 'Transaction ledger for engagement payments, invoices, and credits', 'commercial', 'financial', 'No transaction history for commercial engagements', 'Complete transaction ledger with idempotency and provider support', 2, 'operational', '["cap-payment-methods"]', '["financial-reconciliation-service"]', '["/oc/clients/:clientId/transactions"]', '["No real money movement — ledger only"]', '["Idempotent by external_transaction_id","Client-scoped","Audited"]', '["Webhook-based transaction capture","Settlement tracking"]', 'current', 'medium', 'platform-team', '["Payment provider for real transactions"]')

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
  domain = EXCLUDED.domain, business_problem = EXCLUDED.business_problem, business_value = EXCLUDED.business_value,
  maturity = EXCLUDED.maturity, status = EXCLUDED.status, dependencies = EXCLUDED.dependencies,
  related_services = EXCLUDED.related_services, related_apis = EXCLUDED.related_apis,
  known_gaps = EXCLUDED.known_gaps, evidence = EXCLUDED.evidence, limitations = EXCLUDED.limitations,
  roadmap_phase = EXCLUDED.roadmap_phase, priority = EXCLUDED.priority, owner = EXCLUDED.owner,
  external_dependencies = EXCLUDED.external_dependencies, updated_at = NOW();

-- ─── SCHEDULER JOB ───────────────────────────────────────────────────────────

INSERT INTO oc_scheduled_jobs (id, job_type, name, description, frequency, status, enabled)
VALUES ('job-financial-recon', 'FINANCIAL_RECONCILIATION', 'Financial Reconciliation', 'Daily reconciliation of financial transactions against expected values', 'daily', 'idle', true)
ON CONFLICT (id) DO NOTHING;
