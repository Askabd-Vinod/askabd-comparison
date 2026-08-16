'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_COLORS: Record<string, string> = { draft: '#6b7280', proposed: '#3b82f6', approved: '#22c55e', contracted: '#8b5cf6', active: '#10b981', completed: '#14b8a6' };
const TRANSITIONS: Record<string, string[]> = { draft: ['proposed'], proposed: ['approved', 'draft'], approved: ['contracted', 'draft'], contracted: ['active'], active: ['completed'], completed: [] };

export default function EngagementDetailPage() {
  const { clientId, engagementId } = useParams() as { clientId: string; engagementId: string };
  const router = useRouter();
  const [engagement, setEngagement] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview'|'services'|'pricing'|'proposals'>('overview');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/engagements/${engagementId}`;
      const [eRes, sRes, pRes, sumRes, prRes] = await Promise.all([
        fetch(base),
        fetch(`${base}/services`).catch(() => null),
        fetch(`${base}/pricing`).catch(() => null),
        fetch(`${base}/summary`).catch(() => null),
        fetch(`${base}/proposals`).catch(() => null),
      ]);
      if (eRes.ok) setEngagement((await eRes.json()).engagement || await eRes.json());
      if (sRes?.ok) setServices((await sRes.json()).services || []);
      if (pRes?.ok) setPricing((await pRes.json()).pricing || null);
      if (sumRes?.ok) setSummary(await sumRes.json());
      if (prRes?.ok) setProposals((await prRes.json()).proposals || []);
    } catch {} finally { setLoading(false); }
  }, [engagementId]);

  useEffect(() => { loadData(); }, [loadData]);

  const transition = async (newStatus: string) => {
    const r = await fetch(`${API}/api/v1/oc/engagements/${engagementId}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStatus, actor: 'admin' }),
    });
    if (r.ok) loadData(); else alert((await r.json()).message || 'Transition failed');
  };

  const createProposal = async () => {
    const r = await fetch(`${API}/api/v1/oc/engagements/${engagementId}/proposals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ createdBy: 'admin' }),
    });
    if (r.ok) { setTab('proposals'); loadData(); }
  };

  const generateProposal = async (proposalId: string) => {
    await fetch(`${API}/api/v1/oc/proposals/${proposalId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    loadData();
  };

  const transitionProposal = async (proposalId: string, newStatus: string) => {
    await fetch(`${API}/api/v1/oc/proposals/${proposalId}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStatus, actor: 'admin' }),
    });
    loadData();
  };

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading engagement...</div>;
  if (!engagement) return <div style={{ padding: 40, color: '#ef4444', background: '#0f172a', minHeight: '100vh' }}>Engagement not found</div>;

  const allowed = TRANSITIONS[engagement.status] || [];

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <button onClick={() => router.push(`/clients/${clientId}/engagements`)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, marginBottom: 4 }}>← Back to Engagements</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{engagement.name}</h1>
          <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>{engagement.engagement_type} · {engagement.engagement_number || engagement.id.slice(0, 8)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 12, background: STATUS_COLORS[engagement.status] || '#6b7280', color: '#fff', fontWeight: 600 }}>{engagement.status}</span>
        </div>
      </div>

      {/* Actions */}
      {allowed.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {allowed.map(s => (
            <button key={s} onClick={() => transition(s)} style={{ background: '#334155', border: '1px solid #475569', color: '#f1f5f9', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>→ {s}</button>
          ))}
          {engagement.status === 'draft' && <button onClick={createProposal} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>+ Create Proposal</button>}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #334155', marginBottom: 16 }}>
        {(['overview', 'services', 'pricing', 'proposals'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent', color: tab === t ? '#f1f5f9' : '#64748b', padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400 }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && summary && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 12px', color: '#94a3b8' }}>Engagement Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Services</div><div style={{ fontSize: 18, fontWeight: 700 }}>{summary.servicesCount || services.length}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Problems Addressed</div><div style={{ fontSize: 18, fontWeight: 700 }}>{summary.problemsCount || 0}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Gaps Addressed</div><div style={{ fontSize: 18, fontWeight: 700 }}>{summary.gapsCount || 0}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Investment</div><div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>${(summary.totalInvestment || engagement.total_investment || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Expected Value</div><div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>${(summary.totalExpectedValue || engagement.total_expected_value || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Effort (days)</div><div style={{ fontSize: 18, fontWeight: 700 }}>{summary.totalEffortDays || engagement.total_effort_days || 0}</div></div>
            </div>
          </div>
          {engagement.description && <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}><h3 style={{ fontSize: 14, margin: '0 0 8px', color: '#94a3b8' }}>Description</h3><p style={{ fontSize: 13, color: '#cbd5e1', margin: 0 }}>{engagement.description}</p></div>}
        </div>
      )}

      {tab === 'services' && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 12px', color: '#94a3b8' }}>Selected Services ({services.length})</h3>
          {services.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No services selected yet. Add services from the client service configuration.</p> :
            <div style={{ display: 'grid', gap: 8 }}>
              {services.map((s: any) => (
                <div key={s.id} style={{ background: '#0f172a', borderRadius: 8, padding: 12, borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.service_id}</div>
                  {s.scope_description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{s.scope_description}</div>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#64748b' }}>
                    {s.estimated_effort && <span>Effort: {s.estimated_effort}d</span>}
                    {s.estimated_investment && <span>Invest: ${Number(s.estimated_investment).toLocaleString()}</span>}
                    {s.expected_value && <span>Value: ${Number(s.expected_value).toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {tab === 'pricing' && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 12px', color: '#94a3b8' }}>Pricing</h3>
          {!pricing ? <p style={{ color: '#64748b', fontSize: 13 }}>No pricing configured yet.</p> :
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Subtotal</div><div style={{ fontSize: 18, fontWeight: 700 }}>${Number(pricing.subtotal || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Discount</div><div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>${Number(pricing.discount || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Tax</div><div style={{ fontSize: 18, fontWeight: 700 }}>${Number(pricing.tax || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Total</div><div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>${Number(pricing.total || 0).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Billing Model</div><div style={{ fontSize: 14 }}>{pricing.billing_model || 'N/A'}</div></div>
              <div><div style={{ fontSize: 11, color: '#64748b' }}>Payment Terms</div><div style={{ fontSize: 14 }}>{pricing.payment_terms || 'N/A'}</div></div>
            </div>
          }
        </div>
      )}

      {tab === 'proposals' && (
        <div>
          {proposals.length === 0 ? (
            <div style={{ background: '#1e293b', borderRadius: 10, padding: 24, textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: 13 }}>No proposals yet</p>
              <button onClick={createProposal} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, marginTop: 8 }}>Create First Proposal</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {proposals.map((p: any) => (
                <div key={p.id} style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title || `Proposal v${p.version}`}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.proposal_number || p.id.slice(0, 12)} · v{p.version}</div>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: p.status === 'accepted' ? '#22c55e' : p.status === 'sent' ? '#3b82f6' : '#6b7280', color: '#fff' }}>{p.status}</span>
                  </div>
                  {p.executive_summary && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{p.executive_summary.slice(0, 200)}...</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {p.status === 'draft' && <button onClick={() => generateProposal(p.id)} style={{ background: '#334155', border: 'none', color: '#f1f5f9', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>Generate Content</button>}
                    {p.status === 'draft' && <button onClick={() => transitionProposal(p.id, 'ready')} style={{ background: '#334155', border: 'none', color: '#f1f5f9', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>→ Ready</button>}
                    {p.status === 'ready' && <button onClick={() => transitionProposal(p.id, 'sent')} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>→ Send</button>}
                    {p.status === 'sent' && <button onClick={() => transitionProposal(p.id, 'accepted')} style={{ background: '#22c55e', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>→ Accept</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
