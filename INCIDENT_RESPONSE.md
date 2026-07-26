# Incident Response — AskABD Platform

## Severity Levels
| Level | Definition | Response Time |
|-------|-----------|---------------|
| P1 - Critical | Service down, data loss, security breach | 15 min |
| P2 - High | Major feature broken, degraded performance | 1 hour |
| P3 - Medium | Minor feature broken, workaround exists | 4 hours |
| P4 - Low | Cosmetic, non-blocking | Next sprint |

## Response Process
1. **Detect** — Health check failure, alert, user report
2. **Triage** — Determine severity, assign owner
3. **Investigate** — Check logs (correlation ID), health endpoints
4. **Mitigate** — Rollback, scale, restart, or hotfix
5. **Resolve** — Deploy fix, verify, close
6. **Postmortem** — Document root cause, prevention measures

## Quick Diagnostics
```bash
# All services healthy?
curl http://gateway:3000/services/health

# Specific service logs
kubectl logs -f deployment/comparison-api --since=5m

# Database connectivity
kubectl exec deployment/comparison-api -- node -e "require('pg').Pool({connectionString: process.env.DATABASE_URL}).query('SELECT 1')"

# Recent errors
kubectl logs deployment/comparison-api | grep '"level":50'
```

## Escalation
- P1: Notify CTO immediately
- P2: Engineering lead within 1 hour
- P3/P4: Sprint backlog
