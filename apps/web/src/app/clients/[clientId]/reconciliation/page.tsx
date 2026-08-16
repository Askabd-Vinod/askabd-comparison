'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ClientReconciliationPage() {
  const { clientId } = useParams() as { clientId: string };
  const [summary, setSummary] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, rRes, eRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/reconciliation/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/reconciliation`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/reconciliation/exceptions`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (rRes.ok) setRuns((await rRes.json()).runs || []);
      if (eRes.ok) setExceptions((await eRes.json()).exceptions || []);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading reconciliation...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Financial Reconciliation</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>Client: {clientId}</p>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{summary.transactions?.total || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Transactions</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>${(summary.transactions?.totalAmount || 0).toLocaleString()}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Amount</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{summary.reconciliation?.totalRuns || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Runs</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{summary.reconciliation?.totalMatched || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Matched</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: summary.exceptions?.open > 0 ? '#f59e0b' : '#22c55e' }}>{summary.exceptions?.open || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Open Exceptions</div></div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>${Math.abs(summary.reconciliation?.totalVariance || 0).toLocaleString()}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Variance</div></div>
        </div>
      )}

      {/* Runs */}
      <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Reconciliation Runs ({runs.length})</h2>
        {runs.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No reconciliation runs performed</p> :
          runs.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #334155' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.id.slice(0, 16)}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{r.completed_at ? new Date(r.completed_at).toLocaleString() : 'In progress'} · {r.records_processed || 0} records</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: r.status === 'completed' ? '#22c55e' : r.status === 'running' ? '#3b82f6' : '#6b7280', color: '#fff' }}>{r.status}</span>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Matched: {r.matched || 0} · Unmatched: {r.unmatched || 0}</div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: '#f59e0b' }}>Exceptions ({exceptions.length})</h2>
          {exceptions.map((e: any) => (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{e.exception_type}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: e.status === 'open' ? '#f59e0b' : e.status === 'resolved' ? '#22c55e' : '#6b7280', color: '#fff' }}>{e.status}</span>
              </div>
              {e.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{e.description}</div>}
              {e.actual_amount && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Amount: ${Number(e.actual_amount).toLocaleString()}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
