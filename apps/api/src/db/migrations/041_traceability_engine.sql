-- Generic Traceability Engine (Phase 1 of the Master Platform Evolution
-- Program — see docs/enterprise-operations-roadmap.md Phase 1). Closes out
-- Phase 1's shared-foundation items (Versioning [039], Approval Workflow
-- [040], this one).
--
-- Supports the BR->FR->TR->EWR->EWP->Task->TC->Defect->Deployment->UAT->
-- Production chain from Part 8 of the governing brief, but generic enough
-- for any two linked entities — never assumes a specific entity schema
-- (same convention as entity_versions and approval_workflows: entity_type/
-- entity_id string pairs, not foreign keys).

CREATE TABLE IF NOT EXISTS traceability_links (
  id TEXT PRIMARY KEY DEFAULT 'trace-' || gen_random_uuid()::text,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  -- Real, distinct relationship semantics — not just "linked to". A
  -- Business Requirement DERIVES a Functional Requirement; a Test Case
  -- TESTS a Task; a Defect BLOCKS a Deployment; etc.
  link_type TEXT NOT NULL DEFAULT 'derives_from' CHECK (link_type IN (
    'derives_from', 'implements', 'tests', 'blocks', 'depends_on', 'relates_to'
  )),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotent by design: recording the same real link twice is a no-op,
  -- not a duplicate row (see traceability-engine.ts's link() — uses
  -- ON CONFLICT DO NOTHING then reads back the existing row).
  UNIQUE (source_type, source_id, target_type, target_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_traceability_links_source ON traceability_links (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_traceability_links_target ON traceability_links (target_type, target_id);
