'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function RecommendationsPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          body: JSON.stringify({ clientId, actor: 'admin', comment: 'Approved via recommendations review' }),
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
        body: JSON.stringify({ clientId, actor: 'admin', comment: 'Approved' }),
      });
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
            {recommendations.map((rec: any) => (
              <div key={rec.id} className={`p-4 rounded-lg border ${rec.status === 'approved' ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${rec.priority === 'critical' ? 'bg-red-100 text-red-700' : rec.priority === 'high' ? 'bg-amber-100 text-amber-700' : rec.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{rec.priority || 'medium'}</span>
                      <span className="text-[8px] font-medium text-gray-400 uppercase">{rec.category || 'general'}</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-800">{rec.title || rec.recommendation || 'Recommendation'}</p>
                    {rec.description && <p className="text-[10px] text-gray-600 mt-1">{rec.description}</p>}
                    {rec.impact && <p className="text-[10px] text-purple-600 mt-1">Impact: {rec.impact}</p>}
                    {rec.effort && <p className="text-[10px] text-gray-500">Effort: {rec.effort}</p>}
                  </div>
                  <div className="shrink-0">
                    {rec.status === 'approved' ? (
                      <span className="text-[9px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded">✓ APPROVED</span>
                    ) : rec.status === 'rejected' ? (
                      <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded">✗ REJECTED</span>
                    ) : (
                      <button onClick={() => approveOne(rec.id)} disabled={approving !== null} className="text-[9px] font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-2.5 py-1 rounded transition">
                        {approving === rec.id ? '...' : 'Approve'}
                      </button>
                    )}
                  </div>
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
        {approved.length === recommendations.length && recommendations.length > 0 && (
          <button onClick={async () => {
            try {
              await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, event: 'migration_plan_created', actor: 'admin', actorType: 'user' }),
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
