# Logging Guidelines

## Purpose
This document defines how logging should be used to support troubleshooting, monitoring, and operations.

## Scope
Applies to application logs, API logs, background jobs, and operational events.

## Principles
- Log for diagnosis and monitoring.
- Be consistent and structured.
- Protect sensitive information.
- Keep logs actionable.

## Standards
- Log key business and technical events such as requests, validation failures, errors, and significant state changes.
- Use structured log fields, including severity, correlation ID, user context, and operation context where relevant.
- Avoid logging passwords, tokens, or personal data.
- Keep log levels appropriate: debug, info, warn, error.

## Best Practices
- Include enough context to investigate an issue without dumping excessive data.
- Standardize log formatting across services.
- Correlate logs with request IDs and tracing information when available.

## Examples
- Good: `{"event":"comparison_request","request_id":"...","merchant_count":5}`
- Poor: `console.log(data)` with raw sensitive payloads.

## Do
- Log meaningful events and failures.
- Protect sensitive information.

## Don't
- Log secrets or credentials.
- Emit noisy logs that obscure important events.

## Review Checklist
- [ ] Logs are structured and useful.
- [ ] Sensitive data is excluded.
- [ ] Log levels are appropriate.

## References
- Logging best practices
- Observability and structured logging guidance
