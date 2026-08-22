-- Universal Discovery — free-text problem-statement intake (roadmap Phase 2,
-- item 1: "free-text problem statement intake first (cheapest, highest
-- value); document/file ingestion as a fast-follow"). Document/file
-- ingestion (PDF/Word/spreadsheet/screenshot) is deliberately NOT built in
-- this migration — out of scope for this pass, a real fast-follow, not
-- fabricated here.
--
-- Genuinely new capability — confirmed by investigation before writing this:
-- discovery-service.ts does live, connector-based TECHNICAL resource
-- discovery (tables/schemas/repos via real credentials); problem-universe-
-- service.ts stores already-CLASSIFIED problems (severity/priority/impact).
-- Neither captures the raw, human-authored "here is what's wrong, in our
-- own words" narrative that is the actual starting point of the real
-- discovery journey (Part 8's chain begins here, upstream of a Business
-- Requirement). This migration is that missing first step.
--
-- No real AI/NLP extraction exists in this platform yet (confirmed:
-- ai-copilot.tsx honestly states it is not connected to a real AI backend).
-- Per Part 34 of the governing brief, extracted fields must always be
-- clearly attributed and never presented as an automated inference unless
-- backed by a real model — so extraction here is a STAFF action (a human
-- reads the raw free text and tags real structured findings from it, each
-- with an evidence quote back into the source), never a fabricated
-- "auto-extracted by AI" claim.

CREATE TABLE IF NOT EXISTS discovery_sources (
  id TEXT PRIMARY KEY DEFAULT 'dsrc-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'free_text' CHECK (source_type IN (
    'free_text', 'document', 'meeting_notes', 'email', 'other'
  )),
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'archived')),
  submitted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discovery_sources_client ON discovery_sources (client_id, created_at DESC);

-- Real, structured findings a staff member has tagged out of a source's raw
-- text — never an automated claim. evidence_quote is the actual substring
-- of raw_content that justifies field_value, so a reader can always verify
-- the extraction against the original words, not just trust it.
CREATE TABLE IF NOT EXISTS discovery_extractions (
  id TEXT PRIMARY KEY DEFAULT 'dext-' || gen_random_uuid()::text,
  source_id TEXT NOT NULL REFERENCES discovery_sources(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  evidence_quote TEXT NOT NULL DEFAULT '',
  -- 'unverified' is the safe default — matches oc_business_requirements'
  -- quality_status convention (migration 038): never assume high confidence
  -- just because a field was filled in.
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('high', 'medium', 'low', 'unverified')),
  extracted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discovery_extractions_source ON discovery_extractions (source_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_discovery_extractions_client ON discovery_extractions (client_id);
