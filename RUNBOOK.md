# Runbook — AskABD Comparison Platform

## Service Map
| Service | Port | Health |
|---------|------|--------|
| API Gateway | 3000 | /health |
| Identity | 3100 | /v1/health |
| Organization | 3200 | /v1/health |
| Workflow | 3300 | /v1/health |
| Document | 3400 | /v1/health |
| Notification | 3500 | /v1/health |
| Search | 3600 | /v1/health |
| Configuration | 3800 | /v1/health |
| Audit | 3900 | /v1/health |
| Financial | 4000 | /v1/health |
| Analytics | 4100 | /v1/health |
| Comparison API | 4200 | /health |
| Comparison Web | 3001 | N/A (static) |

## Startup Order
1. PostgreSQL databases
2. Redis
3. Identity Platform (issues tokens)
4. All other infrastructure platforms (parallel)
5. API Gateway (routes to all)
6. Comparison API
7. Comparison Web

## Common Operations

### Deploy new version
```bash
docker build -t askabd/comparison-api:v1.0.0-beta.1 -f apps/api/Dockerfile .
kubectl set image deployment/comparison-api comparison-api=askabd/comparison-api:v1.0.0-beta.1
```

### Run migrations
```bash
kubectl exec deployment/comparison-api -- node dist/db/migrate.js
```

### Rollback
```bash
kubectl rollout undo deployment/comparison-api
```

### Scale
```bash
kubectl scale deployment comparison-api --replicas=5
```

### View logs
```bash
kubectl logs -f deployment/comparison-api
```

### Check all service health
```bash
curl http://localhost:3000/services/health
```
