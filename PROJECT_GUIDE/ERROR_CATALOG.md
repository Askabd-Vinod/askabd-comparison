# AskABD Comparison Platform — Error Catalog

## Error Format

Every error contains:
- **Code**: Machine-readable identifier (e.g., `SHARED.VALIDATION_ERROR`)
- **Category**: Logical grouping (validation, not_found, conflict, authentication, authorization, rate_limited, server)
- **Severity**: info, warning, error, critical
- **User Message**: Simple, friendly, actionable
- **Developer Message**: Technical, includes context
- **Admin Message**: Business explanation with resolution
- **Correlation ID**: Request-level trace
- **Timestamp**: ISO 8601

---

## Error Codes

| Code | Status | Category | User Message | Developer Context | Admin Resolution |
|------|--------|----------|-------------|-------------------|-----------------|
| `SHARED.VALIDATION_ERROR` | 400 | validation | Input is invalid. Please check your data. | Field-level errors in context.fields | Review input schema; check API docs |
| `SHARED.NOT_FOUND` | 404 | not_found | The requested resource was not found. | Resource type and ID in context | Verify resource exists; check database |
| `SHARED.CONFLICT` | 409 | conflict | This resource already exists. | Conflicting field in context | Duplicate detection; verify unique constraints |
| `SHARED.AUTHENTICATION_ERROR` | 401 | authentication | Authentication failed. Please sign in. | Attempt timestamp in context | Check identity service; verify JWT |
| `SHARED.AUTHORIZATION_ERROR` | 403 | authorization | You do not have permission for this action. | Required role/permission in context | Review RBAC configuration |
| `SHARED.RATE_LIMIT_EXCEEDED` | 429 | rate_limited | Too many requests. Please try again later. | retryAfterMs in context | Review rate limit config; check for abuse |
| `SHARED.TIMEOUT` | 408 | server | The operation timed out. Please try again. | Query/operation details in context | Check database performance; review slow queries |
| `SHARED.INFRASTRUCTURE_ERROR` | 500 | server | An unexpected error occurred. Please try again. | Full error details in context | Check service health; review logs |

## Prisma Error Mapping

| Prisma Code | Maps To | Meaning |
|-------------|---------|---------|
| P2002 | `SHARED.CONFLICT` | Unique constraint violation |
| P2003 | `SHARED.VALIDATION_ERROR` | Foreign key constraint failure |
| P2025 | `SHARED.NOT_FOUND` | Record not found |
| Other | `SHARED.INFRASTRUCTURE_ERROR` | Unexpected database error |

## API Response Format (External)

```json
{
  "error": {
    "category": "validation",
    "code": "SHARED.VALIDATION_ERROR",
    "field": "email",
    "message": "Invalid email format",
    "statusCode": 400
  }
}
```

## Log Format (Internal — Developer)

```json
{
  "level": 50,
  "service": "comparison-api",
  "correlationId": "req-abc-123",
  "err": {
    "code": "SHARED.VALIDATION_ERROR",
    "message": "Invalid email format",
    "statusCode": 400,
    "context": { "field": "email", "received": "not-an-email" },
    "stack": "..."
  }
}
```
