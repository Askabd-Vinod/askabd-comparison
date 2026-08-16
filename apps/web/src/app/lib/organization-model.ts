/**
 * AskABD Organization Model
 * 
 * Organizations are the primary business entity. They contain Business Units, 
 * Departments, Projects, and map to existing Clients for backward compatibility.
 * 
 * BACKWARD COMPATIBILITY:
 * - Existing /clients routes continue to work
 * - Client IDs remain valid
 * - Organization wraps Client — every Client belongs to exactly one Organization
 * - New features use Organization as primary; legacy features use Client via adapter
 */

// ─── ORGANIZATION TYPES ────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  type: 'enterprise' | 'mid-market' | 'startup' | 'government' | 'non-profit';
  industry: string;
  country: string;
  timezone: string;
  status: 'active' | 'onboarding' | 'suspended' | 'archived';
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  businessUnits: BusinessUnit[];
  departments: Department[];
  legalEntities: LegalEntity[];
  regions: Region[];
  projects: Project[];
  // Adapter: maps to legacy client IDs
  clientIds: string[];
  primaryContact: string;
  contacts: OrganizationContact[];
  contracts: string[]; // Contract IDs
  features: FeatureConfig;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessUnit {
  id: string;
  name: string;
  head: string;
  applications: string[];
  services: string[];
  budget: string;
}

export interface Department {
  id: string;
  name: string;
  businessUnitId: string;
  head: string;
  members: number;
}

export interface LegalEntity {
  id: string;
  name: string;
  jurisdiction: string;
  registrationNumber: string;
  type: 'parent' | 'subsidiary' | 'branch';
}

export interface Region {
  id: string;
  name: string;
  country: string;
  timezone: string;
  dataResidency: string;
  primary: boolean;
}

export interface Project {
  id: string;
  name: string;
  organizationId: string;
  businessUnitId?: string;
  type: 'migration' | 'transformation' | 'modernization' | 'implementation' | 'assessment' | 'support';
  status: 'active' | 'planning' | 'completed' | 'on-hold' | 'cancelled';
  description: string;
  owner: string;
  startDate: string;
  targetDate: string;
  progress: number;
  // Links to platform entities
  migrationIds: string[];
  assessmentIds: string[];
  engineeringDefectIds: string[];
  incidentIds: string[];
  deploymentIds: string[];
}

export interface OrganizationContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  type: 'executive' | 'technical' | 'management' | 'operations' | 'askabd';
  availability: string;
  notificationPhases: string[];
}

export interface FeatureConfig {
  // Module toggles
  engineering: boolean;
  migrations: boolean;
  monitoring: boolean;
  automation: boolean;
  connectors: boolean;
  consulting: boolean;
  knowledge: boolean;
  testing: boolean;
  governance: boolean;
  // Service toggles
  twentyFourSeven: boolean;
  premiumSupport: boolean;
  aiCopilot: boolean;
  autoRemediation: boolean;
  // Connector toggles
  enabledConnectors: string[];
}

// ─── ADAPTER: Organization ↔ Client ────────────────────────────────────────

/**
 * Maps a legacy Client to an Organization.
 * Used during the transition period where both models coexist.
 */
export function clientToOrganization(client: {
  id: string; name: string; industry: string; primaryContact: string; health: string;
}): Partial<Organization> {
  return {
    id: `org-${client.id}`,
    name: client.name,
    industry: client.industry,
    status: client.health === 'offline' ? 'suspended' : 'active',
    clientIds: [client.id],
    primaryContact: client.primaryContact,
  };
}

/**
 * Gets the organization ID for a given client ID.
 * During transition, organization ID is derived from client ID.
 */
export function getOrganizationIdForClient(clientId: string): string {
  return `org-${clientId}`;
}

/**
 * Gets the primary client ID for a given organization.
 * Organizations may have multiple clients (for multi-entity orgs).
 */
export function getPrimaryClientId(org: Organization): string {
  return org.clientIds[0] || '';
}

// ─── MOCK DATA ─────────────────────────────────────────────────────────────

export function generateMockOrganizations(): Organization[] {
  return [
    {
      id: 'org-meridian-financial',
      name: 'Meridian Financial Group',
      type: 'enterprise',
      industry: 'Financial Services',
      country: 'Australia',
      timezone: 'Australia/Sydney',
      status: 'active',
      tier: 'platinum',
      businessUnits: [
        { id: 'bu-trading', name: 'Trading Division', head: 'J Harrison', applications: ['Trading Portal', 'Risk Dashboard'], services: ['Real-time Feed', 'Trade Execution'], budget: '$2.4M' },
        { id: 'bu-retail', name: 'Retail Banking', head: 'S Chen', applications: ['Client Onboarding', 'Account Management'], services: ['KYC', 'Payments'], budget: '$1.8M' },
      ],
      departments: [
        { id: 'dept-eng', name: 'Engineering', businessUnitId: 'bu-trading', head: 'Tech Lead', members: 45 },
        { id: 'dept-ops', name: 'Operations', businessUnitId: 'bu-trading', head: 'Ops Manager', members: 12 },
        { id: 'dept-sec', name: 'Security', businessUnitId: 'bu-trading', head: 'CISO', members: 8 },
      ],
      legalEntities: [
        { id: 'le-au', name: 'Meridian Financial Group Pty Ltd', jurisdiction: 'Australia', registrationNumber: 'ACN 123 456 789', type: 'parent' },
        { id: 'le-nz', name: 'Meridian NZ Limited', jurisdiction: 'New Zealand', registrationNumber: 'NZBN 9429041234', type: 'subsidiary' },
      ],
      regions: [
        { id: 'reg-au', name: 'Australia', country: 'Australia', timezone: 'Australia/Sydney', dataResidency: 'ap-southeast-2', primary: true },
        { id: 'reg-nz', name: 'New Zealand', country: 'New Zealand', timezone: 'Pacific/Auckland', dataResidency: 'ap-southeast-2', primary: false },
      ],
      projects: [
        { id: 'proj-cloud-mig', name: 'Trading Platform Cloud Migration', organizationId: 'org-meridian-financial', businessUnitId: 'bu-trading', type: 'migration', status: 'active', description: 'Migrate on-premise trading platform to AWS', owner: 'hello@askabd.com', startDate: '2026-06-01', targetDate: '2026-09-15', progress: 45, migrationIds: ['mig-001'], assessmentIds: [], engineeringDefectIds: ['def-001', 'def-004'], incidentIds: [], deploymentIds: [] },
        { id: 'proj-modernize', name: 'Risk Engine Modernization', organizationId: 'org-meridian-financial', type: 'modernization', status: 'planning', description: 'Modernize monolithic risk engine to microservices', owner: 'ops@askabd.com', startDate: '2026-10-01', targetDate: '2027-03-31', progress: 5, migrationIds: [], assessmentIds: [], engineeringDefectIds: [], incidentIds: [], deploymentIds: [] },
      ],
      clientIds: ['meridian-financial'],
      primaryContact: 'j.harrison@meridian.com',
      contacts: [
        { id: 'con-1', name: 'J Harrison', email: 'j.harrison@meridian.com', phone: '+61 400 000 001', role: 'Business Owner', type: 'executive', availability: 'Business Hours', notificationPhases: ['incident', 'escalation', 'resolution'] },
        { id: 'con-2', name: 'Tech Lead', email: 'tech.lead@meridian.com', phone: '+61 400 000 002', role: 'Technical Owner', type: 'technical', availability: 'Business Hours', notificationPhases: ['service-change', 'incident', 'remediation', 'deployment'] },
      ],
      contracts: ['con-1', 'con-2', 'con-3'],
      features: { engineering: true, migrations: true, monitoring: true, automation: true, connectors: true, consulting: true, knowledge: true, testing: true, governance: true, twentyFourSeven: true, premiumSupport: true, aiCopilot: true, autoRemediation: false, enabledConnectors: ['github', 'aws', 'datadog', 'pagerduty'] },
      createdAt: '2025-06-01T00:00:00Z',
      updatedAt: '2026-08-05T00:00:00Z',
    },
  ];
}
