# Performance Guidelines

## Purpose
This document defines the expectations for building responsive, efficient, and scalable software.

## Scope
Applies to application code, APIs, database access, UI rendering, and deployment configuration.

## Principles
- Performance first
- Measure before optimizing
- Optimize hotspots based on evidence
- Deliver a good user experience under realistic load

## Standards
### Caching
- Cache data when it is expensive to recompute and reused frequently.
- Keep cache invalidation explicit and reasoned.

### Lazy Loading
- Load non-critical resources lazily where appropriate.

### Pagination
- Paginate large result sets to reduce payload and latency.

### Image Optimization
- Use appropriately sized and compressed assets.

### API Optimization
- Minimize request count and payload size.
- Use efficient query and response shapes.

### Database Optimization
- Use indexes and query planning carefully.
- Avoid unnecessary scans and joins.

### Bundle Size
- Keep client bundles lean and avoid unnecessary dependencies.

### Memory Usage
- Avoid memory leaks and large unnecessary object graphs.

## Best Practices
- Profile before and after optimization.
- Prefer efficient algorithms and data structures.
- Set timeout and retry policies thoughtfully.

## Examples
- Good: Use pagination for large merchant listings.
- Poor: Return entire datasets for every client request.

## Do
- Optimize for user-visible latency and reliability.
- Monitor critical paths.

## Don't
- Optimize prematurely without evidence.
- Introduce expensive patterns for minor gains.

## Review Checklist
- [ ] Performance impact was considered.
- [ ] Large payloads and expensive paths were reviewed.
- [ ] Caching and pagination strategies are appropriate.

## References
- Web performance best practices
- Database performance tuning guidance
