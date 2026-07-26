# Known Limitations — v1.0.0-beta.1

## Accepted for Beta

| # | Limitation | Impact | Planned Fix |
|---|-----------|--------|-------------|
| 1 | Frontend pages display placeholder data (not connected to live APIs) | UI is demonstrative, not functional | GA release |
| 2 | Notification providers are stubs (no real email/SMS delivery) | Notifications queued but not delivered | Configure SMTP credentials for beta |
| 3 | No Redis caching implemented | Higher database load, slower responses | Performance sprint pre-GA |
| 4 | Inter-service event bus not wired | Services operate independently | Event integration sprint |
| 5 | No background job runner | SLA checks, price sync, retention not automated | Background worker sprint |
| 6 | Search delegates to PostgreSQL ILIKE (not OpenSearch) | Slower search, no faceted filtering | Wire to Search Platform |
| 7 | No file upload endpoint (multipart) | Document storage abstraction exists but no HTTP route | Add multipart route |
| 8 | Mobile app not built | API-first design supports future mobile | Post-GA |
| 9 | AI features not implemented | Extension points exist, no ML models | Post-GA |
| 10 | No WebSocket/SSE real-time updates | Price alerts are polling-based | Post-GA |

## Intentionally Deferred to GA

- GraphQL aggregation layer
- Merchant self-service portal UI
- Affiliate commission tracking
- Regional pricing / currency conversion
- Advanced analytics dashboards
- Third-party data feed ingestion
- Automated price syncing
