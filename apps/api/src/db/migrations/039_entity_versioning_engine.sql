-- Generic Versioning Engine (Phase 1 of the Master Platform Evolution
-- Program — see docs/enterprise-operations-roadmap.md Phase 1).
--
-- Several services already hand-roll their own per-entity version history
-- table (oc_client_service_requirement_history, oc_business_requirement_history,
-- ...) — each one correct, but each one a fresh ad hoc reimplementation of the
-- exact same shape (entity_type/entity_id/version/field_snapshot/changed_by/
-- changed_at). Per the roadmap's own reasoning: build the generic version
-- ONCE now so future phases (2-7) reuse it instead of inventing yet another
-- copy. This is deliberately NOT a retrofit of the existing per-entity
-- history tables (out of scope, real working functionality, do not touch —
-- see the platform's own "do not rebuild what already works" rule) — it is
-- the shared engine new work should reach for going forward.

CREATE TABLE IF NOT EXISTS entity_versions (
  id TEXT PRIMARY KEY DEFAULT 'ver-' || gen_random_uuid()::text,
  -- Free-text entity-type discriminator (e.g. 'business_requirement',
  -- 'gap', 'document') — not a foreign key, deliberately: this engine is
  -- generic and must not depend on any one entity table's schema.
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  -- The full field state at this version — same shape convention as every
  -- existing hand-rolled history table in this codebase.
  field_snapshot JSONB NOT NULL,
  changed_by TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Real, DB-enforced guarantee that two callers can never write the same
  -- version number for the same entity — the service layer additionally
  -- serializes version-number assignment per entity via a transaction-scoped
  -- advisory lock (see versioning-engine.ts), but this constraint is the
  -- backstop if that discipline is ever bypassed.
  UNIQUE (entity_type, entity_id, version)
);
CREATE INDEX IF NOT EXISTS idx_entity_versions_lookup ON entity_versions (entity_type, entity_id, version DESC);
