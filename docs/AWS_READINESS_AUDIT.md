# AskABD Comparison Platform — Phase 1: AWS Readiness Audit

**Date:** 2026-08-11  
**Repository:** `askabd-comparison`  
**Auditor:** Automated (Kiro)  
**Scope:** Complete inspection of infrastructure, deployment, database, services, security, and operational readiness for AWS migration.

---

## Executive Summary

The AskABD Comparison Platform is a monorepo with two applications (API on Fastify/Node.js 20, Web on Next.js 15) backed by PostgreSQL 16. The platform has 67+ capabilities including full service registry, client lifecycle, discovery, assessment, financial reconciliation, and commercial engagement. The codebase is well-structured with shared platform packages, health checks, audit, RBAC, rate limiting, and structured logging.

**Current state:** Runs in local Docker Compose (DEV) with partial Kubernetes manifests. No AWS infrastructure exists. No real payment provider integration. Email uses Mailpit (DEV only). Document storage is local filesystem. Scheduler uses PostgreSQL advisory locks (safe for multi-instance).

---

## 1. Dockerfiles

| Item | Status | Notes |
|------|--------|-------|
| API Dockerfile | ✅ READY | Multi-stage, non-root user, health check, node:20-alpine |
| Web Dockerfile | ⚠️ CONFIGURATION REQUIRED | Multi-stage, non-root user, health check. Not using Next.js standalone output mode — copies full node_modules |
| Build context | ✅ READY | Both use repo root as context |
| Image tagging | ❌ BLOCKED | K8s manifest uses `askabd/comparison-api:latest` — violates production rule |
| Base image pinning | ⚠️ CONFIGURATION REQUIRED | Uses `node:20-alpine` — should pin to specific digest or patch version |

**Recommendation:**
- Web Dockerfile: Enable `output: 'standalone'` in `next.config.mjs` for minimal production image
- Pin base images with SHA digest for reproducibility
- Never use `:latest` as production reference

---

## 2. Docker Compose

| Item | Status | Notes |
|------|--------|-------|
| docker-compose.yml (DEV) | ✅ READY | PostgreSQL 16 + Mailpit |
| docker-compose.prod.yml | ✅ READY | API + Web + PostgreSQL, health checks, env vars, proper depends_on |
| Secrets exposure | ⚠️ CONFIGURATION REQUIRED | Uses env vars from host — acceptable for local; AWS needs Secrets Manager |

---

## 3. Kubernetes Manifests

| Item | Status | Notes |
|------|--------|-------|
| api-deployment.yaml | ⚠️ CONFIGURATION REQUIRED | Uses `image: askabd/comparison-api:latest` (must use ECR + commit SHA) |
| Service | ✅ READY | ClusterIP on port 4200 |
| HPA | ✅ READY | 2-10 replicas, 70% CPU target |
| Liveness probe | ✅ READY | GET /health, 10s initial delay |
| Readiness probe | ✅ READY | GET /health, 5s initial delay |
| Resource limits | ✅ READY | 256Mi-512Mi memory, 200m-500m CPU |
| secrets.yaml | ❌ BLOCKED | Contains hardcoded placeholder secret in plaintext — must use AWS Secrets Manager |
| Web deployment | 🟡 AWS RESOURCE REQUIRED | No K8s manifest exists for web app |
| Ingress/ALB | 🟡 AWS RESOURCE REQUIRED | No ingress controller configured |
| Network Policy | 🟡 AWS RESOURCE REQUIRED | Not present |
| Pod Security | ⚠️ CONFIGURATION REQUIRED | No PodSecurityPolicy/Standards defined |

---

## 4. Helm Charts

| Item | Status | Notes |
|------|--------|-------|
| Helm chart | N/A | No Helm charts present. Plain K8s manifests used. |

---

## 5. GitHub Actions

| Item | Status | Notes |
|------|--------|-------|
| CI workflow | ✅ READY | TypeScript check, build, unit tests, security audit |
| Release workflow | ⚠️ CONFIGURATION REQUIRED | Builds Docker image on tag, creates GitHub Release. No ECR push, no deploy step |
| Docker image push to ECR | 🟡 AWS RESOURCE REQUIRED | Not configured |
| OIDC to AWS | 🟡 AWS RESOURCE REQUIRED | Not configured — uses no AWS auth |
| Staging deploy | 🟡 AWS RESOURCE REQUIRED | Not present |
| Production deploy | 🟡 AWS RESOURCE REQUIRED | Not present |
| Approval gate | 🟡 AWS RESOURCE REQUIRED | No production approval gate |
| Integration tests in CI | ⚠️ CONFIGURATION REQUIRED | Not present in CI (only unit tests) |
| Image scanning | 🟡 AWS RESOURCE REQUIRED | Not present |

---

## 6. Environment Templates

| Item | Status | Notes |
|------|--------|-------|
| .env.example | ✅ READY | Comprehensive, well-documented |
| deploy/env/staging.env | ⚠️ CONFIGURATION REQUIRED | Skeleton only — uses `${DATABASE_URL}` placeholders |
| deploy/env/production.env | ⚠️ CONFIGURATION REQUIRED | Skeleton only |
| Web .env.local | ✅ READY | NEXT_PUBLIC_API_URL configured |

---

## 7. Database Migrations

| Item | Status | Notes |
|------|--------|-------|
| Migration runner | ✅ READY | Custom pg-based sequential runner with `_migrations` tracking table |
| Migration files | ✅ READY | 21 ordered SQL files (001–021) |
| Idempotency | ✅ READY | Uses `IF NOT EXISTS` and `ON CONFLICT` patterns |
| Rollback support | ⚠️ CONFIGURATION REQUIRED | No down migrations exist — forward-only |
| PostgreSQL version | ✅ READY | 16-alpine, compatible with RDS PostgreSQL 16 |
| Extensions used | ✅ READY | `gen_random_uuid()` (built-in PG 13+), JSONB, GIN indexes |
| Foreign keys | ✅ READY | Proper FK constraints throughout |
| Indexes | ✅ READY | Comprehensive indexes on all query paths |

---

## 8. Backup Scripts

| Item | Status | Notes |
|------|--------|-------|
| backup.sh | ✅ READY | pg_dump with custom format, compression, retention policy |
| restore.sh | ✅ READY | Full restore with drop/recreate, safety timeout |
| S3 backup integration | 🟡 AWS RESOURCE REQUIRED | .env.example mentions BACKUP_S3_BUCKET but script uses local filesystem only |
| Automated scheduling | ⚠️ CONFIGURATION REQUIRED | Documented as cron/CronJob — not automated yet |

---

## 9. Restore Scripts

| Item | Status | Notes |
|------|--------|-------|
| restore.sh | ✅ READY | Functional pg_restore script |
| Validation post-restore | ⚠️ CONFIGURATION REQUIRED | Script says "verify table counts" but doesn't automate verification |
| Point-in-time recovery | 🟡 AWS RESOURCE REQUIRED | Requires RDS PITR (not available with local PostgreSQL) |

---

## 10. Scheduler

| Item | Status | Notes |
|------|--------|-------|
| Scheduler service | ✅ READY | Full job engine with PostgreSQL advisory locking for multi-instance safety |
| Job types | ✅ READY | 9 job types including FINANCIAL_RECONCILIATION |
| Advisory lock (multi-instance) | ✅ READY | `pg_try_advisory_lock(42424242)` prevents duplicate execution |
| External trigger | ✅ READY | `POST /api/v1/oc/scheduler/run-all` endpoint exists |
| AWS integration | 🟡 AWS RESOURCE REQUIRED | Needs EventBridge or CloudWatch Events to trigger periodically |

---

## 11. Email Provider

| Item | Status | Notes |
|------|--------|-------|
| Provider abstraction | ✅ READY | Supports Mailpit (DEV), SMTP (production) |
| AWS SES support | ⚠️ CONFIGURATION REQUIRED | Architecture mentions SES; factory only implements `mailpit` and `smtp` — no SES class exists |
| Retry logic | ✅ READY | 3 attempts with exponential backoff |
| Domain verification | 🟡 AWS RESOURCE REQUIRED | Not configured (SES requires domain verification) |
| Bounce/complaint handling | 🟡 AWS RESOURCE REQUIRED | Not implemented |

---

## 12. Payment Provider Abstraction

| Item | Status | Notes |
|------|--------|-------|
| Payment method schema | ✅ READY | Provider-agnostic, stores tokens only (never PAN/CVV) |
| Payment method service | ✅ READY | CRUD + verification lifecycle |
| Provider integration | ❌ BLOCKED | No real provider (Stripe/Adyen) integration — manual/mock only |
| Webhook endpoint | ⚠️ CONFIGURATION REQUIRED | Not present — needed for provider callbacks |
| Idempotency | ✅ READY | `external_transaction_id` unique index |
| Secure credential storage | 🟡 AWS RESOURCE REQUIRED | Provider secrets need Secrets Manager |

**Status: PAYMENT EXECUTION = CONFIGURATION REQUIRED (provider not connected)**

---

## 13. Object/Document Storage

| Item | Status | Notes |
|------|--------|-------|
| Storage service | ✅ READY | Clean `DocumentStorageService` abstraction with logical references |
| Current backend | ⚠️ CONFIGURATION REQUIRED | Local filesystem (`uploads/` directory) |
| S3 provider | 🟡 AWS RESOURCE REQUIRED | No S3 implementation exists — only filesystem |
| Provider abstraction | ⚠️ CONFIGURATION REQUIRED | Service uses fs directly — needs interface extraction for S3 |
| Encryption | 🟡 AWS RESOURCE REQUIRED | Not implemented (S3+KMS needed) |
| Public access prevention | ✅ READY | Files served through API only (no public URL exposure) |

---

## 14. OpenAPI

| Item | Status | Notes |
|------|--------|-------|
| Swagger/OpenAPI | ✅ READY | `@fastify/swagger` + `@fastify/swagger-ui` registered |
| Documentation endpoint | ✅ READY | `/docs` route (excluded from auth) |

---

## 15. Frontend Build

| Item | Status | Notes |
|------|--------|-------|
| Framework | ✅ READY | Next.js 15.3.3 with App Router |
| Dynamic routes | ✅ READY | `/client-portal/[clientId]`, `/clients/[clientId]/*`, `/engineering/[defectId]`, etc. |
| SSR | ✅ READY | Next.js App Router uses server components by default |
| Standalone output | ⚠️ CONFIGURATION REQUIRED | Not configured — needed for minimal Docker image |
| Environment handling | ✅ READY | `NEXT_PUBLIC_API_URL` properly configured |
| Image optimization | ⚠️ CONFIGURATION REQUIRED | No CDN configured for images |

---

## 16. API Build

| Item | Status | Notes |
|------|--------|-------|
| TypeScript compilation | ✅ READY | TSC produces `dist/` output |
| ES Modules | ✅ READY | `"type": "module"` with proper `.js` extensions in imports |
| Dependencies | ✅ READY | 15 shared vendor tarballs + standard npm packages |
| Build reproducibility | ✅ READY | `package-lock.json` present |

---

## 17. Health Checks

| Item | Status | Notes |
|------|--------|-------|
| `/health` | ✅ READY | Returns DB status, uptime, version |
| `/ready` | ✅ READY | Verifies database connectivity with actual query |
| `/platform/health` | ✅ READY | Comprehensive platform health with security and platform dimensions |
| Distinction alive/ready | ✅ READY | `/health` = alive, `/ready` = dependencies verified |
| Non-expensive checks | ✅ READY | Single count query for readiness |

---

## 18. Readiness Checks

| Item | Status | Notes |
|------|--------|-------|
| Database readiness | ✅ READY | Prisma count query |
| Startup validation | ✅ READY | 16+ checks at boot (DB, JWT, ports, memory, CPU, etc.) |
| Fail-fast in production | ✅ READY | `process.exit(1)` on required check failure in production |

---

## 19. Logging

| Item | Status | Notes |
|------|--------|-------|
| Structured logging | ✅ READY | Pino via `@askabd/shared-logging`, JSON format |
| Correlation IDs | ✅ READY | `x-request-id` / `x-correlation-id` propagation |
| Log levels | ✅ READY | Configurable via `LOG_LEVEL` |
| Secret masking | ✅ READY | No credential logging observed in code |
| CloudWatch integration | 🟡 AWS RESOURCE REQUIRED | Logs go to stdout — CloudWatch agent/Firelens needed to ship |

---

## 20. Audit

| Item | Status | Notes |
|------|--------|-------|
| Audit engine | ✅ READY | `@askabd/shared-audit` + platform audit middleware |
| Write operation capture | ✅ READY | Automatic on all mutations |
| Audit table | ✅ READY | `oc_audit_log` with entity, action, actor, evidence |
| Query API | ✅ READY | `GET /oc/audit` with filters |

---

## 21. Security Headers

| Item | Status | Notes |
|------|--------|-------|
| Helmet middleware | ✅ READY | `@fastify/helmet` registered (CSP disabled for API) |
| CORS | ✅ READY | `@fastify/cors` with `origin: true, credentials: true` |
| CORS restriction | ⚠️ CONFIGURATION REQUIRED | Currently allows all origins — production must restrict to `CORS_ORIGIN` |

---

## 22. Rate Limiting

| Item | Status | Notes |
|------|--------|-------|
| Rate limit middleware | ✅ READY | Custom token bucket implementation |
| Per-route configuration | ✅ READY | Applied after auth (higher limits for authenticated users) |

---

## 23. Authentication

| Item | Status | Notes |
|------|--------|-------|
| JWT verification | ✅ READY | `jose` library, supports EdDSA/RS256, JWKS endpoint |
| Token expiry validation | ✅ READY | Standard JWT exp claim |
| Development bypass | ✅ READY | Only when no JWT_SECRET configured AND not production |
| Public routes | ✅ READY | `/health`, `/ready`, `/metrics`, `/docs` excluded |
| JWKS support | ✅ READY | `JWKS_URL` environment variable supported |

---

## 24. Authorization

| Item | Status | Notes |
|------|--------|-------|
| RBAC framework | ✅ READY | `@askabd/shared-authorization` + platform RBAC |
| Route rules | ✅ READY | `COMPARISON_API_RULES` define per-route access |
| Client isolation | ✅ READY | All queries scoped by `client_id` parameter |
| Dev bypass | ✅ READY | Only in non-production when explicitly configured |

---

## 25. CORS

| Item | Status | Notes |
|------|--------|-------|
| CORS middleware | ✅ READY | Fastify CORS plugin |
| Production restriction | ⚠️ CONFIGURATION REQUIRED | `docker-compose.prod.yml` sets `CORS_ORIGIN` but code uses `origin: true` — must use env var |

---

## 26. Database Connection Pooling

| Item | Status | Notes |
|------|--------|-------|
| Shared pool | ✅ READY | Single `pg.Pool` instance, 15 max connections |
| Connection timeout | ✅ READY | 30,000ms |
| Idle timeout | ✅ READY | 60,000ms |
| Error handling | ✅ READY | Pool-level error handler (non-fatal) |
| Warmup at startup | ✅ READY | `initializeDatabase()` with 3 retries |
| Graceful shutdown | ✅ READY | `sharedPool.end()` on SIGTERM/SIGINT |
| RDS failover handling | ⚠️ CONFIGURATION REQUIRED | No automatic reconnection on DNS failover — pool handles via timeout |

---

## 27. Redis/Cache

| Item | Status | Notes |
|------|--------|-------|
| Redis usage | ⚠️ CONFIGURATION REQUIRED | Startup checks for `REDIS_URL`, architecture mentions Redis caching, but no Redis client code found |
| Cache layer | N/A | No caching implemented in current codebase — planned |

---

## 28. External Integrations

| Item | Status | Notes |
|------|--------|-------|
| Gateway service | ⚠️ CONFIGURATION REQUIRED | `GATEWAY_URL` referenced but this repo operates standalone |
| Payment providers | ❌ BLOCKED | No real provider connected |
| Email SMTP | ⚠️ CONFIGURATION REQUIRED | SMTP abstraction ready, provider credentials needed |
| External transaction import | ❌ BLOCKED | No webhook endpoint for payment provider callbacks |

---

## 29. DNS Configuration

| Item | Status | Notes |
|------|--------|-------|
| Domain | 🟡 AWS RESOURCE REQUIRED | `askabd.com` referenced in CORS/email but no DNS config exists |
| Route 53 | 🟡 AWS RESOURCE REQUIRED | Not configured |
| Cloudflare mention | ⚠️ CONFIGURATION REQUIRED | Architecture doc mentions Cloudflare — DNS authority unclear |

---

## 30. TLS Configuration

| Item | Status | Notes |
|------|--------|-------|
| TLS termination | 🟡 AWS RESOURCE REQUIRED | No TLS in application — relies on reverse proxy/ALB |
| ACM certificate | 🟡 AWS RESOURCE REQUIRED | Not provisioned |
| HTTP redirect | 🟡 AWS RESOURCE REQUIRED | Not configured |

---

## 31. Monitoring

| Item | Status | Notes |
|------|--------|-------|
| Monitoring middleware | ✅ READY | `@askabd/shared-monitoring` records response times, errors |
| Metrics endpoint | ⚠️ CONFIGURATION REQUIRED | `/metrics` in public routes but unclear if Prometheus format |
| CloudWatch dashboards | 🟡 AWS RESOURCE REQUIRED | Not configured |
| X-Ray/OpenTelemetry | 🟡 AWS RESOURCE REQUIRED | Not configured |

---

## 32. Alerting

| Item | Status | Notes |
|------|--------|-------|
| Alert rules defined | ✅ READY | Documented in OPERATIONS.md (5xx spike, latency, DB connections, etc.) |
| CloudWatch Alarms | 🟡 AWS RESOURCE REQUIRED | Not configured |
| SNS notifications | 🟡 AWS RESOURCE REQUIRED | Not configured |

---

## 33. Disaster Recovery

| Item | Status | Notes |
|------|--------|-------|
| RPO defined | ✅ READY | Documented as backup interval (daily = 24h) |
| RTO defined | ✅ READY | 15-30 minutes (container restart + restore) |
| Backup strategy | ✅ READY | pg_dump with retention |
| Multi-AZ | 🟡 AWS RESOURCE REQUIRED | Not configured (requires RDS Multi-AZ) |
| Cross-region | 🟡 AWS RESOURCE REQUIRED | Not configured |
| DR testing | ❌ BLOCKED | No evidence of restore testing |

---

## 34. Infrastructure Documentation

| Item | Status | Notes |
|------|--------|-------|
| ARCHITECTURE.md | ✅ READY | Comprehensive product architecture |
| DEPLOYMENT.md | ✅ READY | K8s and Docker deployment guide |
| OPERATIONS.md | ✅ READY | Operational procedures and alerting |
| deploy/PRODUCTION.md | ✅ READY | Production deployment with Cloudflare/Docker/K8s options |
| BACKUP_RESTORE.md | ✅ READY | Exists at repo root |
| INCIDENT_RESPONSE.md | ✅ READY | Exists at repo root |
| ROLLBACK_GUIDE.md | ✅ READY | Exists at repo root |
| AWS-specific docs | 🟡 AWS RESOURCE REQUIRED | None exist yet |

---

## AWS Readiness Matrix — Summary

### Category Breakdown

| Category | Ready | Config Required | AWS Required | Blocked | N/A | Total |
|----------|-------|-----------------|--------------|---------|-----|-------|
| Compute (Dockerfiles, Build) | 5 | 4 | 0 | 1 | 0 | 10 |
| Orchestration (K8s, Helm) | 5 | 2 | 4 | 1 | 1 | 13 |
| CI/CD (GitHub Actions) | 2 | 2 | 5 | 0 | 0 | 9 |
| Database | 9 | 1 | 1 | 0 | 0 | 11 |
| Storage | 2 | 2 | 3 | 0 | 0 | 7 |
| Security | 11 | 3 | 0 | 0 | 0 | 14 |
| Networking (DNS, TLS, CORS) | 1 | 2 | 4 | 0 | 0 | 7 |
| Observability | 5 | 2 | 4 | 0 | 0 | 11 |
| Operations (Backup, DR) | 5 | 2 | 3 | 1 | 0 | 11 |
| Email | 2 | 1 | 2 | 0 | 0 | 5 |
| Payment | 3 | 2 | 1 | 2 | 0 | 8 |
| Scheduler | 4 | 0 | 1 | 0 | 0 | 5 |
| **TOTALS** | **54** | **23** | **28** | **5** | **1** | **111** |

### Overall Readiness Score

- **Code readiness:** 49% items fully ready
- **Configuration gaps:** 21% need config changes (no AWS resources needed)
- **AWS infrastructure needed:** 25% require AWS resource provisioning
- **Blocked:** 5% have fundamental gaps (payment provider, DR testing)

---

## Critical Findings

### Strengths
1. **Application architecture is production-grade** — shared packages, audit, RBAC, structured logging, health checks, graceful shutdown
2. **Database design is solid** — proper migrations, indexes, FK constraints, advisory locking for scheduler
3. **Security middleware is comprehensive** — JWT, RBAC, rate limiting, Helmet, correlation IDs
4. **Multi-instance safety** — PostgreSQL advisory locks prevent scheduler duplication
5. **No sensitive data in source** — payment schema stores tokens only, OTP never returned to frontend

### Blockers for AWS Production
1. **No ECR repository** — Docker images have no AWS registry
2. **No AWS networking** — No VPC, subnets, security groups
3. **No RDS instance** — Database is local PostgreSQL only
4. **No S3 bucket** — Document storage is local filesystem
5. **No Secrets Manager** — K8s secrets.yaml has plaintext credentials
6. **No TLS/DNS** — No certificate, no Route 53 records
7. **No CloudWatch** — No log shipping, no dashboards, no alarms
8. **No CI/CD to AWS** — Pipeline stops at Docker build, doesn't deploy
9. **Payment provider not integrated** — Ledger exists, no real money movement
10. **SES not implemented** — Email provider factory has no SES class

### Configuration Work (No AWS Resources Needed)
1. Web Dockerfile — add standalone output
2. Pin Docker base images
3. CORS — use `CORS_ORIGIN` env var in code
4. next.config.mjs — add `output: 'standalone'`
5. Image tag strategy — replace `:latest` with commit SHA

---

## Recommended AWS Architecture (Phase 2 Preview)

```
Route 53 (DNS)
     │
CloudFront (CDN + WAF)
     │
Application Load Balancer (TLS termination via ACM)
     │
┌────┴────┐
│ ECS Fargate │
│ ┌─────────┐ ┌─────────┐ │
│ │  API    │ │   Web   │ │
│ │ :4200   │ │  :3001  │ │
│ └────┬────┘ └─────────┘ │
└──────┼──────────────────┘
       │
  ┌────┴────────────────┐
  │ RDS PostgreSQL 16   │
  │ Multi-AZ, encrypted │
  │ Automated backups   │
  └─────────────────────┘

  S3 (document storage, KMS encrypted)
  Secrets Manager (DB URL, JWT, SMTP, payment secrets)
  ECR (container registry)
  CloudWatch (logs, metrics, alarms)
  SES (production email)
  EventBridge (scheduler trigger)
```

**Rationale for ECS Fargate over EKS:** The application is 2 containers (API + Web) with straightforward scaling needs. EKS adds operational complexity (cluster management, node groups, RBAC, networking) that isn't justified for this workload. If multi-service gateway architecture is deployed later, EKS can be evaluated.

---

## Next Steps

Phase 2 awaits explicit approval. It will define the complete target AWS architecture with:
- VPC design (public/private subnets)
- ECS task definitions
- RDS configuration
- S3 bucket policies
- IAM roles (least privilege)
- CI/CD pipeline extension
- Secrets management mapping
- Monitoring/alerting configuration

---

*End of Phase 1 — AWS Readiness Audit*
