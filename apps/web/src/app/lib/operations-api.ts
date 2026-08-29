/**
 * Operations Center API client.
 * All actions go through the API which persists to the database for evidence.
 *
 * REAL BUG FOUND AND FIXED (2026-08-29, RISK-014 triage continuation):
 * `ocFetch` sent NO Authorization header at all — every one of this file's
 * 17 exported functions (used by 11 real staff pages/components: client
 * onboarding, edit, lifecycle, contracts, the dynamic client overview,
 * verify, remediation, file upload/download) was calling the real API
 * completely unauthenticated. This was invisible in local dev because the
 * API's `devBypass` (no `JWKS_URL` configured) treats every unauthenticated
 * request as a synthetic admin identity — the exact same root cause
 * `lib/staff-session.ts`'s own doc comment already documents for Server
 * Components' `apiSafe()` calls. This is that same bug class's client-side
 * sibling, in a different file, found independently this pass while
 * investigating a related RBAC gap on `/oc/service-actions`. The moment
 * real JWT verification is active (`JWKS_URL` configured, matching this
 * platform's own documented security posture), every one of these calls
 * would 401 for every staff user — not a security leak, a production
 * reliability break. Fixed the same way `staffFetch` already does: attach
 * the real staff session's bearer token, and retry once on a genuine 401
 * after a token renewal attempt.
 */
import { getStaffSession, refreshStaffSession } from './staff-session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
const OC_PREFIX = `${API}/api/v1/oc`;

async function ocFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const session = getStaffSession();
  const headers = new Headers({ 'Content-Type': 'application/json', ...(opts?.headers || {}) });
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);

  let res = await fetch(`${OC_PREFIX}${path}`, { ...opts, headers });

  if (res.status === 401 && session) {
    const renewed = await refreshStaffSession();
    if (renewed) {
      const retryHeaders = new Headers({ 'Content-Type': 'application/json', ...(opts?.headers || {}) });
      retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`);
      res = await fetch(`${OC_PREFIX}${path}`, { ...opts, headers: retryHeaders });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `API error: ${res.status}`);
  }
  return res.json();
}

// ─── CLIENTS ────────────────────────────────────────────────────────────────

export async function createClient(data: any) {
  return ocFetch<{ client: any }>('/clients', { method: 'POST', body: JSON.stringify(data) });
}

export async function listClients(filters?: { health?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.health) params.set('health', filters.health);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return ocFetch<{ clients: any[] }>(`/clients${qs ? `?${qs}` : ''}`);
}

export async function getClient(id: string) {
  return ocFetch<{ client: any }>(`/clients/${id}`);
}

// ─── AUDIT ──────────────────────────────────────────────────────────────────

export async function logAuditEvent(entry: {
  entityType: string;
  entityId: string;
  entityName: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
  evidence?: string[];
}) {
  return ocFetch<{ entry: any }>('/audit', { method: 'POST', body: JSON.stringify(entry) });
}

export async function getAuditLog(filters?: { entityType?: string; entityId?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.entityType) params.set('entityType', filters.entityType);
  if (filters?.entityId) params.set('entityId', filters.entityId);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return ocFetch<{ entries: any[] }>(`/audit${qs ? `?${qs}` : ''}`);
}

// ─── REMEDIATIONS ───────────────────────────────────────────────────────────

export async function createRemediation(data: any) {
  return ocFetch<{ remediation: any }>('/remediations', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateRemediationPhase(id: string, phase: string, evidence: string[], actor: string) {
  return ocFetch<{ remediation: any }>(`/remediations/${id}/phase`, {
    method: 'PATCH', body: JSON.stringify({ phase, evidence, actor }),
  });
}

export async function closeRemediationTicket(id: string, verifiedBy: string) {
  return ocFetch<{ remediation: any }>(`/remediations/${id}/close`, {
    method: 'POST', body: JSON.stringify({ verifiedBy }),
  });
}

export async function getRemediation(id: string) {
  return ocFetch<{ remediation: any }>(`/remediations/${id}`);
}

export async function listRemediations(params: { clientId?: string; incidentId?: string }) {
  const q = new URLSearchParams();
  if (params.clientId) q.set('clientId', params.clientId);
  if (params.incidentId) q.set('incidentId', params.incidentId);
  return ocFetch<{ remediations: any[] }>(`/remediations?${q.toString()}`);
}

/** Real execution start — creates a genuine oc_operations row server-side. */
export async function executeRemediation(id: string, actor: string) {
  return ocFetch<{ remediation: any; operation: any } | { error: string; operation?: any }>(`/remediations/${id}/execute`, {
    method: 'POST', body: JSON.stringify({ actor }),
  });
}

/** Real, operator-driven step transitions — replace any client-only timer/simulation. */
export async function startRemediationStep(id: string, stepId: string, actor: string) {
  return ocFetch<{ remediation: any }>(`/remediations/${id}/steps/${stepId}/start`, {
    method: 'POST', body: JSON.stringify({ actor }),
  });
}

export async function completeRemediationStep(id: string, stepId: string, actor: string, evidence?: string) {
  return ocFetch<{ remediation: any }>(`/remediations/${id}/steps/${stepId}/complete`, {
    method: 'POST', body: JSON.stringify({ actor, evidence }),
  });
}

export async function failRemediationStep(id: string, stepId: string, actor: string, reason?: string) {
  return ocFetch<{ remediation: any }>(`/remediations/${id}/steps/${stepId}/fail`, {
    method: 'POST', body: JSON.stringify({ actor, reason }),
  });
}

export async function getIncident(id: string) {
  return ocFetch<{ incident: any }>(`/incidents/${id}`);
}

// ─── SERVICE ACTIONS ────────────────────────────────────────────────────────

export async function recordServiceAction(data: {
  entityType: string;
  entityId: string;
  entityName: string;
  action: 'enabled' | 'disabled' | 'restarted';
  previousState?: string;
  newState?: string;
  actor: string;
  reason?: string;
  durationMs?: number;
  success?: boolean;
}) {
  return ocFetch<{ action: any }>('/service-actions', { method: 'POST', body: JSON.stringify(data) });
}

export async function getServiceActions(entityId: string) {
  return ocFetch<{ actions: any[] }>(`/service-actions/${entityId}`);
}
