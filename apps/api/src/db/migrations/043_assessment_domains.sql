-- Current State Assessment — extend to the six other domains (roadmap
-- Phase 2, item 2: "extend the existing assessment-service.ts shape...
-- to the other six categories: Business, Application, Data, Security,
-- Quality, Operations, rather than a parallel schema").
--
-- Real, additive extension of oc_assessments (migration 007) — same table,
-- same AssessmentResult/AssessmentFinding shape (Source/Evidence/Confidence
-- via the existing `evidence` field), NOT a new parallel schema. Every
-- assessment row before this migration was implicitly an Infrastructure
-- assessment (the only domain assessment-service.ts covered); this column
-- makes that explicit and lets the same table hold the six new domains too.
ALTER TABLE oc_assessments ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'infrastructure' CHECK (domain IN (
  'infrastructure', 'business', 'application', 'data', 'security', 'quality', 'operations'
));
CREATE INDEX IF NOT EXISTS idx_oc_assessments_client_domain ON oc_assessments (client_id, domain, created_at DESC);
