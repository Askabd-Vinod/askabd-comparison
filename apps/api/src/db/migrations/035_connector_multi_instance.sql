-- Connector multi-instance support (2026-08-21, final hardening pass).
--
-- Real gap: `oc_connectors` was UNIQUE(client_id, provider) — a client could
-- never have both "AWS Production" and "AWS Development" (or two GitHub
-- orgs, two Kubernetes clusters, etc.) at the same time. This is the exact
-- same class of gap already fixed for databases (migration 034,
-- oc_client_database_connections) — this migration applies the same fix to
-- the general SaaS/cloud connector catalog (aws, azure, github, kubernetes,
-- gitlab, jira, slack, and everything else in lib/connectors.ts).
--
-- `name` defaults to the provider id itself, so every pre-existing row (and
-- every existing single-instance write path that doesn't pass a name) keeps
-- behaving exactly as before — this is additive, not a breaking rename.
ALTER TABLE oc_connectors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
UPDATE oc_connectors SET name = provider WHERE name = '';

ALTER TABLE oc_connectors DROP CONSTRAINT IF EXISTS oc_connectors_client_id_provider_key;
ALTER TABLE oc_connectors ADD CONSTRAINT oc_connectors_client_id_provider_name_key UNIQUE (client_id, provider, name);

CREATE INDEX IF NOT EXISTS idx_oc_connectors_client_provider ON oc_connectors(client_id, provider);
