'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '../../../../components/error-state';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ClientPaymentsPage() {
  const { clientId } = useParams() as { clientId: string };
  const [methods, setMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Previously a failed fetch (network error, 500, RBAC denial) and a
  // genuinely empty result were indistinguishable — both silently rendered
  // "No payment methods configured" / "No transactions recorded" with zero
  // indication anything had actually gone wrong. Found during the
  // 2026-08-22 global UX audit.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, tRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/payment-methods`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/transactions`),
      ]);
      if (mRes.ok) setMethods((await mRes.json()).paymentMethods || []);
      else if (mRes.status !== 404) throw new Error(`Payment methods request failed (${mRes.status})`);
      if (tRes.ok) setTransactions((await tRes.json()).transactions || []);
      else if (tRes.status !== 404) throw new Error(`Transactions request failed (${tRes.status})`);
    } catch (err) {
      setError((err as Error).message || 'Unable to reach AskABD.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading payments…</p>;
  if (error) return (
    <div className="py-6">
      <ErrorState what="Payments could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={loadData} />
    </div>
  );

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Payments</h2>
      <p className="text-xs text-gray-500 mb-6">Real, on-file payment methods and transaction history for this client.</p>

      <section className="bg-white rounded-xl border p-5 mb-4">
        <h3 className="font-semibold text-sm mb-3">Payment Methods ({methods.length})</h3>
        {methods.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No payment methods configured</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {methods.map((pm: any) => (
              <div key={pm.id} className={`bg-gray-50 rounded-lg p-3.5 border-l-4 ${pm.status === 'active' ? 'border-green-400' : 'border-gray-300'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-900">{pm.display_name}</span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${pm.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{pm.status}</span>
                </div>
                <p className="text-[11px] text-gray-500">{pm.type} · {pm.currency}{pm.last4 ? ` · ····${pm.last4}` : ''}</p>
                <p className="text-[10px] text-gray-400 mt-1">Provider: {pm.provider} · Verified: {pm.verification_status}</p>
                {pm.is_default && <p className="text-[10px] text-blue-600 mt-1">★ Default</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Transactions ({transactions.length})</h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No transactions recorded</p>
        ) : (
          <div className="divide-y">
            {transactions.map((t: any) => (
              <div key={t.id} className="flex justify-between items-center py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-800">{t.description || t.reference || `${t.transaction_type} transaction`}</p>
                  <p className="text-[10px] text-gray-400">{new Date(t.transaction_date).toLocaleDateString('en-AU')} · {t.transaction_type} · {t.provider || 'manual'}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${t.transaction_type === 'refund' ? 'text-red-600' : 'text-green-600'}`}>${Number(t.amount).toLocaleString()}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${t.status === 'settled' ? 'bg-green-100 text-green-700' : t.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
