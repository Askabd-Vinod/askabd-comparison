'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280', proposed: '#3b82f6', approved: '#22c55e',
  contracted: '#8b5cf6', active: '#10b981', completed: '#14b8a6',
};

export default function EngagementsPage() {
  const { clientId } = useParams() as { clientId: string };
  const router = useRouter();
  const [engagements, setEngagements] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [reconSummary, setReconSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('transformation');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/clients/${clientId}`;
      const [eRes, pmRes, txRes, rRes] = await Promise.all([
        fetch(`${base}/engagements`),
        fetch(`${base}/payment-methods`).catch(() => null),
        fetch(`${base}/transactions`).catch(() => null),
        fetch(`${base}/reconciliation/summary`).catch(() => null),
      ]);
      if (eRes.ok) setEngagements((await eRes.json()).engagements || []);
      if (pmRes?.ok) setPaymentMethods((await pmRes.json()).paymentMethods || []);
      if (txRes?.ok) setTransactions((await txRes.json()).transactions || []);
      if (rRes?.ok) setReconSummary(await rRes.json());
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const createEngagement = async () => {
    if (!newName.trim()) return;
    const r = await fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, engagementType: newType }),
    });
    if (r.ok) { setShowCreate(false); setNewName(''); loadData(); }
  };

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading commercial...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Commercial Engagements</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Client: {clientId}</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ New Engagement</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700 }}>{engagements.length}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Engagements</div></div>
        <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{engagements.filter(e => e.status === 'active').length}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Active</div></div>
        <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{paymentMethods.length}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Payment Methods</div></div>
        <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>{transactions.length}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Transactions</div></div>
        <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: reconSummary?.exceptions?.open ? '#f59e0b' : '#22c55e' }}>{reconSummary?.reconciliation?.totalRuns || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Reconciliations</div></div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 20, marginBottom: 20, border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>Create New Engagement</h3>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Engagement name..." style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', marginBottom: 10, fontSize: 14 }} />
          <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', marginBottom: 12, fontSize: 14 }}>
            <option value="transformation">Transformation</option>
            <option value="managed_services">Managed Services</option>
            <option value="advisory">Advisory</option>
            <option value="assessment">Assessment</option>
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createEngagement} style={{ background: '#22c55e', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Create</button>
            <button onClick={() => setShowCreate(false)} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Engagements List */}
      {engagements.length === 0 ? (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>No engagements yet</div>
          <div style={{ fontSize: 12, color: '#475569' }}>Create an engagement to begin the commercial lifecycle</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {engagements.map((e: any) => (
            <div key={e.id} onClick={() => router.push(`/clients/${clientId}/engagements/${e.id}`)} style={{ background: '#1e293b', borderRadius: 10, padding: 16, cursor: 'pointer', borderLeft: `3px solid ${STATUS_COLORS[e.status] || '#6b7280'}`, transition: 'background 0.15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.engagement_type} · {e.engagement_number || e.id.slice(0, 8)}</div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: STATUS_COLORS[e.status] || '#6b7280', color: '#fff', fontWeight: 600, textTransform: 'uppercase' }}>{e.status}</span>
              </div>
              {e.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>{e.description}</div>}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#64748b' }}>
                {e.total_investment && <span>Investment: ${Number(e.total_investment).toLocaleString()}</span>}
                {e.currency && <span>Currency: {e.currency}</span>}
                <span>Created: {new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Methods Section */}
      {paymentMethods.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Payment Methods</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {paymentMethods.map((pm: any) => (
              <div key={pm.id} style={{ background: '#1e293b', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{pm.display_name}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: pm.status === 'active' ? '#22c55e' : '#6b7280', color: '#fff' }}>{pm.status}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{pm.type} · {pm.currency}{pm.last4 ? ` · ****${pm.last4}` : ''}</div>
                {pm.is_default && <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 4 }}>★ Default</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reconciliation Summary */}
      {reconSummary && reconSummary.transactions?.total > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Financial Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700 }}>{reconSummary.transactions.total}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Transactions</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>${reconSummary.transactions.totalAmount?.toLocaleString() || 0}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Total Amount</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700 }}>{reconSummary.reconciliation.totalMatched}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Matched</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700, color: reconSummary.exceptions.open > 0 ? '#f59e0b' : '#22c55e' }}>{reconSummary.exceptions.open}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Open Exceptions</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
