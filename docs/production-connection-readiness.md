# AskABD Production Connection Readiness Register

## Purpose
Single source of truth for ALL external dependencies required to deploy AskABD to production.
When credentials/infrastructure are provided, this document defines exactly what to configure, test, and verify.

## Status Legend
- 🟢 VERIFIED — Connected, tested, production-ready
- 🔵 READY TO CONNECT — Code ready, awaiting credentials/infrastructure
- 🟡 REQUIRED — Must be provided before production
- 🔴 MISSING — Blocks production deployment
- ⚪ NOT CONFIGURED — Awaiting configuration
- ⚫ OPTIONAL — Not required for production launch

---

## Master Dependency Table

| ID | Category | Dependency | Required | Status | What We Have | What Is Missing | Env Variable | Secret | Owner | Blocking |
|---|---|---|---|---|---|---|---|---|---|---|
| DEP-001 | Cloud | AWS Account | ✅ | 🔴 MISSING | Nothing | Account ID, Region, IAM Role | AWS_ACCOUNT_ID, AWS_REGION | No | DevOps | YES |
| DEP-002 | IAM | Deployment Role | ✅ | 🔴 MISSING | Nothing | IAM role with deploy permissions | AWS_ROLE_ARN | No | DevOps | YES |
| DEP-003 | IAM | Application Role | ✅ | 🔴 MISSING | Nothing | Least-privilege app execution role | — | No | DevOps | YES |
| DEP-004 | Secrets | AWS Secrets Manager | ✅ | 🔴 MISSING | .env files (DEV only) | Secrets Manager configuration | — | N/A | DevOps | YES |
| DEP-005 | Database | Production RDS | ✅ | 🔴 MISSING | Local Docker PostgreSQL 16 | RDS endpoint, credentials | DATABASE_URL | ✅ | DevOps | YES |
| DEP-006 | Database | Backup/Restore | ✅ | 🔴 MISSING | No automated backup | RDS automated backups + tested restore | — | No | DevOps | YES |
| DEP-007 | Database | SSL Connection | ✅ | 🔵 READY | Code supports sslmode=require | Production RDS with SSL | DATABASE_URL (sslmode) | No | DevOps | YES |
| DEP-008 | Email | SMTP Provider | ✅ | 🔵 READY | Mailpit (DEV), email-transport.ts | SES/SMTP credentials | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS | ✅ | Platform | YES |
| DEP-009 | DNS | Domain Configuration | ✅ | 🔴 MISSING | localhost:4200 / localhost:3001 | Production domains | API_PUBLIC_URL, NEXT_PUBLIC_API_URL | No | DevOps | YES |
| DEP-010 | TLS | SSL Certificate | ✅ | 🔴 MISSING | No certificate | ACM cert or Let's Encrypt | CERTIFICATE_ARN | No | DevOps | YES |
| DEP-011 | TLS | Load Balancer | ✅ | 🔴 MISSING | Direct port access | ALB with TLS termination | — | No | DevOps | YES |
| DEP-012 | Auth | JWT Secret | ✅ | 🔵 READY | DEV bypass (no secret) | 32+ char random secret | JWT_SECRET | ✅ | Security | YES |
| DEP-013 | Registry | Container Registry | ✅ | 🔴 MISSING | Local Docker only | ECR/registry | — | No | DevOps | YES |
| DEP-014 | Jira | Jira Cloud Instance | ⚫ | ⚪ NOT CONFIGURED | Architecture complete | Jira URL, project, API token | JIRA_BASE_URL, JIRA_PROJECT_KEY, JIRA_API_TOKEN | ✅ | Product | NO |
| DEP-015 | Cloud | AWS Connector Creds | ⚫ | ⚪ NOT CONFIGURED | Endpoint reachability | IAM role for read-only access | — | ✅ | Client | NO |
| DEP-016 | Cloud | Azure Connector | ⚫ | ⚪ NOT CONFIGURED | Endpoint reachability | Service principal | — | ✅ | Client | NO |
| DEP-017 | Cloud | Kubernetes Connector | ⚫ | ⚪ NOT CONFIGURED | Endpoint reachability | Kubeconfig/SA token | — | ✅ | Client | NO |
| DEP-018 | Storage | S3 Bucket | ✅ | 🔵 READY | Local filesystem (DEV) | S3 bucket, IAM permissions | STORAGE_PROVIDER, S3_BUCKET, S3_REGION | No | DevOps | YES |
| DEP-019 | Monitoring | Log Destination | ✅ | 🔵 READY | stdout (pino JSON) | CloudWatch/Datadog/ELK | — | No | DevOps | NO (soft) |
| DEP-020 | Monitoring | Alerting | ✅ | 🔴 MISSING | None | Alert rules + notification channel | — | No | DevOps | NO (soft) |
| DEP-021 | CI/CD | Build Pipeline | ✅ | 🔵 READY | GitHub workflows exist | Runner configuration | — | No | DevOps | YES |
| DEP-022 | Cache | Redis | ⚫ | ⚫ OPTIONAL | Not used in current architecture | N/A | REDIS_URL | ✅ | — | NO |
| DEP-023 | CORS | Production Origins | ✅ | 🔵 READY | CORS_ORIGIN=* (DEV) | Explicit domain list | CORS_ORIGIN | No | DevOps | YES |

---

## Dependency Details

### DEP-005: Production Database (RDS)

**What we have:** Local PostgreSQL 16 in Docker (port 5442)
**What is needed:**
- RDS PostgreSQL 16 instance (Multi-AZ recommended)
- Endpoint: `<instance>.rds.amazonaws.com`
- Port: 5432
- Database: `askabd`
- Username: `askabd_app` (least privilege)
- Password: stored in Secrets Manager
- SSL: `sslmode=require`
- Max connections: 100+ (RDS default)
- Backup: 7-day retention minimum
- Encryption: AES-256 at rest

**Verification command:**
```
psql "postgresql://askabd_app:<password>@<endpoint>:5432/askabd?sslmode=require" -c "SELECT version();"
```

**Migration command:**
```
DATABASE_URL="postgresql://..." npx tsx src/db/migrate.ts
```

**Network requirement:** VPC security group must allow inbound 5432 from application subnet.

---

### DEP-008: Email Provider (SMTP/SES)

**What we have:** `email-transport.ts` — environment-aware (DEV=Mailpit, PROD=configured SMTP)
**What is needed:**
- SMTP_HOST (e.g., `email-smtp.us-east-1.amazonaws.com` for SES)
- SMTP_PORT (587 for STARTTLS, 465 for TLS)
- SMTP_USER (SES SMTP username)
- SMTP_PASS (SES SMTP password — from Secrets Manager)

**Verification:**
1. Configure environment variables
2. Start API
3. Trigger OTP send
4. Verify email received at destination

**Business test:** Create client → Send OTP → Verify email arrives within 30 seconds

---

### DEP-012: JWT Secret

**What we have:** DEV bypass (auth middleware allows unauthenticated in development)
**What is needed:** JWT_SECRET environment variable, minimum 32 characters, cryptographically random
**Production behavior:** If JWT_SECRET is not set AND NODE_ENV=production, startup validation fails with `process.exit(1)`

**Generation:**
```
openssl rand -base64 48
```

---

### DEP-014: Jira Integration

**What we have:** Complete architecture (config, health check, issue creation, deduplication, webhook, verification loop)
**What is needed:**
- Jira Cloud URL (e.g., `https://company.atlassian.net`)
- Project key (e.g., `ABD`)
- API token (generated at id.atlassian.com)
- User email for authentication

**Required Jira permissions:**
- Browse Projects
- Create Issues
- Edit Issues
- Add Comments
- View Workflow

**Webhook (if used):**
- URL: `https://api.askabd.com/api/v1/oc/jira/webhook`
- Events: issue_updated, issue_generic
- Authentication: **NOT YET IMPLEMENTED** — corrected 2026-08-24
  (`risk_014_triage_test_2`, see `docs/security-risk-register.md`
  RISK-015). This line previously read "Shared secret header
  validation", describing an intended, not an actual, control: the real
  handler performs only structural JSON validation, no secret/signature
  field exists anywhere in the codebase, and the route is not in
  `publicRoutes`, so a real Jira webhook (which cannot present an
  askabd-identity JWT) cannot successfully call it today regardless. Do
  not configure a production Jira webhook against this URL until
  RISK-015 is resolved.

**Verification procedure:**
1. POST /api/v1/oc/jira/config (save configuration)
2. POST /api/v1/oc/jira/test (verify connectivity)
3. POST /api/v1/oc/jira/issues (create test issue)
4. Verify issue exists in Jira
5. Transition issue to Done in Jira
6. POST /api/v1/oc/jira/webhook (simulate webhook)
7. Verify AskABD re-validates

---

## Production Go Checklist

- [ ] AWS account confirmed
- [ ] IAM roles created (least privilege)
- [ ] Secrets Manager configured with all secrets
- [ ] RDS PostgreSQL 16 provisioned
- [ ] RDS SSL enabled
- [ ] Database migrations applied
- [ ] Database backup verified
- [ ] Database restore tested
- [ ] JWT_SECRET configured
- [ ] SMTP/SES configured
- [ ] Real email delivery verified
- [ ] DNS configured (API + Web domains)
- [ ] TLS certificate installed
- [ ] HTTPS verified
- [ ] HTTP→HTTPS redirect verified
- [ ] ALB/Load balancer configured
- [ ] Health check path registered (/health)
- [ ] Container images built and pushed
- [ ] CORS_ORIGIN set to production domains
- [ ] S3 bucket configured for documents
- [ ] Monitoring/logging configured
- [ ] Alerting configured
- [ ] CI/CD pipeline tested
- [ ] Staging E2E passed
- [ ] Production preflight passed
- [ ] Production smoke test passed

---

## What Happens When Each Dependency Becomes Available

| Dependency | Action Required | Estimated Time | Risk |
|---|---|---|---|
| AWS Account | Configure IAM, VPC, security groups | 2-4 hours | Low |
| RDS | Create instance, run migrations, verify | 1-2 hours | Low |
| Secrets Manager | Create secrets, update task definition | 30 minutes | Low |
| SMTP/SES | Verify domain, create SMTP credentials | 1 hour | Low |
| DNS | Create A/CNAME records | 30 minutes | Low |
| TLS | Request ACM certificate, attach to ALB | 30 minutes | Low |
| ALB | Create target group, listeners | 1 hour | Low |
| ECR | Push images, update deployment | 30 minutes | Low |
| Jira | Configure integration via UI | 15 minutes | Low |

**Total estimated production connection time: 8-12 hours (sequential) or 4-6 hours (parallel)**

No application code changes required.
