'use client';
import { useState, useEffect, useCallback } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Client Requests — staff-facing management for real customer self-service
 * requests (service/connector/support), 2026-08-20 master UAT pass. See
 * client-request-service.ts / migration 033_client_requests.sql.
 *
 * Every request here is real, customer-submitted, persisted state — never
 * fabricated. Approving a service/connector request reuses the platform's
 * real existing enablement mechanisms (see the service layer) — this page
 * never invents a parallel "enabled" concept of its own.
 */
interface ClientRequest {
  id: string;
  requestType: 'service' | 'connector' | 'support' | 'requirement' | 'incident' | 'change';
  targetKey: string | null;
  targetLabel: string | null;
  description: string;
  requestedBy: string;
  requestedByOrgContext: string;
  priority: string;
  status: 'requested' | 'under_review' | 'approved' | 'rejected' | 'in_progress' | 'completed';
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

const STATUS_META: Record<ClientRequest['status'], { label: string; icon: string; className: string }> = {
  requested: { label: 'Requested', icon: '●', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  under_review: { label: 'Under Review', icon: '◐', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  approved: { label: 'Approved', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  rejected: { label: 'Rejected', icon: '✕', className: 'text-red-700 bg-red-50 border-red-200' },
  in_progress: { label: 'In Progress', icon: '◐', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  completed: { label: 'Completed', icon: '✓', className: 'text-gray-700 bg-gray-100 border-gray-200' },
};

/**
 * Type-aware since 2026-08-22: 'service' and 'connector' requests MUST still
 * pass through `approved` — that's the exact transition whose real linkage
 * code (see client-request-service.ts) creates the real oc_client_services /
 * oc_connectors row. Skipping straight to `in_progress` for those would let
 * staff mark a request "in progress" while the underlying service/connector
 * was never actually created — a real functional regression, not just a
 * cosmetic one. 'incident', 'support', 'change', and 'requirement' requests
 * have no such linkage — for those, an "approval" step is itself a kind of
 * fabrication (nobody approves fixing a real incident), so they get the
 * more honest `under_review -> in_progress` ("Start Work") path the backend
 * state machine added this pass instead.
 */
function getNextActions(status: ClientRequest['status'], requestType: ClientRequest['requestType']): { status: ClientRequest['status']; label: string; needsNotes?: boolean }[] {
  const needsFormalApproval = requestType === 'service' || requestType === 'connector';
  switch (status) {
    case 'requested':
      return needsFormalApproval
        ? [{ status: 'under_review', label: 'Start Review' }, { status: 'approved', label: 'Approve' }, { status: 'rejected', label: 'Reject', needsNotes: true }]
        : [{ status: 'under_review', label: 'Start Review' }, { status: 'in_progress', label: 'Start Work' }, { status: 'rejected', label: 'Reject', needsNotes: true }];
    case 'under_review':
      return needsFormalApproval
        ? [{ status: 'approved', label: 'Approve' }, { status: 'rejected', label: 'Reject', needsNotes: true }]
        : [{ status: 'in_progress', label: 'Start Work' }, { status: 'rejected', label: 'Reject', needsNotes: true }];
    case 'approved':
      return [{ status: 'in_progress', label: 'Start Work' }, { status: 'completed', label: 'Mark Completed' }];
    case 'in_progress':
      return [{ status: 'completed', label: requestType === 'incident' ? 'Mark Resolved' : 'Mark Completed' }, { status: 'rejected', label: 'Reject', needsNotes: true }];
    default:
      return [];
  }
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClientRequestsPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/requests`);
      if (res.ok) {
        setRequests((await res.json()).requests ?? []);
      } else if (res.status === 401 || res.status === 403) {
        setError('You are not authorized to manage requests for this client.');
      } else {
        setError('Unable to load requests. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    params.then(p => { setClientId(p.clientId); load(p.clientId); });
  }, [params, load]);

  // Previously never checked res.ok at all — a failed transition (RBAC
  // denial, validation error, backend outage) silently did nothing: the
  // button just stopped spinning and the request sat there unchanged, with
  // zero indication to the staff member that anything went wrong. Found
  // during the 2026-08-22 global UX audit.
  async function handleTransition(id: string, status: string) {
    setActionInFlight(id + status);
    setActionError(null);
    try {
      const res = await staffFetch(`/api/v1/oc/client-requests/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNotes: notesDraft[id] || undefined }),
      });
      if (res.ok) {
        await load(clientId);
      } else {
        const body = await res.json().catch(() => ({}));
        setActionError(body?.message || body?.error?.message || `Could not update this request. Please try again.`);
      }
    } catch (err) {
      setActionError(`Could not reach AskABD: ${(err as Error).message}`);
    } finally {
      setActionInFlight(null);
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading requests...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState what="Requests could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} />
    </div>
  );

  const filtered = statusFilter ? requests.filter(r => r.status === statusFilter) : requests;
  const openCount = requests.filter(r => r.status === 'requested' || r.status === 'under_review').length;
  const approvedCount = requests.filter(r => r.status === 'approved' || r.status === 'in_progress').length;
  const completedCount = requests.filter(r => r.status === 'completed').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Client Requests</h2>
      <p className="text-xs text-gray-500 mb-4">
        Real service, connector, and support requests submitted by this client&apos;s customer users. Approving a
        service or connector request enables the real record — nothing happens automatically.
      </p>

      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}

      {requests.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <Stat label="Total" value={requests.length} />
          <Stat label="Open" value={openCount} color="text-blue-600" />
          <Stat label="Approved / In Progress" value={approvedCount} color="text-indigo-600" />
          <Stat label="Completed" value={completedCount} color="text-green-600" />
          <Stat label="Rejected" value={rejectedCount} color="text-red-600" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'requested', 'under_review', 'approved', 'in_progress', 'rejected', 'completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            {s === '' ? 'All' : STATUS_META[s as ClientRequest['status']].label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm font-medium text-gray-700">No requests {statusFilter ? `with status "${STATUS_META[statusFilter as ClientRequest['status']].label}"` : 'yet'}</p>
          <p className="text-xs text-gray-400 mt-1">Real customer requests will appear here as soon as they&apos;re submitted from the client portal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const meta = STATUS_META[r.status];
            const actions = getNextActions(r.status, r.requestType);
            return (
              <div key={r.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{r.requestType}</span>
                    <p className="text-sm font-semibold text-gray-900">{r.targetLabel || r.description.slice(0, 60)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                    <p className="text-[11px] text-gray-400 mt-1">Requested by {r.requestedBy} ({r.requestedByOrgContext}) · {new Date(r.createdAt).toLocaleString()}</p>
                    {r.resolutionNotes && <p className="text-[11px] text-gray-600 mt-1">Notes: {r.resolutionNotes}</p>}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${meta.className}`}>
                    <span aria-hidden="true">{meta.icon}</span>{meta.label}
                  </span>
                </div>
                {actions.length > 0 && (() => {
                  // Previously `needsNotes` was set on the Reject action but
                  // never actually read anywhere — a staff member could
                  // reject a customer's request with zero explanation, even
                  // though the field existed specifically so the customer
                  // would learn why. Found during the 2026-08-22 global UX
                  // audit. Now Reject is disabled until a note is entered,
                  // and the note field is labeled "required" for that case.
                  const requiresNotes = actions.some(a => a.needsNotes);
                  const hasNotes = !!notesDraft[r.id]?.trim();
                  return (
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <div className="flex-1 min-w-[180px]">
                        <input
                          value={notesDraft[r.id] || ''}
                          onChange={e => setNotesDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder={requiresNotes ? 'Note for the customer (required to reject)…' : 'Optional note for the customer…'}
                          className="text-xs border rounded-md px-2 py-1.5 w-full"
                        />
                      </div>
                      {actions.map(a => {
                        const blocked = a.needsNotes && !hasNotes;
                        return (
                          <button
                            key={a.status}
                            onClick={() => handleTransition(r.id, a.status)}
                            disabled={actionInFlight === r.id + a.status || blocked}
                            title={blocked ? 'Enter a note explaining the rejection before continuing' : undefined}
                            className={`text-xs font-medium px-3 py-1.5 rounded-md ${a.status === 'rejected' ? 'text-red-600 hover:bg-red-50' : a.status === 'approved' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'} disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {actionInFlight === r.id + a.status ? 'Working…' : a.label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
