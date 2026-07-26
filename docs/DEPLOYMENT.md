# AskABD Comparison Platform — Deployment Guide

## Prerequisites
- Kubernetes cluster (1.28+)
- PostgreSQL 16+
- Redis 7+
- Docker registry access
- All 11 AskABD platform services running

## Build
```bash
docker build -t askabd/comparison-api:latest -f apps/api/Dockerfile .
```

## Deploy
```bash
kubectl apply -f deploy/k8s/secrets.yaml
kubectl apply -f deploy/k8s/api-deployment.yaml
```

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| GATEWAY_URL | Yes | API Gateway URL |
| NODE_ENV | Yes | production |
| PORT | No | Default: 4200 |
| LOG_LEVEL | No | Default: info |

## Health Checks
- Liveness: `GET /health`
- Readiness: `GET /health`

## Scaling
- HPA configured: 2-10 replicas based on CPU (70% threshold)
- Stateless: scale horizontally without coordination

## Migrations
```bash
kubectl exec -it deployment/comparison-api -- node dist/db/migrate.js
```

## Rollback
```bash
kubectl rollout undo deployment/comparison-api
```

## Monitoring
- Prometheus metrics: `GET /metrics` (when enabled)
- Structured JSON logs to stdout
- Correlation IDs in all requests

## Backup
- PostgreSQL: pg_dump scheduled via CronJob
- Point-in-time recovery via WAL archiving

## Disaster Recovery
- RTO: 15 minutes (redeploy from last image)
- RPO: 5 minutes (WAL streaming replication)
- Multi-AZ deployment recommended
