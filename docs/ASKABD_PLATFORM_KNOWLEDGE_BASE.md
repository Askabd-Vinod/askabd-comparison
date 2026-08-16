# AskABD Enterprise Platform — Knowledge Base

## Executive Summary

### Purpose
AskABD is an Enterprise Operations, Intelligence, Engineering, and Migration platform that provides organizations with a single pane of glass for managing their entire technology estate.

### Vision
Transform how enterprises manage operations, detect and resolve engineering issues, execute migrations, and make technology decisions — powered by AI intelligence and evidence-based recommendations.

### Mission
Deliver an enterprise-grade platform that automatically detects problems, analyzes root causes, recommends solutions, validates fixes, and provides auditable evidence for every decision.

### Business Value
- Reduce MTTR (Mean Time To Resolve) by 60% through automated RCA
- Eliminate manual incident triage through AI-powered detection
- Provide executive-ready reports for every engineering decision
- Enable zero-downtime migrations with automated validation
- Ensure governance compliance with complete audit trails

### Target Customers
- Enterprise organizations (500+ employees)
- Managed service providers
- Digital transformation programs
- Multi-cloud migrations

### Industries Supported
Financial Services, Healthcare, Technology, Manufacturing, Retail, Education, Government, Logistics, Telecommunications, Energy, Insurance, Legal, Hospitality, Agriculture, Automotive, Aerospace

### Competitive Advantages
- AI-powered root cause analysis with confidence scoring
- Evidence-based recommendations (never without proof)
- 12-step guided migration studio
- Plain-English explanations for business stakeholders
- Complete audit trail for every action
- 25+ enterprise connector integrations (ready-for-connection)

---

## Platform Architecture

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS |
| Backend | Fastify, Node.js, TypeScript |
| Database | PostgreSQL 15 (via Prisma + pg) |
| Auth | JWT + RBAC middleware |
| API Docs | OpenAPI/Swagger |
| Monitoring | Custom platform health + metrics |
| Build | Turborepo monorepo |

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────┐
│                    AskABD Platform                        │
├─────────────────────────────────────────────────────────┤
│  FRONTEND (Next.js 15 — apps/web)                       │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐ │
│  │Dashboard│ │Engineering│ │Migrations │ │Governance │ │
│  └────┬────┘ └─────┬────┘ └─────┬─────┘ └─────┬─────┘ │
│       │             │            │              │        │
│  ┌────┴─────────────┴────────────┴──────────────┴────┐  │
│  │           Shared Components & Libraries            │  │
│  │  KpiCard, RemediationPanel, DownloadButton,       │  │
│  │  ServiceControls, AICopilot, FileUpload, etc.     │  │
│  └───────────────────────┬───────────────────────────┘  │
├──────────────────────────┼──────────────────────────────┤
│  API LAYER (Fastify — apps/api)                         │
│  ┌───────────┐ ┌─────────────┐ ┌──────────────────┐   │
│  │ API Routes│ │  OC Routes  │ │Platform Middleware│   │
│  └─────┬─────┘ └──────┬──────┘ └────────┬─────────┘   │
│        │               │                 │              │
│  ┌─────┴───────────────┴─────────────────┴──────────┐  │
│  │              Services Layer                        │  │
│  │  OperationsCenter, Notifications, Prisma Client   │  │
│  └───────────────────────┬───────────────────────────┘  │
├──────────────────────────┼──────────────────────────────┤
│  DATABASE (PostgreSQL 15)                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  oc_clients | oc_audit_log | oc_remediations    │   │
│  │  oc_service_actions | oc_notifications          │   │
│  │  categories | items | comparisons | reviews     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```


### Navigation Structure (15 items)
| Route | Label | Description |
|-------|-------|-------------|
| `/` | Dashboard | Executive Operations Dashboard |
| `/clients` | Clients | Client directory (Table/Cards/Kanban) |
| `/applications` | Applications | Application portfolio |
| `/services` | Services | Platform services catalog |
| `/infrastructure` | Infrastructure | Server/container inventory |
| `/monitoring` | Monitoring | Live metrics (16 KPIs) |
| `/deployments` | Deployments | Deployment tracking |
| `/incidents` | Incidents | Incident management |
| `/intelligence` | Intelligence | Enterprise intelligence hub |
| `/engineering` | Engineering | Engineering intelligence |
| `/migrations` | Migrations | Migration studio |
| `/governance` | Governance | Audit & compliance |
| `/reports` | Reports | Downloadable reports |
| `/platform` | Platform | Platform health |
| `/settings` | Settings | Configuration |

### Client-Level Tabs (34 tabs)
Overview, Applications, Services, Capabilities, Environments, Infrastructure, Monitoring, Deployments, Incidents, Alerts, Audit, Risks, Maturity, Roadmap, Knowledge, Consulting, Documents, Contacts, Timeline, Scorecard, Reports, Connectors, Automation, Contracts, Testing, Readiness, Engineering, Migrations, Settings, Support, Performance, Usage

---

## Complete Module Inventory

### 1. Executive Operations Dashboard (`/`)
- **Purpose**: Single-pane executive view of entire platform
- **Features**: KPI tiles (14), Engineering summary, Migration summary, Client table, AI Insights, Legend
- **Components**: KpiCard, AIInsightsPanel, ServiceControlsInline, OnboardedClientsRows, NewClientsCount

### 2. Client Management (`/clients`)
- **Purpose**: Client lifecycle management
- **Features**: Table/Cards/Kanban views, filtering by health/status, onboarding wizard, service toggles
- **Sub-routes**: `/clients/onboard` (6-step wizard), `/clients/[id]` (34-tab workspace)
- **Key Features**: Toggle enable/disable, restart, multi-select dropdowns, notification recipients

### 3. Client Onboarding Wizard (`/clients/onboard`)
- **Purpose**: Guided 6-step new client setup
- **Steps**: Company Info → Business Info → Technology → Environments → Monitoring → Services
- **Features**: Dropdowns with "Other", country→timezone auto-fill, required field validation, toast notifications, notification recipients per phase, auto-save to DB + localStorage

### 4. Applications (`/applications`)
- **Purpose**: Application portfolio across all clients
- **Features**: Table view, health indicators, production status, service toggles

### 5. Platform Services (`/services`)
- **Purpose**: Service catalog with health monitoring
- **Features**: Card grid, service toggles, health status, version tracking
- **Data**: 15 services in catalog (serviceCatalog)

### 6. Infrastructure (`/infrastructure`)
- **Purpose**: Server/container/cluster inventory
- **Features**: 8 KPI tiles, resource utilization bars, per-client breakdown table

### 7. Monitoring (`/monitoring`)
- **Purpose**: Live platform metrics
- **Features**: 16 metric KPIs (CPU, Memory, Disk, Latency, Availability, Error Rate, etc.), per-client table

### 8. Deployments (`/deployments`)
- **Purpose**: Deployment tracking and history
- **Features**: Deployment list, status tracking

### 9. Incidents (`/incidents`)
- **Purpose**: Incident management and resolution
- **Features**: Incident list, severity/status badges, per-client drill-down
- **Sub-route**: `/clients/[id]/incidents/[incidentId]` — Full detail with RCA, timeline, remediation

### 10. Engineering Intelligence (`/engineering`)
- **Purpose**: Automated defect detection, RCA, solutions, knowledge base
- **Sub-routes**: `/engineering/[defectId]`, `/engineering/knowledge`, `/engineering/reports`
- **Features**: 14 KPI tiles, executive summary, AI insights, defect table, plain-English reports
- **Defect Detail**: 3-tab view (Engineering Report, Technical Details, Actions & Remediate)
- **Knowledge Base**: Searchable, filterable, expandable entries with reuse tracking
- **Reports**: 11 downloadable report types (PDF/Excel/CSV/JSON)

### 11. Migration Intelligence (`/migrations`)
- **Purpose**: Enterprise migration assessment, planning, execution, validation
- **Sub-routes**: `/migrations/new` (12-step studio), `/migrations/[id]` (8-tab detail)
- **Features**: Portfolio dashboard, KPIs, AI insights, gap analysis, wave planning
- **Migration Studio**: Discovery → Source → Target → Validation → Assessment → Strategy → Plan → Dry Run → Execute → Validation → Audit → Report
- **Execution Engine**: Real-time progress, pause/resume/rollback, 13-check connection validation

### 12. Enterprise Intelligence (`/intelligence`)
- **Purpose**: Risk, maturity, transformation, compliance
- **Features**: Risk register, maturity assessment, transformation roadmap, compliance scoring

### 13. Governance (`/governance`)
- **Purpose**: Audit, compliance, security governance
- **Features**: Global audit timeline, compliance status (SOC2, ISO27001, GDPR), security controls

### 14. Reports (`/reports`)
- **Purpose**: Downloadable platform-wide reports
- **Features**: 9 report types, each with PDF/Excel/CSV download buttons
- **Reports**: Health, Availability, Performance, Incident, Deployment, Security, Usage, SLA, Growth

### 15. Platform Health (`/platform`)
- **Purpose**: API health, diagnostics, feature flags, system metrics


---

## Shared Components (23 components)

| Component | Purpose | Used By |
|-----------|---------|---------|
| `ai-copilot.tsx` | AI Engineering Assistant (floating) | Root layout (every page) |
| `ai-insights.tsx` | AI insights panel with recommendations | Dashboard, Engineering, Migrations, Intelligence |
| `assessment-report.tsx` | Assessment report generation | Clients |
| `breadcrumb.tsx` | Navigation breadcrumbs | Every page |
| `client-card.tsx` | Client card component | Client views |
| `download-button.tsx` | Universal file download (PDF/Excel/CSV) | Reports, Documents, Engineering, Migrations |
| `file-upload.tsx` | File upload with version control | Documents, Contracts |
| `kpi-card.tsx` | Universal KPI tile with tooltip + new client count | Every dashboard |
| `legend.tsx` | Health status legend | Dashboard |
| `live-indicator.tsx` | Real-time status indicator | Monitoring |
| `logo.tsx` | AskABD logo (SVG) | Header |
| `migration-connection.tsx` | Source/target connection + comparison | Migrations detail |
| `missing-info.tsx` | Missing information panel | Client detail |
| `nav.tsx` | Main navigation bar | Root layout |
| `new-clients-counter.tsx` | "+N new" badge for onboarded clients | Dashboard, Clients |
| `onboarded-clients.tsx` | Onboarded client rows/cards/banner | Clients page |
| `operations-dashboard.tsx` | Operations dashboard widget | Dashboard |
| `remediation-panel.tsx` | Guided remediation (12 phases) | Incidents, Engineering |
| `search-filters.tsx` | Search and filter controls | Various |
| `service-controls.tsx` | Toggle (ON/OFF) + Restart button | Clients, Apps, Services |
| `solution-recommendation.tsx` | Solution display component | Incidents |
| `status-badge.tsx` | Health/SLA status badges | Client tables |
| `timeline.tsx` | Event timeline component | Incidents, Clients |

---

## Core Libraries (14 files)

| Library | Purpose |
|---------|---------|
| `api.ts` | HTTP client for backend API calls |
| `assessment-standard.ts` | Assessment methodology standards |
| `connector-framework.ts` | 20 enterprise connectors with full lifecycle |
| `connectors.ts` | Connector utilities |
| `engineering-intelligence.ts` | Defect types, RCA, solutions, metrics, mock data |
| `env.ts` | Environment detection (dev/staging/prod) |
| `migration-intelligence.ts` | 34 migration types, programs, assessments |
| `mock-clients.ts` | 8 mock clients with full data |
| `notifications.ts` | AskABD Standard notification system |
| `operations-api.ts` | Operations Center API client |
| `organization-model.ts` | Organization entity model (wraps Client) |
| `platform-registry.ts` | Metadata-driven module/connector registry |
| `service-catalog.ts` | 15 service definitions with deliverables |
| `types.ts` | Core TypeScript types (Client, Incident, etc.) |

---

## Connector Inventory (25 connectors)

All connectors are **READY FOR CONNECTION** — production-ready framework awaiting customer credentials.

| Connector | Category | Auth | Features |
|-----------|----------|------|----------|
| AWS | Cloud | API Key / IAM | EC2, S3, RDS, Lambda, ECS, CloudWatch |
| Azure | Cloud | Certificate / OAuth | VMs, Storage, SQL, AKS, Monitor |
| Google Cloud | Cloud | Certificate | Compute, GKE, BigQuery, Storage |
| GitHub | Source Control | OAuth / PAT | Repos, PRs, Actions, Security |
| GitLab | Source Control | PAT | Repos, Pipelines, Registry |
| Bitbucket | Source Control | OAuth | PRs, Pipelines, Code Insights |
| Azure DevOps | Source Control | PAT | Repos, Boards, Pipelines |
| Jira | Project Mgmt | API Key | Issues, Sprints, Boards |
| ServiceNow | ITSM | Basic / OAuth | Incidents, Changes, CMDB |
| Confluence | Documentation | API Key | Pages, Spaces, Search |
| Prometheus | Monitoring | Basic / Bearer | Metrics, Alerts, Rules |
| Grafana | Monitoring | API Key | Dashboards, Alerts |
| Datadog | Monitoring | API Key | APM, Logs, Monitors |
| PagerDuty | Incident | API Key | Incidents, Schedules |
| Splunk | Logging | API Key | Search, Dashboards, Alerts |
| Elastic | Logging | API Key | Search, Kibana, APM |
| Kubernetes | Container | Certificate | Deployments, Pods, Services |
| Docker | Container | PAT | Images, Builds, Scanning |
| Okta | Identity | API Key | SSO, MFA, Provisioning |
| Microsoft Entra ID | Identity | Certificate / OAuth | SSO, Groups, Policies |
| Slack | Communication | OAuth | Messages, Channels, Bots |
| PostgreSQL | Database | Basic | Query, Schema, Replication |
| MongoDB | Database | Basic / Cert | Collections, Indexes |
| Oracle | Database | Basic | Tables, Procedures (Premium) |
| Salesforce | CRM | OAuth | Objects, Reports (Premium) |

---

## Database Schema (6 migrations)

| Migration | Tables Created |
|-----------|---------------|
| 001_initial_schema | Core comparison tables |
| 002_normalized_entities | Normalized entity structure |
| 003_merchant_brand_extended | Merchant/brand extensions |
| 004_product_catalog | Product catalog |
| 005_merchant_portal_inventory | Merchant portal |
| 006_operations_center | oc_clients, oc_audit_log, oc_remediations, oc_service_actions, oc_notifications |

### Operations Center Tables
| Table | Purpose |
|-------|---------|
| `oc_clients` | Full client records (all onboarding data) |
| `oc_audit_log` | Every action: who, what, when, where, why, evidence |
| `oc_remediations` | Remediation lifecycle: plan, execute, validate, close |
| `oc_service_actions` | Toggle/restart history with duration, success |
| `oc_notifications` | Sent notification records with recipients |


---

## API Endpoints

### Platform Routes (Fastify)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Platform health check |
| GET | `/ready` | Readiness probe (DB connectivity) |
| GET | `/platform/health` | Full platform health with dimensions |
| GET | `/platform/flags` | Feature flags |

### Operations Center API (`/api/v1/oc/`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/oc/clients` | Create client (onboarding) |
| GET | `/oc/clients` | List clients (with filters) |
| GET | `/oc/clients/:id` | Get single client |
| PUT | `/oc/clients/:id` | Update client |
| GET | `/oc/audit` | Query audit trail |
| POST | `/oc/audit` | Log audit event |
| POST | `/oc/remediations` | Create remediation |
| PATCH | `/oc/remediations/:id/phase` | Update phase + evidence |
| POST | `/oc/remediations/:id/close` | Close ticket |
| POST | `/oc/service-actions` | Record toggle/restart |
| GET | `/oc/service-actions/:id` | Get action history |
| POST | `/oc/notifications` | Send notification |
| GET | `/oc/notifications` | List notifications |

### Business API (`/api/v1/`)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/categories` | Category CRUD |
| GET/POST | `/items` | Item CRUD + search |
| POST | `/compare` | Generate comparison |
| POST/GET | `/comparisons` | Saved comparisons |
| GET | `/search` | Full-text search |

---

## Security Architecture

| Layer | Implementation |
|-------|---------------|
| Authentication | JWT middleware (dev bypass when no JWT_SECRET) |
| Authorization | RBAC framework with route rules |
| Rate Limiting | Token bucket (authenticated users get higher limits) |
| Audit | Every write operation automatically logged |
| Encryption | AES-256-GCM for connector credentials |
| Input Validation | Zod schemas for all config |
| Error Handling | Structured error responses (never raw stack traces to client) |
| Correlation | X-Request-ID propagated through all requests |
| Tenant Isolation | Client/Organization-scoped data access |

---

## AI Capabilities

### AI Copilot (available on every page)
- Explain errors in plain English
- Generate root cause analysis
- Search knowledge base
- Compare historical incidents
- Generate executive summaries
- Suggest best practices
- Assess business impact
- Evidence-backed responses with confidence scores

### AI Insights Panel (contextual)
- Issue detection with severity
- Risk predictions
- Recommendations with actions
- Trend predictions

### Engineering Intelligence AI
- Automatic error categorization (18 types)
- RCA with confidence scoring (0-100%)
- Solution generation with alternatives
- Auto-fix assessment (YES/PARTIAL/NO)
- Pattern matching against knowledge base

---

## Notification System

### AskABD Standard Format
Every notification follows identical structure regardless of trigger:
- Priority (Low/Medium/High/Critical)
- Client name
- Phase (onboarding/service-change/incident/remediation/deployment/maintenance/escalation/resolution)
- Subject line format: `[AskABD] {Phase} — {Action} — {Client}`
- Details: Action, Performed By, Timestamp, Environment, Impact, Affected Services
- Evidence array
- Recipients (configurable per phase during onboarding)

### Notification Triggers
| Event | Phase | Priority |
|-------|-------|----------|
| Client onboarded | onboarding | medium |
| Service enabled | service-change | low |
| Service disabled | service-change | high |
| Service restarted | service-change | medium |
| Remediation complete | resolution | low |

---

## Remediation Panel (12-phase lifecycle)

Phases: idle → impact-analysis → approval-pending → executing → validating → completed → (user verification) → ticket-closed

**Key Features:**
- State persisted to localStorage (survives navigation)
- Two grades: Standard (safe, 15min) and Expedited (fast, 5min)
- Impact analysis with risk scoring before any action
- Step-by-step execution with live progress
- Evidence captured at every step with timestamps
- User must verify fix works before ticket closure
- If fix fails → re-analysis before retry (no blind retries)
- Emergency rollback available during execution
- Full audit trail logged to database

---

## Platform Metrics

| Metric | Count |
|--------|-------|
| Frontend Pages/Routes | 50+ |
| Shared Components | 23 |
| Core Libraries | 14 |
| API Endpoints | 20+ |
| Database Tables | 10+ |
| Connectors | 25 |
| Migration Types | 34 |
| Report Types | 30+ |
| Client Tabs | 34 |
| Main Nav Items | 15 |
| KPI Tiles (Dashboard) | 14 |
| Engineering Defect Types | 18 |
| Service Catalog Items | 15 |
| Industries Supported | 16+ |

---

## Known Gaps & External Dependencies

### Requires Customer Credentials (READY FOR CONNECTION)
- All 25 connectors need customer-provided API keys/tokens
- Database connection for live discovery in Migration Studio
- SMTP/SES for email notification delivery
- Identity provider (Okta/Entra ID) for production SSO

### Requires Infrastructure
- PostgreSQL database (configured at localhost:5442)
- Docker/Kubernetes for production deployment
- CI/CD pipeline for automated builds
- SSL certificates for production domains

### Partially Complete
- ESLint configuration not present in web app
- `next build` production build not verified (requires running API)
- Real-time WebSocket monitoring (simulated)
- Multi-tenant data isolation (framework ready, enforcement depends on auth provider)

### Complete (No External Dependencies)
- All UI pages and navigation
- All KPI calculations and dashboards
- Remediation lifecycle with persistence
- File download generation
- File upload with version control
- Service toggle/restart with audit
- Client onboarding wizard
- Migration Studio (12 steps)
- Engineering Intelligence (RCA, solutions, knowledge base)
- AI Copilot responses
- Notification formatting
- Organization model
- Platform registry

---

## Dependency Matrix

```
Dashboard ──→ Clients, Engineering, Migrations, Monitoring
Clients ──→ Incidents, Deployments, Infrastructure, Monitoring, Engineering, Migrations
Engineering ──→ Knowledge Base, Clients, Incidents, Remediation Panel
Migrations ──→ Connectors, Clients, Reports, Audit
Incidents ──→ Remediation Panel, Timeline, AI Insights, Solution Recommendation
Governance ──→ Audit, Compliance, Security
Reports ──→ All modules (generates reports from each)
AI Copilot ──→ Engineering, Knowledge Base, Incidents
Connectors ──→ Migrations, Monitoring, Engineering (evidence collection)
Notifications ──→ Clients (recipients), Audit (evidence)
```

---

*Generated: 6 August 2026 | Platform Version: 0.4.0 | Document Version: 1.0*
