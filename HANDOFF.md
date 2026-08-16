# ASKABD — MASTER ENGINEERING HANDOFF

Version: 2026-08-11
Repository: d:\.kiro\askabd-comparison

## 1. PURPOSE

This document is the authoritative handoff for continuing AskABD development in a fresh AI/developer session.

IMPORTANT:
- The repository/database are the source of truth.
- Do not assume this document is more accurate than the actual code.
- Always inspect the repository before modifying existing files.
- Do not rebuild existing capabilities.
- Preserve existing behavior and regression tests.

---

## 2. ASKABD PRODUCT VISION

AskABD is an enterprise transformation platform that helps organizations:

DISCOVER → ASSESS → IDENTIFY PROBLEMS → IDENTIFY GAPS → UNDERSTAND FINANCIAL/EFFORT IMPACT → COMPARE OPTIONS → MAKE DECISIONS → PLAN TRANSFORMATION → EXECUTE → VALIDATE → MEASURE OUTCOMES → CONTINUOUSLY OPTIMIZE

Core principle:
ASK ONCE → UNDERSTAND ONCE → REUSE EVERYWHERE → RECOMMEND → COMMERCIALIZE → TRANSFORM → MEASURE OUTCOME → OPTIMIZE

The platform is domain-agnostic and designed as reusable IP.

---

## 3. CURRENT PLATFORM STATE

Current registered services/capabilities: 67 total
- 31 operational
- 3 foundation
- 22 planned
- 11 concept

Existing major capabilities include:
- Client/Lifecycle Management
- Requirements
- Document Management
- Connectors
- Discovery
- Assessment
- Problem Universe
- Gap Analysis
- Financial Engine
- Effort Engine
- Recommendations
- Options
- Decision Framework
- Transformation Planning
- Migration
- Optimization
- Portfolio Intelligence
- Client Portal
- Workflow Automation
- Event-Driven Architecture
- Notifications
- Scheduler
- Compliance
- Cross-Framework Mapping
- Compliance Exceptions
- Service Registry
- Client Service Enablement
- Service Recommendations
- Service Bundles
- Coverage
- ASK ONCE
- Unified Client Journey
- Production Readiness
- OpenAPI

Do not recreate any of these.

---

## 4. CORE CLIENT JOURNEY

Authoritative journey:
Onboard → Discover → Assess → Problems → Gaps → Value → Options → Decision → Transform → Validate → Outcome → Optimize

The unified journey exists at:
/client-portal/[clientId]/journey

It is already service-aware. Disabled client services appear as "Not enabled".

Do not replace lifecycle state with service configuration. Lifecycle remains authoritative for actual lifecycle progress.

---

## 5. DEV ENVIRONMENT

```
API:        localhost:4200
Web:        localhost:3001
PostgreSQL: localhost:5442
Database:   comparison
User:       comp_user
Password:   comp_local_pass
Mailpit:    localhost:1025 (SMTP) / localhost:8025 (UI)
```

Docker containers:
- `b3d4e70eabdb_comparison-postgres` (PostgreSQL 16)
- `askabd-mailpit` (email)

API startup: `npx tsx src/index.ts` from `apps/api/`
Web startup: `npm run dev` from `apps/web/`

---

## 6. DATABASE MIGRATIONS

20 migrations applied (in `apps/api/src/db/migrations/`):
- 001-009: Core platform schema
- 010: Problem Universe + Financial + Effort
- 011: Capability Registry seed
- 012: Continuous Optimization
- 013: Workflow Automation
- 014: Scheduler + Compliance
- 015: Multi-framework (SOC2 + NIST)
- 016: Cross-framework mapping + Exceptions
- 017: Client Service Enablement
- 018: Future Capabilities (29 placeholders)
- 019: Service Bundles
- 020: Commercial Engagement (4 tables)

Migration 020 tables:
- `oc_commercial_engagements`
- `oc_engagement_services`
- `oc_engagement_pricing`
- `oc_proposals`

---

## 7. KEY SERVICE FILES

Backend services (all in `apps/api/src/services/`):
- `db-pool.ts` — shared PostgreSQL pool (ONE pool, reuse everywhere)
- `operations-center-service.ts` — client CRUD, audit
- `lifecycle-service.ts` — authoritative lifecycle state machine
- `requirements-service.ts` — requirement definitions + readiness
- `connector-service.ts` — database connector validation
- `discovery-service.ts` — infrastructure discovery
- `assessment-service.ts` — risk assessment
- `problem-universe-service.ts` — problem CRUD + auto-detection
- `gap-analysis-service.ts` — gap CRUD + auto-generation
- `decision-transformation-service.ts` — options, decisions, transformations
- `recommendation-service.ts` — recommendations
- `migration-validation-service.ts` — pre-flight + validation
- `migration-execution-service.ts` — migration execution
- `continuous-optimization-service.ts` — metrics, baselines, measurements, findings
- `portfolio-intelligence-service.ts` — cross-client aggregation
- `client-portal-service.ts` — portal aggregation
- `workflow-automation-service.ts` — events, rules, workflow execution
- `scheduler-service.ts` — scheduled jobs with DB advisory locking
- `compliance-service.ts` — frameworks, controls, evidence, exceptions, remediation
- `capability-registry-service.ts` — capability CRUD + maturity
- `service-registry.ts` — service catalog with metadata enrichment
- `notification-service.ts` — notification delivery
- `email-provider.ts` — email abstraction (Mailpit DEV, SMTP prod)
- `otp-store.ts` — PostgreSQL-backed OTP

---

## 8. ROUTE FILE

All OC routes: `apps/api/src/routes/operations-center-routes.ts` (~1800+ lines)

Pattern:
```typescript
import { sharedPool } from '../services/db-pool.js';
// ... service imports

export async function operationsCenterRoutes(server: FastifyInstance): Promise<void> {
  const ocService = new OperationsCenterService();
  // ... routes
}
```

Routes are organized by section with comments like:
```
// ─── SECTION NAME ──────────────────────────────────────────
```

---

## 9. FRONTEND STRUCTURE

Next.js app at `apps/web/src/app/`:
- `/` — Dashboard (managed services)
- `/welcome` — AskABD landing page
- `/platform` — Platform command center
- `/platform/services/registry` — Service Registry
- `/platform/capabilities` — Capability Registry
- `/platform/portfolio` — Portfolio Intelligence
- `/platform/workflows` — Workflow Administration
- `/platform/production-readiness` — Production Readiness
- `/client-portal/[clientId]` — Client Portal (9 tabs)
- `/client-portal/[clientId]/journey` — Unified Journey
- `/clients/[clientId]/problems` — Problem Universe
- `/clients/[clientId]/gaps` — Gap Analysis
- `/clients/[clientId]/optimization` — Optimization
- `/clients/[clientId]/compliance` — Compliance
- `/clients/[clientId]/services` — Service Configuration
- `/clients/[clientId]/lifecycle` — Lifecycle

---

## 10. EXISTING COMMERCIAL SCHEMA (Migration 020)

```sql
-- oc_commercial_engagements
id, client_id, engagement_number, name, description, engagement_type,
status, currency, start_date, target_end_date, owner,
total_investment, total_expected_value, total_effort_days,
created_by, approved_by, approved_at, created_at, updated_at

-- oc_engagement_services
id, engagement_id, client_id, service_id, bundle_id,
status, scope_description, assumptions, exclusions,
estimated_effort, estimated_investment, expected_value,
created_at, updated_at

-- oc_engagement_pricing
id, engagement_id, subtotal, discount, tax, total,
currency, billing_model, payment_terms, pricing_assumptions,
created_at, updated_at

-- oc_proposals
id, engagement_id, client_id, proposal_number, version,
status, title, executive_summary, scope_summary,
investment_summary, value_summary, assumptions, exclusions,
payment_terms, valid_until, created_by, approved_by,
approved_at, created_at, updated_at
```

---

## 11. NEXT BUILD: COMMERCIAL ENGAGEMENT SERVICE

Create: `apps/api/src/services/commercial-engagement-service.ts`

Must implement:
- createEngagement(clientId, data)
- getEngagement(engagementId)
- listEngagements(clientId)
- transitionEngagement(engagementId, newStatus)
- addService(engagementId, serviceId)
- removeService(engagementId, serviceId)
- addBundle(engagementId, bundleId)
- getEngagementSummary(engagementId)
- createProposal(engagementId)
- transitionProposal(proposalId, newStatus)
- approveProposal(proposalId, actor)
- generateProposalContent(proposalId)

Pattern: Use `sharedPool` from `./db-pool.js`, follow existing service patterns.

---

## 12. COMMERCIAL API ROUTES

Add to `operations-center-routes.ts` at the end (before closing `}`):

```
POST   /oc/clients/:clientId/engagements
GET    /oc/clients/:clientId/engagements
GET    /oc/engagements/:id
PATCH  /oc/engagements/:id
POST   /oc/engagements/:id/transition
POST   /oc/engagements/:id/services
DELETE /oc/engagements/:id/services/:serviceId
POST   /oc/engagements/:id/bundles/:bundleId
GET    /oc/engagements/:id/summary
GET    /oc/engagements/:id/pricing
POST   /oc/engagements/:id/pricing
POST   /oc/engagements/:id/proposals
GET    /oc/engagements/:id/proposals
GET    /oc/proposals/:id
POST   /oc/proposals/:id/transition
POST   /oc/proposals/:id/approve
POST   /oc/proposals/:id/generate
GET    /oc/platform/commercial/summary
```

---

## 13. ENGAGEMENT UI

Create: `apps/web/src/app/clients/[clientId]/engagements/page.tsx`
Create: `apps/web/src/app/clients/[clientId]/engagements/[engagementId]/page.tsx`

Platform dashboard: `apps/web/src/app/platform/commercial/page.tsx`

---

## 14. DEMO ENGAGEMENT

For `demo-meridian-financial`, seed:
- Engagement: "Cloud Database Modernization Program"
- Services: from existing recommendations
- Financial: from existing estimates ($250K investment, $400K savings)
- Effort: from existing (120 person-days)
- Proposal: generated from existing evidence

---

## 15. TEST BASELINE

Existing: 52/52 tests passing (vitest)
Run: `npx vitest run` from `apps/api/`

Regression clients:
- stable-0435 (lifecycle: engineering-intelligence)
- guard-01 (lifecycle: identity-verified)
- demo-meridian-financial (lifecycle: validation-passed)

---

## 16. CRITICAL RULES

1. ONE shared database pool — never create another
2. PostgreSQL is authoritative — frontend never invents state
3. Client isolation — every query scoped by client_id
4. ASK ONCE — never re-ask for information already collected
5. Idempotent operations — repeated calls must not create duplicates
6. Audit all mutations
7. Existing services must not be duplicated
8. Service Registry is the authoritative product catalog
9. Lifecycle engine is authoritative for client progress
10. No secrets in responses/logs/events
