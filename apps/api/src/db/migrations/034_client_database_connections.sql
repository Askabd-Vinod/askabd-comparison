-- Client Database Connections — real, multi-record connection management (2026-08-21).
--
-- Real gap found and closed: the pre-existing `oc_connectors` table is UNIQUE on
-- (client_id, provider) — a client can only ever have ONE PostgreSQL connector, ONE
-- Oracle connector, etc. Real enterprise clients routinely have multiple databases of
-- the same technology (Production Oracle, UAT Oracle, a second Postgres for reporting).
-- This table is deliberately NOT unique on (client_id, connector_type) — a client can
-- have as many named connections as they actually have databases.
--
-- Passwords are never stored in plaintext: `password_ref` is an opaque reference from
-- the existing SecretProvider abstraction (secrets-provider.ts) — the same seam already
-- used for the Jira integration — never the raw credential, and the API never returns it.
CREATE TABLE IF NOT EXISTS oc_client_database_connections (
  id TEXT PRIMARY KEY DEFAULT 'dbconn-' || gen_random_uuid()::text,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  connector_type TEXT NOT NULL, -- postgresql, oracle, sqlserver, mysql, mongodb, other
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_ref TEXT, -- opaque SecretProvider reference; never the raw password
  auth_type TEXT NOT NULL DEFAULT 'standard', -- standard, iam, kerberos, certificate
  environment TEXT NOT NULL DEFAULT 'production', -- production, staging, uat, development
  description TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'not_tested', -- not_tested, connected, failed, disabled
  last_test_mode TEXT, -- real, demo
  last_test_steps JSONB DEFAULT '[]',
  last_test_error TEXT DEFAULT '',
  last_tested_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_client_db_connections_client ON oc_client_database_connections(client_id);
CREATE INDEX IF NOT EXISTS idx_oc_client_db_connections_status ON oc_client_database_connections(status);
