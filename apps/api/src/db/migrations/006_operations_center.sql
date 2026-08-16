-- Operations Center Schema
-- Captures all client data, actions, remediations, and audit evidence

-- Clients table
CREATE TABLE IF NOT EXISTS oc_clients (
  id TEXT PRIMARY KEY DEFAULT 'client-' || gen_random_uuid()::text,
  name TEXT NOT NULL,
  logo TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT '',
  business_size TEXT NOT NULL DEFAULT '',
  support_model TEXT NOT NULL DEFAULT '',
  criticality TEXT NOT NULL DEFAULT '',
  primary_contact TEXT NOT NULL DEFAULT '',
  health TEXT NOT NULL DEFAULT 'healthy',
  sla_status TEXT NOT NULL DEFAULT 'compliant',
  platform_score INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'active', -- active, onboarding, suspended, offline
  departments TEXT[] DEFAULT '{}',
  capabilities TEXT[] DEFAULT '{}',
  processes TEXT[] DEFAULT '{}',
  applications TEXT[] DEFAULT '{}',
  tech_apps TEXT[] DEFAULT '{}',
  tech_services TEXT[] DEFAULT '{}',
  tech_apis TEXT[] DEFAULT '{}',
  tech_databases TEXT[] DEFAULT '{}',
  tech_servers TEXT[] DEFAULT '{}',
  tech_cloud TEXT[] DEFAULT '{}',
  tech_infrastructure TEXT[] DEFAULT '{}',
  environments JSONB NOT NULL DEFAULT '{"dev":true,"test":true,"uat":false,"staging":true,"prod":true,"dr":false}',
  monitoring JSONB NOT NULL DEFAULT '{"infra":true,"apps":true,"services":true,"db":true,"network":false,"cloud":false}',
  enabled_services TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log table — captures every action across the platform
CREATE TABLE IF NOT EXISTS oc_audit_log (
  id TEXT PRIMARY KEY DEFAULT 'audit-' || gen_random_uuid()::text,
  entity_type TEXT NOT NULL, -- client, application, service, incident, remediation
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL, -- created, updated, enabled, disabled, restarted, remediated, resolved, rolled_back
  actor TEXT NOT NULL DEFAULT 'system',
  details JSONB DEFAULT '{}',
  evidence TEXT[] DEFAULT '{}',
  environment TEXT DEFAULT 'production',
  ip_address TEXT DEFAULT '',
  correlation_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remediation records — full lifecycle tracking
CREATE TABLE IF NOT EXISTS oc_remediations (
  id TEXT PRIMARY KEY DEFAULT 'rem-' || gen_random_uuid()::text,
  incident_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  grade TEXT NOT NULL DEFAULT 'standard', -- standard, expedited
  phase TEXT NOT NULL DEFAULT 'idle', -- idle, impact-analysis, approval-pending, executing, validating, completed, rolled-back, failed
  fix_immediate TEXT DEFAULT '',
  fix_permanent TEXT DEFAULT '',
  impact_analysis JSONB DEFAULT '{}',
  steps JSONB DEFAULT '[]',
  validation_criteria TEXT[] DEFAULT '{}',
  rollback_plan TEXT DEFAULT '',
  evidence TEXT[] DEFAULT '{}',
  owner TEXT DEFAULT '',
  approved_by TEXT DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  verified_by TEXT DEFAULT '',
  verified_at TIMESTAMPTZ,
  ticket_closed BOOLEAN NOT NULL DEFAULT FALSE,
  ticket_closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service control actions — enable/disable/restart tracking
CREATE TABLE IF NOT EXISTS oc_service_actions (
  id TEXT PRIMARY KEY DEFAULT 'svc-act-' || gen_random_uuid()::text,
  entity_type TEXT NOT NULL, -- client, application, service, environment
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL, -- enabled, disabled, restarted
  previous_state TEXT DEFAULT '',
  new_state TEXT DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'system',
  reason TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oc_audit_log_entity ON oc_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_oc_audit_log_created ON oc_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_audit_log_action ON oc_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_oc_remediations_client ON oc_remediations(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_remediations_incident ON oc_remediations(incident_id);
CREATE INDEX IF NOT EXISTS idx_oc_service_actions_entity ON oc_service_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_oc_clients_health ON oc_clients(health);
CREATE INDEX IF NOT EXISTS idx_oc_clients_status ON oc_clients(status);


-- Notifications table — tracks all sent notifications for evidence
CREATE TABLE IF NOT EXISTS oc_notifications (
  id TEXT PRIMARY KEY DEFAULT 'notif-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL, -- onboarding, service-change, incident, remediation, deployment, maintenance, escalation, resolution
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  subject TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  details JSONB DEFAULT '{}',
  recipients JSONB NOT NULL DEFAULT '[]',
  evidence TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued', -- queued, sent, failed, read
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_notifications_client ON oc_notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_notifications_phase ON oc_notifications(phase);
CREATE INDEX IF NOT EXISTS idx_oc_notifications_status ON oc_notifications(status);
