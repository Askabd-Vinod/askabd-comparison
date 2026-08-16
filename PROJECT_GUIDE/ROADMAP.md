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

## Phase 4: Shared Foundation ✅
- ✅ @askabd/shared-configuration
- ✅ @askabd/shared-logging
- ✅ @askabd/shared-contracts
- ✅ @askabd/shared-validation
- ✅ @askabd/shared-errors
- ✅ @askabd/shared-result
- ✅ Seed framework

## Phase 5: Production Middleware ✅
- ✅ Authentication (JWT, JWKS, dev bypass)
- ✅ Rate limiting (token bucket, route overrides)
- ✅ Global error handler
- ✅ Correlation ID propagation
- ✅ Graceful shutdown

## Phase 6: Platform Foundation ✅
- ✅ RBAC (8 roles, 35+ permissions)
- ✅ Audit Engine
- ✅ Diagnostics Engine
- ✅ Health Engine
- ✅ Monitoring Framework
- ✅ Feature Flags
- ✅ Config Validation Engine

## Phase 7: Production Hardening ✅
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Container image (Dockerfile)
- ✅ Enterprise Readiness Engine (17 checks)
- ✅ OpenAPI 3.1 + Swagger UI (35 paths)

## Phase 8: Shared Package Extraction ✅
- ✅ @askabd/shared-service-utils (L5)
- ✅ @askabd/shared-config-validator (L4)
- ✅ @askabd/shared-health (L4)
- ✅ @askabd/shared-monitoring (L5)
- ✅ @askabd/shared-diagnostics (L4)
- ✅ @askabd/shared-feature-flags (L4)
- ✅ @askabd/shared-audit (L5)
- ✅ @askabd/shared-authorization (L4)
- All adopted in askabd-comparison

## Phase 9: Cross-Repository Adoption (Next)
- ✅ Identity: shared packages installed, startup validation + monitoring added
- ⬜ Identity: push to GitHub (requires repo setup)
- ⬜ Workflow: adopt shared packages
- ⬜ Integration test suite
- ⬜ Performance benchmarks
