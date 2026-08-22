-- Gap Analysis extension (roadmap Phase 2, continuing after item 2). Real,
-- additive extension of the already-working oc_gaps/oc_gap_options/
-- oc_decisions/oc_transformations system (migration 037,
-- gap-analysis-service.ts, decision-transformation-service.ts,
-- clients/[clientId]/gaps/page.tsx) — genuinely new columns/table, no
-- rebuild, no parallel schema. Confirmed via full inspection before writing
-- this: `oc_gaps.related_requirement_id` exists but was never populated by
-- any code path; no compliance-status classification exists (only a
-- lifecycle `status`); no customer-visibility flag; no actor-attribution
-- columns on the gap row itself (only in the separate audit log); no
-- structured evidence-source classification (only a loose JSONB array).

-- Honest compliance classification (distinct from the existing lifecycle
-- `status` column — a gap can be `status='identified'` and
-- `compliance_status='needs_evidence'` at the same time; these are two
-- different real questions). 'unknown' is the safe default, matching this
-- platform's "never fabricate" convention — never auto-set to 'compliant'.
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS compliance_status TEXT NOT NULL DEFAULT 'unknown' CHECK (compliance_status IN (
  'compliant', 'partially_compliant', 'non_compliant', 'missing', 'unknown', 'needs_evidence', 'not_applicable'
));
-- Required whenever compliance_status is set by a real staff action — the
-- "explain why the classification exists" requirement — enforced in
-- gap-analysis-service.ts's classifyCompliance(), not just documented here.
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS compliance_status_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS compliance_classified_by TEXT;
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS compliance_classified_at TIMESTAMPTZ;

-- A gap is internal-only (staff-visible) by default — a customer only ever
-- sees a gap once staff explicitly opts it in, same default-closed
-- convention as CRM's contact/note/task visibility (migration 031).
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS customer_visible BOOLEAN NOT NULL DEFAULT false;

-- NOTE: a `constraints JSONB DEFAULT '[]'` column already exists on oc_gaps
-- in the live DEV database with 153 real rows, but is not declared by any
-- committed migration file — a real pre-existing drift discovered while
-- writing this migration (confirmed via a direct schema query, not
-- assumed). Rather than adding a second, differently-typed `constraints`
-- column (blocked anyway — `ADD COLUMN IF NOT EXISTS` is a safe no-op when
-- the name already exists) or risking a destructive type change against
-- real data, gap-analysis-service.ts stores its free-text constraints
-- value as a JSON string scalar in this existing JSONB column — the same
-- "store text as a JSON scalar in a JSONB column" approach used nowhere
-- else in this codebase but the only safe option that touches neither the
-- column's real existing type nor its real existing data.

-- Real actor attribution on the row itself — previously only recoverable
-- by cross-referencing the separate oc_audit_log, never fabricated as
-- "admin" (see created_by usage in gap-analysis-service.ts).
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE oc_gaps ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE INDEX IF NOT EXISTS idx_oc_gaps_compliance_status ON oc_gaps (client_id, compliance_status);
CREATE INDEX IF NOT EXISTS idx_oc_gaps_customer_visible ON oc_gaps (client_id, customer_visible) WHERE customer_visible = true;

-- Real, structured evidence with an honest source/verification
-- classification — additive alongside the existing `oc_gaps.evidence`
-- JSONB array (left untouched; existing reads/writes of that loose array
-- keep working exactly as before). New evidence added through the real
-- addEvidence() flow lands here instead, where it can be genuinely
-- queried/filtered by source and verification status.
CREATE TABLE IF NOT EXISTS oc_gap_evidence (
  id TEXT PRIMARY KEY DEFAULT 'gapev-' || gen_random_uuid()::text,
  gap_id TEXT NOT NULL REFERENCES oc_gaps(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  text TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'staff_assessment' CHECK (source_type IN (
    'discovery', 'document', 'assessment', 'requirement', 'connector', 'database', 'api', 'client_provided', 'staff_assessment'
  )),
  -- The real distinction the brief asks for: Verified / Client Provided /
  -- Staff Assessment / Needs Verification. A customer submitting evidence
  -- is always recorded as 'client_provided', never 'verified' or
  -- 'staff_assessment' — enforced in the service layer, not just here.
  verification_status TEXT NOT NULL DEFAULT 'needs_verification' CHECK (verification_status IN (
    'verified', 'client_provided', 'staff_assessment', 'needs_verification'
  )),
  reference TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_gap_evidence_gap ON oc_gap_evidence (gap_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_oc_gap_evidence_client ON oc_gap_evidence (client_id);
