# AskABD Comparison Platform — Phase 2: Target AWS Architecture

**Date:** 2026-08-11  
**Repository:** `askabd-comparison`  
**Prerequisite:** Phase 1 AWS Readiness Audit (approved)  
**Scope:** Complete AWS target architecture design — no infrastructure deployed or modified in this phase.

---

## 1. Architecture Decision: ECS Fargate

### Justification (Evidence-Based)

| Factor | ECS Fargate | EKS |
|--------|-------------|-----|
| Workload | 2 services (API + Web) | Overkill for 2 services |
| Existing K8s manifests | Minimal (1 deployment + 1 secret) | Would require full cluster setup |
| Operational overhead | AWS-managed, serverless | Cluster management, node patching |
| Scaling | Built-in auto-scaling | HPA + Cluster Autoscaler |
| Cost (estimated) | ~$150–300/mo for this workload | ~$73/mo cluster fee + nodes |
| Team expertise | Standard AWS, lower barrier | Requires K8s expertise |
| Scheduler | Advisory lock works with multiple tasks | Same |

**Decision: ECS Fargate.** The repository has one minimal K8s deployment manifest with a placeholder
secret — this is insufficient evidence to justify EKS operational complexity. The workload is 2
stateless containers with straightforward horizontal scaling.

---

## 2. Target Architecture Diagram

```
                          ┌─────────────────────────────┐
                          │       Route 53 (DNS)        │
                          │   api.askabd.com            │
                          │   app.askabd.com            │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │   CloudFront Distribution    │
                          │   + AWS WAF                  │
                          │   (TLS via ACM cert)         │
                          └─────────────┬───────────────┘
                                        │
                          ┌─────────────▼───────────────┐
                          │  Application Load Balancer   │
                          │  (internal, HTTPS listener)  │
                          │  Host-based routing:         │
                          │   api.* → API target group   │
                          │   app.* → Web target group   │
                          └──────┬──────────────┬───────┘
                                 │              │
               ┌─────────────────▼──┐   ┌──────▼─────────────────┐
               │  ECS Service: API  │   │  ECS Service: Web      │
               │  Fargate Tasks     │   │  Fargate Tasks         │
               │  Port 4200         │   │  Port 3001             │
               │  Min 2 / Max 10    │   │  Min 2 / Max 6         │
               └────────┬───────────┘   └────────────────────────┘
                        │
          ┌─────────────┼──────────────────────┐
          │             │                      │
┌─────────▼──────┐ ┌───▼──────────┐ ┌─────────▼─────────┐
│ RDS PostgreSQL │ │ S3 Bucket    │ │ AWS SES           │
│ 16.x Multi-AZ  │ │ (documents)  │ │ (email)           │
│ Private subnet │ │ KMS encrypted│ │ Domain verified   │
│ Encrypted      │ │ Versioned    │ │                   │
└────────────────┘ └──────────────┘ └───────────────────┘

Supporting Services:
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Secrets Manager  │ │ CloudWatch       │ │ ECR              │
│ DB URL, JWT,     │ │ Logs, Metrics,   │ │ askabd-api       │
│ SMTP, Payment    │ │ Alarms, Dash     │ │ askabd-web       │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ EventBridge      │ │ KMS              │ │ IAM              │
│ Scheduler cron   │ │ Encryption keys  │ │ Least-privilege  │
│ every 15 min     │ │ RDS, S3, Secrets │ │ roles            │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 3. Network Topology

### VPC Design

| Component | CIDR / Details |
|-----------|---------------|
| VPC | `10.0.0.0/16` (65,536 IPs) |
| Region | `us-east-1` (primary) |
| Availability Zones | 2 minimum (us-east-1a, us-east-1b) |

### Subnet Layout

| Subnet | CIDR | AZ | Purpose |
|--------|------|-----|---------|
| public-1a | `10.0.1.0/24` | us-east-1a | ALB, NAT Gateway |
| public-1b | `10.0.2.0/24` | us-east-1b | ALB, NAT Gateway |
| private-app-1a | `10.0.10.0/24` | us-east-1a | ECS Fargate tasks |
| private-app-1b | `10.0.11.0/24` | us-east-1b | ECS Fargate tasks |
| private-data-1a | `10.0.20.0/24` | us-east-1a | RDS primary |
| private-data-1b | `10.0.21.0/24` | us-east-1b | RDS standby |

### Routing

| Route Table | Destination | Target |
|-------------|-------------|--------|
| public-rt | 0.0.0.0/0 | Internet Gateway |
| private-app-rt-1a | 0.0.0.0/0 | NAT Gateway (AZ-a) |
| private-app-rt-1b | 0.0.0.0/0 | NAT Gateway (AZ-b) |
| private-data-rt | (no internet) | Local only |

### Security Groups

| SG Name | Inbound | Source | Purpose |
|---------|---------|--------|---------|
| sg-alb | 443 (HTTPS) | 0.0.0.0/0 (via CloudFront) | ALB |
| sg-api | 4200 | sg-alb | API Fargate tasks |
| sg-web | 3001 | sg-alb | Web Fargate tasks |
| sg-rds | 5432 | sg-api | RDS PostgreSQL |
| sg-vpc-endpoints | 443 | 10.0.0.0/16 | VPC Endpoints |

### VPC Endpoints (PrivateLink)

Required for Fargate tasks in private subnets without NAT for AWS services:
- `com.amazonaws.us-east-1.ecr.api` (Interface)
- `com.amazonaws.us-east-1.ecr.dkr` (Interface)
- `com.amazonaws.us-east-1.s3` (Gateway)
- `com.amazonaws.us-east-1.logs` (Interface)
- `com.amazonaws.us-east-1.secretsmanager` (Interface)

---

## 4. Complete AWS Resource Inventory

Every AWS resource required for production. None exist yet — all are 🟡 AWS RESOURCE REQUIRED.

### 4.1 Networking

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 1 | askabd-vpc | VPC | 10.0.0.0/16, DNS enabled | 🟡 NOT CREATED |
| 2 | askabd-igw | Internet Gateway | Attached to VPC | 🟡 NOT CREATED |
| 3 | askabd-nat-1a | NAT Gateway | public-1a, Elastic IP | 🟡 NOT CREATED |
| 4 | askabd-nat-1b | NAT Gateway | public-1b, Elastic IP | 🟡 NOT CREATED |
| 5 | public-1a | Subnet | 10.0.1.0/24 | 🟡 NOT CREATED |
| 6 | public-1b | Subnet | 10.0.2.0/24 | 🟡 NOT CREATED |
| 7 | private-app-1a | Subnet | 10.0.10.0/24 | 🟡 NOT CREATED |
| 8 | private-app-1b | Subnet | 10.0.11.0/24 | 🟡 NOT CREATED |
| 9 | private-data-1a | Subnet | 10.0.20.0/24 | 🟡 NOT CREATED |
| 10 | private-data-1b | Subnet | 10.0.21.0/24 | 🟡 NOT CREATED |
| 11 | sg-alb | Security Group | Ingress 443 from CloudFront | 🟡 NOT CREATED |
| 12 | sg-api | Security Group | Ingress 4200 from sg-alb | 🟡 NOT CREATED |
| 13 | sg-web | Security Group | Ingress 3001 from sg-alb | 🟡 NOT CREATED |
| 14 | sg-rds | Security Group | Ingress 5432 from sg-api | 🟡 NOT CREATED |
| 15 | vpce-ecr-api | VPC Endpoint | Interface, ECR API | 🟡 NOT CREATED |
| 16 | vpce-ecr-dkr | VPC Endpoint | Interface, ECR Docker | 🟡 NOT CREATED |
| 17 | vpce-s3 | VPC Endpoint | Gateway, S3 | 🟡 NOT CREATED |
| 18 | vpce-logs | VPC Endpoint | Interface, CloudWatch Logs | 🟡 NOT CREATED |
| 19 | vpce-secrets | VPC Endpoint | Interface, Secrets Manager | 🟡 NOT CREATED |

### 4.2 Compute (ECS Fargate)

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 20 | askabd-cluster | ECS Cluster | Fargate capacity providers | 🟡 NOT CREATED |
| 21 | askabd-api-taskdef | Task Definition | 512 CPU / 1024 MiB, port 4200 | 🟡 NOT CREATED |
| 22 | askabd-web-taskdef | Task Definition | 256 CPU / 512 MiB, port 3001 | 🟡 NOT CREATED |
| 23 | askabd-api-service | ECS Service | Desired 2, max 10, ALB target | 🟡 NOT CREATED |
| 24 | askabd-web-service | ECS Service | Desired 2, max 6, ALB target | 🟡 NOT CREATED |
| 25 | askabd-api-scaling | Auto Scaling | Target tracking CPU 70% | 🟡 NOT CREATED |
| 26 | askabd-web-scaling | Auto Scaling | Target tracking CPU 70% | 🟡 NOT CREATED |

### 4.3 Load Balancing

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 27 | askabd-alb | Application LB | Internal, 2 AZs | 🟡 NOT CREATED |
| 28 | askabd-api-tg | Target Group | Port 4200, health /health | 🟡 NOT CREATED |
| 29 | askabd-web-tg | Target Group | Port 3001, health / | 🟡 NOT CREATED |
| 30 | https-listener | ALB Listener | 443, host-based routing | 🟡 NOT CREATED |

### 4.4 Database

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 31 | askabd-rds | RDS Instance | PostgreSQL 16.x, db.t3.medium | 🟡 NOT CREATED |
| 32 | askabd-rds-subnet | DB Subnet Group | private-data-1a + 1b | 🟡 NOT CREATED |
| 33 | askabd-rds-params | Parameter Group | PG 16 defaults + tuning | 🟡 NOT CREATED |

RDS Configuration:
- Engine: PostgreSQL 16.x
- Instance: db.t3.medium (staging) / db.r6g.large (production)
- Multi-AZ: Yes (production), No (staging)
- Storage: 50 GB gp3, autoscaling to 200 GB
- Encryption: Yes (KMS)
- Automated backups: 7 days retention (staging), 30 days (production)
- PITR: Enabled
- Deletion protection: Yes (production)
- Performance Insights: Enabled
- Maintenance window: Sun 03:00–04:00 UTC
- Backup window: 02:00–03:00 UTC
- Public accessibility: **NO**
- Port: 5432

### 4.5 Storage

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 34 | askabd-documents-{env} | S3 Bucket | Versioned, KMS, private | 🟡 NOT CREATED |
| 35 | askabd-backups-{env} | S3 Bucket | Versioned, lifecycle 90d | 🟡 NOT CREATED |

S3 Configuration:
- Block all public access: Yes
- Versioning: Enabled
- Encryption: SSE-KMS (askabd-kms key)
- Lifecycle: Transition to IA after 30d, Glacier after 90d (backups)
- CORS: None (accessed via API only)
- Bucket policy: Restrict to ECS task role only

### 4.6 Security / Encryption

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 36 | askabd-kms | KMS Key | Symmetric, multi-region disabled | 🟡 NOT CREATED |
| 37 | askabd/staging/* | Secrets Manager | 6 secrets (see §5) | 🟡 NOT CREATED |
| 38 | askabd/production/* | Secrets Manager | 6 secrets (see §5) | 🟡 NOT CREATED |
| 39 | askabd-waf | WAF Web ACL | AWSManagedRules + rate limit | 🟡 NOT CREATED |

### 4.7 DNS / TLS

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 40 | askabd.com zone | Route 53 Hosted Zone | Public | 🟡 NOT CREATED |
| 41 | *.askabd.com cert | ACM Certificate | Wildcard, DNS validation | 🟡 NOT CREATED |
| 42 | api.askabd.com | Route 53 A Record | Alias to CloudFront | 🟡 NOT CREATED |
| 43 | app.askabd.com | Route 53 A Record | Alias to CloudFront | 🟡 NOT CREATED |

### 4.8 CDN

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 44 | askabd-cf | CloudFront Dist | Origin: ALB, WAF attached | 🟡 NOT CREATED |

### 4.9 Container Registry

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 45 | askabd-api | ECR Repository | Scan on push, immutable tags | 🟡 NOT CREATED |
| 46 | askabd-web | ECR Repository | Scan on push, immutable tags | 🟡 NOT CREATED |

### 4.10 Observability

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 47 | /ecs/askabd-api | CW Log Group | 30d retention | 🟡 NOT CREATED |
| 48 | /ecs/askabd-web | CW Log Group | 30d retention | 🟡 NOT CREATED |
| 49 | AskABD-Operations | CW Dashboard | API health, DB, containers | 🟡 NOT CREATED |
| 50 | askabd-5xx-alarm | CW Alarm | >5% 5xx over 5 min | 🟡 NOT CREATED |
| 51 | askabd-latency-alarm | CW Alarm | p95 > 2s over 5 min | 🟡 NOT CREATED |
| 52 | askabd-db-cpu-alarm | CW Alarm | >80% for 10 min | 🟡 NOT CREATED |
| 53 | askabd-db-conn-alarm | CW Alarm | >80% pool used | 🟡 NOT CREATED |
| 54 | askabd-alerts | SNS Topic | Alert notifications | 🟡 NOT CREATED |

### 4.11 Email

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 55 | askabd.com identity | SES Domain | DKIM, SPF verified | 🟡 NOT CREATED |
| 56 | noreply@askabd.com | SES Email | Verified sender | 🟡 NOT CREATED |

### 4.12 Scheduler

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 57 | askabd-scheduler | EventBridge Rule | rate(15 minutes) | 🟡 NOT CREATED |

EventBridge triggers a Lambda or direct ECS RunTask that calls
`POST /api/v1/oc/scheduler/run-all` with `SCHEDULER_AUTH_TOKEN`.

### 4.13 IAM

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 58 | askabd-ecs-execution-role | IAM Role | ECR pull, CW logs, Secrets | 🟡 NOT CREATED |
| 59 | askabd-api-task-role | IAM Role | S3, SES, Secrets read | 🟡 NOT CREATED |
| 60 | askabd-web-task-role | IAM Role | Minimal (no AWS services) | 🟡 NOT CREATED |
| 61 | askabd-ci-role | IAM Role | OIDC trust, ECR push, ECS deploy | 🟡 NOT CREATED |
| 62 | askabd-scheduler-role | IAM Role | Invoke API endpoint | 🟡 NOT CREATED |

### 4.14 CI/CD

| # | Resource | Type | Config | Status |
|---|----------|------|--------|--------|
| 63 | GitHub OIDC Provider | IAM OIDC | Trust GitHub Actions | 🟡 NOT CREATED |

**Total AWS Resources: 63**

---

## 5. Secrets Inventory

Every secret that must be stored in AWS Secrets Manager. Per-environment.

| Secret Path | Contents | Used By | Rotation |
|-------------|----------|---------|----------|
| `askabd/{env}/database-url` | `postgresql://user:pass@rds-endpoint:5432/askabd?sslmode=require` | API task | On credential rotation |
| `askabd/{env}/jwt-secret` | 64-char cryptographic random | API task | Manual (coordinate with identity) |
| `askabd/{env}/smtp-credentials` | `{"host":"...","port":587,"user":"...","pass":"..."}` | API task | Per provider policy |
| `askabd/{env}/scheduler-auth-token` | Bearer token for scheduler endpoint | EventBridge / Lambda | Every 90 days |
| `askabd/{env}/payment-provider` | `{"provider":"stripe","secret_key":"sk_...","webhook_secret":"whsec_..."}` | API task | Per provider policy |
| `askabd/{env}/cors-origin` | `https://app.askabd.com` | API task | On domain change |

**Total secrets per environment: 6**  
**Total secrets (staging + production): 12**

### Secret Access Matrix

| IAM Role | Secrets Access |
|----------|---------------|
| askabd-ecs-execution-role | `askabd/{env}/*` (read at container start) |
| askabd-api-task-role | `askabd/{env}/payment-provider` (runtime read) |
| askabd-ci-role | None (no secret access) |
| askabd-scheduler-role | `askabd/{env}/scheduler-auth-token` |

---

## 6. Domain & Certificate Requirements

| Domain | Purpose | Record Type | Target |
|--------|---------|-------------|--------|
| `askabd.com` | Root (redirect to app) | A (Alias) | CloudFront |
| `app.askabd.com` | Web application | A (Alias) | CloudFront |
| `api.askabd.com` | API | A (Alias) | CloudFront |
| `mail.askabd.com` | SES (DKIM) | CNAME | SES DKIM records |

### Certificate

| Certificate | Domain(s) | Validation | Region |
|-------------|-----------|------------|--------|
| askabd-wildcard | `*.askabd.com`, `askabd.com` | DNS (Route 53) | us-east-1 (required for CloudFront) |

### DNS Authority Decision

The existing architecture docs reference Cloudflare. Two options:

**Option A (Recommended): Route 53 authoritative**
- Transfer NS to Route 53
- Full AWS integration (ACM auto-validation, health checks)
- Simpler operational model

**Option B: Cloudflare proxy → AWS origin**
- Cloudflare remains authoritative
- ACM certificate on ALB (not CloudFront)
- Cloudflare handles edge caching + WAF
- More complex, dual CDN/WAF

**Recommendation:** Option A unless Cloudflare is contractually required. Document the decision
before deployment.

---

## 7. Environment Strategy

### Three Environments

| Environment | Purpose | Infra | Deploy Trigger |
|-------------|---------|-------|----------------|
| **DEV** | Local development | docker-compose.yml (unchanged) | N/A |
| **STAGING** | Pre-production validation | AWS (reduced capacity) | Push to `main` branch |
| **PRODUCTION** | Live traffic | AWS (full capacity) | Manual approval after staging passes |

### Environment Differentiation

| Config | DEV | STAGING | PRODUCTION |
|--------|-----|---------|------------|
| Database | Local PostgreSQL :5442 | RDS db.t3.medium, single-AZ | RDS db.r6g.large, Multi-AZ |
| Email | Mailpit :1025 | SES (sandbox) | SES (production) |
| Storage | Local filesystem | S3 askabd-documents-staging | S3 askabd-documents-production |
| Secrets | .env file | Secrets Manager staging/* | Secrets Manager production/* |
| API tasks | 1 (local) | 2 | 2–10 (auto-scaling) |
| Web tasks | 1 (local) | 2 | 2–6 (auto-scaling) |
| TLS | None (localhost) | ACM cert | ACM cert |
| Domain | localhost | staging.askabd.com | app.askabd.com / api.askabd.com |
| WAF | None | Enabled (count mode) | Enabled (block mode) |
| Backups | None | 7-day RDS | 30-day RDS + S3 cross-region |
| Monitoring | Console logs | CloudWatch (relaxed thresholds) | CloudWatch (strict) + alerts |

---

## 8. Service Mapping (Application → AWS)

### Application Service → AWS Service Mapping

| Application Capability | Current Implementation | AWS Target |
|------------------------|----------------------|------------|
| API Server (Fastify) | Local Node.js :4200 | ECS Fargate task (askabd-api) |
| Web Server (Next.js) | Local Node.js :3001 | ECS Fargate task (askabd-web) |
| PostgreSQL database | Docker container :5442 | RDS PostgreSQL 16.x Multi-AZ |
| Document storage | Local filesystem `uploads/` | S3 bucket (askabd-documents) |
| Email sending | Mailpit :1025 | AWS SES (domain-verified SMTP) |
| Scheduler trigger | Manual POST to API | EventBridge rule → API endpoint |
| Secrets | .env file | AWS Secrets Manager |
| Container images | Local Docker build | ECR repositories |
| TLS termination | None | ACM + CloudFront/ALB |
| DNS | None | Route 53 |
| CDN/WAF | None | CloudFront + AWS WAF |
| Logging | stdout (Pino JSON) | CloudWatch Logs (awslogs driver) |
| Metrics | In-memory monitoring middleware | CloudWatch Metrics (custom + ALB) |
| Alerting | Documented rules only | CloudWatch Alarms + SNS |
| Backup | Local pg_dump script | RDS automated + S3 lifecycle |
| Rate limiting | In-memory token bucket | Application-level (unchanged) + WAF |
| Authentication | JWT verification (jose) | Unchanged (application-level) |
| RBAC | @askabd/shared-authorization | Unchanged (application-level) |
| Audit | oc_audit_log table | Unchanged (application-level, in RDS) |
| Health checks | GET /health, /ready | ALB target group health checks |

### What Does NOT Change

These application-level concerns remain in the codebase as-is:
- Business logic (all 67+ services)
- Database schema and migrations
- JWT/RBAC authentication and authorization
- Rate limiting (in-memory token bucket)
- Audit trail (PostgreSQL table)
- Scheduler job logic (advisory locks)
- API routes and response shapes
- Health check endpoints
- Structured logging format
- Error handling
- OpenAPI documentation

---

## 9. Security Model

### Defense in Depth

```
Layer 1: CloudFront + WAF (edge)
  - Geo-restriction (if needed)
  - Rate limiting (IP-based)
  - SQL injection rules
  - XSS protection
  - Known bad inputs

Layer 2: ALB (transport)
  - TLS termination (ACM)
  - Host-based routing
  - Health check enforcement

Layer 3: Security Groups (network)
  - ALB accepts only from CloudFront
  - API accepts only from ALB
  - RDS accepts only from API
  - No public access to any backend

Layer 4: Application (code)
  - JWT authentication
  - RBAC authorization
  - Rate limiting (token bucket)
  - Input validation (Zod)
  - Helmet security headers
  - CORS restriction
  - Client isolation (query scoping)

Layer 5: Data (storage)
  - RDS encryption at rest (KMS)
  - RDS encryption in transit (SSL)
  - S3 encryption (SSE-KMS)
  - Secrets Manager (encrypted, rotatable)
  - No PAN/CVV/PIN stored anywhere
```

### IAM Least-Privilege Design

**ECS Execution Role** (`askabd-ecs-execution-role`):
```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchGetImage",
    "ecr:GetDownloadUrlForLayer",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
    "secretsmanager:GetSecretValue"
  ],
  "Resource": ["arn:aws:secretsmanager:*:*:secret:askabd/*"]
}
```

**API Task Role** (`askabd-api-task-role`):
```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::askabd-documents-*",
    "arn:aws:s3:::askabd-documents-*/*"
  ]
},
{
  "Effect": "Allow",
  "Action": [
    "ses:SendEmail",
    "ses:SendRawEmail"
  ],
  "Resource": ["arn:aws:ses:*:*:identity/askabd.com"]
}
```

**Web Task Role** (`askabd-web-task-role`):
- No AWS service permissions (web only calls API over HTTP)

**CI/CD Role** (`askabd-ci-role`):
```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:PutImage",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload",
    "ecs:UpdateService",
    "ecs:DescribeServices",
    "ecs:RegisterTaskDefinition"
  ],
  "Resource": "*"
}
```
*Note: Resource should be scoped to specific ARNs in production.*

### Network Security Controls

| Control | Implementation |
|---------|---------------|
| Database not publicly accessible | Private subnet, no IGW route, sg-rds allows only sg-api |
| No public IPs on containers | Fargate tasks in private subnets |
| Egress controlled | NAT Gateway for outbound (SES, npm audit) |
| VPC Flow Logs | Enabled for security analysis |
| CloudTrail | All API calls logged |
| GuardDuty | Threat detection on VPC flow logs |

---

## 10. Data Migration Strategy

### 10.1 Database Migration (PostgreSQL → RDS)

**Source:** Local PostgreSQL 16 (Docker, port 5442)  
**Target:** RDS PostgreSQL 16.x (private subnet, port 5432)

#### Migration Procedure

```
Phase A: Schema Preparation
1. Run pg_dump --schema-only from local DB → schema.sql
2. Validate schema.sql against RDS compatibility
3. Verify extensions: gen_random_uuid() (built-in PG 13+) ✓
4. Verify JSONB support ✓
5. Verify GIN indexes ✓
6. No PostGIS or non-standard extensions needed ✓

Phase B: Staging Migration
1. Create RDS staging instance
2. Connect via bastion or VPN
3. Run all 21 migrations in order via `tsx src/db/migrate.ts`
4. Verify _migrations table shows all 21 entries
5. Seed demo data: `tsx src/seed/index.ts demo`
6. Run application test suite against staging RDS

Phase C: Production Migration
1. Schedule maintenance window (Sunday 03:00 UTC)
2. Stop all application traffic (maintenance page)
3. Run pg_dump from source (full backup)
4. Verify backup file size and integrity
5. Connect to production RDS
6. Run all 21 migrations
7. If seeding required: run demo seed only for demo-meridian-financial
8. Verify table counts match expected
9. Verify critical data integrity (clients, transactions, engagements)
10. Start application, run health checks
11. Monitor for 30 minutes
12. Remove maintenance page
```

#### Database Migration Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| PostgreSQL 16 compatibility | ✅ Schema verified | gen_random_uuid(), JSONB, GIN |
| SSL connection support | ⚠️ Code change needed | Add `?sslmode=require` to DATABASE_URL |
| Connection string format | ✅ Compatible | Standard `postgresql://` URI |
| Migration runner | ✅ Works with any PG | Custom runner uses standard `pg` client |
| No destructive DDL | ✅ All IF NOT EXISTS | Safe for re-runs |
| Foreign key order | ✅ Migrations ordered | 001→021 respects FK dependencies |
| Data volume estimate | Low | Demo + test data only at this stage |

#### Validation Queries (Post-Migration)

```sql
-- Table count verification
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Migration state
SELECT count(*) FROM _migrations;  -- Expected: 21

-- Critical tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Index count
SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';

-- FK constraint count
SELECT count(*) FROM information_schema.referential_constraints;

-- Capability registry populated
SELECT count(*) FROM oc_capabilities;

-- Scheduler jobs exist
SELECT count(*) FROM oc_scheduled_jobs;

-- Demo client exists (if seeded)
SELECT id, name FROM oc_clients WHERE id = 'demo-meridian-financial';
```

### 10.2 Document Storage Migration (Filesystem → S3)

**Source:** Local `uploads/` directory  
**Target:** S3 bucket `askabd-documents-{env}`

#### Migration Procedure

```
1. Inventory existing documents:
   find uploads/ -type f | wc -l

2. For each file, determine logical storage reference:
   {clientId}/{serviceId}/{requirementKey}/v{version}/{fileName}

3. Upload to S3 preserving the path structure as object keys:
   aws s3 sync uploads/ s3://askabd-documents-production/ --sse aws:kms

4. Verify upload:
   aws s3 ls s3://askabd-documents-production/ --recursive | wc -l

5. Compare checksums (application stores SHA256 in DB):
   For each document record, verify S3 object matches stored checksum.
```

#### Code Change Required

The `DocumentStorageService` must be refactored to use an interface:

```typescript
interface StorageProvider {
  save(reference: string, stream: Readable): Promise<{ checksum: string; fileSize: number }>;
  exists(reference: string): boolean | Promise<boolean>;
  read(reference: string): Readable | null | Promise<Readable | null>;
  delete(reference: string): boolean | Promise<boolean>;
  getSize(reference: string): number | Promise<number>;
}

// Implementations:
// - LocalStorageProvider (existing filesystem logic) — DEV
// - S3StorageProvider (new) — STAGING/PRODUCTION
```

Selection via environment variable: `STORAGE_PROVIDER=local|s3`

#### Storage Migration Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| S3 bucket created | 🟡 NOT CREATED | Private, versioned, KMS |
| S3StorageProvider class | 🟡 NOT IMPLEMENTED | Needs @aws-sdk/client-s3 |
| Interface extraction | 🟡 NOT IMPLEMENTED | Refactor DocumentStorageService |
| Data upload | 🟡 NOT DONE | sync existing uploads/ to S3 |
| Checksum verification | 🟡 NOT DONE | Compare SHA256 stored in DB |
| Rollback: keep local | ✅ AVAILABLE | Don't delete uploads/ until verified |

---

## 11. Disaster Recovery Strategy

### Recovery Objectives

| Metric | Target | Mechanism |
|--------|--------|-----------|
| **RPO** (data loss tolerance) | 5 minutes | RDS Multi-AZ sync replication + PITR |
| **RTO** (recovery time) | 15 minutes | ECS service restart + RDS failover |

### Failure Scenarios & Recovery

| Failure | Impact | Recovery | Time |
|---------|--------|----------|------|
| Single API task crash | None (2+ tasks) | ECS auto-replaces task | < 2 min |
| All API tasks fail | API unavailable | ECS desired count restores, ALB routes healthy | < 5 min |
| Single AZ failure | 50% capacity loss | Multi-AZ: tasks in other AZ serve traffic | < 1 min |
| RDS primary failure | Momentary DB unavail | Multi-AZ automatic failover (DNS flip) | < 2 min |
| RDS corruption | Data loss risk | PITR to last consistent point | 5–15 min |
| S3 object deleted | Document unavailable | S3 versioning: restore previous version | < 1 min |
| Region failure | Full outage | Manual: restore from cross-region backup | 2–4 hours |
| CI/CD failure | Cannot deploy | Existing tasks continue; fix pipeline | No user impact |
| Secret compromise | Security breach | Rotate in Secrets Manager, restart tasks | 5–10 min |

### Backup Strategy

| Data | Method | Frequency | Retention | Cross-Region |
|------|--------|-----------|-----------|--------------|
| Database | RDS automated snapshots | Continuous (PITR) | 30 days | Copy to us-west-2 weekly |
| Database | Manual snapshot | Before migrations | 90 days | Yes |
| Documents | S3 versioning | Every write | Indefinite | Cross-region replication |
| Secrets | Secrets Manager built-in | On change | Version history | No (recreate from docs) |
| Infrastructure | IaC in Git | On commit | Git history | N/A |
| Container images | ECR | On build | 30 most recent | No |

### DR Testing Requirements

| Test | Frequency | Procedure |
|------|-----------|-----------|
| RDS failover | Quarterly | Force failover, measure RTO |
| PITR restore | Quarterly | Restore to new instance, validate data |
| S3 version restore | Quarterly | Delete object, restore, verify |
| Full environment rebuild | Annually | Terraform destroy + apply, validate |
| Deployment rollback | Per-deploy | Roll back to previous task def |

**IMPORTANT:** DR is NOT marked READY until each test has been executed and documented.

---

## 12. Rollback Strategy

### Application Rollback

Every deployment creates a new ECS task definition revision. Rollback = update service to
previous revision.

```bash
# Identify previous task definition
aws ecs describe-services --cluster askabd --services askabd-api \
  --query 'services[0].taskDefinition'

# Roll back to previous revision
aws ecs update-service --cluster askabd --service askabd-api \
  --task-definition askabd-api-taskdef:{previous-revision}

# Verify rollback
aws ecs describe-services --cluster askabd --services askabd-api \
  --query 'services[0].deployments'
```

Time to rollback: < 5 minutes (ECS drains old tasks, starts new from previous image).

### Database Rollback

Migrations are forward-only (no down migrations). Rollback options:

| Scenario | Method | Data Loss |
|----------|--------|-----------|
| Migration failed mid-way | Restore from pre-migration snapshot | None (snapshot was pre-migration) |
| Migration succeeded but app broken | PITR to just before migration | Minimal (seconds of writes) |
| Data corruption discovered later | PITR to last known good point | Minutes to hours of writes |

**Pre-migration snapshot procedure:**
```bash
# Create manual snapshot before any migration
aws rds create-db-snapshot \
  --db-instance-identifier askabd-production \
  --db-snapshot-identifier pre-migration-$(date +%Y%m%d-%H%M%S)

# Verify snapshot is available
aws rds describe-db-snapshots \
  --db-snapshot-identifier pre-migration-*
```

### DNS Rollback

If AWS deployment fails entirely and needs to revert to previous hosting:
```bash
# Update Route 53 records to point to previous target
aws route53 change-resource-record-sets --hosted-zone-id Z... \
  --change-batch file://rollback-dns.json
```

Time to propagate: < 60 seconds (TTL 60).

### Rollback Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| ECS previous task definition | 🟡 NOT AVAILABLE | First deploy creates revision 1 only |
| RDS pre-migration snapshot | 🟡 NOT AVAILABLE | Created before first migration |
| DNS previous record | 🟡 NOT AVAILABLE | No current Route 53 records |
| Container image rollback | 🟡 NOT AVAILABLE | Previous images in ECR |
| Rollback runbook | 🟡 NOT DOCUMENTED | Created during deployment phase |

---

## 13. CI/CD Pipeline Design

### Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TRIGGER: Push to main / Tag v*                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Checkout │→ │Install   │→ │TypeCheck │→ │Unit Test │→ │Lint      │ │
│  └─────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐              │
│  │Security Audit│→ │Docker Build   │→ │Image Scan (ECR) │              │
│  └──────────────┘  │ API + Web     │  └────────┬────────┘              │
│                     └───────────────┘           │                        │
│                                                  ▼                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PUSH TO ECR (tag: commit SHA + branch)                            │  │
│  └──────────────────────────────────────┬───────────────────────────┘  │
│                                          │                              │
│  ┌───────────────────────────────────────▼──────────────────────────┐  │
│  │ DEPLOY TO STAGING                                                 │  │
│  │ - Update ECS task definition with new image                       │  │
│  │ - Wait for service stability                                      │  │
│  │ - Run smoke tests against staging endpoint                        │  │
│  └───────────────────────────────────────┬──────────────────────────┘  │
│                                          │                              │
│  ┌───────────────────────────────────────▼──────────────────────────┐  │
│  │ STAGING SMOKE TEST                                                │  │
│  │ - GET /health → 200                                               │  │
│  │ - GET /ready → 200                                                │  │
│  │ - GET /platform/health → all healthy                              │  │
│  │ - GET /api/v1/categories → 200 (authenticated)                    │  │
│  └───────────────────────────────────────┬──────────────────────────┘  │
│                                          │                              │
│  ┌───────────────────────────────────────▼──────────────────────────┐  │
│  │ ⏸️  MANUAL APPROVAL GATE (production only)                        │  │
│  └───────────────────────────────────────┬──────────────────────────┘  │
│                                          │                              │
│  ┌───────────────────────────────────────▼──────────────────────────┐  │
│  │ DEPLOY TO PRODUCTION                                              │  │
│  │ - Update ECS task definition                                      │  │
│  │ - ECS rolling deployment (min 50% healthy)                        │  │
│  │ - Health check verification                                       │  │
│  │ - Auto-rollback if health checks fail                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### GitHub Actions Authentication

- **Method:** GitHub OIDC → AWS IAM Role (no long-lived keys)
- **Trust policy:** Only `askabd-comparison` repository, only `main` branch for production deploy
- **Permissions:** ECR push, ECS update, ECS describe (no Secrets Manager, no RDS)

### Image Tagging Strategy

```
{ecr-repo}:{git-sha-short}        # e.g., askabd-api:a1b2c3d
{ecr-repo}:{git-sha-short}-main   # Branch qualifier
{ecr-repo}:v{semver}              # Release tag (from Git tag)
```

**Never use `:latest` for production deployment.**

---

## 14. ECS Task Definitions

### API Task Definition

```json
{
  "family": "askabd-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/askabd-ecs-execution-role",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/askabd-api-task-role",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/askabd-api:COMMIT_SHA",
      "portMappings": [{ "containerPort": 4200, "protocol": "tcp" }],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "4200" },
        { "name": "HOST", "value": "0.0.0.0" },
        { "name": "LOG_LEVEL", "value": "info" },
        { "name": "EMAIL_PROVIDER", "value": "smtp" },
        { "name": "STORAGE_PROVIDER", "value": "s3" },
        { "name": "S3_BUCKET", "value": "askabd-documents-production" },
        { "name": "S3_REGION", "value": "us-east-1" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/database-url" },
        { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/jwt-secret" },
        { "name": "SMTP_HOST", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/smtp-credentials:host::" },
        { "name": "SMTP_PORT", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/smtp-credentials:port::" },
        { "name": "SMTP_USER", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/smtp-credentials:user::" },
        { "name": "SMTP_PASS", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/smtp-credentials:pass::" },
        { "name": "CORS_ORIGIN", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/cors-origin" },
        { "name": "SCHEDULER_AUTH_TOKEN", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:askabd/production/scheduler-auth-token" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:4200/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/askabd-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "api"
        }
      }
    }
  ]
}
```

### Web Task Definition

```json
{
  "family": "askabd-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/askabd-ecs-execution-role",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/askabd-web-task-role",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/askabd-web:COMMIT_SHA",
      "portMappings": [{ "containerPort": 3001, "protocol": "tcp" }],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3001" },
        { "name": "NEXT_PUBLIC_API_URL", "value": "https://api.askabd.com" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 20
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/askabd-web",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "web"
        }
      }
    }
  ]
}
```

---

## 15. WAF Rules

### AWS WAF Configuration

| Rule Group | Action | Purpose |
|------------|--------|---------|
| AWSManagedRulesCommonRuleSet | Block | OWASP Top 10 |
| AWSManagedRulesSQLiRuleSet | Block | SQL injection |
| AWSManagedRulesKnownBadInputsRuleSet | Block | Known exploits |
| AWSManagedRulesAmazonIpReputationList | Block | Malicious IPs |
| Rate-based rule | Block (2000 req/5min/IP) | DDoS mitigation |
| Geo-restriction (optional) | Count/Block | If geo-limiting needed |

**Note:** Application-level validation (Zod schemas, rate limiting, RBAC) remains active.
WAF is an additional layer, not a replacement.

---

## 16. Monitoring & Alerting Design

### CloudWatch Dashboard: AskABD-Operations

| Panel | Metric | Source |
|-------|--------|--------|
| API Health | HealthyHostCount | ALB target group |
| Error Rate | 5xx count / total | ALB |
| Latency p50/p95/p99 | TargetResponseTime | ALB |
| Request Rate | RequestCount | ALB |
| API CPU | CPUUtilization | ECS (API service) |
| API Memory | MemoryUtilization | ECS (API service) |
| Web CPU | CPUUtilization | ECS (Web service) |
| DB CPU | CPUUtilization | RDS |
| DB Connections | DatabaseConnections | RDS |
| DB Free Storage | FreeStorageSpace | RDS |
| DB Read/Write IOPS | ReadIOPS, WriteIOPS | RDS |
| Container Restarts | TaskCount changes | ECS |
| Scheduler Results | Custom metric from API logs | CloudWatch Logs filter |

### CloudWatch Alarms

| Alarm | Metric | Threshold | Period | Action |
|-------|--------|-----------|--------|--------|
| API-5xx-High | 5xx% | > 5% | 5 min | SNS → ops team |
| API-Latency-High | p95 | > 2000ms | 5 min | SNS → ops team |
| API-Unhealthy | UnHealthyHostCount | > 0 | 2 min | SNS → ops team |
| DB-CPU-High | CPUUtilization | > 80% | 10 min | SNS → ops team |
| DB-Connections-High | DatabaseConnections | > 12 (80% of pool 15) | 5 min | SNS → ops team |
| DB-Storage-Low | FreeStorageSpace | < 5 GB | 15 min | SNS → ops team |
| Container-Restart-Loop | RunningTaskCount drop | < desired | 5 min | SNS → ops team |
| Backup-Failed | Custom (scheduled check) | Failure | Per-event | SNS → ops team |
| Certificate-Expiry | DaysToExpiry | < 30 | Daily | SNS → ops team |

---

## 17. Infrastructure-as-Code Structure

### Recommended Tool: Terraform

Terraform is chosen over CloudFormation because:
- Multi-cloud portability (if needed later)
- Better state management and drift detection
- Modular structure with shared modules
- Widely adopted, strong community

### Directory Structure

```
deploy/
├── terraform/
│   ├── environments/
│   │   ├── staging/
│   │   │   ├── main.tf          # Module composition for staging
│   │   │   ├── variables.tf     # Staging-specific variables
│   │   │   ├── terraform.tfvars # Staging values
│   │   │   └── backend.tf       # S3 remote state (staging)
│   │   └── production/
│   │       ├── main.tf          # Module composition for production
│   │       ├── variables.tf     # Production-specific variables
│   │       ├── terraform.tfvars # Production values
│   │       └── backend.tf       # S3 remote state (production)
│   └── modules/
│       ├── networking/
│       │   ├── main.tf          # VPC, subnets, NAT, IGW, route tables
│       │   ├── security-groups.tf
│       │   ├── vpc-endpoints.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── database/
│       │   ├── main.tf          # RDS instance, subnet group, params
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── compute/
│       │   ├── main.tf          # ECS cluster, services, task defs
│       │   ├── autoscaling.tf
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── loadbalancer/
│       │   ├── main.tf          # ALB, target groups, listeners
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── cdn/
│       │   ├── main.tf          # CloudFront distribution
│       │   ├── waf.tf           # WAF Web ACL
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── storage/
│       │   ├── main.tf          # S3 buckets, policies
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── secrets/
│       │   ├── main.tf          # Secrets Manager entries
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── iam/
│       │   ├── main.tf          # Roles, policies, OIDC
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── dns/
│       │   ├── main.tf          # Route 53 zone, records, ACM
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── monitoring/
│       │   ├── main.tf          # CloudWatch log groups, dashboard
│       │   ├── alarms.tf        # All alarms
│       │   ├── sns.tf           # SNS topics
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── email/
│       │   ├── main.tf          # SES domain, identity, DKIM
│       │   ├── variables.tf
│       │   └── outputs.tf
│       ├── scheduler/
│       │   ├── main.tf          # EventBridge rule + target
│       │   ├── variables.tf
│       │   └── outputs.tf
│       └── ecr/
│           ├── main.tf          # ECR repositories
│           ├── variables.tf
│           └── outputs.tf
├── backup/                       # Existing (unchanged)
│   ├── backup.sh
│   └── restore.sh
├── env/                          # Existing (unchanged)
│   ├── staging.env
│   └── production.env
├── k8s/                          # Existing (deprecated, kept for reference)
│   ├── api-deployment.yaml
│   └── secrets.yaml
└── PRODUCTION.md                 # Existing (will be updated)
```

### Terraform State Management

| Environment | Backend | Key |
|-------------|---------|-----|
| Staging | S3 (`askabd-terraform-state`) | `staging/terraform.tfstate` |
| Production | S3 (`askabd-terraform-state`) | `production/terraform.tfstate` |

State bucket configuration:
- Versioning: Enabled
- Encryption: SSE-S3
- DynamoDB lock table: `askabd-terraform-locks`
- Region: us-east-1

---

## 18. Dependency Graph

### Resource Creation Order (Dependency Chain)

```
Level 0 (No dependencies):
  ├── VPC
  ├── KMS Key
  ├── ECR Repositories
  ├── S3 Buckets (terraform state)
  ├── Route 53 Hosted Zone
  └── GitHub OIDC Provider

Level 1 (Depends on L0):
  ├── Subnets (depends on VPC)
  ├── Internet Gateway (depends on VPC)
  ├── Security Groups (depends on VPC)
  ├── ACM Certificate (depends on Route 53)
  ├── SES Domain (depends on Route 53)
  └── SNS Topics

Level 2 (Depends on L1):
  ├── NAT Gateways (depends on subnets + IGW)
  ├── VPC Endpoints (depends on subnets + SGs)
  ├── DB Subnet Group (depends on subnets)
  ├── Secrets Manager entries (depends on KMS)
  └── CloudWatch Log Groups

Level 3 (Depends on L2):
  ├── Route Tables (depends on NAT, IGW)
  ├── RDS Instance (depends on DB subnet group, SGs, KMS)
  ├── IAM Roles (depends on S3, ECR, Secrets ARNs)
  └── ALB (depends on subnets, SGs, ACM cert)

Level 4 (Depends on L3):
  ├── ECS Cluster
  ├── Target Groups (depends on ALB)
  ├── ALB Listeners (depends on ALB, TGs, cert)
  └── Database migration (depends on RDS)

Level 5 (Depends on L4):
  ├── ECS Task Definitions (depends on ECR, IAM, Secrets, CW logs)
  ├── ECS Services (depends on cluster, task def, TGs, subnets)
  └── Auto Scaling (depends on ECS services)

Level 6 (Depends on L5):
  ├── CloudFront (depends on ALB origin)
  ├── WAF (depends on CloudFront)
  ├── Route 53 Records (depends on CloudFront)
  ├── EventBridge Scheduler (depends on ECS service available)
  ├── CloudWatch Alarms (depends on ALB, ECS, RDS metrics)
  └── CloudWatch Dashboard (depends on all metric sources)
```

### Estimated External Dependencies

| Dependency | Required For | Availability |
|------------|-------------|--------------|
| AWS Account | Everything | Must exist |
| Domain registrar access | Route 53 NS delegation | Owner action required |
| Payment provider account (Stripe/Adyen) | Payment execution | BLOCKED — not yet configured |
| SMTP provider OR SES production access | Email in production | SES requires production access request |

---

## 19. Cost Estimation (Monthly)

### Staging Environment (Reduced)

| Service | Config | Est. Cost/mo |
|---------|--------|--------------|
| ECS Fargate (API) | 2 tasks × 0.5 vCPU × 1 GB | ~$30 |
| ECS Fargate (Web) | 2 tasks × 0.25 vCPU × 0.5 GB | ~$15 |
| RDS PostgreSQL | db.t3.medium, single-AZ, 50 GB | ~$55 |
| NAT Gateway | 1 (single AZ for staging) | ~$35 |
| ALB | 1 ALB + LCU | ~$20 |
| S3 | < 1 GB | ~$1 |
| CloudWatch | Logs + basic metrics | ~$10 |
| Secrets Manager | 6 secrets | ~$3 |
| ECR | < 5 GB images | ~$1 |
| Route 53 | Hosted zone + queries | ~$1 |
| **STAGING TOTAL** | | **~$171/mo** |

### Production Environment (Full)

| Service | Config | Est. Cost/mo |
|---------|--------|--------------|
| ECS Fargate (API) | 2–10 tasks × 0.5 vCPU × 1 GB | ~$30–150 |
| ECS Fargate (Web) | 2–6 tasks × 0.25 vCPU × 0.5 GB | ~$15–45 |
| RDS PostgreSQL | db.r6g.large, Multi-AZ, 100 GB | ~$350 |
| NAT Gateway | 2 (one per AZ) | ~$70 |
| ALB | 1 ALB + LCU | ~$25 |
| CloudFront | Moderate traffic | ~$20 |
| WAF | Web ACL + rules | ~$10 |
| S3 (documents) | < 10 GB | ~$2 |
| S3 (backups) | < 50 GB | ~$5 |
| CloudWatch | Full logs + metrics + alarms | ~$30 |
| Secrets Manager | 6 secrets | ~$3 |
| SES | < 10,000 emails/mo | ~$1 |
| ECR | < 10 GB images | ~$1 |
| Route 53 | Hosted zone + queries | ~$1 |
| KMS | 1 key + requests | ~$1 |
| EventBridge | 4 invocations/hour | ~$0 |
| **PRODUCTION TOTAL** | | **~$565–715/mo** |

---

## 20. Implementation Phases (Execution Plan)

Execution order respects the dependency graph. Each phase is one deployable unit.

### Phase 3A: Application Code Preparation
- [ ] Add `output: 'standalone'` to `next.config.mjs`
- [ ] Update Web Dockerfile for standalone output
- [ ] Pin Docker base images to specific versions
- [ ] Extract `DocumentStorageService` to interface + providers
- [ ] Implement `S3StorageProvider` (with `@aws-sdk/client-s3`)
- [ ] Add SES provider class to email-provider.ts
- [ ] Update CORS to use `CORS_ORIGIN` env var dynamically
- [ ] Add `?sslmode=require` support to DATABASE_URL handling
- [ ] Add `STORAGE_PROVIDER` environment variable switch
- [ ] Add `EMAIL_PROVIDER=ses` case to factory

### Phase 3B: Terraform Foundation (IaC)
- [ ] Create `deploy/terraform/` structure
- [ ] Implement networking module (VPC, subnets, NAT, SGs)
- [ ] Implement ECR module
- [ ] Implement IAM module (roles, OIDC)
- [ ] Implement KMS module
- [ ] Create Terraform state bucket + DynamoDB lock

### Phase 4: AWS Networking
- [ ] `terraform apply` networking module (staging)
- [ ] Validate VPC, subnets, NAT, IGW, route tables
- [ ] Validate security groups
- [ ] Validate VPC endpoints

### Phase 5: Database (RDS)
- [ ] `terraform apply` database module (staging)
- [ ] Validate RDS instance connectivity from private subnet
- [ ] Run all 21 migrations against staging RDS
- [ ] Seed demo data
- [ ] Validate with application test suite

### Phase 6: Storage (S3 + Secrets)
- [ ] `terraform apply` storage + secrets modules (staging)
- [ ] Populate Secrets Manager with staging values
- [ ] Test S3StorageProvider against staging bucket

### Phase 7: Compute (ECS + ALB)
- [ ] Build and push Docker images to ECR
- [ ] `terraform apply` compute + loadbalancer modules (staging)
- [ ] Validate ECS services running
- [ ] Validate ALB health checks passing
- [ ] Validate API reachable via ALB

### Phase 8: DNS + TLS + CDN
- [ ] `terraform apply` dns + cdn modules (staging)
- [ ] Validate ACM certificate issued
- [ ] Validate CloudFront distribution active
- [ ] Validate `staging.askabd.com` resolves

### Phase 9: Observability
- [ ] `terraform apply` monitoring module (staging)
- [ ] Validate CloudWatch log groups receiving logs
- [ ] Validate dashboard populated
- [ ] Validate alarms configured

### Phase 10: Email + Scheduler
- [ ] `terraform apply` email + scheduler modules (staging)
- [ ] Validate SES domain verification
- [ ] Validate EventBridge triggers scheduler endpoint
- [ ] Test email delivery via staging

### Phase 11: CI/CD Pipeline
- [ ] Update `.github/workflows/ci.yml` with ECR push + staging deploy
- [ ] Create `.github/workflows/deploy-production.yml` with approval gate
- [ ] Validate full pipeline: push → build → deploy staging → smoke test

### Phase 12: Staging Validation (E2E)
- [ ] Full journey test against staging
- [ ] Load test against staging
- [ ] Security test against staging
- [ ] Regression test (all existing clients valid)

### Phase 13: Production Deployment
- [ ] `terraform apply` all modules (production — with Multi-AZ RDS)
- [ ] Run production database migration
- [ ] Deploy production services
- [ ] DNS cutover to production
- [ ] Smoke tests
- [ ] Monitor observation period

---

## 21. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Domain NS delegation delay | Blocks TLS + DNS | Medium | Start early, validate with dig |
| SES sandbox limits email | Cannot send to unverified addresses | High | Request production SES access early |
| RDS connection pool exhaustion | API errors | Low | Pool max 15 per task × 10 tasks = 150 < RDS limit |
| Fargate cold start latency | Slow first request | Medium | Min desired = 2 tasks, pre-warm at deploy |
| Payment provider not configured | Cannot process real payments | Certain | Mark CONFIGURATION REQUIRED, document |
| NAT Gateway cost | Unexpected cost if high egress | Low | Monitor data transfer, consider VPC endpoints |
| Secrets Manager rotation | App restart needed | Low | Use dynamic secret fetch or container restart |
| Advisory lock with multiple AZs | Scheduler runs in wrong AZ | None | Advisory lock is DB-level, works across AZs |
| CloudFront cache invalidation | Stale content | Low | Use versioned URLs, set short TTL for API |

---

## 22. What This Design Preserves (Backward Compatibility)

| Guarantee | How |
|-----------|-----|
| HTTP response shapes unchanged | No API code modified during infra migration |
| No database schema changes | Same 21 migrations, same tables |
| No SQL query modifications | Same pg Pool, same queries |
| No business logic moved | All 67+ services stay in-place |
| Existing health endpoints work | ALB uses same /health and /ready paths |
| Demo client preserved | demo-meridian-financial seeded identically |
| Regression clients valid | stable-0435, guard-01 unaffected |
| Client isolation maintained | Same client_id query scoping |
| Scheduler idempotent | Same advisory lock mechanism |
| Audit trail continuous | Same oc_audit_log table in RDS |

---

## 23. Open Questions (Require Decision Before Implementation)

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | DNS authority: Route 53 or Cloudflare? | A: Route 53 (recommended), B: Cloudflare proxy | Affects TLS, CDN, WAF strategy |
| 2 | AWS region? | us-east-1 (recommended), eu-west-1 | Affects latency, compliance |
| 3 | Domain names confirmed? | api.askabd.com, app.askabd.com | Affects certs, CORS, env vars |
| 4 | Payment provider selection? | Stripe, Adyen, or defer | Affects secrets, webhooks |
| 5 | SES or external SMTP? | SES (recommended), SendGrid, other | Affects email code path |
| 6 | Multi-region DR needed now? | Yes (expensive), No (defer) | Affects cost, complexity |
| 7 | Who receives alert notifications? | Email list, Slack webhook, PagerDuty | Affects SNS subscription |

---

## 24. Phase 2 Deliverable Summary

This document provides:

- [x] Complete AWS target architecture with 63 enumerated resources
- [x] ECS Fargate decision with evidence-based justification
- [x] Network topology (VPC, 6 subnets, 4 SGs, 5 VPC endpoints)
- [x] Full service mapping (application → AWS)
- [x] Environment strategy (DEV / STAGING / PRODUCTION)
- [x] Security model (5-layer defense in depth, IAM least-privilege)
- [x] Database migration strategy (21 migrations, validation queries)
- [x] Storage migration strategy (filesystem → S3 with provider interface)
- [x] Disaster recovery strategy (RPO 5min, RTO 15min, tested quarterly)
- [x] Rollback requirements (ECS revision, RDS snapshot, DNS)
- [x] CI/CD pipeline design (GitHub OIDC, staging→approval→production)
- [x] Infrastructure-as-Code structure (Terraform modules)
- [x] Cost estimation (~$171/mo staging, ~$565–715/mo production)
- [x] Dependency graph (creation order)
- [x] Secrets inventory (6 per environment)
- [x] Domain/certificate requirements
- [x] WAF rules
- [x] Monitoring dashboards and alarms
- [x] Implementation phases (13 phases)
- [x] Risks and mitigations
- [x] Backward compatibility guarantees
- [x] Open questions requiring human decision

**No AWS resources have been created. No infrastructure has been modified.
No application code has been changed. This is a design document only.**

---

*End of Phase 2 — Target AWS Architecture Design*  
*Awaiting approval to proceed to Phase 3A (Application Code Preparation).*
