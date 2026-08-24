'use client';
import { useState, useEffect, useCallback } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Release Readiness — AskABD's own internal go/no-go gate before flipping a
 * client to go-live (`release-readiness-service.ts` / `release-readiness
 * -routes.ts`, `release_readiness_test_1`, 2026-08-24). Fourth of the 11
 * engines wired into the staff UI this pass (Phase 3, "ASKABD ENTERPRISE
 * OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 *
 * Distinct from the pre-existing "Readiness" tab (`readiness/page.tsx`),
 * which shows the client-facing health-score dimensions (business/tech/
 * connector/security/governance/operations). This page computes a real,
 * different go/no-go verdict from 5 hard operational gates — lifecycle
 * stage, migration validation, testing, open defects, UAT sign-off — each
 * independently re-derived from its own real source of truth every time
 * this page loads, never cached or self-reported. `overall` is never
 * client-computed: the server alone decides `go`/`no_go` from whether any
 * blocking dimension is not a real "pass".
 */
type DimensionStatus = 'pass' | 'fail' | 'not_determined';
type ApprovalStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded';

interface ReadinessDimension { name: string; status: DimensionStatus; detail: string; blocking: boolean }
interface ReleaseReadiness { clientId: string; overall: 'go' | 'no_go'; dimensions: ReadinessDimension[]; computedAt: string }
interface ApprovalWorkflow { id: string; status: ApprovalStatus; decidedAt: string | null; decisionNote: string | null }

const DIM_META: Record<DimensionStatus, { icon: string; className: string }> = {
  pass: { icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  fail: { icon: '✕', className: 'text-red-700 bg-red-50 border-red-200' },
  not_determined: { icon: '○', className: 'text-gray-400 bg-gray-50 border-gray-200 border-dashed' },
};

function DimBadge({ status }: { status: DimensionStatus }) {
  const m = DIM_META[status];
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}><span aria-hidden="true">{m.icon}</span>{status.replace('_', ' ')}</span>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ReleaseReadinessPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [signoff, setSignoff] = useState<{ current: ApprovalWorkflow | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const [rRes, sRes] = await Promise.all([
        staffFetch(`/api/v1/oc/clients/${id}/release-readiness`),
        staffFetch(`/api/v1/oc/clients/${id}/release-readiness/signoff`),
      ]);
      if (rRes.status === 401 || rRes.status === 403) { setError('You are not authorized to view release readiness for this client.'); setLoading(false); return; }
      if (!rRes.ok) { setError('Unable to load release readiness. The backend may be unavailable.'); setLoading(false); return; }
      setReadiness(await rRes.json());
      if (sRes.ok) setSignoff(await sRes.json());
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  async function requestSignoff() {
    setBusy('request'); setActionErr(null); setBlockers(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/release-readiness/signoff/request`, { method: 'POST' });
      if (res.ok) { await load(clientId); }
      else {
        const b = await res.json().catch(() => ({}));
        if (b?.error?.code === 'release_not_ready' && Array.isArray(b.error.blockers)) setBlockers(b.error.blockers);
        setActionErr(b?.error?.message || 'Could not request release sign-off.');
      }
    } catch (e) { setActionErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  async function decide(decision: 'approve' | 'reject' | 'request_changes') {
    if (!signoff?.current) return;
    if (decision !== 'approve' && !note.trim()) { setActionErr(decision === 'reject' ? 'A reason is required to reject.' : 'A note is required to request changes.'); return; }
    setBusy(decision); setActionErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/release-readiness/signoff/${signoff.current.id}/${decision}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note || undefined }),
      });
      if (res.ok) { setNote(''); await load(clientId); }
      else { const b = await res.json().catch(() => ({})); setActionErr(b?.error?.message || 'That decision could not be recorded.'); }
    } catch (e) { setActionErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  if (loading) return <div className="p-6 text-gray-400">Loading release readiness...</div>;
  if (error) return <div className="p-6"><ErrorState what="Release readiness could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;
  if (!readiness) return null;

  const pendingSignoff = signoff?.current?.status === 'in_review';

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Release Readiness</h2>
      <p className="text-xs text-gray-500 mb-4">AskABD&apos;s internal go/no-go gate before this client goes live — 5 real, independently-verified dimensions, re-computed on every load.</p>

      <div className={`rounded-xl border p-5 mb-4 ${readiness.overall === 'go' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <p className={`text-lg font-bold ${readiness.overall === 'go' ? 'text-green-800' : 'text-red-800'}`}>{readiness.overall === 'go' ? '✓ GO' : '✕ NO-GO'}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">Computed {new Date(readiness.computedAt).toLocaleString('en-AU')}</p>
      </div>

      <section className="bg-white rounded-xl border p-5 mb-4">
        <h3 className="font-semibold text-sm mb-3">Gates</h3>
        <div className="space-y-2">
          {readiness.dimensions.map((d, i) => (
            <div key={i} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-medium">{d.name}{d.blocking && <span className="ml-1 text-[9px] text-gray-400">(blocking)</span>}</span>
                <p className="text-[11px] text-gray-500 mt-0.5">{d.detail}</p>
              </div>
              <DimBadge status={d.status} />
            </div>
          ))}
        </div>
      </section>

      {actionErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{actionErr}</p>}
      {blockers && blockers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
          <p className="text-xs font-medium text-amber-800">Blocking gate(s) not yet a real pass:</p>
          <p className="text-xs text-amber-700 mt-0.5">{blockers.join(', ')}</p>
        </div>
      )}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Release Sign-off</h3>
        {signoff?.current ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">Status: <span className="font-medium">{signoff.current.status}</span>{signoff.current.decisionNote && ` — ${signoff.current.decisionNote}`}</p>
            {pendingSignoff && (
              <div className="flex flex-wrap gap-2 items-center">
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (required to reject / request changes)…" className="border rounded px-2 py-1.5 text-xs flex-1 min-w-[200px]" />
                <button onClick={() => decide('approve')} disabled={busy === 'approve'} className="text-[11px] font-medium px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                <button onClick={() => decide('request_changes')} disabled={busy === 'request_changes'} className="text-[11px] font-medium px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">Request Changes</button>
                <button onClick={() => decide('reject')} disabled={busy === 'reject'} className="text-[11px] font-medium px-3 py-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-3">No release sign-off has been requested yet.{readiness.overall !== 'go' ? ' All blocking gates must show a real pass before one can be requested.' : ''}</p>
            <Action variant="primary" onClick={requestSignoff} loading={busy === 'request'} disabled={readiness.overall !== 'go'} className="!text-xs">
              {busy === 'request' ? 'Requesting…' : 'Request Release Sign-off'}
            </Action>
          </div>
        )}
      </section>
    </div>
  );
}
