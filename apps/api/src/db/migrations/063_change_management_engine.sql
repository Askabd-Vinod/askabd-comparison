-- Change Management Engine (change_management_test_1, 2026-08-24 master
-- completion directive, capability #71). Genuinely NEW — confirmed no real
-- impact-assessment/risk-linked/rollback-plan change-tracking concept
-- existed (only the generic `client_request_service.ts`'s lightweight
-- `requestType: 'change'` intake, real but deliberately simple — same
-- state machine as service/connector/support/incident requests, no room
-- for real impact assessment, risk linkage, or a real implementation/
-- rollback plan without risking that shared, already-tested file).
--
-- Reuses, rather than duplicates:
--   - `oc_client_requests` (unmodified) — a Change Record MAY originate
--     from a real customer-submitted 'change' request (`client_request_id`,
--     nullable — staff-initiated changes need no originating request).
--   - `oc_risks` (unmodified, this session's own `risk_test_1`) — real
--     risk linkage via `risk_ids`, ownership-verified per link, never a
--     bare unverified id array.
--   - `oc_deployments` (unmodified, this session's own
--     `deployment_validation_test_1`) — a change's real implementation MAY
--     be a real deployment (`deployment_id`, nullable, ownership-verified).
--   - `approval_workflows` (generic, unmodified) — the real approval
--     decision (`entity_type = 'change_approval'`).

CREATE TABLE IF NOT EXISTS oc_change_records (
  id TEXT PRIMARY KEY DEFAULT ('chg-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  client_request_id TEXT REFERENCES oc_client_requests(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  change_type TEXT NOT NULL DEFAULT 'normal' CHECK (change_type IN ('standard', 'normal', 'emergency')),
  impact_assessment TEXT NOT NULL DEFAULT '',
  risk_ids TEXT[] NOT NULL DEFAULT '{}',
  dependencies TEXT NOT NULL DEFAULT '',
  implementation_plan TEXT NOT NULL DEFAULT '',
  rollback_plan TEXT NOT NULL DEFAULT '',
  deployment_id TEXT REFERENCES oc_deployments(id) ON DELETE SET NULL,
  validation_reference TEXT NOT NULL DEFAULT '',
  post_change_validation TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'assessed', 'approval_pending', 'approved', 'implementing', 'validating', 'closed', 'cancelled'
  )),
  approval_workflow_id TEXT,
  owner TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_change_records_client ON oc_change_records(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_change_records_status ON oc_change_records(client_id, status);
