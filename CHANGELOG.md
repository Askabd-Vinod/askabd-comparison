# Changelog

## v1.0.0-beta.1 (2026-07-26)

### Platform Foundation (11 Services)
- Identity Platform: Authentication, MFA, RBAC, JWT tokens, session management
- Organization Platform: Hierarchy, members, branches
- Workflow Platform: BPM engine, approvals, rules, SLA
- Document Platform: Storage abstraction (S3/R2/local), versioning, sharing
- Notification Platform: 8 channels, templates, preferences, subscriptions
- Search Platform: OpenSearch integration, autocomplete, aggregations
- API Gateway: Reverse proxy, JWT verification, rate limiting, service registry
- Configuration Platform: Feature flags, scoped config, environment profiles
- Audit & Compliance Platform: Centralized audit, compliance profiles, retention
- Financial Platform: Payments, wallets (concurrency-safe), subscriptions
- Analytics Platform: Metrics, dashboards, KPIs

### Comparison Platform
- Universal comparison engine (any domain, zero hardcoded logic)
- 24 database tables (normalized)
- 12 backend services
- 50+ REST API endpoints
- Dynamic comparison templates with 8 attribute types
- Merchant & brand management with verification workflow
- Universal product catalog with media, variants, relations
- Price engine with multi-merchant pricing and offers
- Inventory management with stock alerts
- Campaign/promotion management
- Review system with moderation
- 10 frontend pages (Next.js, responsive)
- 42 unit tests

### Security (Hardening Sprint)
- Full JWT signature verification in Gateway (EdDSA/RS256/ES256)
- Externalized signing keys (no in-memory generation)
- Wallet concurrency protection (SELECT FOR UPDATE)
- Body size limits (10MB)
- Strict CORS in production
- Content-Security-Policy headers
- Graceful shutdown handlers

### Infrastructure
- Docker multi-stage builds (non-root)
- Kubernetes manifests with HPA (2-10 replicas)
- CI/CD pipelines (GitHub Actions)
- Health/readiness probes
- Structured JSON logging
- Correlation IDs
