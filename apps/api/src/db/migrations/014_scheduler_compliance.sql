-- AskABD Scheduler + Compliance Automation Foundation

-- ─── SCHEDULED JOBS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_scheduled_jobs (
  id TEXT PRIMARY KEY DEFAULT 'job-' || gen_random_uuid()::text,
  job_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  enabled BOOLEAN NOT NULL DEFAULT true,
  frequency TEXT NOT NULL DEFAULT 'daily',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_result JSONB DEFAULT '{}',
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_jobs_type ON oc_scheduled_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_oc_jobs_status ON oc_scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_oc_jobs_enabled ON oc_scheduled_jobs(enabled);

-- ─── COMPLIANCE FRAMEWORKS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_compliance_frameworks (
  id TEXT PRIMARY KEY DEFAULT 'fw-' || gen_random_uuid()::text,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  jurisdiction TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  total_controls INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── COMPLIANCE CONTROLS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_compliance_controls (
  id TEXT PRIMARY KEY DEFAULT 'ctrl-' || gen_random_uuid()::text,
  framework_id TEXT NOT NULL REFERENCES oc_compliance_frameworks(id),
  control_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  requirement TEXT,
  applicability TEXT NOT NULL DEFAULT 'mandatory',
  risk_level TEXT NOT NULL DEFAULT 'medium',
  evidence_required JSONB DEFAULT '[]',
  review_frequency TEXT DEFAULT 'annual',
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_controls_fw ON oc_compliance_controls(framework_id);
CREATE INDEX IF NOT EXISTS idx_oc_controls_cat ON oc_compliance_controls(category);

-- ─── CLIENT COMPLIANCE STATUS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_client_compliance (
  id TEXT PRIMARY KEY DEFAULT 'cc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  framework_id TEXT NOT NULL REFERENCES oc_compliance_frameworks(id),
  control_id TEXT NOT NULL REFERENCES oc_compliance_controls(id),
  status TEXT NOT NULL DEFAULT 'not_assessed',
  maturity INTEGER NOT NULL DEFAULT 0,
  evidence_status TEXT NOT NULL DEFAULT 'missing',
  evidence_references JSONB DEFAULT '[]',
  last_assessed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  owner TEXT,
  notes TEXT,
  finding_id TEXT,
  gap_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_cc_client ON oc_client_compliance(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_cc_fw ON oc_client_compliance(framework_id);
CREATE INDEX IF NOT EXISTS idx_oc_cc_status ON oc_client_compliance(status);

-- ─── SEED DEFAULT JOBS ─────────────────────────────────────────────────────
INSERT INTO oc_scheduled_jobs (id, job_type, name, description, enabled, frequency)
VALUES
('job-overdue-reqs', 'OVERDUE_REQUIREMENTS', 'Overdue Requirements Check', 'Detect requirements past due date or incomplete', true, 'daily'),
('job-overdue-docs', 'OVERDUE_DOCUMENTS', 'Overdue Documents Check', 'Detect expired or missing required documents', true, 'daily'),
('job-overdue-approvals', 'OVERDUE_APPROVALS', 'Overdue Approvals Check', 'Detect pending approvals past SLA', true, 'daily'),
('job-overdue-gaps', 'OVERDUE_GAPS', 'Overdue Gaps Check', 'Detect unresolved gaps past target date', true, 'weekly'),
('job-overdue-tfm', 'OVERDUE_TRANSFORMATIONS', 'Overdue Transformations', 'Detect delayed or blocked transformations', true, 'daily'),
('job-benefit-check', 'BENEFIT_REALIZATION_CHECK', 'Benefit Realization', 'Compare expected vs actual benefits', true, 'weekly'),
('job-compliance-check', 'COMPLIANCE_EVIDENCE_CHECK', 'Compliance Evidence', 'Check for expired or missing compliance evidence', true, 'daily'),
('job-digest', 'DIGEST_PROCESSOR', 'Notification Digest', 'Generate daily/weekly notification digests', true, 'daily')
ON CONFLICT (id) DO NOTHING;

-- ─── SEED ISO 27001 FRAMEWORK (subset) ─────────────────────────────────────
INSERT INTO oc_compliance_frameworks (id, name, version, description, jurisdiction, category, total_controls)
VALUES ('fw-iso27001', 'ISO/IEC 27001:2022', '2022', 'Information security management systems', 'International', 'security', 14)
ON CONFLICT (id) DO NOTHING;

INSERT INTO oc_compliance_controls (id, framework_id, control_ref, name, description, category, requirement, applicability, risk_level, evidence_required)
VALUES
('ctrl-iso-a5', 'fw-iso27001', 'A.5', 'Information Security Policies', 'Policies for information security', 'governance', 'Documented and approved security policies', 'mandatory', 'high', '["security_policy_document","policy_approval_record"]'),
('ctrl-iso-a6', 'fw-iso27001', 'A.6', 'Organization of Information Security', 'Internal organization and mobile/remote working', 'governance', 'Defined security roles and responsibilities', 'mandatory', 'medium', '["org_chart","role_definitions"]'),
('ctrl-iso-a7', 'fw-iso27001', 'A.7', 'Human Resource Security', 'Screening, terms, awareness, disciplinary', 'people', 'Background checks and security awareness', 'mandatory', 'medium', '["screening_records","training_records"]'),
('ctrl-iso-a8', 'fw-iso27001', 'A.8', 'Asset Management', 'Inventory, classification, handling, disposal', 'assets', 'Complete asset inventory with classification', 'mandatory', 'high', '["asset_inventory","classification_scheme"]'),
('ctrl-iso-a9', 'fw-iso27001', 'A.9', 'Access Control', 'Policy, user management, system controls', 'access', 'Access control policy and user provisioning', 'mandatory', 'critical', '["access_policy","user_provisioning_records","rbac_configuration"]'),
('ctrl-iso-a10', 'fw-iso27001', 'A.10', 'Cryptography', 'Cryptographic controls and key management', 'technical', 'Encryption standards and key management', 'mandatory', 'high', '["encryption_standards","key_management_procedures"]'),
('ctrl-iso-a11', 'fw-iso27001', 'A.11', 'Physical Security', 'Secure areas and equipment', 'physical', 'Physical access controls and environmental protection', 'conditional', 'medium', '["physical_access_records","environmental_controls"]'),
('ctrl-iso-a12', 'fw-iso27001', 'A.12', 'Operations Security', 'Procedures, malware, backup, logging, monitoring', 'operations', 'Documented operational procedures and monitoring', 'mandatory', 'high', '["operational_procedures","backup_records","monitoring_config"]'),
('ctrl-iso-a13', 'fw-iso27001', 'A.13', 'Communications Security', 'Network controls and information transfer', 'network', 'Network security controls and secure communications', 'mandatory', 'high', '["network_diagrams","firewall_rules","transfer_policies"]'),
('ctrl-iso-a14', 'fw-iso27001', 'A.14', 'System Development', 'Security requirements, testing, test data', 'development', 'Secure development lifecycle', 'mandatory', 'high', '["sdlc_policy","security_testing_records"]'),
('ctrl-iso-a15', 'fw-iso27001', 'A.15', 'Supplier Relationships', 'Security in supplier agreements', 'vendor', 'Supplier security requirements and monitoring', 'conditional', 'medium', '["supplier_agreements","vendor_assessments"]'),
('ctrl-iso-a16', 'fw-iso27001', 'A.16', 'Incident Management', 'Reporting, assessment, response, lessons', 'operations', 'Incident response procedures and reporting', 'mandatory', 'critical', '["incident_response_plan","incident_records"]'),
('ctrl-iso-a17', 'fw-iso27001', 'A.17', 'Business Continuity', 'Continuity planning and redundancy', 'resilience', 'Business continuity and disaster recovery plans', 'mandatory', 'critical', '["bcp_document","dr_test_records"]'),
('ctrl-iso-a18', 'fw-iso27001', 'A.18', 'Compliance', 'Legal, contractual, review requirements', 'compliance', 'Compliance with legal and contractual requirements', 'mandatory', 'high', '["compliance_register","audit_reports"]')
ON CONFLICT (id) DO NOTHING;
