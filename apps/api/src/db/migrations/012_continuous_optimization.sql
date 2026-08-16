-- AskABD Continuous Optimization Foundation
-- Supports: metric definitions, baselines, measurements, rules, findings, outcomes
-- Domain-agnostic: cloud, on-premise, hybrid, databases, infrastructure, business processes

-- ─── METRIC DEFINITIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_metric_definitions (
  id TEXT PRIMARY KEY DEFAULT 'met-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  transformation_id TEXT,
  domain TEXT NOT NULL DEFAULT 'general',
  category TEXT NOT NULL DEFAULT 'performance',
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'count',
  direction TEXT NOT NULL DEFAULT 'lower_is_better',
  data_type TEXT NOT NULL DEFAULT 'numeric',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_config JSONB DEFAULT '{}',
  threshold_warning NUMERIC(15,4),
  threshold_critical NUMERIC(15,4),
  target_value NUMERIC(15,4),
  measurement_frequency TEXT DEFAULT 'daily',
  enabled BOOLEAN NOT NULL DEFAULT true,
  tags JSONB DEFAULT '[]',
  owner TEXT,
  last_measured_at TIMESTAMPTZ,
  next_measurement_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_metrics_client ON oc_metric_definitions(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_metrics_tfm ON oc_metric_definitions(transformation_id);
CREATE INDEX IF NOT EXISTS idx_oc_metrics_domain ON oc_metric_definitions(domain);
CREATE INDEX IF NOT EXISTS idx_oc_metrics_enabled ON oc_metric_definitions(enabled);

-- ─── BASELINES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_baselines (
  id TEXT PRIMARY KEY DEFAULT 'bsl-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  metric_id TEXT NOT NULL REFERENCES oc_metric_definitions(id),
  transformation_id TEXT,
  value NUMERIC(15,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  capture_method TEXT NOT NULL DEFAULT 'manual',
  confidence TEXT NOT NULL DEFAULT 'medium',
  evidence JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_baselines_client ON oc_baselines(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_baselines_metric ON oc_baselines(metric_id);
CREATE INDEX IF NOT EXISTS idx_oc_baselines_tfm ON oc_baselines(transformation_id);

-- ─── MEASUREMENTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_measurements (
  id TEXT PRIMARY KEY DEFAULT 'msr-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  metric_id TEXT NOT NULL REFERENCES oc_metric_definitions(id),
  transformation_id TEXT,
  value NUMERIC(15,4) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'manual',
  confidence TEXT NOT NULL DEFAULT 'medium',
  evidence JSONB DEFAULT '[]',
  notes TEXT,
  baseline_value NUMERIC(15,4),
  target_value NUMERIC(15,4),
  variance NUMERIC(15,4),
  variance_pct NUMERIC(8,2),
  status TEXT NOT NULL DEFAULT 'recorded',
  alert_level TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_measurements_client ON oc_measurements(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_measurements_metric ON oc_measurements(metric_id);
CREATE INDEX IF NOT EXISTS idx_oc_measurements_tfm ON oc_measurements(transformation_id);
CREATE INDEX IF NOT EXISTS idx_oc_measurements_time ON oc_measurements(measured_at DESC);

-- ─── OPTIMIZATION RULES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_optimization_rules (
  id TEXT PRIMARY KEY DEFAULT 'rule-' || gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL DEFAULT 'general',
  category TEXT NOT NULL DEFAULT 'performance',
  condition_type TEXT NOT NULL DEFAULT 'threshold',
  condition_config JSONB NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  recommendation_template TEXT,
  financial_impact_template JSONB DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  scope TEXT NOT NULL DEFAULT 'global',
  client_id TEXT,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_rules_enabled ON oc_optimization_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_oc_rules_domain ON oc_optimization_rules(domain);

-- ─── OPTIMIZATION FINDINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_optimization_findings (
  id TEXT PRIMARY KEY DEFAULT 'opt-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  transformation_id TEXT,
  metric_id TEXT REFERENCES oc_metric_definitions(id),
  measurement_id TEXT REFERENCES oc_measurements(id),
  rule_id TEXT REFERENCES oc_optimization_rules(id),
  domain TEXT NOT NULL DEFAULT 'general',
  category TEXT NOT NULL DEFAULT 'performance',
  title TEXT NOT NULL,
  description TEXT,
  finding_type TEXT NOT NULL DEFAULT 'deviation',
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  baseline_value NUMERIC(15,4),
  target_value NUMERIC(15,4),
  actual_value NUMERIC(15,4),
  variance NUMERIC(15,4),
  variance_pct NUMERIC(8,2),
  financial_impact NUMERIC(15,2),
  potential_savings NUMERIC(15,2),
  evidence JSONB DEFAULT '[]',
  recommendation TEXT,
  recommended_action TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'detected',
  problem_id TEXT,
  gap_id TEXT,
  owner TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_findings_client ON oc_optimization_findings(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_findings_tfm ON oc_optimization_findings(transformation_id);
CREATE INDEX IF NOT EXISTS idx_oc_findings_status ON oc_optimization_findings(status);
CREATE INDEX IF NOT EXISTS idx_oc_findings_severity ON oc_optimization_findings(severity);
CREATE INDEX IF NOT EXISTS idx_oc_findings_metric ON oc_optimization_findings(metric_id);

-- ─── TRANSFORMATION OUTCOMES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_transformation_outcomes (
  id TEXT PRIMARY KEY DEFAULT 'out-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  transformation_id TEXT NOT NULL,
  expected_cost NUMERIC(15,2),
  actual_cost NUMERIC(15,2),
  cost_variance NUMERIC(15,2),
  cost_variance_pct NUMERIC(8,2),
  expected_savings NUMERIC(15,2),
  actual_savings NUMERIC(15,2),
  savings_variance NUMERIC(15,2),
  savings_variance_pct NUMERIC(8,2),
  benefit_realization_pct NUMERIC(8,2),
  expected_duration TEXT,
  actual_duration TEXT,
  schedule_variance_days INTEGER,
  expected_performance JSONB DEFAULT '{}',
  actual_performance JSONB DEFAULT '{}',
  expected_availability NUMERIC(5,2),
  actual_availability NUMERIC(5,2),
  expected_risk_level TEXT,
  actual_risk_level TEXT,
  roi_expected NUMERIC(8,2),
  roi_actual NUMERIC(8,2),
  roi_variance NUMERIC(8,2),
  overall_status TEXT NOT NULL DEFAULT 'measuring',
  health TEXT NOT NULL DEFAULT 'unknown',
  summary TEXT,
  evidence JSONB DEFAULT '[]',
  lessons_learned JSONB DEFAULT '[]',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_outcomes_client ON oc_transformation_outcomes(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_outcomes_tfm ON oc_transformation_outcomes(transformation_id);

-- ─── SEED DEFAULT OPTIMIZATION RULES ───────────────────────────────────────
INSERT INTO oc_optimization_rules (id, name, description, domain, category, condition_type, condition_config, severity, priority, recommendation_template, enabled, scope)
VALUES
('rule-cost-overrun', 'Cost Overrun Detection', 'Actual cost exceeds expected cost by threshold', 'general', 'cost', 'threshold_exceeded', '{"metric_category":"cost","direction":"higher_is_worse","threshold_pct":10}', 'high', 'high', 'Investigate cost drivers. Compare actual vs planned resource consumption. Consider optimization or renegotiation.', true, 'global'),
('rule-savings-shortfall', 'Savings Shortfall', 'Actual savings below expected savings target', 'general', 'cost', 'below_target', '{"metric_category":"savings","direction":"higher_is_better","threshold_pct":15}', 'high', 'high', 'Analyze benefit realization gap. Verify assumed savings were achievable. Identify blocking factors.', true, 'global'),
('rule-perf-degradation', 'Performance Degradation', 'Performance metric worse than baseline or target', 'general', 'performance', 'threshold_exceeded', '{"metric_category":"performance","direction":"lower_is_better","threshold_pct":20}', 'medium', 'medium', 'Profile application performance. Check for resource contention, configuration drift, or capacity issues.', true, 'global'),
('rule-availability-drop', 'Availability Below Target', 'Service availability below defined SLA threshold', 'general', 'reliability', 'below_target', '{"metric_category":"availability","direction":"higher_is_better","threshold_pct":0.5}', 'critical', 'critical', 'Investigate availability incidents. Review monitoring alerts, error logs, and infrastructure health.', true, 'global'),
('rule-utilization-low', 'Under-utilization Detected', 'Resource utilization significantly below capacity', 'general', 'cost', 'below_target', '{"metric_category":"utilization","direction":"higher_is_better","threshold_pct":30}', 'low', 'medium', 'Right-size resources. Consider consolidation, scheduled scaling, or reserved capacity reduction.', true, 'global'),
('rule-error-rate-high', 'Error Rate Elevated', 'Error rate exceeds acceptable threshold', 'general', 'reliability', 'threshold_exceeded', '{"metric_category":"error_rate","direction":"lower_is_better","threshold_pct":5}', 'high', 'high', 'Investigate error sources. Check recent deployments, dependency health, and input validation.', true, 'global'),
('rule-security-drift', 'Security Control Drift', 'Security metric deviates from established baseline', 'security', 'compliance', 'deviation', '{"metric_category":"security","direction":"stable","threshold_pct":10}', 'critical', 'critical', 'Audit security controls. Verify compliance posture. Check for configuration drift or unauthorized changes.', true, 'global'),
('rule-roi-variance', 'ROI Below Expected', 'Return on investment below projected levels', 'general', 'financial', 'below_target', '{"metric_category":"roi","direction":"higher_is_better","threshold_pct":20}', 'high', 'high', 'Decompose ROI shortfall: revenue impact, cost overrun, timeline delay. Identify recovery options.', true, 'global')
ON CONFLICT (id) DO NOTHING;
