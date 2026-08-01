# Changelog

## 2026-08-01

### feat(shared): adopt @askabd/shared-validation
- Created validate.ts adapter bridging shared validate() → platform Result type
- CategoryService.create() now uses validateInput() via shared-validation internally
- Shared schemas available: UuidSchema, EmailSchema, NonEmptyStringSchema, UrlSchema
- sanitize() available for input sanitization
- No API response changes (adapter preserves external contract)
- All 49 tests pass
- Pattern ready for adoption by remaining services

### feat(shared): adopt @askabd/shared-contracts
- Installed shared-contracts with pagination, sorting, filtering, auth, tenant types
- Created contracts/ adapter layer re-exporting types for internal use
- AuthContext and TenantContext ready for identity integration
- parsePaginationParams and parseSortParams available for future pagination
- No API response format changes (external contract preserved)
- All 49 tests pass

### feat(shared): adopt @askabd/shared-logging
- Server logger created via shared createLogger()
- Log entries include mandatory: service, environment, version
- Sensitive fields automatically redacted (password, token, secret, authorization, credential)
- Fastify 5 integration via loggerInstance option
- pino-pretty available as dev dependency
- All 49 tests pass, API verified

### feat(seed): add reusable seed framework
- Minimal seed: 6 core categories
- Demo seed: 5 brands, 5 items, comparison template with 5 attributes
- Performance seed: 100 items for load testing
- Cleanup: removes only seed tenant data, never production records
- Idempotent: running multiple times creates no duplicates (upsert)
- Scripts: npm run seed / seed:demo / seed:perf / seed:cleanup

### chore: adopt @askabd/shared-configuration
- Replaced inline dotenv+zod config loading with shared loadConfig()
- Config now validated via Result type (fail-fast preserved)
- Deep-frozen config object prevents runtime mutation
- Environment helpers (isProduction, isDevelopment) available
- Installed via npm pack tarball (vendor/ directory)
- All 49 tests pass, API verified
- Design: switching to GitHub Packages later only changes package source

### chore: Platform Cleanup Sprint
- Created shared `types.ts` with single `Result<T>` definition
- Removed 8 dead service files (comparison-engine, template, merchant-brand, catalog, price-engine, review, merchant-portal, search — all raw pg versions)
- Removed unused `getPool` import from api-routes.ts
- Removed unused `zod` import from merchant-brand-prisma.ts
- Consolidated duplicate Result type (was in 10 files, now 1)
- TypeScript: 0 errors
- All 49 tests pass
- Zero raw pg queries remaining

### feat(prisma): migrate SearchService [FINAL MIGRATION]
- Parallel search across categories, items, and brands
- Uses Prisma select for optimized projections
- Case-insensitive contains for fuzzy matching
- Empty query returns empty response
- 2 tests passing
- All 10 services now Prisma-powered

### feat(prisma): migrate MerchantPortalService
- InventoryService: upsert with status derivation, adjustStock with Prisma $transaction
- PricingConsole: price rule CRUD with active filter
- CampaignService: create (draft), activate (draft→active), list by merchant
- Inventory history recording within transaction for atomicity
- 6 tests passing

### feat(prisma): migrate ReviewService
- Review creation with auto item rating/count update (Prisma aggregate)
- Review listing by item with pagination
- Stats with aggregate and groupBy
- Moderation workflow (approve/reject)
- Helpful count increment (atomic)
- Pending review queue
- 4 tests passing

### feat(prisma): migrate PriceEngine
- Price recording with BigInt handling
- Price history with merchant filtering
- Lowest price lookup with validity check
- Merchant price deduplication (latest per merchant)
- Offer creation and active offers retrieval
- Trending deals query
- 5 tests passing

### feat(prisma): migrate CatalogService
- Item creation with Prisma (specifications, media, relations)
- Item update with proper not-found handling
- Media management (add, list by item)
- Item relations (add, get related with include)
- Bulk import preserved
- Duplicate slug returns 409
- 6 tests passing

### feat(prisma): migrate MerchantBrandService
- BrandService: CRUD, search, archive/restore
- MerchantService: register, approve, suspend, reactivate
- Verification workflow: submit, review
- Branch management
- 9 tests passing

### feat(prisma): migrate TemplateService
- Template CRUD with Prisma include for attributes
- Attribute CRUD with validation
- 6 tests passing

### feat(prisma): migrate ComparisonService
- Comparison create with share token
- List by user, get by share token
- Dead code removed from comparison-engine.ts
- 4 tests passing

### feat(prisma): migrate ItemService
- Full CRUD with Prisma
- Search (ILIKE + tags)
- List by category with sorting
- Compare by IDs
- 7 tests passing (via category suite)

### feat(prisma): migrate CategoryService
- Full CRUD with Prisma
- N+1 eliminated (groupBy for item counts)
- Zod validation
- Duplicate slug returns 409
- 7 tests passing
