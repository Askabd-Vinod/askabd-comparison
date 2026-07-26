# AskABD Comparison Platform

**Compare • Decide • Save**

The world's best comparison platform. Compare products, services, travel, insurance, education, banking, and anything else — side by side.

## Architecture

```
┌─────────────────┐     ┌───────────────────┐
│  Next.js Web  │ →→→ │ Comparison API  │
│  (apps/web)   │     │ (apps/api :4200) │
└─────────────────┘     └────────┬──────────┘
                              │
                    ┌────────┴─────────┐
                    │ API Gateway :3000 │
                    └────────┬─────────┘
                              │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   Identity:3100    Search:3600     Financial:4000
   (auth)           (search)        (payments)
   + 8 more platforms...
```

## Quick Start

```bash
docker compose up -d
cd apps/api && npm install && npm run migrate && npm run dev
```

API: http://localhost:4200

## API Endpoints

```
GET    /api/v1/categories              List categories
GET    /api/v1/categories/:slug        Get category
POST   /api/v1/categories              Create category (admin)

GET    /api/v1/items?categoryId=       List items
GET    /api/v1/items?search=           Search items
GET    /api/v1/items/:slug             Get item detail
POST   /api/v1/items                   Create item (admin)

POST   /api/v1/compare                 Compare items (pass itemIds)

POST   /api/v1/comparisons             Save comparison
GET    /api/v1/comparisons?userId=     My comparisons
GET    /api/v1/comparisons/shared/:token  Shared comparison

GET    /api/v1/search?q=               Global search
GET    /health                         Liveness
```

## Domain Extensibility

New comparison domains (travel, insurance, banking, etc.) are added by:
1. Creating a new category with a `comparison_template`
2. Adding items to that category

**Zero code changes required.**

## Built on AskABD Enterprise Platform (11 services)
