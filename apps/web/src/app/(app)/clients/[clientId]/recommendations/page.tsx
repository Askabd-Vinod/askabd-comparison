'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getStaffSession } from '../../../../lib/staff-session';
import Link from 'next/link';

export default function RecommendationsPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Inline reason capture, not window.prompt() — matches the design system's
  // pattern elsewhere (Gap Analysis, Transformations) and avoids a native
  // dialog automated/keyboard-driven workflows can't reliably interact with.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/oc/recommendations/${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        setError(null);
      }
    } catch {
      setError('Unable to load recommendations.');
    }
    setLoading(false);
  }, [clientId, API]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function approveAll() {
    const pending = recommendations.filter(r => r.status === 'pending' || r.status === 'ready');
    if (pending.length === 0) return;
    setApproving('all');
    for (const rec of pending) {
      try {
        await fetch(`${API}/api/v1/oc/recommendations/${rec.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, actor: getStaffSession()?.identityId || 'unknown-staff', comment: 'Approved via recommendations review' }),
        });
      } catch {}
    }
    await fetchData();
    setApproving(null);
  }

  async function approveOne(recId: string) {
    setApproving(recId);
    try {
      await fetch(`${API}/api/v1/oc/recommendations/${recId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, actor: getStaffSession()?.identityId || 'unknown-staff', comment: 'Approved' }),
      });
      await fetchData();
    } catch {}
    setApproving(null);
  }

  // Previously missing entirely — the backend has always supported
  // POST /oc/recommendations/:id/reject (recommendation-service.ts), but no
  // UI path called it, so a set could only ever be approved, never rejected.
  async function rejectOne(recId: string, reason: string) {
    setApproving(recId);
    try {
      await fetch(`${API}/api/v1/oc/recommendations/${recId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, actor: getStaffSession()?.identityId || 'unknown-staff', reason }),
      });
      setRejectingId(null); setRejectReason('');
      await fetchData();
    } catch {}
    setApproving(null);
  }

  const approved = recommendations.filter(r => r.status === 'approved');
  const pending = recommendations.filter(r => r.status !== 'approved' && r.status !== 'rejected');

  if (loading) {
    return <div className="bg-white rounded-xl border p-8 text-center"><p className="text-sm text-gray-500">Loading recommendations...</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Customer Review</p>
            <h2 className="text-lg font-bold text-gray-900">Recommendations</h2>
            <p className="text-xs text-gray-500 mt-0.5">AI-powered recommendations based on assessment findings</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-600">{recommendations.length}</p>
            <p className="text-[9px] text-gray-400">{approved.length} approved • {pending.length} pending</p>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      {recommendations.length > 0 ? (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">All Recommendations</h3>
            {pending.length > 0 && (
              <button onClick={approveAll} disabled={approving !== null} className="text-[10px] font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded transition">
                {approving === 'all' ? 'Approving...' : `Approve All (${pending.length})`}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {/* Each row from GET /oc/recommendations/:clientId is a whole
                RecommendationSet (one per assessment run) — real individual
                recommendation items live nested in `set.recommendations[]`.
                Previously this rendered `set.title`/`set.priority`/etc.
                directly, which don't exist on the set itself, so every card
                silently showed blank/fallback text. Approve/reject genuinely
                act on the whole set (that's the real granularity the backend
                supports — recommendation-service.ts has no per-item action),
                so one set = one card, with its real items listed inside it. */}
            {recommendations.map((set: any) => (
              <div key={set.id} className={`p-4 rounded-lg border ${set.status === 'approved' ? 'border-green-200 bg-green-50/30' : set.status === 'rejected' ? 'border-red-200 bg-red-50/20' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    {/* Never show the raw assessment_id to the user — a
                        friendly date is what actually matters to them. */}
                    <p className="text-xs font-semibold text-gray-800">Recommendations from the {new Date(set.created_at || set.createdAt).toLocaleDateString()} assessment</p>
                    <p className="text-[10px] text-gray-400">{set.recommendations?.length ?? 0} recommendation{set.recommendations?.length === 1 ? '' : 's'} · {new Date(set.created_at || set.createdAt).toLocaleString()}</p>
                    {set.comments && <p className="text-[10px] text-gray-600 mt-1">Note: {set.comments}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {set.status === 'approved' ? (
                      <span className="text-[9px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded">✓ APPROVED</span>
                    ) : set.status === 'rejected' ? (
                      <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded">✗ REJECTED</span>
                    ) : (
                      <>
                        <button onClick={() => approveOne(set.id)} disabled={approving !== null} className="text-[9px] font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-2.5 py-1 rounded transition">
                          {approving === set.id ? '...' : 'Approve'}
                        </button>
                        <button onClick={() => { setRejectingId(set.id); setRejectReason(''); }} disabled={approving !== null} className="text-[9px] font-semibold text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded transition">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {rejectingId === set.id && (
                  <div className="mb-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    <label htmlFor={`reject-${set.id}`} className="block text-[10px] font-medium text-red-800 mb-1">Why are you rejecting this? <span className="text-red-400 font-normal">(optional, but helps the customer understand)</span></label>
                    <textarea id={`reject-${set.id}`} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Not a priority this quarter — revisit after the migration." rows={2} className="w-full text-[11px] border border-red-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400" autoFocus />
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => rejectOne(set.id, rejectReason)} disabled={approving !== null} className="text-[9px] font-semibold bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded transition">{approving === set.id ? 'Rejecting…' : 'Confirm Reject'}</button>
                      <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="text-[9px] text-gray-500">Cancel</button>
                    </div>
                  </div>
                )}
                <div className="space-y-2 pl-3 border-l-2 border-gray-100">
                  {(Array.isArray(set.recommendations) ? set.recommendations : []).map((item: any, i: number) => (
                    <div key={item.id || i}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${item.risk === 'critical' ? 'bg-red-100 text-red-700' : item.risk === 'high' ? 'bg-amber-100 text-amber-700' : item.risk === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{item.risk || 'medium'} risk</span>
                        <span className="text-[8px] font-medium text-gray-400 uppercase">{(item.category || 'general').replace(/[-_]/g, ' ')}</span>
                      </div>
                      <p className="text-xs font-semibold text-gray-800">{item.title || 'Untitled recommendation'}</p>
                      {item.problem && <p className="text-[10px] text-gray-600 mt-0.5">{item.problem}</p>}
                      {item.recommendedAction && <p className="text-[10px] text-purple-600 mt-0.5">Action: {item.recommendedAction}</p>}
                      {item.effort && <p className="text-[10px] text-gray-500">Effort: {item.effort}</p>}
                    </div>
                  ))}
                  {(!set.recommendations || set.recommendations.length === 0) && (
                    <p className="text-[10px] text-gray-400">No individual recommendation items in this set.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-5 text-center">
          <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">💡</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">No Recommendations Yet</p>
          <p className="text-xs text-gray-500 mt-1">Recommendations will appear after assessment is complete.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        <Link href={`/clients/${clientId}/assessment`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          View Assessment
        </Link>
        {/* Real defect found and fixed live during solution_test_1: this
            used to require approved.length === recommendations.length —
            literally EVERY set approved, with no exceptions. A `rejected`
            set is a valid, deliberate, fully-resolved outcome (real reason
            captured, real terminal status) — treating it the same as an
            unresolved `pending` set meant rejecting even ONE set out of
            many permanently hid this button forever, blocking the real
            workflow even after every set had been properly reviewed. Real
            reproduction: 2 sets, 1 approved + 1 rejected — button never
            appeared. Fixed to the real intent: every set resolved (none
            still pending) AND at least one real approval exists. */}
        {pending.length === 0 && approved.length > 0 && (
          <button onClick={async () => {
            try {
              await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, event: 'migration_plan_created', actor: getStaffSession()?.identityId || 'unknown-staff', actorType: 'user' }),
              });
            } catch {}
            window.location.href = `/clients/${clientId}/lifecycle`;
          }} className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
            Proceed to Migration Planning →
          </button>
        )}
        <button onClick={fetchData} className="text-xs text-purple-600 hover:text-purple-800 font-medium ml-auto">
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
