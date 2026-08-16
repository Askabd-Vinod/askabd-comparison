-- AskABD Workflow Automation + Event-Driven Notification Engine
-- Supports: events, workflow rules, notification preferences, escalations

-- ─── PLATFORM EVENTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_events (
  id TEXT PRIMARY KEY DEFAULT 'evt-' || gen_random_uuid()::text,
  event_type TEXT NOT NULL,
  client_id TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  actor_type TEXT NOT NULL DEFAULT 'system',
  severity TEXT NOT NULL DEFAULT 'info',
  payload JSONB DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'api',
  correlation_id TEXT,
  idempotency_key TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_events_client ON oc_events(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_events_type ON oc_events(event_type);
CREATE INDEX IF NOT EXISTS idx_oc_events_processed ON oc_events(processed);
CREATE INDEX IF NOT EXISTS idx_oc_events_created ON oc_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_events_idempotency ON oc_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ─── WORKFLOW RULES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_workflow_rules (
  id TEXT PRIMARY KEY DEFAULT 'wfr-' || gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  notification_template JSONB DEFAULT '{}',
  recipient_rules JSONB DEFAULT '{}',
  escalation_rules JSONB DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium',
  severity TEXT NOT NULL DEFAULT 'info',
  enabled BOOLEAN NOT NULL DEFAULT true,
  scope TEXT NOT NULL DEFAULT 'global',
  client_id TEXT,
  cooldown_minutes INTEGER DEFAULT 0,
  deduplication_key TEXT,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_wf_rules_event ON oc_workflow_rules(event_type);
CREATE INDEX IF NOT EXISTS idx_oc_wf_rules_enabled ON oc_workflow_rules(enabled);

-- ─── WORKFLOW EXECUTIONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_workflow_executions (
  id TEXT PRIMARY KEY DEFAULT 'wfe-' || gen_random_uuid()::text,
  rule_id TEXT NOT NULL REFERENCES oc_workflow_rules(id),
  event_id TEXT NOT NULL REFERENCES oc_events(id),
  client_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  actions_executed JSONB DEFAULT '[]',
  result JSONB DEFAULT '{}',
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_wf_exec_rule ON oc_workflow_executions(rule_id);
CREATE INDEX IF NOT EXISTS idx_oc_wf_exec_client ON oc_workflow_executions(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_wf_exec_status ON oc_workflow_executions(status);

-- ─── NOTIFICATION PREFERENCES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_notification_preferences (
  id TEXT PRIMARY KEY DEFAULT 'npref-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'default',
  role TEXT NOT NULL DEFAULT 'CLIENT_ADMIN',
  channel TEXT NOT NULL DEFAULT 'IN_APP',
  category TEXT NOT NULL DEFAULT 'system',
  severity_minimum TEXT NOT NULL DEFAULT 'info',
  enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  digest_mode TEXT NOT NULL DEFAULT 'immediate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, user_id, channel, category)
);
CREATE INDEX IF NOT EXISTS idx_oc_notif_pref_client ON oc_notification_preferences(client_id);

-- ─── ESCALATIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_escalations (
  id TEXT PRIMARY KEY DEFAULT 'esc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  event_id TEXT,
  notification_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  reason TEXT,
  severity TEXT NOT NULL DEFAULT 'high',
  escalation_level INTEGER NOT NULL DEFAULT 1,
  owner TEXT,
  due_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_escalations_client ON oc_escalations(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_escalations_status ON oc_escalations(status);

-- ─── SEED DEFAULT WORKFLOW RULES ───────────────────────────────────────────
INSERT INTO oc_workflow_rules (id, name, description, event_type, conditions, actions, notification_template, recipient_rules, escalation_rules, priority, severity, enabled)
VALUES
('wfr-req-rejected', 'Requirement Rejected', 'Notify client when a requirement is rejected', 'REQUIREMENT_REJECTED', '{}', '[{"type":"CREATE_NOTIFICATION"}]', '{"title":"Requirement Rejected","message":"Your requirement \"{entityName}\" requires attention. Please review and resubmit.","category":"requirements"}', '{"roles":["CLIENT_ADMIN","CLIENT_TECHNICAL"]}', '{"afterHours":48,"escalateTo":"CLIENT_EXECUTIVE","severity":"high"}', 'high', 'warning', true),
('wfr-doc-expired', 'Document Expired', 'Alert when a document expires', 'DOCUMENT_EXPIRED', '{}', '[{"type":"CREATE_NOTIFICATION"},{"type":"CREATE_ESCALATION"}]', '{"title":"Document Expired","message":"Document \"{entityName}\" has expired. Please upload a new version.","category":"documents"}', '{"roles":["CLIENT_ADMIN","CLIENT_SECURITY"]}', '{"afterHours":72,"escalateTo":"CLIENT_EXECUTIVE","severity":"critical"}', 'high', 'warning', true),
('wfr-conn-failed', 'Connector Failed', 'Alert on connector validation failure', 'CONNECTOR_FAILED', '{}', '[{"type":"CREATE_NOTIFICATION"}]', '{"title":"Connector Validation Failed","message":"Connection to \"{entityName}\" failed. Please verify credentials and network access.","category":"connector"}', '{"roles":["CLIENT_ADMIN","CLIENT_TECHNICAL"]}', '{}', 'high', 'high', true),
('wfr-critical-problem', 'Critical Problem Detected', 'Notify on critical severity problem', 'PROBLEM_CREATED', '{"severity":"critical"}', '[{"type":"CREATE_NOTIFICATION"},{"type":"CREATE_ESCALATION"}]', '{"title":"Critical Problem Identified","message":"A critical problem has been identified: \"{entityName}\". Immediate attention required.","category":"security"}', '{"roles":["CLIENT_ADMIN","CLIENT_EXECUTIVE","CLIENT_SECURITY"]}', '{"afterHours":24,"escalateTo":"CLIENT_EXECUTIVE","severity":"critical"}', 'critical', 'critical', true),
('wfr-migration-failed', 'Migration Failed', 'Alert on migration failure', 'MIGRATION_FAILED', '{}', '[{"type":"CREATE_NOTIFICATION"},{"type":"CREATE_ESCALATION"}]', '{"title":"Migration Failed","message":"Migration execution has failed. Rollback procedures are available.","category":"migration"}', '{"roles":["CLIENT_ADMIN","CLIENT_TECHNICAL","CLIENT_EXECUTIVE"]}', '{"afterHours":4,"escalateTo":"CLIENT_EXECUTIVE","severity":"critical"}', 'critical', 'critical', true),
('wfr-benefit-below', 'Benefit Below Target', 'Notify when benefit realization drops below 70%', 'BENEFIT_BELOW_TARGET', '{}', '[{"type":"CREATE_NOTIFICATION"}]', '{"title":"Benefit Realization Below Target","message":"Transformation benefit realization is below expected targets. Review optimization recommendations.","category":"financial"}', '{"roles":["CLIENT_ADMIN","CLIENT_EXECUTIVE","CLIENT_FINANCE"]}', '{}', 'high', 'warning', true),
('wfr-lifecycle-changed', 'Lifecycle Stage Changed', 'Notify on lifecycle progression', 'LIFECYCLE_CHANGED', '{}', '[{"type":"CREATE_NOTIFICATION"}]', '{"title":"Progress Update","message":"Your engagement has progressed to stage: \"{entityName}\".","category":"lifecycle"}', '{"roles":["CLIENT_ADMIN"]}', '{}', 'low', 'info', true),
('wfr-recommendation-ready', 'Recommendation Ready', 'Notify when recommendations require approval', 'RECOMMENDATION_APPROVAL_REQUIRED', '{}', '[{"type":"CREATE_NOTIFICATION"}]', '{"title":"Recommendation Ready for Review","message":"New recommendations are available for your review and approval.","category":"transformation"}', '{"roles":["CLIENT_ADMIN","CLIENT_EXECUTIVE"]}', '{"afterHours":168,"escalateTo":"CLIENT_EXECUTIVE","severity":"high"}', 'medium', 'info', true)
ON CONFLICT (id) DO NOTHING;
