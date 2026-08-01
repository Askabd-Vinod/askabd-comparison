# Technical Debt

## Dead Code (pending cleanup approval)
- `src/services/comparison-engine.ts` — reduced to Result type export only
- `src/services/template-service.ts` — old raw pg version, unused
- `src/services/merchant-brand-service.ts` — old raw pg version, unused
- `src/services/catalog-service.ts` — old raw pg version, unused
- `src/services/price-engine.ts` — old raw pg version, unused

## Type Safety
- 5 instances of `as any` for Prisma JSON fields (Prisma v7 InputJsonValue type)
- TSC full check hangs with Prisma v7 types (use --skipLibCheck)

## Missing Infrastructure
- No authentication
- No authorization
- No rate limiting
- No CI/CD pipeline
- No seed data script

## Dependencies
- `comparison-engine.ts` still exports `Result` type used by remaining raw pg services
- Will be removed after all services are migrated
