-- AskABD Multi-Framework Compliance Seeding: SOC 2 + NIST CSF

-- ─── SOC 2 ─────────────────────────────────────────────────────────────────
INSERT INTO oc_compliance_frameworks (id, name, version, description, jurisdiction, category, total_controls)
VALUES ('fw-soc2', 'SOC 2 Type II', '2017', 'Service Organization Control reporting (Trust Service Criteria)', 'US', 'security', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO oc_compliance_controls (id, framework_id, control_ref, name, description, category, requirement, applicability, risk_level, evidence_required)
VALUES
('ctrl-soc2-cc1', 'fw-soc2', 'CC1', 'Control Environment', 'Tone at the top, governance, accountability', 'governance', 'Board oversight and management philosophy', 'mandatory', 'high', '["governance_charter","org_chart","code_of_conduct"]'),
('ctrl-soc2-cc2', 'fw-soc2', 'CC2', 'Communication and Information', 'Internal/external communication of security objectives', 'governance', 'Security communication policies', 'mandatory', 'medium', '["security_policy","communication_records"]'),
('ctrl-soc2-cc3', 'fw-soc2', 'CC3', 'Risk Assessment', 'Risk identification and analysis', 'risk', 'Formal risk assessment process', 'mandatory', 'high', '["risk_register","risk_assessment_report"]'),
('ctrl-soc2-cc4', 'fw-soc2', 'CC4', 'Monitoring Activities', 'Ongoing and separate evaluations', 'operations', 'Continuous monitoring and evaluation', 'mandatory', 'high', '["monitoring_config","review_records"]'),
('ctrl-soc2-cc5', 'fw-soc2', 'CC5', 'Control Activities', 'Policies, procedures, technology controls', 'operations', 'Defined control activities over technology', 'mandatory', 'high', '["control_procedures","technology_controls"]'),
('ctrl-soc2-cc6', 'fw-soc2', 'CC6', 'Logical and Physical Access', 'Access control mechanisms', 'access', 'Logical and physical access restrictions', 'mandatory', 'critical', '["access_policy","provisioning_records","physical_access"]'),
('ctrl-soc2-cc7', 'fw-soc2', 'CC7', 'System Operations', 'Detection and response to system anomalies', 'operations', 'System monitoring and incident detection', 'mandatory', 'high', '["monitoring_alerts","incident_records"]'),
('ctrl-soc2-cc8', 'fw-soc2', 'CC8', 'Change Management', 'Changes to infrastructure, software, procedures', 'development', 'Formal change management process', 'mandatory', 'high', '["change_records","deployment_procedures"]'),
('ctrl-soc2-cc9', 'fw-soc2', 'CC9', 'Risk Mitigation', 'Risk mitigation through business processes', 'risk', 'Risk mitigation strategies and vendor management', 'mandatory', 'medium', '["risk_treatment","vendor_assessments"]'),
('ctrl-soc2-a1', 'fw-soc2', 'A1', 'Availability', 'System availability commitments and SLAs', 'resilience', 'System availability and disaster recovery', 'mandatory', 'critical', '["sla_documents","dr_plan","uptime_records"]')
ON CONFLICT (id) DO NOTHING;

-- ─── NIST CSF ──────────────────────────────────────────────────────────────
INSERT INTO oc_compliance_frameworks (id, name, version, description, jurisdiction, category, total_controls)
VALUES ('fw-nist-csf', 'NIST Cybersecurity Framework', '2.0', 'Framework for improving critical infrastructure cybersecurity', 'US', 'security', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO oc_compliance_controls (id, framework_id, control_ref, name, description, category, requirement, applicability, risk_level, evidence_required)
VALUES
('ctrl-nist-id', 'fw-nist-csf', 'ID', 'Identify', 'Asset management, risk assessment, governance', 'governance', 'Understand organizational context and risk', 'mandatory', 'high', '["asset_inventory","risk_assessment","governance_documents"]'),
('ctrl-nist-pr', 'fw-nist-csf', 'PR', 'Protect', 'Access control, awareness, data security, maintenance', 'protection', 'Implement safeguards for critical services', 'mandatory', 'high', '["access_controls","training_records","encryption_config"]'),
('ctrl-nist-de', 'fw-nist-csf', 'DE', 'Detect', 'Anomalies, continuous monitoring, detection processes', 'detection', 'Timely discovery of cybersecurity events', 'mandatory', 'high', '["monitoring_config","detection_rules","alert_records"]'),
('ctrl-nist-rs', 'fw-nist-csf', 'RS', 'Respond', 'Response planning, communications, analysis, mitigation', 'response', 'Effective response to detected incidents', 'mandatory', 'critical', '["incident_response_plan","communication_plan","mitigation_records"]'),
('ctrl-nist-rc', 'fw-nist-csf', 'RC', 'Recover', 'Recovery planning, improvements, communications', 'recovery', 'Timely recovery to normal operations', 'mandatory', 'critical', '["recovery_plan","bcp_test_records","lessons_learned"]'),
('ctrl-nist-gv', 'fw-nist-csf', 'GV', 'Govern', 'Organizational context, strategy, roles, policy', 'governance', 'Cybersecurity risk management governance', 'mandatory', 'high', '["cyber_strategy","roles_responsibilities","policy_documents"]'),
('ctrl-nist-id-am', 'fw-nist-csf', 'ID.AM', 'Asset Management', 'Physical and software assets identified and managed', 'assets', 'Complete asset inventory and management', 'mandatory', 'high', '["asset_inventory","classification_scheme","ownership_records"]'),
('ctrl-nist-pr-ac', 'fw-nist-csf', 'PR.AC', 'Access Control', 'Access limited to authorized users/processes', 'access', 'Identity management and access control', 'mandatory', 'critical', '["iam_policy","mfa_config","access_reviews"]'),
('ctrl-nist-pr-ds', 'fw-nist-csf', 'PR.DS', 'Data Security', 'Data managed consistent with risk strategy', 'data', 'Data-at-rest and data-in-transit protection', 'mandatory', 'high', '["encryption_policy","dlp_config","backup_procedures"]'),
('ctrl-nist-de-cm', 'fw-nist-csf', 'DE.CM', 'Continuous Monitoring', 'Information system and assets monitored', 'monitoring', 'Continuous monitoring of systems and networks', 'mandatory', 'high', '["siem_config","network_monitoring","endpoint_monitoring"]')
ON CONFLICT (id) DO NOTHING;
