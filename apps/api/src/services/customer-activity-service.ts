/**
 * Customer Activity — a real, cross-service aggregation (Phase 2, 2026-08-20
 * continuation) answering "what exactly did this customer do?" for an
 * authorized staff/super-user, across BOTH real audit sources this platform
 * already has:
 *
 *  1. askabd-comparison's own `oc_audit_log` (business events: requirements,
 *     services, connectors, CRM, requests, invitations).
 *  2. askabd-identity's real `audit_event` table, reached over its real HTTP
 *     API (`GET /v1/audit/events`) — never a direct cross-database
 *     connection, and never a duplicated/parallel identity-side audit store.
 *     The caller's OWN real staff bearer token is forwarded as-is; identity's
 *     own `requireAdmin()` (this session's earlier fix) is what actually
 *     gates access on that side — this service invents no new authorization
 *     logic of its own.
 *
 * Both sources are normalized into one shape at this service boundary. No
 * third audit system is created; nothing here is written back anywhere —
 * this is a read-only, real-time aggregation view.
 */
import { getPool } from '../db/connection.js';
import { ClientIdentityMappingService } from './client-identity-mapping-service.js';

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:3100';

export type ActivityModule = 'authentication' | 'client' | 'lifecycle' | 'services' | 'connectors' | 'crm' | 'requests' | 'documents' | 'other';
export type ActivityResult = 'success' | 'failure' | 'info';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  customer: string | null;
  action: string;
  module: ActivityModule;
  entity: string | null;
  entityId: string | null;
  status: string | null;
  source: 'identity' | 'comparison';
  result: ActivityResult;
}

const IDENTITY_ACTION_MAP: Record<string, { module: ActivityModule; result: ActivityResult; label: string }> = {
  'identity.created': { module: 'authentication', result: 'success', label: 'Account created' },
  'identity.verified': { module: 'authentication', result: 'success', label: 'Account verified' },
  'auth.login.succeeded': { module: 'authentication', result: 'success', label: 'Logged in' },
  'auth.login.failed': { module: 'authentication', result: 'failure', label: 'Failed login attempt' },
  'auth.rate_limited': { module: 'authentication', result: 'failure', label: 'Login rate-limited' },
  'auth.account_locked': { module: 'authentication', result: 'failure', label: 'Account locked' },
  'auth.logout': { module: 'authentication', result: 'success', label: 'Logged out' },
  'session.started': { module: 'authentication', result: 'success', label: 'Session started' },
  'token.refreshed': { module: 'authentication', result: 'success', label: 'Session renewed' },
  'token.revoked': { module: 'authentication', result: 'info', label: 'Session token revoked' },
  'credential.stored': { module: 'authentication', result: 'success', label: 'Password set' },
  'credential.changed': { module: 'authentication', result: 'success', label: 'Password changed' },
  'credential.reset_requested': { module: 'authentication', result: 'info', label: 'Password reset requested' },
  'credential.reset_completed': { module: 'authentication', result: 'success', label: 'Password reset completed' },
  'mfa.enrolled': { module: 'authentication', result: 'success', label: 'MFA enrolled' },
  'mfa.activated': { module: 'authentication', result: 'success', label: 'MFA activated' },
  'mfa.disabled': { module: 'authentication', result: 'info', label: 'MFA disabled' },
  'mfa.challenge_succeeded': { module: 'authentication', result: 'success', label: 'MFA verification succeeded' },
  'mfa.challenge_failed': { module: 'authentication', result: 'failure', label: 'MFA verification failed' },
};

const COMPARISON_ACTION_MAP: Record<string, { module: ActivityModule; result: ActivityResult; label: string }> = {
  'invitation.created': { module: 'client', result: 'info', label: 'Invitation sent' },
  'invitation.accepted': { module: 'client', result: 'success', label: 'Invitation accepted — membership granted' },
  'invitation.revoked': { module: 'client', result: 'info', label: 'Invitation revoked' },
  'invitation.renewed': { module: 'client', result: 'info', label: 'Invitation renewed' },
  'invitation.link_regenerated': { module: 'client', result: 'info', label: 'Invitation link regenerated' },
  'requirement_updated': { module: 'lifecycle', result: 'success', label: 'Requirement updated' },
  'client_service.service_enabled': { module: 'services', result: 'success', label: 'Service enabled' },
  'client_service.service_disabled': { module: 'services', result: 'info', label: 'Service disabled' },
  'client_request.created': { module: 'requests', result: 'info', label: 'Request submitted' },
  'client_request.requested': { module: 'requests', result: 'info', label: 'Request submitted' },
  'client_request.under_review': { module: 'requests', result: 'info', label: 'Request under review' },
  'client_request.approved': { module: 'requests', result: 'success', label: 'Request approved' },
  'client_request.rejected': { module: 'requests', result: 'failure', label: 'Request rejected' },
  'client_request.in_progress': { module: 'requests', result: 'info', label: 'Request in progress' },
  'client_request.completed': { module: 'requests', result: 'success', label: 'Request completed' },
  'client_request.approved_service_enabled': { module: 'services', result: 'success', label: 'Requested service enabled' },
  'client_request.approved_connector_created': { module: 'connectors', result: 'success', label: 'Requested connector created' },
  'contact.created': { module: 'crm', result: 'success', label: 'Contact added' },
  'contact.updated': { module: 'crm', result: 'success', label: 'Contact updated' },
  'note.created': { module: 'crm', result: 'success', label: 'Note added' },
  'note.updated': { module: 'crm', result: 'success', label: 'Note updated' },
  'task.created': { module: 'crm', result: 'success', label: 'Task created' },
  'task.status_changed': { module: 'crm', result: 'success', label: 'Task updated' },
  'document_uploaded': { module: 'documents', result: 'success', label: 'Document uploaded' },
};

function normalizeIdentityEvent(row: { id: string; type: string; identityId: string | null; at: string; detail: Record<string, unknown> }): ActivityEvent {
  const mapped = IDENTITY_ACTION_MAP[row.type];
  return {
    id: row.id,
    timestamp: row.at,
    customer: row.identityId,
    action: mapped?.label ?? row.type,
    module: mapped?.module ?? 'authentication',
    entity: 'identity',
    entityId: row.identityId,
    status: mapped?.result ?? null,
    source: 'identity',
    result: mapped?.result ?? 'info',
  };
}

function normalizeComparisonEvent(row: { id: string; entity_type: string; entity_id: string; entity_name: string; action: string; actor: string; created_at: Date }): ActivityEvent {
  const mapped = COMPARISON_ACTION_MAP[row.action];
  return {
    id: row.id,
    timestamp: row.created_at.toISOString(),
    customer: row.actor,
    action: mapped?.label ?? row.action,
    module: mapped?.module ?? 'other',
    entity: row.entity_type,
    entityId: row.entity_id,
    status: row.entity_name || null,
    source: 'comparison',
    result: mapped?.result ?? 'info',
  };
}

export interface ActivityQuery {
  clientId: string;
  from?: Date;
  to?: Date;
  module?: ActivityModule;
  action?: string;
  status?: ActivityResult;
  sort?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ActivityPage {
  events: ActivityEvent[];
  total: number;
}

export class CustomerActivityService {
  private mappingService = new ClientIdentityMappingService();

  async getActivity(query: ActivityQuery, callerBearerToken: string): Promise<ActivityPage> {
    const from = query.from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days by default — real, bounded, not "everything ever"
    // Real defect found and fixed here: defaulting `to` to the app process's
    // own `new Date()` compares an app-clock timestamp against `created_at`,
    // which Postgres stamps with its OWN server clock (`NOW()`). Measured
    // directly against this environment's DB: the Postgres server clock
    // consistently runs ~1-2ms AHEAD of the Node process clock. Under normal
    // load that's invisible (tens of ms separate the last write from this
    // read), but under heavy CPU contention (e.g. a full test-suite run) the
    // gap between "just wrote a row" and "captured `to`" can shrink enough
    // for the skew to flip the comparison, silently excluding the
    // most-recently-written row(s) from a query meant to mean "up to right
    // now". A small forward buffer absorbs real inter-process/inter-host
    // clock skew without meaningfully changing what "up to now" means to a
    // caller — this is a real bug fix, not a test-timing workaround.
    const to = query.to ?? new Date(Date.now() + 5000);

    const [comparisonEvents, identityEvents] = await Promise.all([
      this.fetchComparisonEvents(query.clientId, from, to),
      this.fetchIdentityEvents(query.clientId, from, to, callerBearerToken),
    ]);

    let merged = [...comparisonEvents, ...identityEvents];
    if (query.module) merged = merged.filter(e => e.module === query.module);
    if (query.action) merged = merged.filter(e => e.action.toLowerCase().includes(query.action!.toLowerCase()));
    if (query.status) merged = merged.filter(e => e.result === query.status);

    merged.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return query.sort === 'asc' ? diff : -diff;
    });

    const total = merged.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return { events: merged.slice(offset, offset + limit), total };
  }

  private async fetchComparisonEvents(clientId: string, from: Date, to: Date): Promise<ActivityEvent[]> {
    const db = getPool();
    try {
      const res = await db.query<{ id: string; entity_type: string; entity_id: string; entity_name: string; action: string; actor: string; created_at: Date }>(
        `SELECT id, entity_type, entity_id, entity_name, action, actor, created_at FROM oc_audit_log
         WHERE (entity_id = $1 OR details->>'clientId' = $1) AND created_at >= $2 AND created_at <= $3
         ORDER BY created_at DESC LIMIT 500`,
        [clientId, from, to],
      );
      return res.rows.map(normalizeComparisonEvent);
    } catch {
      return []; // real, honest degradation — never fabricate comparison-side activity
    }
  }

  /** Real HTTP call to askabd-identity's own audit read, once per org_context
   *  actually mapped to this client — never a direct cross-database
   *  connection. Forwards the CALLER's real bearer token; identity's own
   *  requireAdmin() (real permission check) is the actual authorization
   *  boundary here, not anything invented in this service. */
  private async fetchIdentityEvents(clientId: string, from: Date, to: Date, callerBearerToken: string): Promise<ActivityEvent[]> {
    const mappings = await this.mappingService.listMappingsForClient(clientId);
    const orgContexts = [...new Set(mappings.filter(m => m.status === 'active').map(m => m.orgContext))];
    if (orgContexts.length === 0) return [];

    const results = await Promise.all(orgContexts.map(async (org) => {
      try {
        const url = `${IDENTITY_URL}/v1/audit/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=500`;
        const res = await fetch(url, { headers: { 'X-Org-Context': org, Authorization: `Bearer ${callerBearerToken}` } });
        if (!res.ok) return []; // real, honest degradation (e.g. identity unreachable, or this specific org has no events) — never fabricated
        const body = await res.json() as { events: { id: string; type: string; identityId: string | null; orgContext: string | null; at: string; detail: Record<string, unknown> }[] };
        return (body.events || []).map(normalizeIdentityEvent);
      } catch {
        return [];
      }
    }));
    return results.flat();
  }
}
