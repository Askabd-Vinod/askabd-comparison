# API Design Standards

## Purpose
This document defines the standards for building APIs that are consistent, secure, and evolvable.

## Scope
Applies to all REST APIs exposed by the platform, including internal and external services.

## Principles
- Enterprise API standards
- Consistency
- Security first
- Backward compatibility
- Explicit contracts

## Standards
### REST APIs
- Use clear resource-oriented endpoints.
- Prefer nouns for resources and verbs only where needed for actions.
- Use plural resource names consistently.

### Status Codes
- 200 for successful reads and updates.
- 201 for created resources.
- 204 for successful deletions with no response body.
- 400 for validation failures.
- 401 for authentication issues.
- 403 for authorization failures.
- 404 for missing resources.
- 409 for conflicts.
- 500 for unexpected server issues.

### Validation
- Validate input at the boundary.
- Return structured validation errors.

### Pagination
- Support pagination for list endpoints.
- Use limit and offset or cursor-based patterns consistently.

### Filtering and Sorting
- Support predictable filter and sort parameters.
- Make defaults explicit.

### Versioning
- Use versioned paths or explicit version headers when breaking changes are necessary.

### Authentication and Authorization
- Require authentication for protected resources.
- Enforce authorization by role or capability.

### Error Responses
- Return consistent error envelopes with code, message, and details.

### Response Structure
- Use consistent success and error payloads.

## Best Practices
- Keep endpoints small and focused.
- Document parameters, responses, and examples.
- Avoid leaking internal implementation details.

## Examples
- Good: `GET /api/v1/merchants/{id}`
- Poor: `GET /api/getMerchantInfo`

## Do
- Preserve API contracts.
- Version breaking changes.

## Don't
- Introduce undocumented field changes.
- Return inconsistent response structures.

## Review Checklist
- [ ] API routes are consistent and documented.
- [ ] Errors are structured and clear.
- [ ] Security and validation are enforced.

## References
- REST API best practices
- OpenAPI and HTTP semantics
