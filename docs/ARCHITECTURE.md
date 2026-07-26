# AskABD Comparison Platform — Product Architecture Blueprint

## 1. Product Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                                   │
├──────────┬──────────┬───────────┬───────────┬──────────────────┤
│ Next.js  │ Mobile   │ Partner   │ Affiliate │ Admin            │
│ Web App  │ (Future) │ Widgets   │ API       │ Portal           │
└────┬─────┴────┬─────┴─────┬─────┴─────┬─────┴────────┬─────────┘
     │          │           │           │              │
     ▼          ▼           ▼           ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 API GATEWAY (:3000)                               │
│  Auth • Rate Limit • Routing • CORS • Logging • Tenant          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
     ┌───────────────────────┬┼┬───────────────────────┐
     ▼                       ▼ ▼                       ▼
┌──────────┐  ┌──────────────────────────┐  ┌──────────────────┐
│Comparison│  │   Enterprise Platforms    │  │   AI Services    │
│Engine API│  │ Identity • Organization  │  │ (Future)         │
│(:4200)   │  │ Search • Financial       │  │ Recommendations  │
│          │  │ Notification • Document  │  │ Price Prediction │
│          │  │ Workflow • Config        │  │ Review Summary   │
│          │  │ Audit • Analytics        │  │                  │
└──────────┘  └──────────────────────────┘  └──────────────────┘
```

## 2. Module Breakdown

| Module | Responsibility | Backend | Frontend |
|--------|---------------|---------|----------|
| **Landing** | Homepage, SEO, marketing | Static + SSR | Next.js pages |
| **Auth** | Login, signup, profile | Identity Platform | Auth components |
| **Categories** | Domain browsing, hierarchy | Comparison API | Category pages |
| **Search** | Universal search, filters, autocomplete | Search Platform | Search UI |
| **Comparison Engine** | Side-by-side comparison, templates | Comparison API | Compare view |
| **Product Detail** | Item pages, specs, media | Comparison API | Detail pages |
| **Pricing Engine** | Price tracking, history, alerts | Comparison API + Financial | Price components |
| **Deals Engine** | Offers, coupons, best value | Comparison API | Deal cards |
| **Reviews** | Ratings, pros/cons, verified | Comparison API | Review components |
| **Wishlist** | Saved items, price alerts | Comparison API | Wishlist page |
| **Saved Comparisons** | User comparison history, sharing | Comparison API | Comparisons page |
| **Recommendations** | Personalized suggestions | AI Service (future) | Rec widgets |
| **Notifications** | Alerts, price drops, new offers | Notification Platform | Notification center |
| **Merchant Management** | Merchant onboarding, data feeds | Comparison API (admin) | Admin portal |
| **Admin Portal** | Content, moderation, templates | Comparison API (admin) | Admin app |
| **Analytics** | Usage, conversions, engagement | Analytics Platform | Dashboard |
| **Marketplace** | Merchant self-service (future) | Comparison API | Marketplace pages |
| **Affiliate** | Partner links, commissions (future) | Financial + Comparison API | Affiliate dashboard |
| **Subscription** | Premium plans, pro features | Financial Platform | Subscription pages |

## 3. Database Design (Normalized)

### Core Entities

```
category
├── id, slug, name, parent_id, icon, description
├── comparison_template_id → comparison_template
└── sort_order, active, metadata

comparison_template
├── id, name, slug, category_id
├── attribute_groups: [{name, attributes: [attribute_id]}]
└── layout_config, version

comparison_attribute
├── id, template_id, name, slug, data_type
├── unit, options[], is_comparable, is_filterable
├── display_order, group_name
└── weight (for scoring)

item
├── id, category_id, brand_id, merchant_id
├── name, slug, description, status
├── images[], videos[], specifications (JSONB)
├── pros[], cons[], tags[]
├── rating_avg, review_count
└── created_at, updated_at, published_at

item_variant
├── id, item_id, name, sku
├── specifications (variant-specific overrides)
├── price_current, price_original, currency
└── availability, stock_status

item_price
├── id, item_id, variant_id, merchant_id
├── price, original_price, currency
├── valid_from, valid_until
├── source_url, is_affiliate
└── recorded_at

brand
├── id, name, slug, logo_url
├── description, website
└── category_ids[], verified

merchant
├── id, name, slug, logo_url
├── website, affiliate_config
├── trust_score, verified
├── commission_rate
└── status (pending, active, suspended)

offer
├── id, item_id, merchant_id
├── type (discount, coupon, bundle, cashback)
├── title, description, code
├── discount_value, discount_type (percent, fixed)
├── valid_from, valid_until
├── terms, url
└── status, priority

review
├── id, item_id, user_id
├── rating, title, content
├── pros[], cons[]
├── verified_purchase, helpful_count
├── media[], status
└── created_at

comparison (saved)
├── id, user_id, category_id
├── title, item_ids[]
├── notes, is_public, share_token
└── created_at

wishlist_item
├── id, user_id, item_id
├── price_alert_threshold
├── notes
└── created_at

search_history
├── id, user_id, query
├── category_id, filters
├── results_count
└── searched_at
```

## 4. API Design

### Public APIs (Consumer)

```
# Categories
GET    /api/v1/categories
GET    /api/v1/categories/:slug
GET    /api/v1/categories/:slug/items
GET    /api/v1/categories/:slug/template

# Items
GET    /api/v1/items/:slug
GET    /api/v1/items/:id/prices
GET    /api/v1/items/:id/reviews
GET    /api/v1/items/:id/offers
GET    /api/v1/items/:id/similar

# Comparison
POST   /api/v1/compare           {itemIds: []}
GET    /api/v1/compare/template/:categorySlug

# Search
GET    /api/v1/search?q=&category=&filters=&sort=&page=
GET    /api/v1/search/autocomplete?q=
GET    /api/v1/search/suggestions

# User (Authenticated)
GET    /api/v1/me/comparisons
POST   /api/v1/me/comparisons
GET    /api/v1/me/wishlist
POST   /api/v1/me/wishlist
DELETE /api/v1/me/wishlist/:id
GET    /api/v1/me/alerts
POST   /api/v1/me/reviews

# Deals
GET    /api/v1/deals?category=
GET    /api/v1/deals/trending
```

### Admin APIs

```
# Categories & Templates
POST   /api/v1/admin/categories
PUT    /api/v1/admin/categories/:id
POST   /api/v1/admin/templates
POST   /api/v1/admin/templates/:id/attributes

# Items
POST   /api/v1/admin/items
PUT    /api/v1/admin/items/:id
POST   /api/v1/admin/items/bulk-import

# Merchants
GET    /api/v1/admin/merchants
POST   /api/v1/admin/merchants
PUT    /api/v1/admin/merchants/:id/approve

# Moderation
GET    /api/v1/admin/reviews/pending
POST   /api/v1/admin/reviews/:id/approve
POST   /api/v1/admin/reviews/:id/reject

# Analytics
GET    /api/v1/admin/analytics/overview
GET    /api/v1/admin/analytics/popular-searches
GET    /api/v1/admin/analytics/top-comparisons
```

## 5. UI Architecture

### Screen Hierarchy

```
/ (Landing)
├── /categories
│   └── /categories/:slug (Category listing)
│       └── /categories/:slug/:itemSlug (Item detail)
├── /compare?items=id1,id2,id3 (Side-by-side)
├── /search?q=&category=&filters=
├── /deals
├── /login
├── /signup
├── /dashboard
│   ├── /dashboard/comparisons
│   ├── /dashboard/wishlist
│   ├── /dashboard/alerts
│   ├── /dashboard/reviews
│   └── /dashboard/settings
├── /admin
│   ├── /admin/categories
│   ├── /admin/items
│   ├── /admin/merchants
│   ├── /admin/reviews
│   ├── /admin/templates
│   └── /admin/analytics
└── /shared/:token (Public shared comparison)
```

### Reusable Components

```
Layout: AppLayout, AdminLayout, AuthLayout
Nav: Header, MobileNav, Breadcrumb, Footer
Search: SearchBar, FilterPanel, SortDropdown, AutocompleteDropdown
Comparison: CompareTable, CompareCard, AttributeRow, WinnerBadge
Item: ItemCard, ItemGrid, ItemDetail, SpecTable, PriceChart
Review: ReviewCard, StarRating, ProsCons, ReviewForm
Deal: DealCard, OfferBadge, PriceTag, DiscountBadge
Common: Button, Modal, Tabs, Accordion, Toast, Skeleton, Pagination
```

## 6. Mobile Architecture

- Next.js responsive-first (Progressive Web App ready)
- All APIs return mobile-optimized payloads
- Image CDN with responsive variants
- Touch-friendly comparison swipe UI
- Future: React Native app consuming same APIs

## 7. AI Integration Points

| Feature | Integration | Trigger |
|---------|------------|--------|
| Smart Recommendations | ML service via API | User browsing history |
| Price Prediction | Time-series model | Historical price data |
| Review Summarization | LLM endpoint | Review aggregation |
| Smart Compare | Decision engine | User preferences |
| Shopping Assistant | Chat API | User query |
| Auto-categorization | Classification model | New item ingestion |

All AI features are behind feature flags (Configuration Platform) and pluggable via the existing event-driven architecture.

## 8. Search Strategy

- Primary: Search Platform (OpenSearch) for full-text
- Faceted search on attributes from comparison templates
- Autocomplete with category-aware suggestions
- Recent searches stored per user
- Popular searches for trending
- Filter by: price range, brand, rating, merchant, availability
- Sort by: relevance, price, rating, newest, popularity

## 9. Merchant Integration Strategy

```
Phase 1: Manual data entry (admin)
Phase 2: CSV/JSON bulk import
Phase 3: Merchant API (self-service portal)
Phase 4: Data feed aggregation (affiliate networks)
Phase 5: Real-time price sync (webhooks from merchants)
```

Merchant data model supports affiliate links, commission tracking, and trust scoring.

## 10. Future Marketplace Strategy

- Merchants register via Organization Platform
- Self-service item management portal
- Verification workflow (Workflow Platform)
- Commission-based revenue model (Financial Platform)
- Merchant analytics dashboard (Analytics Platform)

## 11. Performance Strategy

- Next.js ISR (Incremental Static Regeneration) for item pages
- Redis cache for hot category/item data
- CDN for images (Cloudflare R2)
- Database query optimization (indexes on all filter fields)
- Lazy loading for below-fold content
- API response compression
- Connection pooling (PostgreSQL)

## 12. Security Strategy

- Authentication: Identity Platform (JWT)
- Authorization: Role-based (admin, merchant, user)
- Input validation: Zod schemas on all endpoints
- Rate limiting: API Gateway
- CORS: Strict origin control
- XSS/CSRF: Helmet headers + token validation
- Data: Tenant isolation, PII masking in logs
- Audit: All user actions logged to Audit Platform

## 13. Scalability Strategy

- Stateless API (horizontal scaling)
- Database read replicas for search-heavy queries
- OpenSearch for full-text (scales independently)
- Redis for caching hot paths
- CDN for static assets
- Background jobs for price sync, email digests
- Event-driven decoupling between modules

## 14. Deployment Strategy

- Frontend: Cloudflare Pages (Next.js)
- API: Docker container (Cloudflare Workers or container host)
- Database: Managed PostgreSQL
- Cache: Managed Redis
- Search: Managed OpenSearch
- Storage: Cloudflare R2
- CI/CD: GitHub Actions → Cloudflare

## 15. Multi-tenant Strategy

- Default tenant: `public` (main AskABD comparison site)
- White-label: Tenant-specific branding, categories, items
- Merchant tenants: Isolated data per merchant
- Client tenants: Custom comparison portals for enterprises
- All tenant isolation via existing platform infrastructure

## 16. Caching Strategy

| Data | Cache | TTL |
|------|-------|-----|
| Categories | Redis | 1 hour |
| Item detail | Redis | 15 min |
| Search results | Redis | 5 min |
| Price data | Redis | 30 min |
| User session | JWT (stateless) | 15 min |
| Comparison template | Redis | 1 hour |
| Trending/popular | Redis | 5 min |

## 17. Event-driven Architecture

```
Item Created → Index in Search Platform
Price Changed → Notify watchlist users (Notification Platform)
Review Posted → Update item rating + moderate (Workflow Platform)
Comparison Saved → Record in Analytics Platform
Merchant Registered → Approval workflow (Workflow Platform)
Offer Expired → Remove from active deals
User Signup → Welcome notification (Notification Platform)
```

## 18. Future Microservice Expansion

```
Phase 1 (Current): Monolithic Comparison API
Phase 2: Extract Pricing Engine as separate service
Phase 3: Extract Merchant Service
Phase 4: Extract Recommendation Engine (AI)
Phase 5: Extract Marketplace Service
Phase 6: Extract Affiliate Engine
```

Each extraction follows the same pattern as existing platforms — independent repo, own DB, own port, registered in Gateway.
