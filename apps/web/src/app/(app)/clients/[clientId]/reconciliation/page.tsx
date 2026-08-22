'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '../../../../components/error-state';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

export default function ClientReconciliationPage() {
  const { clientId } = useParams() as { clientId: string };
  const [summary, setSummary] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Same fix as the Payments page: previously a failed fetch and a
  // genuinely empty result were indistinguishable — found during the
  // 2026-08-22 global UX audit.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, rRes, eRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/reconciliation/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/reconciliation`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/reconciliation/exceptions`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      else if (sRes.status !== 404) throw new Error(`Reconciliation summary request failed (${sRes.status})`);
      if (rRes.ok) setRuns((await rRes.json()).runs || []);
      else if (rRes.status !== 404) throw new Error(`Reconciliation runs request failed (${rRes.status})`);
      if (eRes.ok) setExceptions((await eRes.json()).exceptions || []);
      else if (eRes.status !== 404) throw new Error(`Reconciliation exceptions request failed (${eRes.status})`);
    } catch (err) {
      setError((err as Error).message || 'Unable to reach AskABD.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading reconciliation…</p>;
  if (error) return (
    <div className="py-6">
      <ErrorState what="Reconciliation data could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={loadData} />
    </div>
  );

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Financial Reconciliation</h2>
      <p className="text-xs text-gray-500 mb-6">Real reconciliation runs matching this client's transactions against provider records.</p>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Stat label="Transactions" value={summary.transactions?.total || 0} />
          <Stat label="Total Amount" value={`$${(summary.transactions?.totalAmount || 0).toLocaleString()}`} color="text-green-600" />
          <Stat label="Runs" value={summary.reconciliation?.totalRuns || 0} color="text-blue-600" />
          <Stat label="Matched" value={summary.reconciliation?.totalMatched || 0} color="text-green-600" />
          <Stat label="Open Exceptions" value={summary.exceptions?.open || 0} color={summary.exceptions?.open > 0 ? 'text-orange-600' : 'text-green-600'} />
          <Stat label="Variance" value={`$${Math.abs(summary.reconciliation?.totalVariance || 0).toLocaleString()}`} />
        </div>
      )}

      <section className="bg-white rounded-xl border p-5 mb-4">
        <h3 className="font-semibold text-sm mb-3">Reconciliation Runs ({runs.length})</h3>
        {runs.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No reconciliation runs performed</p>
        ) : (
          <div className="divide-y">
            {/* Previously showed the raw internal run id (e.g.
                "recon-a1b2c3d4e5f6") as the run's title — meaningless to a
                staff user. Found during the 2026-08-22 global UX audit.
                Runs are shown newest-first by the API, so this numbers them
                in that same order as a real, readable label. */}
            {runs.map((r: any, i: number) => (
              <div key={r.id} className="flex justify-between py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-800">Reconciliation run #{runs.length - i}</p>
                  <p className="text-[10px] text-gray-400">{r.completed_at ? new Date(r.completed_at).toLocaleString('en-AU') : 'In progress'} · {r.records_processed || 0} records</p>
                </div>
                <div className="text-right">
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${r.status === 'completed' ? 'bg-green-100 text-green-700' : r.status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  <p className="text-[10px] text-gray-500 mt-1">Matched: {r.matched || 0} · Unmatched: {r.unmatched || 0}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {exceptions.length > 0 && (
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm text-orange-700 mb-3">Exceptions ({exceptions.length})</h3>
          <div className="divide-y">
            {exceptions.map((e: any) => (
              <div key={e.id} className="py-2.5">
                <div className="flex justify-between">
                  <span className="text-xs font-medium text-gray-800">{e.exception_type}</span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${e.status === 'open' ? 'bg-orange-100 text-orange-700' : e.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{e.status}</span>
                </div>
                {e.description && <p className="text-[10px] text-gray-500 mt-0.5">{e.description}</p>}
                {e.actual_amount && <p className="text-[10px] text-gray-400 mt-0.5">Amount: ${Number(e.actual_amount).toLocaleString()}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
