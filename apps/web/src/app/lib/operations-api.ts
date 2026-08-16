/**
 * Operations Center API client.
 * All actions go through the API which persists to the database for evidence.
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
const OC_PREFIX = `${API}/api/v1/oc`;

async function ocFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${OC_PREFIX}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    ...opts,
  });
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
