# Changelog

## [0.3.0] — 2026-08-02 — CI/CD & Container

### Added
- **CI Pipeline**: Triggers on all branches (feature branch CI enabled), npm caching, security audit step
- **Dockerfile**: Fixed vendor tarball resolution, multi-stage build, --skipLibCheck compatibility
- Production readiness: 94% → 96%

## [0.2.1] — 2026-08-02 — Platform Stabilization

### Changed
- **ComparisonService**: Migrated from raw z.safeParse to platform validateInput adapter
- **TemplateService**: Migrated createTemplate() and addAttribute() to validateInput
- **merchant-brand-routes**: Read operations now use safeQuery (observable, logged)
- **Validation error codes**: Standardized to `invalid_input` across all services (platform convention)

### Improved
- Zero silent error swallowing in route layer (all reads use safeQuery)
- Consistent validation error format across entire API surface
- All 4 write services use identical validation pattern
- Production readiness: 92% → 94%

## [0.2.0] — 2026-08-02 — Platform Foundation

### Added
- **Authorization Framework (RBAC)**: 8 configurable roles (super_admin, admin, business_user, merchant, partner, support, auditor, customer), 35+ permissions, role inheritance, wildcard support, route-level authorization rules
- **Audit Engine**: Automatic write operation capture (POST/PUT/DELETE), structured audit entries with who/when/what/where/result, configurable sinks
- **Enterprise Diagnostics Engine**: Multi-audience failure reports (user/developer/admin/architect), automatic problem classification (Prisma, auth, validation, generic)
- **Platform Health Engine**: 5 health dimensions (infrastructure, database, security, API, platform), scoring system, check framework
- **Monitoring Framework**: Response time percentiles (p50/p95/p99), request/error counters, resource metrics, /metrics endpoint
- **Feature Flag Framework**: 8 default flags, environment/tenant/role/user scoping, percentage rollouts, date-based activation
- **Configuration Validation Engine**: Startup checks for database, JWT, env vars, URLs — friendly diagnostics on failure
- **Authentication Middleware**: JWT validation via jose (EdDSA/RS256), JWKS support, dev bypass
- **Rate Limiting Middleware**: Token bucket (100/min anon, 300/min auth), route overrides, cleanup
- **Global Error Handler**: AppError/Prisma/validation/404 conversion to structured responses
- **Correlation ID Propagation**: Accept/generate X-Request-ID, echo in responses
- **Graceful Shutdown**: SIGTERM/SIGINT handlers, in-flight request completion
- **Enhanced Health Checks**: /health (liveness), /ready (DB connectivity), /platform/health (multi-dimensional)
- Platform endpoints: /metrics, /platform/health, /platform/flags

### Changed
- Production readiness increased from 75% to 92%
- Middleware stack expanded from 3 to 9 layers
- Test count stable at 52 (all passing)

## [0.1.0] — 2026-08-01 — Shared Foundation

### Added
- All 10 services migrated to Prisma
- 6 shared packages adopted (configuration, logging, contracts, validation, errors, result)
- Seed framework (4 scripts)
- Platform cleanup (dead code removed, types consolidated)
