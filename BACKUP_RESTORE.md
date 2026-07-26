# Backup & Restore Guide

## Database Backup

### Manual Backup
```bash
pg_dump -h $DB_HOST -U comp_user -d comparison -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
```

### Automated (Kubernetes CronJob)
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16-alpine
            command: ["pg_dump", "-h", "$(DB_HOST)", "-U", "comp_user", "-d", "comparison", "-f", "/backups/backup.dump"]
          restartPolicy: OnFailure
```

### Restore
```bash
pg_restore -h $DB_HOST -U comp_user -d comparison -c backup.dump
```

## Point-in-Time Recovery
- Enable WAL archiving in PostgreSQL
- Configure `archive_command` to ship WALs to S3/R2
- Restore to any point: `recovery_target_time = '2026-07-26 10:00:00'`

## RPO/RTO
- RPO: 5 minutes (WAL streaming)
- RTO: 15 minutes (restore from latest backup)
