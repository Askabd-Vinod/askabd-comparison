-- API Discovery / Validation Engine (api_discovery_test_1, 2026-08-24
-- master completion directive, capability #75). Genuinely NEW — confirmed
-- no OpenAPI/Swagger parsing or API-spec concept existed anywhere
-- ("Discovery Engine covers DB/infra only, not API specs" — the
-- coverage matrix's own prior, accurate note).
CREATE TABLE IF NOT EXISTS oc_api_specs (
  id TEXT PRIMARY KEY DEFAULT ('apispec-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('openapi3', 'swagger2')),
  base_url TEXT,
  -- Only ever set true by an explicit, real client authorization — never
  -- assumed. Gates whether ANY real outbound validation request may ever
  -- be attempted against base_url (see network-security-policy.ts's real
  -- SSRF protection, reused unmodified for the actual outbound call).
  live_validation_authorized BOOLEAN NOT NULL DEFAULT false,
  raw_spec JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_api_specs_client ON oc_api_specs(client_id);

CREATE TABLE IF NOT EXISTS oc_api_endpoints (
  id TEXT PRIMARY KEY DEFAULT ('apiep-' || gen_random_uuid()::text),
  spec_id TEXT NOT NULL REFERENCES oc_api_specs(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  has_description BOOLEAN NOT NULL DEFAULT false,
  has_response_schema BOOLEAN NOT NULL DEFAULT false,
  has_security_requirement BOOLEAN NOT NULL DEFAULT false,
  documented_status_codes TEXT[] NOT NULL DEFAULT '{}',
  -- Real, live validation result — null until a real check has actually
  -- been run (never fabricated as passing by default).
  last_validation_status TEXT CHECK (last_validation_status IN ('reachable', 'unreachable', 'blocked', 'not_checked')),
  last_validated_at TIMESTAMPTZ,
  last_validation_evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_api_endpoints_spec ON oc_api_endpoints(spec_id);
CREATE INDEX IF NOT EXISTS idx_oc_api_endpoints_client ON oc_api_endpoints(client_id);
