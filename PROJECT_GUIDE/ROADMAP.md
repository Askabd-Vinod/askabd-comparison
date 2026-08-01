# Migration Roadmap

## Phase 1: Core Services ✅
1. ✅ CategoryService
2. ✅ ItemService
3. ✅ ComparisonService
4. ✅ TemplateService

## Phase 2: Business Services ✅
5. ✅ MerchantBrandService
6. ✅ CatalogService
7. ✅ PriceEngine
8. ✅ ReviewService
9. ✅ MerchantPortalService

## Phase 3: Cross-Cutting ✅
10. ✅ SearchService

## Phase 4: Platform Foundation ✅
- ✅ @askabd/shared-configuration adopted
- ✅ @askabd/shared-logging adopted
- ✅ @askabd/shared-contracts adopted
- ✅ @askabd/shared-validation adopted
- ✅ @askabd/shared-errors adopted
- ✅ @askabd/shared-result adopted
- ✅ Seed framework

## Phase 5: Production Middleware ✅
- ✅ Authentication middleware (JWT, JWKS, dev bypass)
- ✅ Rate limiting middleware (token bucket, route overrides)
- ✅ Global error handler (structured responses)
- ✅ Correlation ID propagation
- ✅ Graceful shutdown

## Phase 6: Platform Foundation ✅
- ✅ Authorization Framework (RBAC) — 8 roles, 35+ permissions, route rules
- ✅ Audit Engine — automatic write operation capture, structured logs
- ✅ Enterprise Diagnostics Engine — multi-audience failure reports
- ✅ Platform Health Engine — 5 health dimensions, scoring
- ✅ Monitoring Framework — p50/p95/p99, error counts, resource metrics
- ✅ Feature Flag Framework — env/tenant/role/user scoping, 8 flags
- ✅ Configuration Validation Engine — startup diagnostics

## Phase 7: Production Hardening (In Progress)
- ✅ CI/CD pipeline (GitHub Actions) — all branches, caching, security audit
- ✅ Container image (Dockerfile) — multi-stage, vendor packages, healthcheck
- ⬜ Migrate services to tryCatch/safeOperation pattern
- ⬜ Input validation on all write endpoints
- ⬜ API documentation (OpenAPI/Swagger)
- ⬜ Integration test suite
- ⬜ Performance benchmarks
- ⬜ Infrastructure as Code (Terraform/Pulumi)

## Phase 8: Cross-Repository Adoption
- ⬜ Extract platform modules to @askabd/shared-middleware
- ⬜ Extract RBAC to @askabd/shared-authorization
- ⬜ Extract audit to @askabd/shared-audit
- ⬜ Adopt platform foundation in askabd-identity
- ⬜ Adopt platform foundation in askabd-workflow
