-- Generic Approval Workflow Engine (Phase 1 of the Master Platform
-- Evolution Program — see docs/enterprise-operations-roadmap.md Phase 1).
--
-- Like the Versioning Engine (migration 039), this is built once so future
-- phases (Document Generation approval, Gap Resolution approval, Change
-- Management, ...) reach for a shared mechanism instead of each inventing
-- its own status enum and transition logic. No existing "approval workflow"
-- concept was found anywhere in this codebase (confirmed by search before
-- writing this) — this is new capability, not a retrofit of working code.

CREATE TABLE IF NOT EXISTS approval_workflows (
  id TEXT PRIMARY KEY DEFAULT 'appr-' || gen_random_uuid()::text,
  -- Generic entity reference, same convention as entity_versions — not a
  -- foreign key by design, so this engine never depends on any one entity
  -- table's schema.
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  -- The real state machine (Part 41 of the governing brief's own vocabulary):
  -- DRAFT -> IN_REVIEW -> (CHANGES_REQUESTED -> IN_REVIEW)* -> APPROVED | REJECTED
  -- APPROVED -> SUPERSEDED (when a newer workflow for the same entity is opened)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_review', 'changes_requested', 'approved', 'rejected', 'superseded'
  )),
  title TEXT NOT NULL DEFAULT '',
  -- Real, structured "what am I approving" context — e.g. a snapshot of the
  -- entity's key fields at submission time, or a reference to a specific
  -- entity_versions row. Never used to fabricate a decision — the actual
  -- decision is always the real, human transition below.
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ,
  -- Set only on a real approve/reject decision — never inferred.
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_entity ON approval_workflows (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_status ON approval_workflows (status);

-- Real, complete transition history — every status change, who made it, and
-- why (when a reason was given). This is the actual evidence trail for "who
-- approved this and when," not just the current status.
CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id TEXT PRIMARY KEY DEFAULT 'apprstep-' || gen_random_uuid()::text,
  workflow_id TEXT NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_workflow ON approval_workflow_steps (workflow_id, created_at);

-- At most one non-terminal (draft/in_review/changes_requested) workflow per
-- entity at a time — a real business rule (you cannot have two competing
-- open approval processes for the same thing), enforced by the DB, not just
-- application code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_workflows_one_open_per_entity
  ON approval_workflows (entity_type, entity_id)
  WHERE status IN ('draft', 'in_review', 'changes_requested');
