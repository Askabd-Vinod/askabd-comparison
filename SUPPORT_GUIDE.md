# Support Guide — AskABD Comparison Platform

## Contact
- Engineering: hello@askabd.com
- Issues: https://github.com/Askabd-Vinod/askabd-comparison/issues

## Common Issues

### Service won't start
1. Check DATABASE_URL is correct
2. Run migrations: `npm run migrate`
3. Verify PostgreSQL is reachable
4. Check logs: `docker logs comparison-api`

### Authentication fails
1. Verify Identity Platform is running (:3100)
2. Verify Gateway is running (:3000)
3. Check JWT_ISSUER matches between services
4. Verify token not expired

### Search returns empty
1. Verify items exist in database
2. Check category_id matches
3. Search uses ILIKE (case-insensitive)

### Merchant stuck in pending
1. Admin must call POST /admin/merchants/:id/approve
2. Check verification is submitted
3. Review audit log for rejection

## Health Checks
- API: http://localhost:4200/health
- Gateway: http://localhost:3000/health
- Identity: http://localhost:3100/v1/health

## Logs
All services output structured JSON to stdout.
Filter by correlation ID: `x-correlation-id`
