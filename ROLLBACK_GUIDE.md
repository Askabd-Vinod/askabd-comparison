# Rollback Guide

## Application Rollback

### Kubernetes
```bash
# View rollout history
kubectl rollout history deployment/comparison-api

# Rollback to previous version
kubectl rollout undo deployment/comparison-api

# Rollback to specific revision
kubectl rollout undo deployment/comparison-api --to-revision=3

# Verify
kubectl rollout status deployment/comparison-api
```

### Docker
```bash
# Tag previous version
docker tag askabd/comparison-api:v1.0.0-beta.0 askabd/comparison-api:latest

# Restart
docker compose up -d
```

## Database Rollback

**WARNING:** Database migrations are forward-only by design.

If a migration causes issues:
1. Restore from backup (see BACKUP_RESTORE.md)
2. Deploy the previous application version
3. Verify data integrity

## Rollback Decision Tree
```
Is the issue in application code?
  YES → kubectl rollout undo
  NO →
    Is the issue in database schema?
      YES → Restore from backup + rollback app
      NO →
        Is the issue in configuration?
          YES → Revert ConfigMap/Secret + restart pods
          NO → Escalate to engineering
```

## Post-Rollback
1. Verify health: `curl /health`
2. Run smoke tests
3. Notify stakeholders
4. Create incident report
