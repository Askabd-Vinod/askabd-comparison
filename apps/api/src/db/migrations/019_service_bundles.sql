-- AskABD Service Bundles (product packaging metadata only)
CREATE TABLE IF NOT EXISTS oc_service_bundles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'transformation',
  service_ids JSONB NOT NULL DEFAULT '[]',
  recommended_for JSONB DEFAULT '[]',
  business_value TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO oc_service_bundles (id, name, description, category, service_ids, recommended_for, business_value, status)
VALUES
('bundle-assessment', 'Assessment Bundle', 'Comprehensive environment assessment and problem identification', 'discovery', '["cap-client-onboarding","cap-connector-framework","cap-discovery-engine","cap-assessment-engine","cap-problem-universe","cap-gap-analysis"]', '["new_client","legacy_environment","pre_transformation"]', 'Understand current state and identify transformation opportunities', 'active'),
('bundle-transformation', 'Transformation Bundle', 'End-to-end transformation from decision to execution', 'transformation', '["cap-problem-universe","cap-gap-analysis","cap-decision-framework","cap-transformation-planning","cap-migration-execution","cap-migration-validation"]', '["assessed_client","decision_ready","migration_required"]', 'Execute transformation with validated outcomes', 'active'),
('bundle-optimization', 'Optimization Bundle', 'Continuous measurement and optimization post-transformation', 'optimization', '["cap-optimization-engine","cap-migration-validation","cap-transformation-planning"]', '["post_transformation","operational_client"]', 'Maximize realized benefits through continuous improvement', 'active'),
('bundle-compliance', 'Compliance Bundle', 'Multi-framework compliance assessment and automation', 'compliance', '["cap-compliance-automation","cap-cross-framework","cap-audit-trail","cap-document-management"]', '["regulated_industry","security_focused","audit_preparation"]', 'Achieve and maintain compliance with reduced manual effort', 'active'),
('bundle-enterprise', 'Enterprise Transformation Bundle', 'Complete AskABD platform for full lifecycle transformation', 'enterprise', '["cap-client-onboarding","cap-discovery-engine","cap-assessment-engine","cap-problem-universe","cap-gap-analysis","cap-decision-framework","cap-transformation-planning","cap-migration-execution","cap-migration-validation","cap-optimization-engine","cap-compliance-automation","cap-portfolio-management"]', '["enterprise_client","managed_services"]', 'Universal transformation platform with portfolio intelligence', 'active')
ON CONFLICT (id) DO NOTHING;
