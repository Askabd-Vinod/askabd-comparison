-- Client invitations — the real onboarding entry point for a brand-new customer.
--
-- Bridges the two things askabd-comparison already owns: `oc_clients` (its own
-- consulting customers) and `client_identity_mapping` (migration 024 — which org_context
-- is authorized for which client). An invitation is the mechanism that creates BOTH a real
-- askabd-identity identity AND the mapping row, atomically, on acceptance — never before.
--
-- Deliberately NOT stored in askabd-identity: an invitation is fundamentally "AskABD is
-- granting access to one of ITS OWN clients," a concept askabd-identity has no model for
-- and should not need one for — same reasoning as client_identity_mapping itself.

CREATE TABLE IF NOT EXISTS oc_invitations (
  id TEXT PRIMARY KEY DEFAULT 'inv-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  -- The org_context that will be granted access to client_id on acceptance (via
  -- client_identity_mapping). Chosen at invitation time by the inviting admin — not
  -- guessed, not defaulted to the client's own id (see docs/askabd-tenant-model.md's
  -- explicit rejection of the org_context==client_id convention).
  org_context TEXT NOT NULL,
  email TEXT NOT NULL,
  -- Only the SHA-256 hash of the raw invitation token is ever stored — the raw token
  -- exists only in the email sent to the invitee and briefly in-memory at creation time.
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'expired', 'revoked')),
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  -- The real askabd-identity identity ID created on acceptance — recorded for audit
  -- traceability, never guessed or fabricated.
  accepted_identity_id TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  resent_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_invitations_token_hash ON oc_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_oc_invitations_client ON oc_invitations (client_id);
CREATE INDEX IF NOT EXISTS idx_oc_invitations_email ON oc_invitations (email);
-- Hot path for "does this client already have a live invitation for this email" (used to
-- avoid silently issuing duplicate invitations, and to power resend).
CREATE INDEX IF NOT EXISTS idx_oc_invitations_client_email_status
  ON oc_invitations (client_id, email, status);
