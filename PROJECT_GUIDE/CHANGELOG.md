# Changelog

## 2026-08-01

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
