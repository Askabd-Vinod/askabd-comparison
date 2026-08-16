'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ClientProposalsPage() {
  const { clientId } = useParams() as { clientId: string };
  const [engagements, setEngagements] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const eRes = await fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`);
      const engs = eRes.ok ? (await eRes.json()).engagements || [] : [];
      setEngagements(engs);

      // Load proposals for each engagement
      const allProps: any[] = [];
      for (const eng of engs.slice(0, 10)) {
        try {
          const pRes = await fetch(`${API}/api/v1/oc/engagements/${eng.id}/proposals`);
          if (pRes.ok) {
            const data = await pRes.json();
            (data.proposals || []).forEach((p: any) => allProps.push({ ...p, engagementName: eng.name }));
          }
        } catch {}
      }
      setProposals(allProps);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const sc = (s: string) => s === 'accepted' ? '#22c55e' : s === 'sent' ? '#3b82f6' : s === 'ready' ? '#f59e0b' : '#6b7280';

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading proposals...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Proposals</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>Client: {clientId}</p>

      {proposals.length === 0 ? (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: 14 }}>No proposals yet</p>
          <p style={{ color: '#475569', fontSize: 12 }}>Proposals are created from commercial engagements</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {proposals.map((p: any) => (
            <div key={p.id} style={{ background: '#1e293b', borderRadius: 10, padding: 16, borderLeft: `3px solid ${sc(p.status)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{p.title || `Proposal v${p.version}`}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.proposal_number || p.id.slice(0, 14)} · Version {p.version} · {p.engagementName}</div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: sc(p.status), color: '#fff', fontWeight: 600, alignSelf: 'flex-start' }}>{p.status}</span>
              </div>
              {p.executive_summary && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, lineHeight: 1.5 }}>{p.executive_summary.slice(0, 250)}{p.executive_summary.length > 250 ? '...' : ''}</div>}
              {p.investment_summary && <div style={{ fontSize: 12, color: '#3b82f6', marginBottom: 4 }}>{p.investment_summary.slice(0, 150)}</div>}
              {p.value_summary && <div style={{ fontSize: 12, color: '#22c55e' }}>{p.value_summary.slice(0, 150)}</div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: '#64748b' }}>
                {p.payment_terms && <span>Terms: {p.payment_terms}</span>}
                <span>Created: {new Date(p.created_at).toLocaleDateString()}</span>
                {p.valid_until && <span>Valid until: {new Date(p.valid_until).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
