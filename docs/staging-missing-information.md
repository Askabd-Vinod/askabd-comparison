# AskABD Staging — Missing Information Register

## Purpose
Exact list of what must be provided before staging deployment can proceed.
Each item has a placeholder, an owner, and a verification method.

---

## Infrastructure Required

| # | Item | Status | Why Required | Who Provides | Placeholder | Where To Configure | How To Verify | Blocking |
|---|---|---|---|---|---|---|---|---|
| 1 | Staging PostgreSQL | ❌ MISSING | Data persistence | DevOps | `<STAGING_DATABASE_URL>` | .env.staging / Secrets Manager | `SELECT version()` against endpoint | YES |
| 2 | Staging SMTP/SES | ❌ MISSING | OTP delivery, notifications | DevOps | `<STAGING_SMTP_HOST>` | .env.staging / Secrets Manager | Send test email, verify receipt | YES |
| 3 | Staging Domain (API) | ❌ MISSING | Public API access | DevOps | `<STAGING_API_URL>` | DNS provider | `curl https://api-staging.askabd.com/health` | YES |
| 4 | Staging Domain (Web) | ❌ MISSING | Public web access | DevOps | `<STAGING_WEB_DOMAIN>` | DNS provider | Browser access | YES |
| 5 | TLS Certificate | ❌ MISSING | HTTPS | DevOps | ACM ARN or cert path | Load balancer config | `openssl s_client -connect domain:443` | YES |
| 6 | Container Registry | ❌ MISSING | Deployment artifacts | DevOps | ECR repository URL | CI/CD config | `docker pull <image>` | YES |
| 7 | Load Balancer | ❌ MISSING | TLS termination, HA | DevOps | ALB ARN | AWS console | Health check passes | YES |
| 8 | S3 Bucket | ❌ MISSING | Document storage | DevOps | `<STAGING_S3_BUCKET>` | .env.staging | Upload/download test file | YES |

## Secrets Required

| # | Secret | Status | Why Required | Who Provides | Env Variable | How To Verify | Blocking |
|---|---|---|---|---|---|---|---|
| 1 | Database password | ❌ MISSING | DB auth | DevOps | Part of DATABASE_URL | Connection test | YES |
| 2 | JWT Secret | ❌ MISSING | API auth | Security | JWT_SECRET | Token generation/validation | YES |
| 3 | SMTP Password | ❌ MISSING | Email auth | DevOps | SMTP_PASS | Email delivery test | YES |
| 4 | Scheduler Token | ❌ MISSING | Background job auth | Engineering | SCHEDULER_AUTH_TOKEN | Authenticated scheduler call | NO (soft) |

## Optional (Does NOT Block Staging)

| # | Item | Status | Why Useful | Who Provides | Blocking |
|---|---|---|---|---|---|
| 1 | Jira Cloud Project | ⚪ OPTIONAL | Issue tracking | Product/Admin | NO |
| 2 | Jira API Token | ⚪ OPTIONAL | Jira connectivity | Admin | NO |
| 3 | AWS IAM for connectors | ⚪ OPTIONAL | Cloud resource discovery | Client | NO |
| 4 | Redis | ⚪ NOT REQUIRED | Not used in architecture | — | NO |

---

## What Happens When Each Item Is Provided

| Item | Action | Estimated Time |
|---|---|---|
| Database URL | Set env var → run migrations → verify health | 15 minutes |
| JWT Secret | Set env var → restart → verify auth | 5 minutes |
| SMTP credentials | Set env var → restart → send test email | 10 minutes |
| DNS records | Create records → wait propagation → verify | 30 minutes |
| TLS certificate | Request ACM → attach to ALB → verify HTTPS | 30 minutes |
| S3 bucket | Create bucket → set env → test upload | 15 minutes |
| Container registry | Create repos → push images → deploy | 30 minutes |
| Load balancer | Create ALB → target groups → health check | 45 minutes |

**Total from infrastructure availability to staging running: ~3 hours (parallel) or ~5 hours (sequential)**

---

## Staging Deployment Procedure (Once Everything Is Available)

1. Create `.env.staging` from `.env.staging.example` with real values
2. Build Docker images: `docker build -t askabd-api .` (apps/api)
3. Push to container registry
4. Run database migrations: `DATABASE_URL=<staging> npx tsx src/db/migrate.ts`
5. Deploy containers (ECS/K8s/Docker Compose)
6. Verify health: `curl https://api-staging.askabd.com/health`
7. Verify preflight: `curl https://api-staging.askabd.com/platform/production/preflight`
8. Run staging E2E test suite
9. Verify email delivery (send OTP)
10. Run staging certification

---

## Current Decision

**STAGING: NOT READY — INFRASTRUCTURE REQUIRED**

No code changes needed. Only infrastructure provisioning and credential configuration.
