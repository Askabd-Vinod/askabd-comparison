#!/bin/bash
# AskABD Database Backup Script
# Performs timestamped pg_dump with retention policy.
# Usage: ./backup.sh [retention_days]
# Requires: PGHOST, PGUSER, PGPASSWORD, PGDATABASE environment variables.
# In production: triggered by cron or K8s CronJob.

set -euo pipefail

RETENTION_DAYS=${1:-${BACKUP_RETENTION_DAYS:-30}}
BACKUP_DIR=${BACKUP_DIR:-/backup}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/askabd_${TIMESTAMP}.sql.gz"

echo "[BACKUP] Starting AskABD database backup at $(date -Iseconds)"
echo "[BACKUP] Target: ${BACKUP_FILE}"

# Create backup directory if needed
mkdir -p "${BACKUP_DIR}"

# Perform backup with compression
pg_dump \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-askabd_user}" \
  --dbname="${PGDATABASE:-askabd}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE%.gz}" 2>&1

# Verify backup file exists and is non-empty
if [ ! -s "${BACKUP_FILE%.gz}" ]; then
  echo "[BACKUP] ERROR: Backup file is empty or missing!"
  exit 1
fi

FILESIZE=$(stat -c%s "${BACKUP_FILE%.gz}" 2>/dev/null || stat -f%z "${BACKUP_FILE%.gz}" 2>/dev/null)
echo "[BACKUP] Backup completed: ${FILESIZE} bytes"

# Clean up old backups (retention policy)
echo "[BACKUP] Applying retention policy: ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "askabd_*.sql*" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

REMAINING=$(find "${BACKUP_DIR}" -name "askabd_*.sql*" | wc -l)
echo "[BACKUP] Backups retained: ${REMAINING}"
echo "[BACKUP] Completed successfully at $(date -Iseconds)"
