# Beta Test Plan — v1.0.0-beta.1

## Objective
Validate core user journeys, identify bugs, measure performance baseline.

## Test Scenarios

### Scenario 1: Consumer Journey
1. Register user (Identity Platform API)
2. Login → receive JWT
3. Browse categories
4. Search products (keyword)
5. View product detail
6. Compare 2-3 products side-by-side
7. Save comparison
8. Add to wishlist
9. Verify audit event recorded
10. Verify analytics metric recorded

**Expected:** All API calls return 200/201. Data persists. Audit trail complete.

### Scenario 2: Merchant Journey
1. Register merchant (pending status)
2. Submit verification documents
3. Admin approves merchant → status: active
4. Merchant creates product
5. Merchant sets price
6. Merchant creates offer
7. Product appears in search
8. Audit trail shows all actions

**Expected:** Lifecycle state machine enforced. Product visible after approval.

### Scenario 3: Admin Journey
1. Login as admin
2. View pending merchants → approve
3. View pending reviews → moderate
4. Create category + template + attributes
5. View analytics dashboard
6. Query audit trail

**Expected:** Admin operations succeed. Data integrity maintained.

## Performance Baseline
| Endpoint | Target p95 | Measurement |
|----------|-----------|-------------|
| GET /health | <50ms | Probe |
| POST /api/v1/compare | <500ms | Load test |
| GET /api/v1/items?search= | <300ms | Load test |
| POST /api/v1/items | <200ms | Load test |

## Pass Criteria
- All 3 scenarios complete without errors
- No data corruption
- No auth bypass
- p95 latency within targets
- Zero critical bugs
