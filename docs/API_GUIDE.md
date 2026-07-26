# AskABD Comparison Platform — API Guide

## Base URL
- Development: `http://localhost:4200/api/v1`
- Production: `https://api.askabd.app/comparison/v1` (via Gateway)

## Authentication
All protected endpoints require `Authorization: Bearer <jwt>` header.
JWTs issued by the AskABD Identity Platform.

## Tenant Isolation
Public data uses tenant `public`. Multi-tenant via `X-Tenant-Id` header.

## Error Format
```json
{ "error": { "category": "validation", "code": "name_required", "field": "name", "message": "Name required" } }
```

## Endpoints Summary (50+)

### Categories
- `GET /categories` — List all
- `GET /categories/:slug` — Get by slug
- `GET /categories/:slug/template` — Get comparison template
- `POST /categories` — Create (admin)

### Items
- `GET /items?categoryId=&search=&sort=` — List/search
- `GET /items/:slug` — Get detail
- `POST /items` — Create (admin/merchant)

### Compare
- `POST /compare` — Side-by-side comparison (returns items + template)

### Brands
- `GET /brands` — List/search
- `GET /brands/:slug`
- `POST /admin/brands` — Create
- `PUT /admin/brands/:id`
- `POST /admin/brands/:id/archive`

### Merchants
- `GET /merchants` — List/search
- `POST /merchants/register` — Self-registration
- `POST /admin/merchants/:id/approve`
- `POST /admin/merchants/:id/suspend`
- `POST /merchants/:id/verification`
- `POST /merchants/:id/branches`

### Templates (Admin)
- `POST /admin/templates`
- `POST /admin/templates/:id/attributes`
- `PUT /admin/attributes/:id`

### Comparisons
- `POST /comparisons` — Save comparison
- `GET /comparisons?userId=` — My comparisons
- `GET /comparisons/shared/:token` — Shared link

### Search
- `GET /search?q=` — Global search

## Rate Limits
- 200 requests/minute per IP (via Gateway)
- 1000 requests/minute for authenticated users

## Pagination
All list endpoints support `?limit=20&offset=0`

## Versioning
All endpoints under `/api/v1/`. Breaking changes ship under `/api/v2/`.
