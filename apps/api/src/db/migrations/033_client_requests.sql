-- Client Requests — the real, persisted backing for customer self-service
-- ("Request a Service", "Request a Connector/Source") demanded by the 2026-08-20
-- master UAT pass, Parts 1/2/6/14.
--
-- Deliberately ONE table for both service and connector requests (and left
-- extensible to support/requirement requests) rather than two near-identical
-- parallel systems — the review/approve/reject/in_progress/completed workflow
-- is identical regardless of what's being requested; only what gets linked on
-- approval differs (see client-request-service.ts's approve()).
--
-- Reuses, never duplicates, the platform's REAL existing service/connector
-- models: approving a 'service' request calls the exact same
-- oc_client_services enable path the staff Services page already uses;
-- approving a 'connector' request creates a real (but honestly
-- not_configured, never fabricated 'connected') oc_connectors row for staff
-- to then configure through the existing connector flow.

CREATE TABLE IF NOT EXISTS oc_client_requests (
  id TEXT PRIMARY KEY DEFAULT 'req-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('service', 'connector', 'support', 'requirement')),
  -- 'service': target_key is an oc_capabilities.id. 'connector': target_key is
  -- a provider name (may legitimately be one AskABD doesn't support yet —
  -- free text, honestly, never validated against a closed enum that would
  -- silently reject a real customer need).
  target_key TEXT,
  -- Human-readable label captured AT REQUEST TIME — survives the underlying
  -- catalog entry being renamed or removed later; never re-derived after the
  -- fact from a name that may no longer mean the same thing.
  target_label TEXT,
  description TEXT NOT NULL DEFAULT '',
  -- The real, verified identity who submitted this — never a client-supplied
  -- display name. org_context recorded alongside for real tenant-isolation
  -- checks on the customer-facing read path (a customer only ever sees their
  -- OWN client's requests via the already-tenant-scoped /oc/portal/:clientId
  -- route, but this column lets that be verified/audited independently too).
  requested_by TEXT NOT NULL,
  requested_by_org_context TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'under_review', 'approved', 'rejected', 'in_progress', 'completed')),
  assigned_to TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oc_client_requests_client ON oc_client_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_oc_client_requests_status ON oc_client_requests (status);
CREATE INDEX IF NOT EXISTS idx_oc_client_requests_org ON oc_client_requests (requested_by_org_context);
CREATE INDEX IF NOT EXISTS idx_oc_client_requests_type ON oc_client_requests (request_type);
