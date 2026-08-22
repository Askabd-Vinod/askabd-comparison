-- Invitation de-duplication — PostgreSQL as the final authority, not just an
-- application-level pre-check (which is inherently racy: two concurrent
-- "create invitation" requests for the same client+email can both pass an
-- application-level SELECT-then-INSERT check before either has committed).
--
-- Real bug this closes (found live during manual UAT 2026-08-20): the same
-- customer email could accumulate multiple 'invited' rows for the same
-- client, because the only existing guard was a non-atomic SELECT in
-- invitation-service.ts's createInvitation(). A unique partial index makes a
-- second concurrent INSERT fail at the database level (23505) instead of
-- silently succeeding — invitation-service.ts now catches that failure and
-- returns the winning row instead of erroring, so the caller-facing behavior
-- is "reuse the existing invitation," never a raw 500.
--
-- Case-insensitive + trimmed: matches the email normalization now applied in
-- invitation-service.ts before every read/write, so "Foo@Bar.com " and
-- "foo@bar.com" are correctly treated as the same invitee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_invitations_one_active_per_client_email
  ON oc_invitations (client_id, lower(trim(email)))
  WHERE status = 'invited';

-- Hot path for "find my pending invitations across every client" (used by the
-- authenticated-customer pending-invitation detection flow — see
-- operations-center-routes.ts's GET /oc/me/pending-invitations). org_context
-- is the real authorization key already used everywhere else in this schema
-- (client_identity_mapping), not email — see docs/askabd-tenant-model.md.
CREATE INDEX IF NOT EXISTS idx_oc_invitations_org_context_status
  ON oc_invitations (org_context, status);
