'use client';
import { useState, useEffect, useCallback } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Customer Activity — real, cross-service view (Phase 2, 2026-08-20
 * continuation). Every row is a real event from either askabd-comparison's
 * own oc_audit_log or askabd-identity's real audit log, fetched live via
 * customer-activity-service.ts — never fabricated, never a third audit
 * system of its own.
 */
interface ActivityEvent {
  id: string;
  timestamp: string;
  customer: string | null;
  action: string;
  module: string;
  entity: string | null;
  entityId: string | null;
  status: string | null;
  source: 'identity' | 'comparison';
  result: 'success' | 'failure' | 'info';
}

const RESULT_META: Record<string, { className: string; icon: string }> = {
  success: { className: 'text-green-700 bg-green-50 border-green-200', icon: '✓' },
  failure: { className: 'text-red-700 bg-red-50 border-red-200', icon: '✕' },
  info: { className: 'text-blue-700 bg-blue-50 border-blue-200', icon: 'ⓘ' },
};

const MODULES = ['authentication', 'client', 'lifecycle', 'services', 'connectors', 'crm', 'requests', 'documents', 'other'];

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClientActivityPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const load = useCallback(async (id: string, moduleF: string, statusF: string, sortV: string, pageN: number) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ sort: sortV, limit: String(PAGE_SIZE), offset: String(pageN * PAGE_SIZE) });
      if (moduleF) qs.set('module', moduleF);
      if (statusF) qs.set('status', statusF);
      const res = await staffFetch(`/api/v1/oc/clients/${id}/activity?${qs.toString()}`);
      if (res.ok) {
        const body = await res.json();
        setEvents(body.events ?? []);
        setTotal(body.total ?? 0);
      } else if (res.status === 401 || res.status === 403) {
        setError('You are not authorized to view activity for this client.');
      } else {
        setError('Unable to load activity. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    params.then(p => setClientId(p.clientId));
  }, [params]);

  useEffect(() => {
    if (clientId) load(clientId, moduleFilter, statusFilter, sort, page);
  }, [clientId, moduleFilter, statusFilter, sort, page, load]);

  if (loading && events.length === 0) return <div className="p-6 text-gray-400">Loading activity...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState what="Activity could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId, moduleFilter, statusFilter, sort, page)} />
    </div>
  );

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Customer Activity</h2>
      <p className="text-xs text-gray-500 mb-4">
        Real activity for this client, combining AskABD platform events (requirements, services, connectors, CRM,
        requests) with authentication events from the identity service. Never a fabricated log.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(0); }} className="text-xs border rounded-md px-2 py-1.5">
          <option value="">All modules</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} className="text-xs border rounded-md px-2 py-1.5">
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="info">Info</option>
        </select>
        <button onClick={() => { setSort(s => s === 'desc' ? 'asc' : 'desc'); setPage(0); }} className="text-xs border rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50">
          {sort === 'desc' ? 'Newest first ↓' : 'Oldest first ↑'}
        </button>
        <span className="text-xs text-gray-400 ml-auto">{total} event{total === 1 ? '' : 's'}</span>
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <div className="text-3xl mb-2">🕓</div>
          <p className="text-sm font-medium text-gray-700">No activity {moduleFilter || statusFilter ? 'matches these filters' : 'recorded yet'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Module</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => {
                const meta = RESULT_META[e.result] || RESULT_META.info;
                return (
                  <tr key={`${e.source}-${e.id}`} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-700 font-mono text-[11px]">{e.customer || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-900">{e.action}</td>
                    <td className="px-4 py-2.5 text-gray-500 capitalize">{e.module}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-[11px] uppercase">{e.source}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${meta.className}`}>
                        <span aria-hidden="true">{meta.icon}</span>{e.result}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs border rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">← Newer</button>
          <span className="text-xs text-gray-400">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button onClick={() => setPage(p => (p + 1) * PAGE_SIZE < total ? p + 1 : p)} disabled={(page + 1) * PAGE_SIZE >= total} className="text-xs border rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Older →</button>
        </div>
      )}
    </div>
  );
}
