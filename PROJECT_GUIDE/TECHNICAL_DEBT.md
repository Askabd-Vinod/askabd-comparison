# Technical Debt

## Dead Code (pending cleanup approval)
- ✅ ALL DEAD FILES REMOVED (8 files deleted)
- ✅ Result<T> consolidated into shared `types.ts`
- ✅ Unused getPool import removed from routes
- ✅ Unused `z` import removed from merchant-brand

## Type Safety
- 5 instances of `as any` for Prisma JSON fields (Prisma v7 InputJsonValue type)
- TSC full check hangs with Prisma v7 types (use --skipLibCheck)

## Shared Package Integration
- Packages installed as tarballs (vendor/) — switch to GitHub Packages for CI/CD
- Internal Result type still uses `{ ok, value/error }` — adapter needed for shared-result adoption

## Missing Infrastructure
- No authentication
- No authorization
- No rate limiting
- No CI/CD pipeline
- ~~No seed data script~~ ✅ RESOLVED

## Dependencies
- ✅ `comparison-engine.ts` DELETED — no longer needed
- `db/connection.ts` still exists for health check (Prisma handles all queries)
- Raw `pg` package still in dependencies (used by @prisma/adapter-pg)
