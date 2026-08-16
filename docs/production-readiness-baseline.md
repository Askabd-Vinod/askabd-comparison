# AskABD Production Readiness Baseline

## Captured: 2026-08-16

### Test Results
| Repository | Tests | Result |
|---|---|---|
| askabd-comparison API | 103 | ✅ PASS |
| askabd-identity | 177 | ✅ PASS |
| askabd-workflow | 9 | ✅ PASS |
| askabd-shared | 455 | ✅ PASS |
| **TOTAL** | **744** | **✅ ALL PASS** |

### Git State
- Repository: askabd-comparison
- Branch: feature/category-stabilization
- Commit: 2c288ff
- Message: feat(web): convert to managed service — remove customer auth, comparison-first home

### Database
- Engine: PostgreSQL 16 Alpine
- Port: 5442
- Database: comparison
- Migrations applied: 023 (001 through 023_jira_integration.sql)
- Pool: Single shared pool (max 15 connections)

### Existing Clients (4)
1. AskABD Manual UAT 2026 — lifecycle=NOT_INITIALIZED
2. test1 — lifecycle=NOT_INITIALIZED
3. E2E Lifecycle #1 — lifecycle=assessment-complete, v11
4. E2E Lifecycle #2 — lifecycle=assessment-complete, v11

### E2E Lifecycle Test
- Result: 27/27 PASS
- Discovery: 232 resources (REAL PostgreSQL introspection)
- Assessment: 5 findings generated
- Health Score: 55/100
- Defect Detection: 8 items scanned
- Client Isolation: VERIFIED

### Running Services (DEV)
- AskABD API: Fastify 5.3 on port 4200
- AskABD Web: Next.js 15.3 on port 3001
- PostgreSQL: Docker on port 5442
- Mailpit: Docker (SMTP 1025, UI 8025)

### Platform Health
- Database: ✅ Ready
- API: ✅ Healthy
- Email: ✅ Mailpit (DEV only)
- Jira: ⚪ Not configured
- AWS/Azure/K8s: ⚪ Not configured (external dependency)
