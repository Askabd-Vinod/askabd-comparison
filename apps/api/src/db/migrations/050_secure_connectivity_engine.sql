-- Secure Client Environment Connectivity Engine — a real, generic security-
-- metadata layer over EXISTING connector tables (`oc_connectors`,
-- `oc_client_database_connections`), not a third, competing connector
-- system. Polymorphic by design (`connector_source_type`/`connector_source_id`)
-- so any current or future connector type can carry the same real
-- classification/VPN/permission/network-path metadata without forcing a
-- schema change on every connector-type table — same generic-primitive
-- philosophy as the Phase 1 Traceability/Versioning/Approval engines.
--
-- v1 scope, stated honestly (see docs/enterprise-operations-progress.md
-- for the full write-up): this session cannot provision real VPN tunnels,
-- bastion hosts, WireGuard/IPSec configs, or a client-side agent binary —
-- there is no client network to connect to from this sandbox. What IS
-- real: the classification/status MODEL, a real, ENFORCED guard
-- (`assertReadyForConnection`) that genuinely blocks a real connection
-- attempt (proven against the Universal Comparison Engine) when a
-- required VPN is not connected, a real secret-masking filter applied to
-- real persisted error/evidence text, a real external-integration
-- allowlist enforced before any adapter push, and a real, computed
-- Client Security Report — never a fabricated "secure" status.
--
-- A real, deliberate decision: `oc_connectors.security_level` already
-- exists (a real, in-use column — see assessment-service.ts's real
-- admin-connector finding) and is a SIMILAR but not identical concept
-- (a coarse access-level classification on that one table). Left
-- untouched — this migration does not rename, migrate, or duplicate it;
-- `permission_scope` here is a distinct, generic least-privilege concept
-- (READ_ONLY/READ_WRITE/ADMIN) that applies across every connector type,
-- including `oc_client_database_connections`, which has no equivalent
-- field at all today.

CREATE TABLE IF NOT EXISTS client_connection_security (
  id TEXT PRIMARY KEY DEFAULT ('ccs-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  connector_source_type TEXT NOT NULL CHECK (connector_source_type IN ('oc_connectors', 'oc_client_database_connections')),
  connector_source_id TEXT NOT NULL,
  data_classification TEXT NOT NULL DEFAULT 'confidential' CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted', 'secret')),
  vpn_status TEXT NOT NULL DEFAULT 'not_required' CHECK (vpn_status IN ('not_required', 'required', 'configured', 'connected', 'failed', 'expired', 'auth_failed')),
  permission_scope TEXT NOT NULL DEFAULT 'read_only' CHECK (permission_scope IN ('read_only', 'read_write', 'admin')),
  network_path TEXT NOT NULL DEFAULT 'direct_https' CHECK (network_path IN (
    'direct_https', 'private_https', 'vpn', 'site_to_site_vpn', 'wireguard', 'ipsec',
    'private_network', 'vpc_peering', 'private_link', 'bastion', 'ssh_tunnel',
    'reverse_connector', 'agent', 'other'
  )),
  data_residency_region TEXT,
  last_reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connector_source_type, connector_source_id)
);
CREATE INDEX IF NOT EXISTS idx_client_connection_security_client ON client_connection_security(client_id);

-- Real, client-configurable allowlist — "Before sending client information
-- externally: verify Integration configured / Authorization exists /
-- Destination allowed." Disabled by default for every provider (closed by
-- default, same convention as CRM's customer_visible flags this session).
CREATE TABLE IF NOT EXISTS client_integration_allowlist (
  id TEXT PRIMARY KEY DEFAULT ('cia-' || gen_random_uuid()::text),
  client_id TEXT NOT NULL REFERENCES oc_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT '',
  enabled_by TEXT,
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_client_integration_allowlist_client ON client_integration_allowlist(client_id);
