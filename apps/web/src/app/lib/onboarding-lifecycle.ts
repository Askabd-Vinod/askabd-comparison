/**
 * AskABD Enterprise Customer Success Lifecycle — Single Workflow Engine
 * ONE shared engine. ONE shared state. Used by EVERY module.
 */

export type LifecycleStatus =
  | 'prospect' | 'qualification' | 'contract' | 'organization-created'
  | 'otp-sent' | 'otp-verified' | 'identity-verified' | 'security-validated'
  | 'environment-registered' | 'connectors-configured'
  | 'discovery-running' | 'discovery-complete'
  | 'assessment-running' | 'assessment-complete' | 'recommendations-generated'
  | 'migration-planning' | 'migration-approved' | 'migration-running' | 'migration-complete'
  | 'validation-running' | 'validation-passed'
  | 'audit-running' | 'audit-passed'
  | 'go-live' | 'hyper-care' | 'managed-services' | 'continuous-monitoring' | 'engineering-intelligence';

export type WorkflowEvent =
  | 'prospect_created' | 'qualification_complete' | 'contract_signed'
  | 'organization_created' | 'otp_verified' | 'identity_verified'
  | 'security_validated' | 'environment_registered' | 'connectors_configured'
  | 'discovery_started' | 'discovery_completed'
  | 'assessment_started' | 'assessment_completed' | 'recommendations_generated'
  | 'migration_plan_created' | 'migration_approved' | 'migration_started' | 'migration_completed'
  | 'validation_started' | 'validation_passed'
  | 'audit_started' | 'audit_passed'
  | 'go_live' | 'hyper_care_started' | 'managed_services_active' | 'monitoring_active' | 'engineering_active';

export interface StatusInfo {
  label: string; description: string; why: string; whatNext: string;
  successCriteria: string; color: string; order: number;
}

export const statusMeta: Record<LifecycleStatus, StatusInfo> = {
  'prospect': { label: 'Prospect', description: 'Lead captured', why: 'Identify the customer', whatNext: 'Qualify prospect', successCriteria: 'Info captured', color: 'bg-gray-200 text-gray-700', order: 0 },
  'qualification': { label: 'Qualification', description: 'Assessing fit', why: 'Ensure we can deliver value', whatNext: 'Generate contract', successCriteria: 'Qualified', color: 'bg-blue-100 text-blue-700', order: 1 },
  'contract': { label: 'Contract', description: 'Contract under review', why: 'Terms must be agreed', whatNext: 'Create organization', successCriteria: 'Contract signed', color: 'bg-blue-100 text-blue-700', order: 2 },
  'organization-created': { label: 'Organization Created', description: 'Record created in AskABD', why: 'Platform needs a home for data', whatNext: 'Send OTP verification', successCriteria: 'Org ID generated', color: 'bg-indigo-100 text-indigo-700', order: 3 },
  'otp-sent': { label: 'OTP Sent', description: 'Verification code sent', why: 'Confirm email ownership', whatNext: 'Customer enters OTP', successCriteria: 'OTP delivered', color: 'bg-yellow-100 text-yellow-700', order: 4 },
  'otp-verified': { label: 'OTP Verified', description: 'Identity confirmed via OTP', why: 'Prevent unauthorized access', whatNext: 'Complete identity verification', successCriteria: 'Valid OTP entered', color: 'bg-green-100 text-green-700', order: 5 },
  'identity-verified': { label: 'Identity Verified', description: 'Customer identity confirmed', why: 'Enterprise security requirement', whatNext: 'Run security validation', successCriteria: 'Identity confirmed', color: 'bg-green-100 text-green-700', order: 6 },
  'security-validated': { label: 'Security Validated', description: 'Security requirements met', why: 'Compliance before system access', whatNext: 'Register environments', successCriteria: 'Security checklist complete', color: 'bg-green-100 text-green-700', order: 7 },
  'environment-registered': { label: 'Environments Registered', description: 'Systems documented', why: 'Know what exists', whatNext: 'Configure connectors', successCriteria: 'All environments catalogued', color: 'bg-purple-100 text-purple-700', order: 8 },
  'connectors-configured': { label: 'Connectors Configured', description: 'Integrations ready', why: 'Enable automated discovery', whatNext: 'Run discovery (read-only)', successCriteria: 'Connector validated', color: 'bg-purple-100 text-purple-700', order: 9 },
  'discovery-running': { label: 'Discovery Running', description: 'Scanning environment (read-only)', why: 'Map infrastructure and data', whatNext: 'Wait for completion', successCriteria: 'All systems scanned', color: 'bg-purple-100 text-purple-700', order: 10 },
  'discovery-complete': { label: 'Discovery Complete', description: 'Environment mapped', why: 'Complete picture for assessment', whatNext: 'Run assessment', successCriteria: 'Inventory generated', color: 'bg-purple-200 text-purple-800', order: 11 },
  'assessment-running': { label: 'Assessment Running', description: 'Analyzing risks and readiness', why: 'Find issues early', whatNext: 'Wait for completion', successCriteria: 'Analysis engines done', color: 'bg-indigo-100 text-indigo-700', order: 12 },
  'assessment-complete': { label: 'Assessment Complete', description: 'Analysis done', why: 'Findings ready for review', whatNext: 'Generate recommendations', successCriteria: 'Report available', color: 'bg-indigo-100 text-indigo-700', order: 13 },
  'recommendations-generated': { label: 'Recommendations Ready', description: 'AI recommendations generated', why: 'Clear action plan with evidence', whatNext: 'Customer reviews plan', successCriteria: 'Recommendations delivered', color: 'bg-indigo-100 text-indigo-700', order: 14 },
  'migration-planning': { label: 'Migration Planning', description: 'Plan under development', why: 'Structured plan reduces risk', whatNext: 'Customer approves plan', successCriteria: 'Plan signed off', color: 'bg-blue-100 text-blue-700', order: 15 },
  'migration-approved': { label: 'Migration Approved', description: 'Customer approved plan', why: 'Nothing executes without approval', whatNext: 'Execute migration', successCriteria: 'Written approval received', color: 'bg-blue-100 text-blue-700', order: 16 },
  'migration-running': { label: 'Migration Running', description: 'Migration in progress', why: 'Systems being transferred', whatNext: 'Monitor and handle exceptions', successCriteria: 'All waves complete', color: 'bg-orange-100 text-orange-700', order: 17 },
  'migration-complete': { label: 'Migration Complete', description: 'Transfer finished', why: 'Data moved to target', whatNext: 'Run validation', successCriteria: 'Zero critical errors', color: 'bg-green-100 text-green-700', order: 18 },
  'validation-running': { label: 'Validation Running', description: 'Verifying integrity', why: 'Confirm nothing lost', whatNext: 'Wait for completion', successCriteria: 'All checks initiated', color: 'bg-indigo-100 text-indigo-700', order: 19 },
  'validation-passed': { label: 'Validation Passed', description: 'All checks passed', why: 'Proves data integrity', whatNext: 'Run governance audit', successCriteria: 'Zero mismatches', color: 'bg-green-100 text-green-700', order: 20 },
  'audit-running': { label: 'Audit Running', description: 'Governance audit in progress', why: 'Compliance verification', whatNext: 'Wait for completion', successCriteria: 'All checks initiated', color: 'bg-indigo-100 text-indigo-700', order: 21 },
  'audit-passed': { label: 'Audit Passed', description: 'Governance checks passed', why: 'Compliance confirmed', whatNext: 'Prepare go-live', successCriteria: 'Report signed off', color: 'bg-green-100 text-green-700', order: 22 },
  'go-live': { label: 'Go Live', description: 'Live in production', why: 'Customer on new platform', whatNext: 'Enter hyper-care', successCriteria: 'Production traffic confirmed', color: 'bg-green-200 text-green-800', order: 23 },
  'hyper-care': { label: 'Hyper Care', description: 'Intensive support (2-4 weeks)', why: 'Catch early issues quickly', whatNext: 'Transition to managed', successCriteria: 'Stability confirmed', color: 'bg-green-200 text-green-800', order: 24 },
  'managed-services': { label: 'Managed Services', description: 'Ongoing management', why: 'Continuous operation', whatNext: 'Enable monitoring', successCriteria: 'SLA targets met', color: 'bg-green-200 text-green-800', order: 25 },
  'continuous-monitoring': { label: 'Continuous Monitoring', description: '24/7 monitoring active', why: 'Proactive detection', whatNext: 'Enable engineering intelligence', successCriteria: 'All monitors green', color: 'bg-green-200 text-green-800', order: 26 },
  'engineering-intelligence': { label: 'Engineering Intelligence', description: 'AI engineering active', why: 'Automated RCA and recommendations', whatNext: 'Continuous improvement', successCriteria: 'Knowledge base growing', color: 'bg-green-200 text-green-800', order: 27 },
};

const TOTAL_PHASES = 27;


const transitions: Record<WorkflowEvent, { from: LifecycleStatus; to: LifecycleStatus }> = {
  'prospect_created': { from: 'prospect', to: 'qualification' },
  'qualification_complete': { from: 'qualification', to: 'contract' },
  'contract_signed': { from: 'contract', to: 'organization-created' },
  'organization_created': { from: 'organization-created', to: 'otp-sent' },
  'otp_verified': { from: 'otp-sent', to: 'otp-verified' },
  'identity_verified': { from: 'otp-verified', to: 'identity-verified' },
  'security_validated': { from: 'identity-verified', to: 'security-validated' },
  'environment_registered': { from: 'security-validated', to: 'environment-registered' },
  'connectors_configured': { from: 'environment-registered', to: 'connectors-configured' },
  'discovery_started': { from: 'connectors-configured', to: 'discovery-running' },
  'discovery_completed': { from: 'discovery-running', to: 'discovery-complete' },
  'assessment_started': { from: 'discovery-complete', to: 'assessment-running' },
  'assessment_completed': { from: 'assessment-running', to: 'assessment-complete' },
  'recommendations_generated': { from: 'assessment-complete', to: 'recommendations-generated' },
  'migration_plan_created': { from: 'recommendations-generated', to: 'migration-planning' },
  'migration_approved': { from: 'migration-planning', to: 'migration-approved' },
  'migration_started': { from: 'migration-approved', to: 'migration-running' },
  'migration_completed': { from: 'migration-running', to: 'migration-complete' },
  'validation_started': { from: 'migration-complete', to: 'validation-running' },
  'validation_passed': { from: 'validation-running', to: 'validation-passed' },
  'audit_started': { from: 'validation-passed', to: 'audit-running' },
  'audit_passed': { from: 'audit-running', to: 'audit-passed' },
  'go_live': { from: 'audit-passed', to: 'go-live' },
  'hyper_care_started': { from: 'go-live', to: 'hyper-care' },
  'managed_services_active': { from: 'hyper-care', to: 'managed-services' },
  'monitoring_active': { from: 'managed-services', to: 'continuous-monitoring' },
  'engineering_active': { from: 'continuous-monitoring', to: 'engineering-intelligence' },
};

export interface LifecycleEvent {
  event: WorkflowEvent; timestamp: string; actor: string; details?: string;
  fromStatus: LifecycleStatus; toStatus: LifecycleStatus;
}

export interface LifecycleState {
  organizationId: string; organizationName: string;
  status: LifecycleStatus; previousStatus: LifecycleStatus | null;
  verificationToken?: string; verificationExpiry?: string;
  events: LifecycleEvent[]; updatedAt: string; createdAt: string;
}

export function processWorkflowEvent(state: LifecycleState, event: WorkflowEvent, actor: string, details?: string): LifecycleState | null {
  const transition = transitions[event];
  if (!transition) return null;
  if (state.status !== transition.from) return null;
  return {
    ...state, previousStatus: state.status, status: transition.to,
    events: [...state.events, { event, timestamp: new Date().toISOString(), actor, details, fromStatus: state.status, toStatus: transition.to }],
    updatedAt: new Date().toISOString(),
  };
}

export function createLifecycleState(orgId: string, orgName: string): LifecycleState {
  return {
    organizationId: orgId, organizationName: orgName,
    status: 'organization-created', previousStatus: 'contract',
    events: [{ event: 'contract_signed', timestamp: new Date().toISOString(), actor: 'system', fromStatus: 'contract', toStatus: 'organization-created', details: 'Created via onboarding wizard' }],
    updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  };
}

export function getProgress(status: LifecycleStatus): number {
  const meta = statusMeta[status];
  return meta ? Math.round((meta.order / TOTAL_PHASES) * 100) : 0;
}

export function getEnabledModules(status: LifecycleStatus): string[] {
  const meta = statusMeta[status];
  if (!meta) return ['dashboard'];
  return ['dashboard'];
}

export function getCurrentStepInfo(status: LifecycleStatus): StatusInfo {
  return statusMeta[status] || statusMeta['prospect'];
}

export function getNextStep(status: LifecycleStatus): StatusInfo | null {
  const meta = statusMeta[status];
  if (!meta) return null;
  for (const [, info] of Object.entries(statusMeta)) {
    if (info.order === meta.order + 1) return info;
  }
  return null;
}

export function getLifecycleState(orgId: string): LifecycleState | null {
  if (typeof window === 'undefined') return null;
  // Read from localStorage cache (synchronous for immediate UI render)
  // Server is authoritative — this is a local cache only
  const key = `askabd-lifecycle-${orgId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    const state = JSON.parse(stored) as LifecycleState;
    if (!state.status || !statusMeta[state.status]) {
      state.status = 'organization-created';
      localStorage.setItem(key, JSON.stringify(state));
    }
    return state;
  } catch { localStorage.removeItem(key); return null; }
}

export function persistLifecycleState(state: LifecycleState): void {
  if (typeof window === 'undefined') return;
  // Write to localStorage cache for immediate UI display
  localStorage.setItem(`askabd-lifecycle-${state.organizationId}`, JSON.stringify(state));
  // Also persist to server (authoritative source)
  syncLifecycleToServer(state).catch(() => { /* non-blocking — server sync is best-effort from persist */ });
}

/**
 * Fetch authoritative lifecycle state from server.
 * Returns null if not found or server unavailable.
 */
export async function fetchServerLifecycle(orgId: string): Promise<LifecycleState | null> {
  const API = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200') : 'http://localhost:4200';
  try {
    const res = await fetch(`${API}/api/v1/oc/lifecycle/${orgId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.initialized || !data.status) return null;
    // Convert server format to LifecycleState and update local cache
    const state: LifecycleState = {
      organizationId: data.clientId,
      organizationName: data.clientId, // Server may not have name — use cached name if available
      status: data.status as LifecycleStatus,
      previousStatus: data.previousStatus || null,
      events: data.events || [],
      updatedAt: data.updatedAt || new Date().toISOString(),
      createdAt: data.createdAt || new Date().toISOString(),
    };
    // Merge with local cache for name
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`askabd-lifecycle-${orgId}`);
      if (cached) {
        try { const c = JSON.parse(cached); if (c.organizationName) state.organizationName = c.organizationName; } catch { /* skip */ }
      }
      // Update local cache with server truth
      localStorage.setItem(`askabd-lifecycle-${orgId}`, JSON.stringify(state));
    }
    return state;
  } catch { return null; }
}

/**
 * Sync lifecycle state to server. Called after local persist.
 */
async function syncLifecycleToServer(state: LifecycleState): Promise<void> {
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
  try {
    // Initialize on server if not exists
    await fetch(`${API}/api/v1/oc/lifecycle/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: state.organizationId, initialStatus: state.status }),
    });
  } catch { /* best-effort */ }
}

/**
 * Request a lifecycle transition via the server API.
 * This is the CORRECT way to advance lifecycle — server validates and persists.
 */
export async function requestLifecycleTransition(orgId: string, event: WorkflowEvent, actor: string, details?: string): Promise<LifecycleState | null> {
  const API = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200') : 'http://localhost:4200';
  try {
    const res = await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: orgId, event, actor, details }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.lifecycle) return null;
    // Update local cache with server response
    const state: LifecycleState = {
      organizationId: orgId,
      organizationName: orgId,
      status: data.lifecycle.status as LifecycleStatus,
      previousStatus: data.lifecycle.previousStatus || null,
      events: data.lifecycle.events || [],
      updatedAt: data.lifecycle.updatedAt || new Date().toISOString(),
      createdAt: data.lifecycle.createdAt || new Date().toISOString(),
    };
    // Preserve name from local cache
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`askabd-lifecycle-${orgId}`);
      if (cached) { try { const c = JSON.parse(cached); if (c.organizationName) state.organizationName = c.organizationName; } catch { /* skip */ } }
      localStorage.setItem(`askabd-lifecycle-${orgId}`, JSON.stringify(state));
    }
    return state;
  } catch { return null; }
}
