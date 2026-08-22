'use client';
import { useEffect, useState, useCallback } from 'react';
import { ErrorState } from '../../../components/error-state';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-4 text-center"><p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', approved: 'bg-green-100 text-green-700',
};

export default function CommercialDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/v1/oc/platform/commercial/summary`);
      if (r.ok) setData(await r.json());
      else throw new Error(`Commercial summary request failed (${r.status})`);
    } catch (err) {
      setError((err as Error).message || 'Unable to reach AskABD.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="max-w-[1600px] mx-auto px-4 py-6"><p className="text-xs text-gray-500 text-center py-10">Loading commercial dashboard…</p></div>;
  if (error) return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <ErrorState what="Commercial dashboard could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={loadData} />
    </div>
  );

  const s = data?.summary || {};
  const byStatus = data?.byStatus || {};
  const pipeline = data?.pipeline || [];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Commercial Platform</h1>
        <p className="text-xs text-gray-500 mt-0.5">Engagement pipeline, revenue, and reconciliation overview</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Stat label="Total Engagements" value={s.totalEngagements || 0} />
        <Stat label="Draft" value={byStatus?.draft || 0} color="text-blue-600" />
        <Stat label="Proposed" value={byStatus?.proposed || 0} color="text-orange-600" />
        <Stat label="Approved" value={byStatus?.approved || 0} color="text-green-600" />
        <Stat label="Active" value={byStatus?.active || 0} color="text-emerald-600" />
        <Stat label="Completed" value={byStatus?.completed || 0} color="text-teal-600" />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-[10px] text-gray-400 mb-1">Total Estimated Value</p>
          <p className="text-xl font-bold text-blue-600">${(s.totalEstimatedValue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-[10px] text-gray-400 mb-1">Total Contracted Value</p>
          <p className="text-xl font-bold text-purple-600">${(s.totalContractedValue || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-[10px] text-gray-400 mb-1">Total Realized</p>
          <p className="text-xl font-bold text-green-600">${(s.totalRealized || 0).toLocaleString()}</p>
        </div>
      </div>

      {pipeline.length > 0 && (
        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-sm mb-3">Engagement Pipeline</h2>
          <div className="space-y-2">
            {pipeline.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-gray-900">{e.name}</p>
                  {/* Previously showed the raw internal client_id — found
                      during the 2026-08-22 global UX audit. */}
                  <p className="text-[10px] text-gray-400">{e.client_name || e.client_id} · {e.engagement_type}</p>
                </div>
                <div className="flex items-center gap-3">
                  {e.total_investment && <span className="text-xs text-blue-600">${Number(e.total_investment).toLocaleString()}</span>}
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${STATUS_BADGE[e.status] || 'bg-gray-100 text-gray-600'}`}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
