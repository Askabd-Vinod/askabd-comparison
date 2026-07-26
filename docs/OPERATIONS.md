# AskABD Comparison Platform — Operations Guide

## Service Architecture
```
Clients → CDN → Gateway(:3000) → Comparison API(:4200) → PostgreSQL
                                                      → Redis (cache)
                                                      → Search Platform
                                                      → 11 AskABD platforms
```

## Health Monitoring
- `GET /health` — service alive
- Response: `{ status: 'ok', service: 'comparison-api', uptime: N }`

## Common Operations

### Scale Up
```bash
kubectl scale deployment comparison-api --replicas=5
```

### View Logs
```bash
kubectl logs -f deployment/comparison-api --all-containers
```

### Run Migrations
```bash
kubectl exec deployment/comparison-api -- node dist/db/migrate.js
```

### Database Backup
```bash
pg_dump -h $DB_HOST -U comp_user comparison > backup_$(date +%Y%m%d).sql
```

## Alerting Rules
| Alert | Condition | Severity |
|-------|-----------|----------|
| API Down | health check fails 3x | Critical |
| High Latency | p95 > 2s for 5min | Warning |
| Error Rate | >5% 5xx in 5min | Critical |
| CPU High | >80% for 10min | Warning |
| DB Connections | >80% pool used | Warning |
| Disk Space | >85% used | Warning |

## Incident Response
1. Check `/health` endpoint
2. Review structured logs (JSON, correlation IDs)
3. Check dependent services via Gateway `/services/health`
4. Check database connectivity
5. Check Redis cache
6. Rollback if deployment-related: `kubectl rollout undo`

## SLA Targets
- Availability: 99.9%
- Response time (p95): < 500ms
- Recovery time: < 15 minutes
