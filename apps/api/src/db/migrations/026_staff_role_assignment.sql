-- Staff role assignment — the real, server-side source of "which AskABD roles does
-- this identity have," closing a genuine gap this migration discovers and fixes:
--
-- Real askabd-identity access tokens carry ONLY sub/org/sid/iat/exp/jti/kid/aud — no
-- `roles` or `permissions` claim (confirmed directly from source — see
-- docs/identity-token-contract.md's Phase 1 claim-shape table). Before this migration,
-- askabd-comparison's RBAC middleware (platform/rbac/middleware.ts's extractRoles)
-- read roles EXCLUSIVELY from that nonexistent claim, meaning every real,
-- genuinely-authenticated identity resolved to an empty role list — no real token
-- could ever pass an Admin.Access check or cross a tenant boundary as admin. Every
-- "admin" capability exercised so far in this platform's real testing was only ever
-- reachable through DEV bypass, never through a real, production-shaped token.
--
-- This table is the real fix, following the exact same pattern already proven for
-- client_identity_mapping (migration 024): askabd-comparison owns this concept (which
-- of ITS roles an identity has) — askabd-identity's own role/permission tables
-- (identity/src/db/migrations/001_initial_schema.sql: role, permission,
-- role_assignment, role_permission) are a SEPARATE, org_context-scoped RBAC system for
-- identity's own domain (who can manage identities within an org) and are not reused
-- here, deliberately — conflating the two would mean askabd-comparison's own
-- application-level roles (Admin.Access, super_admin, etc.) live inside a different
-- service's database, which is not how any other cross-service concern in this
-- platform works (see client_identity_mapping's own rationale for the same reasoning).
--
-- Granted per real identity (by the identity's own `sub` claim — a globally unique
-- UUID from askabd-identity), NOT per org_context, so different staff members sharing
-- the same organizational org_context can hold different roles (least-privilege,
-- per this milestone's explicit "do not give every staff user super_admin"
-- requirement) — mirrors client_identity_mapping's own (client_id, org_context)
-- granularity, adapted to (identity_id, role).

CREATE TABLE IF NOT EXISTS staff_role_assignment (
  id TEXT PRIMARY KEY DEFAULT 'sra-' || gen_random_uuid()::text,
  -- The real askabd-identity `sub` claim value — not a foreign key (identity's own
  -- database is a separate service/database by design), but a real, verified-at-token-
  -- time identifier, never fabricated.
  identity_id TEXT NOT NULL,
  -- Matches this app's own real role vocabulary (platform/rbac/roles.ts) — customer,
  -- business_user, admin, super_admin, merchant, partner, support, auditor. Not
  -- validated by a DB constraint (the role vocabulary already lives in application
  -- code, single source of truth there) — an unknown role string here simply resolves
  -- to zero permissions via ROLE_MAP, the same fail-closed behavior as an unknown role
  -- claim always had.
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  UNIQUE (identity_id, role)
);

CREATE INDEX IF NOT EXISTS idx_staff_role_assignment_identity_active
  ON staff_role_assignment (identity_id)
  WHERE status = 'active';
