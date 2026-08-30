# Route Inventory (mechanically generated)

Generated 2026-08-30T13:11:17.310Z by scanning `apps/web/src/app` directly — every `page.tsx` plus co-located client components in its directory. This is a structural scan (regex over real source), not a manual claim.

**Total routes: 124**

## staff — internal operations (29)

| Route | Buttons | Forms | Inputs | Fetch/API | Downloads | Uploads | Mutations | Realtime signals |
|---|---|---|---|---|---|---|---|---|
| `/` | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| `/account/security` | 0 | 2 | 2 | 3 | 0 | 0 | 3 | 0 |
| `/applications` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients` | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/deployments` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/engineering` | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/engineering/[defectId]` | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `/engineering/knowledge` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/engineering/reports` | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| `/governance` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/incidents` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/infrastructure` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/intelligence` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/intelligence/catalog` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/intelligence/catalog/[serviceId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/intelligence/debt` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/intelligence/proposals` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/migrations` | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| `/migrations/[migrationId]` | 6 | 0 | 0 | 5 | 1 | 0 | 4 | 0 |
| `/migrations/new` | 1 | 0 | 1 | 2 | 0 | 0 | 1 | 0 |
| `/monitoring` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/reports` | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `/reports/[reportId]` | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `/search` | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| `/services` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/services/[serviceId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/settings` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/verify` | 5 | 0 | 1 | 3 | 0 | 0 | 3 | 0 |
| `/welcome` | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |

## auth (unauthenticated) (5)

| Route | Buttons | Forms | Inputs | Fetch/API | Downloads | Uploads | Mutations | Realtime signals |
|---|---|---|---|---|---|---|---|---|
| `/accept-invitation` | 5 | 2 | 3 | 2 | 0 | 0 | 1 | 0 |
| `/forgot-password` | 1 | 1 | 2 | 1 | 0 | 0 | 1 | 0 |
| `/login` | 7 | 2 | 4 | 0 | 0 | 0 | 1 | 0 |
| `/reset-password` | 4 | 1 | 3 | 1 | 0 | 0 | 1 | 0 |
| `/staff/login` | 4 | 2 | 4 | 0 | 0 | 0 | 0 | 0 |

## client-portal (customer-facing) (2)

| Route | Buttons | Forms | Inputs | Fetch/API | Downloads | Uploads | Mutations | Realtime signals |
|---|---|---|---|---|---|---|---|---|
| `/client-portal/[clientId]` | 12 | 0 | 2 | 0 | 0 | 0 | 1 | 0 |
| `/client-portal/[clientId]/journey` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## staff — client-scoped workflow (74)

| Route | Buttons | Forms | Inputs | Fetch/API | Downloads | Uploads | Mutations | Realtime signals |
|---|---|---|---|---|---|---|---|---|
| `/clients/[clientId]` | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/activity` | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/alerts` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/alerts/[alertId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/api-specs` | 5 | 0 | 2 | 0 | 0 | 0 | 3 | 0 |
| `/clients/[clientId]/applications` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/applications/[appId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/assessment` | 5 | 0 | 0 | 6 | 0 | 0 | 3 | 1 |
| `/clients/[clientId]/audit` | 2 | 0 | 0 | 6 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/audit/[auditId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/automation` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/business-requirements` | 1 | 1 | 6 | 7 | 0 | 0 | 3 | 0 |
| `/clients/[clientId]/capabilities` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/changes` | 14 | 0 | 7 | 0 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/clarifications` | 5 | 0 | 2 | 0 | 0 | 0 | 3 | 0 |
| `/clients/[clientId]/comparisons` | 12 | 4 | 15 | 13 | 0 | 0 | 5 | 0 |
| `/clients/[clientId]/compliance` | 1 | 0 | 0 | 5 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/connectors` | 3 | 0 | 2 | 5 | 0 | 0 | 3 | 0 |
| `/clients/[clientId]/consulting` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/contacts` | 1 | 1 | 6 | 4 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/contracts` | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `/clients/[clientId]/data-mappings` | 6 | 0 | 11 | 0 | 0 | 0 | 4 | 0 |
| `/clients/[clientId]/data-reconciliation` | 2 | 0 | 3 | 0 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/dependencies` | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/deployments` | 0 | 0 | 1 | 3 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/deployments/[deploymentId]` | 0 | 0 | 0 | 4 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/discovery` | 3 | 0 | 0 | 2 | 0 | 0 | 1 | 1 |
| `/clients/[clientId]/discovery-intake` | 3 | 3 | 6 | 7 | 0 | 1 | 4 | 0 |
| `/clients/[clientId]/documents` | 12 | 1 | 1 | 6 | 1 | 0 | 6 | 1 |
| `/clients/[clientId]/edit` | 4 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/engagements` | 0 | 0 | 1 | 5 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/engagements/[engagementId]` | 2 | 0 | 0 | 9 | 0 | 0 | 4 | 0 |
| `/clients/[clientId]/engineering` | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| `/clients/[clientId]/environments` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/environments/[envName]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/executive-reports` | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/financial` | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/gaps` | 21 | 0 | 4 | 15 | 0 | 0 | 9 | 0 |
| `/clients/[clientId]/incidents` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/incidents/[incidentId]` | 0 | 0 | 0 | 5 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/infrastructure` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/infrastructure/servers/[serverId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/invitations` | 7 | 1 | 2 | 0 | 0 | 0 | 3 | 0 |
| `/clients/[clientId]/knowledge` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/lifecycle` | 3 | 0 | 0 | 10 | 0 | 0 | 7 | 0 |
| `/clients/[clientId]/maturity` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/migrations` | 3 | 0 | 0 | 5 | 0 | 0 | 5 | 0 |
| `/clients/[clientId]/monitoring` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/notes` | 1 | 1 | 1 | 4 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/optimization` | 2 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/payments` | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/performance` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/problems` | 2 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/proposals` | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/readiness` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/recommendations` | 7 | 0 | 0 | 5 | 0 | 0 | 4 | 0 |
| `/clients/[clientId]/reconciliation` | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/release-readiness` | 3 | 0 | 1 | 0 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/reports` | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/requests` | 2 | 0 | 1 | 0 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/risks` | 10 | 0 | 6 | 0 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/roadmap` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/scorecard` | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/services` | 2 | 0 | 1 | 5 | 0 | 0 | 1 | 0 |
| `/clients/[clientId]/settings` | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/support` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/tasks` | 3 | 1 | 4 | 4 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/testing` | 1 | 0 | 1 | 9 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/timeline` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/traceability` | 1 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/clients/[clientId]/transformations` | 0 | 0 | 4 | 4 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/uat` | 5 | 0 | 3 | 0 | 0 | 0 | 2 | 0 |
| `/clients/[clientId]/usage` | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| `/clients/onboard` | 12 | 0 | 3 | 1 | 0 | 0 | 1 | 0 |

## staff — platform/admin (14)

| Route | Buttons | Forms | Inputs | Fetch/API | Downloads | Uploads | Mutations | Realtime signals |
|---|---|---|---|---|---|---|---|---|
| `/platform` | 2 | 0 | 0 | 4 | 0 | 0 | 0 | 1 |
| `/platform/capabilities` | 3 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/platform/commercial` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/platform/defects` | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/platform/incidents` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/platform/integrations/jira` | 0 | 0 | 4 | 3 | 0 | 0 | 2 | 0 |
| `/platform/portfolio` | 2 | 0 | 0 | 7 | 0 | 0 | 0 | 0 |
| `/platform/production-readiness` | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `/platform/services` | 4 | 0 | 0 | 4 | 0 | 0 | 1 | 1 |
| `/platform/services/registry` | 2 | 0 | 1 | 3 | 0 | 0 | 0 | 0 |
| `/platform/verification` | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| `/platform/verification/[runId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/platform/verification/journeys/[runId]` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `/platform/workflows` | 4 | 1 | 6 | 5 | 0 | 0 | 2 | 0 |

