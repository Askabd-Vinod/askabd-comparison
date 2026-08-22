-- Business Requirements Intelligence (Phase 1 of the Master Platform
-- Evolution Program — see docs/enterprise-operations-roadmap.md).
--
-- Real architecture decision made here, documented rather than silently
-- assumed: this is deliberately a NEW, separate table from the existing
-- `oc_client_service_requirements` (requirements-service.ts). That existing
-- table is AskABD's own fixed, well-specified ONBOARDING catalog (Database
-- Host, Security Contact, Primary Cloud Provider, ...) — every field in it
-- is written by AskABD, not the client, so "is this requirement ambiguous?"
-- is not a meaningful question to ask of it. This new table is the client's
-- own BUSINESS/FUNCTIONAL/TECHNICAL requirements (things like "We need a
-- better ordering system"), which genuinely can be incomplete, ambiguous,
-- conflicting, or duplicate — that is exactly what quality_status below
-- exists to classify, honestly and with real evidence, never fabricated.
--
-- ON DELETE CASCADE: a requirement is owned by exactly one client, same
-- relationship as oc_contacts/oc_client_notes/oc_client_tasks (migration 030).

CREATE TABLE IF NOT EXISTS oc_business_requirements (
  id TEXT PRIMARY KEY DEFAULT 'req-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,

  requirement_type TEXT NOT NULL DEFAULT 'business' CHECK (requirement_type IN (
    'business', 'functional', 'non_functional', 'technical', 'integration',
    'security', 'compliance', 'data', 'reporting', 'migration',
    'performance', 'availability', 'usability'
  )),

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  business_objective TEXT NOT NULL DEFAULT '',
  stakeholder TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL DEFAULT '',

  -- Lifecycle status of the requirement itself (draft/proposed → active →
  -- superseded/deprecated) — distinct from quality_status below.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded', 'deprecated')),

  -- The real capability this table exists for: an honest, evidence-backed
  -- quality classification. Never auto-set to 'complete' just because
  -- fields are non-empty — see business-requirements-service.ts for the
  -- real, explainable rule set. 'unverified' is the safe default for
  -- anything this system cannot honestly assess on its own (e.g. real
  -- semantic conflicts between two requirements need a human to confirm).
  quality_status TEXT NOT NULL DEFAULT 'unverified' CHECK (quality_status IN (
    'complete', 'partially_complete', 'incomplete', 'ambiguous',
    'conflicting', 'duplicate', 'unverified'
  )),
  -- Real, structured reasons for the quality_status above — an array of
  -- {rule, message} objects, e.g. [{"rule":"missing_acceptance_criteria",
  -- "message":"No acceptance criteria provided"}]. Never empty when
  -- quality_status is anything other than 'complete'.
  quality_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Requirement ID this one is a suspected duplicate/conflict of, if any —
  -- set by the same real, explainable check, never a black-box match.
  related_requirement_id TEXT REFERENCES oc_business_requirements(id) ON DELETE SET NULL,

  acceptance_criteria TEXT NOT NULL DEFAULT '',
  dependencies TEXT NOT NULL DEFAULT '',
  constraints TEXT NOT NULL DEFAULT '',
  assumptions TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',

  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_business_requirements_client ON oc_business_requirements (client_id);
CREATE INDEX IF NOT EXISTS idx_oc_business_requirements_quality ON oc_business_requirements (client_id, quality_status);
CREATE INDEX IF NOT EXISTS idx_oc_business_requirements_type ON oc_business_requirements (client_id, requirement_type);

-- Version history — same pattern as oc_client_service_requirement_history.
CREATE TABLE IF NOT EXISTS oc_business_requirement_history (
  id TEXT PRIMARY KEY DEFAULT 'reqhist-' || gen_random_uuid()::text,
  requirement_id TEXT NOT NULL REFERENCES oc_business_requirements(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  field_snapshot JSONB NOT NULL,
  changed_by TEXT,
  version INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_business_requirement_history_req ON oc_business_requirement_history (requirement_id, version DESC);
