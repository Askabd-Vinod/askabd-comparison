-- Client ↔ Identity-Organization Mapping
--
-- The real, explicit, database-enforced answer to the question tenant-access.ts's own
-- docblock left open: "when a real per-client mapping is designed, this module is the
-- single place to extend it." Neither askabd-identity's `org_context` (that service's own
-- flat, single-valued tenancy dimension — see identity's 001_initial_schema.sql) nor this
-- database previously contained any link from an authenticated identity's organization to
-- a specific `oc_clients` row. This migration adds that link. No convention (org_context
-- == client_id) is assumed or required — the mapping is a real row, not a naming rule.
--
-- Deliberately NOT a change to askabd-identity's schema: `org_context` continues to mean
-- exactly what it already means there (the authenticated identity's own organization).
-- This table lives entirely on the askabd-comparison side, which is the side that owns
-- the concept of an `oc_clients` row in the first place — preserving the existing
-- identity-service architecture rather than reaching into it.

CREATE TABLE IF NOT EXISTS client_identity_mapping (
  id TEXT PRIMARY KEY DEFAULT 'cim-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  -- The `org` claim from a real askabd-identity access token (see
  -- askabd-identity/src/services/token-service.ts's TokenClaims — `org_context` at
  -- issuance time). Not a foreign key into askabd-identity's own database — these are
  -- two separate services/databases by design; this column is this side's own record of
  -- which org_context values are entitled to which client(s).
  org_context TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Identity ID of the admin who created this mapping (a real `sub` claim value from a
  -- real admin token) — NULL only for mappings created outside a request context (e.g. a
  -- one-off manual/migration seed), never fabricated.
  created_by TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  -- One (client_id, org_context) pair can only be mapped once — re-authorizing a
  -- previously-revoked pair reactivates the same row (see the service layer's upsert
  -- logic) rather than accumulating duplicate history rows.
  UNIQUE (client_id, org_context)
);

-- The hot path: "given this authenticated request's org_context, which client_ids are
-- currently authorized?" — partial index keeps it small as revoked history accumulates.
CREATE INDEX IF NOT EXISTS idx_client_identity_mapping_org_active
  ON client_identity_mapping (org_context)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_client_identity_mapping_client
  ON client_identity_mapping (client_id);
