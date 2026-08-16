-- Migration 023: Jira Integration
-- Stores Jira configuration, issue links, and synchronization state.
-- AskABD stores linkage and status — NOT the full Jira database.

-- Jira integration configuration (per-environment)
CREATE TABLE IF NOT EXISTS oc_jira_integrations (
  id TEXT PRIMARY KEY DEFAULT 'jira-' || gen_random_uuid()::text,
  environment TEXT NOT NULL DEFAULT 'development', -- development, staging, production
  base_url TEXT NOT NULL, -- e.g., https://company.atlassian.net
  project_key TEXT NOT NULL, -- e.g., ABD
  auth_method TEXT NOT NULL DEFAULT 'api_token', -- api_token, oauth2, pat
  auth_email TEXT DEFAULT '', -- Jira user email (for API token auth)
  auth_token_encrypted TEXT DEFAULT '', -- encrypted token (NEVER plaintext in responses)
  default_issue_type TEXT DEFAULT 'Task',
  default_priority TEXT DEFAULT 'Medium',
  default_assignee TEXT DEFAULT '',
  default_labels TEXT[] DEFAULT '{}',
  default_components TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'not_configured', -- not_configured, configured, authenticated, healthy, degraded, failed
  last_health_check TIMESTAMPTZ,
  last_health_status TEXT DEFAULT '',
  last_health_error TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

-- Jira issue links (maps AskABD entities to Jira issues)
CREATE TABLE IF NOT EXISTS oc_jira_issue_links (
  id TEXT PRIMARY KEY DEFAULT 'jlink-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'development',
  -- AskABD source
  source_type TEXT NOT NULL, -- finding, gap, recommendation, incident, defect, remediation, problem
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL DEFAULT '',
  -- Jira target
  jira_issue_key TEXT NOT NULL, -- e.g., ABD-123
  jira_issue_url TEXT NOT NULL DEFAULT '',
  jira_issue_type TEXT DEFAULT 'Task',
  jira_status TEXT DEFAULT 'To Do', -- last known Jira status
  jira_priority TEXT DEFAULT 'Medium',
  jira_assignee TEXT DEFAULT '',
  -- Synchronization
  askabd_status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, blocked, resolved, verified, closed
  sync_status TEXT NOT NULL DEFAULT 'created', -- created, synced, stale, error
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT DEFAULT '',
  -- Verification
  verification_status TEXT DEFAULT 'pending', -- pending, passed, failed, not_applicable
  verified_at TIMESTAMPTZ,
  verified_by TEXT DEFAULT '',
  verification_evidence TEXT[] DEFAULT '{}',
  -- Metadata
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_type, source_id, environment)
);

-- Defects / incidents detected by AskABD
CREATE TABLE IF NOT EXISTS oc_defects (
  id TEXT PRIMARY KEY DEFAULT 'def-' || gen_random_uuid()::text,
  client_id TEXT, -- NULL for platform-level defects
  environment TEXT NOT NULL DEFAULT 'development',
  -- Classification
  category TEXT NOT NULL, -- health, connector, migration, validation, security, compliance, performance, api, lifecycle, workflow
  severity TEXT NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  -- Details
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  affected_service TEXT DEFAULT '',
  affected_endpoint TEXT DEFAULT '',
  -- Fingerprint for deduplication
  fingerprint TEXT NOT NULL, -- hash of (client_id + category + affected_service + root_cause_key)
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Root cause
  root_cause TEXT DEFAULT '',
  root_cause_confidence TEXT DEFAULT 'unknown', -- confirmed, likely, possible, unknown
  -- Impact
  business_impact TEXT DEFAULT '',
  technical_impact TEXT DEFAULT '',
  affected_clients INTEGER DEFAULT 0,
  -- Resolution
  status TEXT NOT NULL DEFAULT 'detected', -- detected, acknowledged, investigating, mitigating, resolved, verified, closed
  recommended_fix TEXT DEFAULT '',
  resolution TEXT DEFAULT '',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT DEFAULT '',
  -- Jira
  jira_issue_key TEXT DEFAULT '',
  jira_issue_url TEXT DEFAULT '',
  -- Evidence
  evidence TEXT[] DEFAULT '{}',
  related_audit_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fingerprint)
);

-- Incidents (operational — triggered by defects or external events)
CREATE TABLE IF NOT EXISTS oc_incidents (
  id TEXT PRIMARY KEY DEFAULT 'inc-' || gen_random_uuid()::text,
  client_id TEXT,
  environment TEXT NOT NULL DEFAULT 'development',
  severity TEXT NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  affected_service TEXT DEFAULT '',
  -- Timeline
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT DEFAULT '',
  mitigated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT DEFAULT '',
  verified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  -- Duration
  duration_minutes INTEGER DEFAULT 0,
  -- Root cause
  root_cause TEXT DEFAULT '',
  root_cause_confidence TEXT DEFAULT 'unknown',
  -- Status
  status TEXT NOT NULL DEFAULT 'detected', -- detected, acknowledged, investigating, mitigating, resolved, verified, closed
  -- Links
  defect_id TEXT DEFAULT '',
  jira_issue_key TEXT DEFAULT '',
  -- Evidence
  evidence TEXT[] DEFAULT '{}',
  impact_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Client health snapshots (computed periodically)
CREATE TABLE IF NOT EXISTS oc_client_health_snapshots (
  id TEXT PRIMARY KEY DEFAULT 'chs-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  -- Dimension scores (0-100)
  overall_score INTEGER NOT NULL DEFAULT 0,
  technical_score INTEGER NOT NULL DEFAULT 0,
  security_score INTEGER NOT NULL DEFAULT 0,
  compliance_score INTEGER NOT NULL DEFAULT 0,
  operational_score INTEGER NOT NULL DEFAULT 0,
  financial_score INTEGER NOT NULL DEFAULT 0,
  migration_score INTEGER NOT NULL DEFAULT 0,
  reliability_score INTEGER NOT NULL DEFAULT 0,
  -- Top issues
  top_risks JSONB DEFAULT '[]',
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  recommended_actions JSONB DEFAULT '[]',
  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_by TEXT DEFAULT 'system',
  evidence JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jira_links_client ON oc_jira_issue_links(client_id);
CREATE INDEX IF NOT EXISTS idx_jira_links_source ON oc_jira_issue_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_jira_links_key ON oc_jira_issue_links(jira_issue_key);
CREATE INDEX IF NOT EXISTS idx_defects_client ON oc_defects(client_id);
CREATE INDEX IF NOT EXISTS idx_defects_fingerprint ON oc_defects(fingerprint);
CREATE INDEX IF NOT EXISTS idx_defects_status ON oc_defects(status);
CREATE INDEX IF NOT EXISTS idx_defects_severity ON oc_defects(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_client ON oc_incidents(client_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON oc_incidents(status);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_client ON oc_client_health_snapshots(client_id, computed_at DESC);
