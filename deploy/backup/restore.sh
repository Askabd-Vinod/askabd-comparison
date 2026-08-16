#!/bin/bash
# AskABD Database Restore Script
# Restores from a pg_dump backup file.
# Usage: ./restore.sh <backup_file>
# WARNING: This will DROP and recreate the database.

set -euo pipefail

BACKUP_FILE=${1:?Usage: ./restore.sh <backup_file>}

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[RESTORE] ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "[RESTORE] Starting AskABD database restore at $(date -Iseconds)"
echo "[RESTORE] Source: ${BACKUP_FILE}"
echo "[RESTORE] Target: ${PGDATABASE:-askabd} @ ${PGHOST:-localhost}"
echo ""
echo "[RESTORE] WARNING: This will drop and recreate the database."
echo "[RESTORE] Press Ctrl+C to cancel, or wait 5 seconds to proceed..."
sleep 5

# Drop and recreate database
echo "[RESTORE] Dropping database..."
dropdb --if-exists --host="${PGHOST:-localhost}" --port="${PGPORT:-5432}" --username="${PGUSER:-askabd_user}" "${PGDATABASE:-askabd}" || true
createdb --host="${PGHOST:-localhost}" --port="${PGPORT:-5432}" --username="${PGUSER:-askabd_user}" "${PGDATABASE:-askabd}"

# Restore
echo "[RESTORE] Restoring from backup..."
pg_restore \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-askabd_user}" \
  --dbname="${PGDATABASE:-askabd}" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  "${BACKUP_FILE}" 2>&1 || true

echo "[RESTORE] Restore completed at $(date -Iseconds)"
echo "[RESTORE] Verify: connect to database and check table counts."
