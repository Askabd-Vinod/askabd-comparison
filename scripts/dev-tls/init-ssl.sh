#!/bin/sh
# Real, local-dev-only TLS enablement for the disposable comparison-postgres
# container (connector_test_1 TLS fast-follow, 2026-08-24).
#
# Runs once, automatically, on a FRESH volume via postgres's own
# /docker-entrypoint-initdb.d/ mechanism (bind-mounted read-only in
# docker-compose.yml). Copies the throwaway self-signed dev cert/key from
# the read-only mount into the writable data directory and fixes ownership
# /permissions the way Postgres requires (the private key must not be
# group/world-readable, which a directly bind-mounted file often can't
# satisfy cross-platform, especially on Windows Docker Desktop — copying
# into the container's own filesystem and chmod'ing here avoids that).
#
# This cert is NOT a secret — it is a disposable, publicly-committed,
# CN=localhost self-signed certificate that exists solely so this
# platform's own local dev/test Postgres can be reached over real,
# verifiable TLS (proving `client-database-connection-service.ts`'s
# 'require'/'verify-full' modes against genuine, live infrastructure,
# not just unit-level mocks). Never use it, or any cert like it, for a
# real client's actual database.
set -e
cp /docker-entrypoint-initdb.d/tls/server.crt /var/lib/postgresql/data/server.crt
cp /docker-entrypoint-initdb.d/tls/server.key /var/lib/postgresql/data/server.key
chmod 600 /var/lib/postgresql/data/server.key
chmod 644 /var/lib/postgresql/data/server.crt
cat >> "$PGDATA/postgresql.conf" <<-EOF
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
EOF
