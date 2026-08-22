/**
 * Client Requests — real, persisted customer self-service (Part 1/2/6/14 of the
 * 2026-08-20 master UAT pass). See migration 033_client_requests.sql for the
 * schema rationale.
 *
 * The customer request NEVER automatically grants anything — every approval
 * is a real, deliberate staff action (`approve()` below), and even then only
 * REUSES the platform's existing real service-enablement / connector
 * mechanisms — never a second, parallel model.
 */
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';

/**
 * 'incident' and 'change' added during the 2026-08-22 SDLC-completion pass —
 * the platform previously had no way for a customer to report a real
 * post-delivery incident or request a real change. Rather than build a
 * second, parallel ITSM subsystem (a separate incident/change table, its own
 * state machine, its own audit wiring, its own staff UI), these reuse this
 * EXACT already-real, already-tested, already-audited request pipeline —
 * same table, same state machine, same `priority` field doubling as
 * severity, same staff approval UI, same customer visibility rules. This is
 * the "extend existing services" principle applied directly: `request_type`
 * has no DB-level enum (see migration 033 — plain TEXT), so this is a real,
 * safe, additive change with no migration required.
 */
export type RequestType = 'service' | 'connector' | 'support' | 'requirement' | 'incident' | 'change';
export type RequestStatus = 'requested' | 'under_review' | 'approved' | 'rejected' | 'in_progress' | 'completed';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ClientRequest {
  id: string;
  clientId: string;
  requestType: RequestType;
  targetKey: string | null;
  targetLabel: string | null;
  description: string;
  requestedBy: string;
  requestedByOrgContext: string;
  priority: RequestPriority;
  status: RequestStatus;
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export type RequestResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

interface RequestRow {
  id: string; client_id: string; request_type: RequestType; target_key: string | null; target_label: string | null;
  description: string; requested_by: string; requested_by_org_context: string; priority: RequestPriority;
  status: RequestStatus; assigned_to: string | null; resolution_notes: string | null;
  created_at: Date; updated_at: Date; resolved_at: Date | null;
}

function toRequest(row: RequestRow): ClientRequest {
  return {
    id: row.id, clientId: row.client_id, requestType: row.request_type,
    targetKey: row.target_key, targetLabel: row.target_label, description: row.description,
    requestedBy: row.requested_by, requestedByOrgContext: row.requested_by_org_context,
    priority: row.priority, status: row.status, assignedTo: row.assigned_to,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
  };
}

const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  // `requested -> in_progress` added 2026-08-22 alongside `under_review ->
  // in_progress` below — a genuinely urgent incident (severity `urgent`)
  // shouldn't be forced through a review step before someone can start
  // working it; real on-call practice is "acknowledge and go."
  requested: ['under_review', 'approved', 'in_progress', 'rejected'],
  // `under_review -> in_progress` added 2026-08-22: incidents and support
  // requests don't have a real "approval" concept (nobody approves fixing a
  // real outage) — they go Reported -> Triaged/Investigating -> Working ->
  // Resolved. Forcing every incident through a fake `approved` state before
  // `in_progress` would itself be a form of fabrication (a status that
  // doesn't correspond to anything real happening). Service/connector
  // requests are unaffected — they still naturally flow through `approved`
  // since that's the step that creates the real service/connector row.
  under_review: ['approved', 'in_progress', 'rejected'],
  approved: ['in_progress', 'completed'],
  rejected: [], // terminal — a rejected request is not resurrected; a new request is the correct path
  in_progress: ['completed', 'rejected'],
  completed: [], // terminal
};

export class ClientRequestService {
  constructor(private readonly db: DbClient = getPool()) {}

  async create(input: {
    clientId: string; requestType: RequestType; targetKey?: string; targetLabel?: string;
    description: string; requestedBy: string; requestedByOrgContext: string; priority?: RequestPriority;
  }): Promise<RequestResult<ClientRequest>> {
    const clientExists = await this.db.query<{ id: string }>('SELECT id FROM oc_clients WHERE id = $1', [input.clientId]);
    if (clientExists.rows.length === 0) {
      return { ok: false, error: { code: 'client_not_found', message: `No client with id ${input.clientId}` } };
    }
    if (!input.description || !input.description.trim()) {
      return { ok: false, error: { code: 'description_required', message: 'A description of what you need is required.' } };
    }

    // Duplicate prevention (Phase 8/9, 2026-08-20): never silently spawn a
    // second pending request for the same (client, type, target) — reuse the
    // real existing one instead, same reuse-not-duplicate philosophy already
    // established for invitations. Only meaningful when a real targetKey was
    // given (service/connector requests); free-text support requests are
    // deliberately not deduplicated — two genuinely different support asks
    // can legitimately share no target key at all.
    if (input.targetKey) {
      const existingActive = await this.db.query<RequestRow>(
        `SELECT * FROM oc_client_requests WHERE client_id = $1 AND request_type = $2 AND target_key = $3
         AND status IN ('requested', 'under_review', 'approved', 'in_progress') ORDER BY created_at DESC LIMIT 1`,
        [input.clientId, input.requestType, input.targetKey],
      );
      if (existingActive.rows.length > 0) {
        return { ok: true, value: toRequest(existingActive.rows[0]!) };
      }

      // Already-active check: refuse a request for something that's already
      // genuinely live — never a fabricated "sure, request it again" that
      // would just create pointless duplicate work for staff.
      if (input.requestType === 'service') {
        const svc = await this.db.query<{ status: string }>('SELECT status FROM oc_client_services WHERE client_id = $1 AND service_id = $2', [input.clientId, input.targetKey]);
        if (svc.rows.length > 0 && svc.rows[0]!.status === 'enabled') {
          return { ok: false, error: { code: 'already_active', message: 'This service is already active for this client.' } };
        }
      }
      if (input.requestType === 'connector') {
        const conn = await this.db.query<{ status: string }>('SELECT status FROM oc_connectors WHERE client_id = $1 AND provider = $2', [input.clientId, input.targetKey]);
        if (conn.rows.length > 0 && (conn.rows[0]!.status === 'connected' || conn.rows[0]!.status === 'configured')) {
          return { ok: false, error: { code: 'already_active', message: 'This connector is already configured for this client.' } };
        }
      }
    }

    const result = await this.db.query<RequestRow>(
      `INSERT INTO oc_client_requests (client_id, request_type, target_key, target_label, description, requested_by, requested_by_org_context, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [input.clientId, input.requestType, input.targetKey ?? null, input.targetLabel ?? null, input.description.trim(), input.requestedBy, input.requestedByOrgContext, input.priority ?? 'normal'],
    );
    const request = toRequest(result.rows[0]!);

    await this.audit(request.id, 'client_request.created', input.requestedBy, { clientId: input.clientId, requestType: input.requestType, targetKey: input.targetKey });
    return { ok: true, value: request };
  }

  async listForClient(clientId: string, opts?: { status?: RequestStatus; requestType?: RequestType }): Promise<ClientRequest[]> {
    const conditions = ['client_id = $1'];
    const params: unknown[] = [clientId];
    if (opts?.status) { params.push(opts.status); conditions.push(`status = $${params.length}`); }
    if (opts?.requestType) { params.push(opts.requestType); conditions.push(`request_type = $${params.length}`); }
    const result = await this.db.query<RequestRow>(
      `SELECT * FROM oc_client_requests WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map(toRequest);
  }

  /**
   * The customer-portal read path — identical data to listForClient (a
   * customer sees their own client's full request history and status,
   * exactly like the staff view), scoped by the SAME real, already-verified
   * tenant boundary every other /oc/portal/:clientId/* route uses (the
   * caller resolved clientId only after tenant-access.ts confirmed this
   * org_context is authorized for it — see client-requests-routes.ts).
   */
  async listForCustomer(clientId: string): Promise<ClientRequest[]> {
    return this.listForClient(clientId);
  }

  async getById(id: string): Promise<ClientRequest | null> {
    const result = await this.db.query<RequestRow>('SELECT * FROM oc_client_requests WHERE id = $1', [id]);
    return result.rows.length > 0 ? toRequest(result.rows[0]!) : null;
  }

  /**
   * Real staff transition — the ONLY way a request's status ever changes.
   * Enforces a real state machine (no jumping straight from `requested` to
   * `completed`, no reviving a `rejected`/`completed` request). Approving a
   * `service` request reuses the EXACT existing oc_client_services enable
   * logic (same INSERT ... ON CONFLICT the staff Services page's own
   * `/enable` route already uses — not a second implementation). Approving a
   * `connector` request creates a real, honestly `not_configured` (never
   * fabricated `connected`) oc_connectors row if one doesn't already exist,
   * so it becomes visible for staff to actually configure.
   */
  async transition(id: string, newStatus: RequestStatus, actor: string, opts?: { resolutionNotes?: string; assignedTo?: string }): Promise<RequestResult<ClientRequest>> {
    const existing = await this.db.query<RequestRow>('SELECT * FROM oc_client_requests WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return { ok: false, error: { code: 'not_found', message: 'No such request' } };
    }
    const row = existing.rows[0]!;
    const allowed = VALID_TRANSITIONS[row.status];
    if (!allowed.includes(newStatus)) {
      return { ok: false, error: { code: 'invalid_transition', message: `Cannot move a ${row.status} request to ${newStatus}.` } };
    }
    // Real integrity rule, enforced server-side (not just hidden from the UI):
    // 'service' and 'connector' requests MUST pass through `approved` — that
    // transition's linkage code below is the ONLY place that creates the real
    // oc_client_services / oc_connectors row. The 2026-08-22 pass opened a
    // direct `requested/under_review -> in_progress` shortcut for request
    // types that have no such linkage (incident/support/change/requirement);
    // without this check, a raw API call could move a service/connector
    // request straight to `in_progress` and the request would show as
    // "being worked" while nothing was ever actually enabled — the exact
    // false-status class of bug this whole platform has been hardened
    // against. The frontend already never offers this button for these two
    // types (see requests/page.tsx's `getNextActions`); this is the
    // authoritative, can't-be-bypassed enforcement of the same rule.
    if (newStatus === 'in_progress' && row.status !== 'approved' && (row.request_type === 'service' || row.request_type === 'connector')) {
      return { ok: false, error: { code: 'approval_required', message: `${row.request_type === 'service' ? 'Service' : 'Connector'} requests must be approved before work can start — approval is what creates the real record.` } };
    }

    const resolvedAt = (newStatus === 'completed' || newStatus === 'rejected') ? new Date() : null;
    await this.db.query(
      `UPDATE oc_client_requests SET status = $2, resolution_notes = COALESCE($3, resolution_notes), assigned_to = COALESCE($4, assigned_to), updated_at = NOW(), resolved_at = $5 WHERE id = $1`,
      [id, newStatus, opts?.resolutionNotes ?? null, opts?.assignedTo ?? null, resolvedAt],
    );

    // Real linkage on approval — never automatic on creation, always a
    // deliberate staff action landing here.
    if (newStatus === 'approved') {
      if (row.request_type === 'service' && row.target_key) {
        await this.db.query(
          `INSERT INTO oc_client_services (client_id, service_id, status, enabled_at, enabled_by, reason)
           VALUES ($1, $2, 'enabled', NOW(), $3, $4)
           ON CONFLICT (client_id, service_id) DO UPDATE SET status = 'enabled', enabled_at = NOW(), enabled_by = $3, reason = $4, disabled_at = NULL, updated_at = NOW()`,
          [row.client_id, row.target_key, actor, `Approved customer request ${id}`],
        );
        await this.audit(id, 'client_request.approved_service_enabled', actor, { clientId: row.client_id, serviceId: row.target_key });
      } else if (row.request_type === 'connector' && row.target_key) {
        // Real gap found during the 2026-08-21 contract audit: this used to write
        // `target_key` (a machine slug, e.g. "snowflake-—-finance-reporting-warehouse")
        // into BOTH the `provider` and `name` columns. `provider` must stay the
        // slug (it's the ON CONFLICT identity), but `name` is what staff actually
        // see as this connector's label — using the customer's own human-readable
        // `target_label` there (when the request has one; free-text customer
        // requests for a non-catalog connector always do) instead of repeating the
        // slug fixes the raw-slug display without touching the conflict target.
        await this.db.query(
          `INSERT INTO oc_connectors (client_id, provider, name, status)
           VALUES ($1, $2, $3, 'not_configured')
           ON CONFLICT (client_id, provider, name) DO NOTHING`,
          [row.client_id, row.target_key, row.target_label || row.target_key],
        );
        await this.audit(id, 'client_request.approved_connector_created', actor, { clientId: row.client_id, provider: row.target_key });
      }
    }

    await this.audit(id, `client_request.${newStatus}`, actor, { clientId: row.client_id, previousStatus: row.status, newStatus });

    const updated = await this.db.query<RequestRow>('SELECT * FROM oc_client_requests WHERE id = $1', [id]);
    return { ok: true, value: toRequest(updated.rows[0]!) };
  }

  private async audit(requestId: string, action: string, actor: string, details: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details) VALUES ('client_request', $1, $2, $3, $4)`,
      [requestId, action, actor, JSON.stringify(details)],
    );
  }
}
