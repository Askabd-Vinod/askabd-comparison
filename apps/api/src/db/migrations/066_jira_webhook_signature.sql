-- Migration 066: Jira webhook signature verification (RISK-015)
--
-- Real, cryptographic HMAC-SHA256 signature verification for POST /oc/jira/webhook,
-- replacing the previous structural-JSON-only validation. docs/production-connection
-- -readiness.md had documented "Shared secret header validation" as this webhook's
-- production auth mechanism since before this migration — that claim was never
-- actually implemented until now (see docs/security-risk-register.md RISK-015).
--
-- webhook_secret_encrypted follows the exact same storage convention already used
-- for auth_token_encrypted on this table (SecretProvider abstraction — see
-- jira-integration-service.ts and secrets-provider.ts; genuinely plaintext in this
-- DEV environment's DevSecretProvider, same disclosed production blocker as the
-- existing Jira API token).

ALTER TABLE oc_jira_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT DEFAULT '';

-- Real, DB-backed anti-replay record. A byte-identical (environment, signature)
-- pair can only be accepted once — a genuine replay of a previously-valid,
-- captured request is rejected via the UNIQUE constraint below, not a
-- best-effort in-memory check that would reset on every process restart.
CREATE TABLE IF NOT EXISTS oc_jira_webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT 'jwd-' || gen_random_uuid()::text,
  environment TEXT NOT NULL,
  signature_hash TEXT NOT NULL, -- sha256(signature header value), not the raw signature itself
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment, signature_hash)
);

CREATE INDEX IF NOT EXISTS idx_jira_webhook_deliveries_received_at ON oc_jira_webhook_deliveries(received_at);
