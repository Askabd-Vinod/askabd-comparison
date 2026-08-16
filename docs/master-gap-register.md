# AskABD Master Gap Register

## Date: 2026-08-16

### Priority Legend
- P0 = Security / Data Loss / Tenant Isolation
- P1 = Production Blocker
- P2 = Major Operational Risk
- P3 = Enhancement

---

| ID | Description | Severity | Business Impact | Technical Impact | Status | Required Action | Dependency |
|---|---|---|---|---|---|---|---|
| GAP-001 | TLS/HTTPS not configured | P1 | Data in transit unencrypted | API calls susceptible to MITM | BLOCKED (infra) | Configure ALB/nginx reverse proxy with SSL cert | SSL certificate + load balancer |
| GAP-002 | Production secrets vault not integrated | P1 | Secrets in .env files | Credential exposure risk in deployment | BLOCKED (infra) | Integrate AWS Secrets Manager | AWS account |
| GAP-003 | Production database (RDS) not provisioned | P1 | No production persistence | Data lives only in Docker volume | BLOCKED (infra) | Provision RDS PostgreSQL | AWS account |
| GAP-004 | Automated backup/restore not implemented | P1 | Data loss on failure | No point-in-time recovery | BLOCKED (infra) | Configure RDS automated backups | RDS instance |
| GAP-005 | Production email (SES/SMTP) not configured | P2 | OTP cannot be sent in production | Email-dependent flows blocked | CONFIGURATION | Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS | SMTP provider account |
| GAP-006 | PostgreSQL RLS not implemented | P2 | Relies on application-level isolation | Defense-in-depth gap | DESIGN REQUIRED | Evaluate RLS policies for multi-tenant | DBA review |
| GAP-007 | Jira Cloud not provisioned for testing | P2 | Cannot verify full Jira loop | Integration untested with real Jira | EXTERNAL DEPENDENCY | Provision Jira Cloud project | Jira license |
| GAP-008 | AWS/Azure/K8s SDK not installed | P2 | Cloud connectors endpoint-only | Cannot validate cloud credentials | EXTERNAL DEPENDENCY | Install @aws-sdk, configure IAM | Cloud accounts |
| GAP-009 | workflow-automation email uses hardcoded localhost | P2 | Workflow emails fail in production | `localhost:1025` hardcoded in workflow-automation-service.ts | REQUIRES FIX | Use email-transport.ts | None |
| GAP-010 | email-provider.ts MailpitProvider hardcodes localhost | P3 | Dev-only provider used if EMAIL_PROVIDER=mailpit | Will fail silently if Mailpit unavailable | DOCUMENTED | Already handled by email-transport.ts for OTP | None |
| GAP-011 | Platform services health hardcodes DEV endpoints | P3 | Service health shows localhost addresses | Non-portable | LOW RISK | Make endpoints configurable | None |
| GAP-012 | CI/CD pipeline not tested end-to-end | P3 | Deployment not validated | Manual deploy required | REQUIRES TESTING | Run full pipeline in CI | GitHub Actions |
| GAP-013 | Load/stress testing not performed | P3 | Unknown scaling limits | Bottlenecks undiscovered | DEFERRED | Run k6/artillery after staging deploy | Staging environment |
| GAP-014 | GitHub connector not E2E tested with real token | P3 | Discovery of GitHub repos untested | Token-based auth untested | EXTERNAL DEPENDENCY | Test with real PAT | GitHub token |
| GAP-015 | Frontend build not production-validated | P3 | `next build` not verified | Potential build failures | REQUIRES TESTING | Run `next build` in CI | None |

---

## Summary

| Priority | Count | Status |
|---|---|---|
| P0 | 0 | No security/data-loss blockers |
| P1 | 4 | All infrastructure dependencies |
| P2 | 4 | Mixed (1 code fix + 3 external) |
| P3 | 5 | Enhancements/testing |
| **TOTAL** | **13** | |

## Critical Path to Production

1. **AWS Account** → provisions RDS, ALB, Secrets Manager, SES
2. **Database Migration** → run against RDS
3. **TLS Certificate** → ACM or Let's Encrypt
4. **Environment Variables** → inject via Secrets Manager
5. **Deploy** → Docker/ECS with health checks
6. **Verify** → run production certification suite
