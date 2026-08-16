-- AskABD Cross-Framework Mapping + Compliance Exceptions

-- ─── CROSS-FRAMEWORK CONTROL MAPPINGS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_control_mappings (
  id TEXT PRIMARY KEY DEFAULT 'map-' || gen_random_uuid()::text,
  source_framework_id TEXT NOT NULL REFERENCES oc_compliance_frameworks(id),
  source_control_id TEXT NOT NULL REFERENCES oc_compliance_controls(id),
  target_framework_id TEXT NOT NULL REFERENCES oc_compliance_frameworks(id),
  target_control_id TEXT NOT NULL REFERENCES oc_compliance_controls(id),
  mapping_type TEXT NOT NULL DEFAULT 'related',
  coverage TEXT NOT NULL DEFAULT 'partial',
  confidence TEXT NOT NULL DEFAULT 'medium',
  rationale TEXT,
  mapping_source TEXT DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_control_id, target_control_id)
);
CREATE INDEX IF NOT EXISTS idx_oc_mappings_source ON oc_control_mappings(source_control_id);
CREATE INDEX IF NOT EXISTS idx_oc_mappings_target ON oc_control_mappings(target_control_id);
CREATE INDEX IF NOT EXISTS idx_oc_mappings_fw ON oc_control_mappings(source_framework_id, target_framework_id);

-- ─── COMPLIANCE EXCEPTIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_compliance_exceptions (
  id TEXT PRIMARY KEY DEFAULT 'exc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  framework_id TEXT NOT NULL REFERENCES oc_compliance_frameworks(id),
  control_id TEXT NOT NULL REFERENCES oc_compliance_controls(id),
  title TEXT NOT NULL,
  description TEXT,
  reason TEXT NOT NULL,
  business_justification TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  risk_owner TEXT,
  compensating_control TEXT,
  requested_by TEXT NOT NULL DEFAULT 'admin',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  review_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'requested',
  conditions TEXT,
  evidence JSONB DEFAULT '[]',
  audit_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_exceptions_client ON oc_compliance_exceptions(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_exceptions_control ON oc_compliance_exceptions(control_id);
CREATE INDEX IF NOT EXISTS idx_oc_exceptions_status ON oc_compliance_exceptions(status);

-- ─── SEED VERIFIED CROSS-FRAMEWORK MAPPINGS ────────────────────────────────
-- These are real, verifiable mappings between ISO 27001, SOC 2, and NIST CSF
INSERT INTO oc_control_mappings (id, source_framework_id, source_control_id, target_framework_id, target_control_id, mapping_type, coverage, confidence, rationale, mapping_source, status)
VALUES
-- ISO A.9 Access Control ↔ SOC2 CC6 Logical Access ↔ NIST PR.AC
('map-iso-a9-soc2-cc6', 'fw-iso27001', 'ctrl-iso-a9', 'fw-soc2', 'ctrl-soc2-cc6', 'full', 'full', 'high', 'Both address logical access control requirements', 'industry_standard', 'active'),
('map-iso-a9-nist-prac', 'fw-iso27001', 'ctrl-iso-a9', 'fw-nist-csf', 'ctrl-nist-pr-ac', 'full', 'full', 'high', 'Both address identity management and access control', 'industry_standard', 'active'),
('map-soc2-cc6-nist-prac', 'fw-soc2', 'ctrl-soc2-cc6', 'fw-nist-csf', 'ctrl-nist-pr-ac', 'full', 'full', 'high', 'Both cover logical and physical access restrictions', 'industry_standard', 'active'),
-- ISO A.12 Operations ↔ SOC2 CC7 System Operations ↔ NIST DE.CM Monitoring
('map-iso-a12-soc2-cc7', 'fw-iso27001', 'ctrl-iso-a12', 'fw-soc2', 'ctrl-soc2-cc7', 'partial', 'partial', 'high', 'ISO A.12 is broader; CC7 focuses on detection/response', 'industry_standard', 'active'),
('map-iso-a12-nist-decm', 'fw-iso27001', 'ctrl-iso-a12', 'fw-nist-csf', 'ctrl-nist-de-cm', 'partial', 'partial', 'high', 'ISO A.12 covers operations broadly; NIST DE.CM focuses on monitoring', 'industry_standard', 'active'),
('map-soc2-cc7-nist-decm', 'fw-soc2', 'ctrl-soc2-cc7', 'fw-nist-csf', 'ctrl-nist-de-cm', 'full', 'full', 'high', 'Both address continuous monitoring and anomaly detection', 'industry_standard', 'active'),
-- ISO A.16 Incident ↔ NIST RS Respond
('map-iso-a16-nist-rs', 'fw-iso27001', 'ctrl-iso-a16', 'fw-nist-csf', 'ctrl-nist-rs', 'full', 'full', 'high', 'Both address incident response and reporting', 'industry_standard', 'active'),
-- ISO A.17 BCP ↔ SOC2 A1 Availability ↔ NIST RC Recover
('map-iso-a17-soc2-a1', 'fw-iso27001', 'ctrl-iso-a17', 'fw-soc2', 'ctrl-soc2-a1', 'partial', 'partial', 'high', 'ISO A.17 covers BCP; SOC2 A1 covers availability commitments', 'industry_standard', 'active'),
('map-iso-a17-nist-rc', 'fw-iso27001', 'ctrl-iso-a17', 'fw-nist-csf', 'ctrl-nist-rc', 'full', 'full', 'high', 'Both address recovery planning and business continuity', 'industry_standard', 'active'),
-- ISO A.8 Assets ↔ NIST ID.AM Asset Management
('map-iso-a8-nist-idam', 'fw-iso27001', 'ctrl-iso-a8', 'fw-nist-csf', 'ctrl-nist-id-am', 'full', 'full', 'high', 'Both address asset inventory and management', 'industry_standard', 'active'),
-- ISO A.5 Policies ↔ SOC2 CC1 Control Environment ↔ NIST GV Govern
('map-iso-a5-soc2-cc1', 'fw-iso27001', 'ctrl-iso-a5', 'fw-soc2', 'ctrl-soc2-cc1', 'partial', 'partial', 'medium', 'ISO A.5 covers security policies; CC1 covers broader governance', 'industry_standard', 'active'),
('map-iso-a5-nist-gv', 'fw-iso27001', 'ctrl-iso-a5', 'fw-nist-csf', 'ctrl-nist-gv', 'partial', 'partial', 'medium', 'Both address governance and policy requirements', 'industry_standard', 'active'),
-- ISO A.10 Cryptography ↔ NIST PR.DS Data Security
('map-iso-a10-nist-prds', 'fw-iso27001', 'ctrl-iso-a10', 'fw-nist-csf', 'ctrl-nist-pr-ds', 'partial', 'partial', 'high', 'ISO A.10 covers cryptography; NIST PR.DS covers broader data security', 'industry_standard', 'active')
ON CONFLICT (source_control_id, target_control_id) DO NOTHING;
