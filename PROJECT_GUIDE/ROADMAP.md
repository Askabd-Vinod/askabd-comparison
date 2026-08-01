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
- ✅ Seed framework (minimal, demo, performance, cleanup)

## Phase 5: Production Middleware ✅
- ✅ Authentication middleware (JWT, JWKS, dev bypass)
- ✅ Rate limiting middleware (token bucket, route overrides)
- ✅ Global error handler (structured responses)

## Phase 6: Production Hardening (Next)
- ⬜ Authorization (RBAC) — role-based access control
- ⬜ Request correlation ID propagation
- ⬜ Migrate services to use tryCatch/safeOperation from result adapter
- ⬜ Input validation on all write endpoints via shared-validation
- ⬜ API documentation (OpenAPI/Swagger)
- ⬜ CI/CD pipeline
- ⬜ Health check enhancements (DB connectivity, dependencies)
- ⬜ Graceful shutdown handling
