# Database Standards

## Purpose
This document defines the database standards required for correctness, maintainability, and safe evolution of data models.

## Scope
Applies to PostgreSQL schema design, migrations, queries, and data access layers.

## Principles
- Data integrity first
- Performance-aware design
- Safe migrations
- Clear domain modeling

## Standards
### Naming
- Use lowercase snake_case for table and column names.
- Use singular table names for entities and plural names only when business context requires it.

### Indexes
- Add indexes for foreign keys and frequently filtered columns.
- Avoid unnecessary indexes that increase write cost.

### Foreign Keys
- Enforce relationships through foreign keys where appropriate.
- Avoid orphaned records.

### Transactions
- Use transactions for multi-step writes that must be atomic.
- Keep transactions short.

### Migration Rules
- Create reversible migrations where possible.
- Never make destructive changes without a rollback plan.

### Seed Rules
- Seeds must be deterministic and safe for non-production environments.
- Avoid seeding sensitive or production-only data.

### Audit Fields
- Include created_at, updated_at, and created_by where relevant.

### Soft Delete
- Use soft delete where data retention and auditability matter.

## Best Practices
- Normalize where appropriate and denormalize only for measurable performance gains.
- Keep queries explicit and avoid N+1 patterns.
- Review migration impact before release.

## Examples
- Good: `merchant_id`, `created_at`, `is_deleted`
- Poor: `MerchantID`, `CreateDate`, `deleted`

## Do
- Keep schema changes documented and tested.
- Migrate incrementally.

## Don't
- Make schema changes without migration review.
- Ignore data integrity constraints.

## Review Checklist
- [ ] Naming is consistent and predictable.
- [ ] Constraints and indexes are appropriate.
- [ ] Migrations are safe and reversible.

## References
- PostgreSQL design and migration guidance
- Database normalization principles
