'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

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

  const fmt = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n?.toFixed(0) || 0}`;

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading financial...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Financial Overview</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>Client: {clientId}</p>

      {financial && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(financial.investment || 0)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Investment</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{fmt(financial.expectedSavings || 0)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Expected Value</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{fmt(financial.realizedSavings || 0)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Realized</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{financial.avgRoi || 0}%</div><div style={{ fontSize: 11, color: '#94a3b8' }}>ROI</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{financial.benefitRealization || 0}%</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Benefit Realization</div></div>
        </div>
      )}

      {engagements.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Engagement Financials</h2>
          {engagements.map((e: any) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <span style={{ fontSize: 13 }}>{e.name}</span>
              <span style={{ fontSize: 13, color: '#3b82f6' }}>{e.total_investment ? `$${Number(e.total_investment).toLocaleString()}` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Transactions ({transactions.length})</h2>
        {transactions.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No transactions recorded</p> :
          transactions.slice(0, 20).map((t: any) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <div><div style={{ fontSize: 13 }}>{t.description || t.reference || t.transaction_type}</div><div style={{ fontSize: 11, color: '#64748b' }}>{new Date(t.transaction_date).toLocaleDateString()} · {t.transaction_type}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 600, color: t.transaction_type === 'refund' ? '#ef4444' : '#22c55e' }}>${Number(t.amount).toLocaleString()}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{t.status}</div></div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
