# Implementation Matrix

| Service | Data Layer | Validation | Error Handling | Tests | Routes | Status |
|---------|-----------|-----------|----------------|-------|--------|--------|
| CategoryService | Prisma | Zod | P2002/P2025 duck-type | 7 | api-routes.ts | ✅ |
| ItemService | Prisma | Zod | P2002/P2003/P2025 | 7 | api-routes.ts | ✅ |
| ComparisonService | Prisma | Zod | Validation | 4 | api-routes.ts | ✅ |
| TemplateService | Prisma | Zod | P2003/P2025 | 6 | api-routes.ts | ✅ |
| BrandService | Prisma | Manual | P2002/P2025 | 3 | merchant-brand-routes.ts | ✅ |
| MerchantService | Prisma | Manual | P2002/P2025 | 6 | merchant-brand-routes.ts | ✅ |
| CatalogService | Prisma | Manual | P2002/P2003/P2025 | 6 | (programmatic) | ✅ |
| PriceEngine | Prisma | Manual | Validation | 5 | (programmatic) | ✅ |
| ReviewService | Prisma | Manual | P2025 duck-type | 4 | (programmatic) | ✅ |
| MerchantPortalService | Raw pg | Manual | Manual | 6 | (programmatic) | ⬜ |
| SearchService | Raw pg | None | safeRead wrapper | 1 | api-routes.ts | ⬜ |
