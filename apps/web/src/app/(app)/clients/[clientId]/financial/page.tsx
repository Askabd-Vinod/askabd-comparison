'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

export default function ClientFinancialPage() {
  const { clientId } = useParams() as { clientId: string };
  const [financial, setFinancial] = useState<any>(null);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fRes, eRes, tRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/portal/${clientId}/financial`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/transactions`),
      ]);
      if (fRes.ok) setFinancial(await fRes.json());
      if (eRes.ok) setEngagements((await eRes.json()).engagements || []);
      if (tRes.ok) setTransactions((await tRes.json()).transactions || []);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const fmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n?.toFixed(0) || 0}`;

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading financial…</p>;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Financial Overview</h2>
      <p className="text-xs text-gray-500 mb-6">Real engagement investment, savings, and transaction history for this client.</p>

      {financial && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <Stat label="Investment" value={fmt(financial.investment || 0)} />
          <Stat label="Expected Value" value={fmt(financial.expectedSavings || 0)} color="text-blue-600" />
          <Stat label="Realized" value={fmt(financial.realizedSavings || 0)} color="text-green-600" />
          <Stat label="ROI" value={`${financial.avgRoi || 0}%`} />
          <Stat label="Benefit Realization" value={`${financial.benefitRealization || 0}%`} color="text-orange-600" />
        </div>
      )}

      {engagements.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-3">Engagement Financials</h3>
          <div className="divide-y">
            {engagements.map((e: any) => (
              <div key={e.id} className="flex justify-between py-2 text-xs">
                <span className="text-gray-700">{e.name}</span>
                <span className="text-blue-600 font-medium">{e.total_investment ? `$${Number(e.total_investment).toLocaleString()}` : '—'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Transactions ({transactions.length})</h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-gray-500 py-4">No transactions recorded</p>
        ) : (
          <div className="divide-y">
            {transactions.slice(0, 20).map((t: any) => (
              <div key={t.id} className="flex justify-between items-center py-2">
                <div>
                  <p className="text-xs text-gray-800">{t.description || t.reference || t.transaction_type}</p>
                  <p className="text-[10px] text-gray-400">{new Date(t.transaction_date).toLocaleDateString('en-AU')} · {t.transaction_type}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${t.transaction_type === 'refund' ? 'text-red-600' : 'text-green-600'}`}>${Number(t.amount).toLocaleString()}</p>
                  <p className="text-[9px] text-gray-500">{t.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
