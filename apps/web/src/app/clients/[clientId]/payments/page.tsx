'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ClientPaymentsPage() {
  const { clientId } = useParams() as { clientId: string };
  const [methods, setMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [mRes, tRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/payment-methods`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/transactions`),
      ]);
      if (mRes.ok) setMethods((await mRes.json()).paymentMethods || []);
      if (tRes.ok) setTransactions((await tRes.json()).transactions || []);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading payments...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Payments</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>Client: {clientId}</p>

      {/* Payment Methods */}
      <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Payment Methods ({methods.length})</h2>
        {methods.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No payment methods configured</p> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {methods.map((pm: any) => (
              <div key={pm.id} style={{ background: '#0f172a', borderRadius: 8, padding: 14, borderLeft: `3px solid ${pm.status === 'active' ? '#22c55e' : '#6b7280'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{pm.display_name}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: pm.status === 'active' ? '#22c55e' : '#6b7280', color: '#fff' }}>{pm.status}</span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{pm.type} · {pm.currency}{pm.last4 ? ` · ····${pm.last4}` : ''}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Provider: {pm.provider} · Verified: {pm.verification_status}</div>
                {pm.is_default && <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 4 }}>★ Default</div>}
              </div>
            ))}
          </div>
        }
      </div>

      {/* Transactions */}
      <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Transactions ({transactions.length})</h2>
        {transactions.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No transactions recorded</p> :
          <div>
            {transactions.map((t: any) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #334155' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.description || t.reference || `${t.transaction_type} transaction`}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(t.transaction_date).toLocaleDateString()} · {t.transaction_type} · {t.provider || 'manual'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.transaction_type === 'refund' ? '#ef4444' : '#22c55e' }}>${Number(t.amount).toLocaleString()}</div>
                  <div style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: t.status === 'settled' ? '#22c55e' : t.status === 'pending' ? '#f59e0b' : '#6b7280', color: '#fff', display: 'inline-block' }}>{t.status}</div>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
