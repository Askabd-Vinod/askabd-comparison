-- connector_test_1 fast-follow (2026-08-24): real TLS support for the
-- database connector. Previously `client-database-connection-service.ts`
-- hardcoded `ssl: false` unconditionally -- no TLS was ever negotiated,
-- regardless of the connection's declared VPN/security-profile status, and
-- the Connector Configuration UI made a false, fabricated claim about
-- encryption. This migration adds the real, honest configuration surface:
-- an explicit ssl_mode ('disable' | 'require' | 'verify-full', matching
-- libpq's own sslmode vocabulary for familiarity) and an optional CA
-- certificate for verify-full's real hostname+chain validation against a
-- client's own (often internal/self-signed) CA. Defaults to 'disable' for
-- schema/backward-compatibility safety -- every pre-existing row and this
-- session's own local test infrastructure keep working unchanged; the real
-- UI nudges new connections toward 'require' as a client-side default.
ALTER TABLE oc_client_database_connections
  ADD COLUMN IF NOT EXISTS ssl_mode TEXT NOT NULL DEFAULT 'disable'
    CHECK (ssl_mode IN ('disable', 'require', 'verify-full')),
  ADD COLUMN IF NOT EXISTS ssl_ca_certificate TEXT;
