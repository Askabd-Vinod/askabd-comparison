# AskABD — Production Deployment Guide

## Architecture

```
[Client Browser] → [CDN/Cloudflare] → [Reverse Proxy/LB]
                                            ↓
                                    ┌───────┴───────┐
                                    │   Web (3001)  │
                                    │   API (4200)  │
                                    └───────┬───────┘
                                            ↓
                                    [PostgreSQL 5432]
                                    [SMTP Provider]
```

## Prerequisites

- Node.js 20+ (or Docker)
- PostgreSQL 16+
- SMTP provider (SendGrid, SES, or equivalent)
- TLS certificates (via Cloudflare or Let's Encrypt)
- DNS configured for API + Web domains

## Deployment Options

### Option A: Docker Compose (Recommended for small deployments)
```bash
cp .env.example .env
# Edit .env with production values
docker compose -f docker-compose.prod.yml up -d
```

### Option B: Kubernetes (Recommended for enterprise)
```bash
kubectl apply -f deploy/k8s/secrets.yaml
kubectl apply -f deploy/k8s/api-deployment.yaml
```

### Option C: Cloud Platform (AWS/GCP/Azure)
- Use managed PostgreSQL (RDS, Cloud SQL, Azure DB)
- Deploy containers to ECS/Cloud Run/App Service
- Use managed secrets (Secrets Manager, Key Vault)

## Environment Variables

See `.env.example` for complete list. Critical:

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| JWT_SECRET | Yes | Min 32 chars random string |
| CORS_ORIGIN | Yes | Frontend domain |
| EMAIL_PROVIDER | Yes | smtp or ses |
| SMTP_HOST | If smtp | SMTP server host |

## Database

### Migrations
```bash
# Run all migrations in order
for f in apps/api/src/db/migrations/*.sql; do psql -f "$f"; done
```

### Backup (daily via cron)
```bash
0 2 * * * /app/deploy/backup/backup.sh
```

### Restore
```bash
./deploy/backup/restore.sh /backup/askabd_20260811.sql
```

## TLS/HTTPS

### Via Cloudflare (recommended)
- Set DNS to Cloudflare proxy
- Enable Full (strict) SSL mode
- Cloudflare handles certificate provisioning

### Via Reverse Proxy (Caddy/Nginx)
- Caddy auto-provisions Let's Encrypt certs
- Configure upstream to API:4200 and Web:3001

## Scheduler

The scheduler requires an external trigger calling:
```
POST /api/v1/oc/scheduler/run-all
Authorization: Bearer <token>
```

Options:
- Kubernetes CronJob (every 15 minutes)
- CloudWatch Events + Lambda
- External cron service

## Health Checks

- Liveness: `GET /health`
- Readiness: `GET /ready`
- Platform: `GET /platform/health`

## Monitoring

- Structured JSON logs (Pino) → CloudWatch/Datadog/ELK
- Correlation IDs in all requests (x-request-id)
- Audit trail in oc_audit_log table

## Disaster Recovery

- **RPO:** Time since last backup (daily = 24h max data loss)
- **RTO:** Container restart + restore (~15-30 minutes)
- Procedure: See `deploy/backup/restore.sh`

## Security Checklist

- [ ] JWT_SECRET is cryptographically random (32+ chars)
- [ ] DATABASE_URL uses SSL connection
- [ ] CORS_ORIGIN restricted to actual frontend domain
- [ ] Rate limiting configured appropriately
- [ ] TLS termination active
- [ ] Secrets not in source control
- [ ] Container runs as non-root user
- [ ] Security headers active (Helmet)
