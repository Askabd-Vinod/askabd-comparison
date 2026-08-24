-- Requirements Clarification Engine (requirements_clarification_test_1,
-- 2026-08-24 master completion directive, capability #14). Genuinely NEW —
-- confirmed no clarification/question-generation concept existed anywhere.
--
-- Reuses, rather than duplicates: `business-requirements-service.ts`'s own
-- real, rule-based `classifyQuality()` and its `quality_findings` JSONB
-- (migration 038) — this engine does NOT re-detect missing/ambiguous/
-- duplicate requirements; it consumes the EXISTING real findings and
-- generates a real, specific, human-answerable question for each one. This
-- closes the exact, already-documented gap in the coverage matrix's own
-- prior note: "classifier says which fields are missing, never generates
-- the specific questions a human analyst would ask."

CREATE TABLE IF NOT EXISTS oc_requirement_clarifications (
  id TEXT PRIMARY KEY DEFAULT ('clar-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES oc_business_requirements(id) ON DELETE CASCADE,
  finding_rule TEXT NOT NULL,
  problem TEXT NOT NULL,
  why_required TEXT NOT NULL,
  what_is_missing TEXT NOT NULL,
  question_to_client TEXT NOT NULL,
  possible_interpretation TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'resolved', 'wont_fix')),
  -- The REAL client answer, once given — never invented by this engine.
  client_answer TEXT,
  answered_by TEXT,
  answered_at TIMESTAMPTZ,
  resolution TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_requirement_clarifications_client ON oc_requirement_clarifications(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_requirement_clarifications_requirement ON oc_requirement_clarifications(requirement_id);
