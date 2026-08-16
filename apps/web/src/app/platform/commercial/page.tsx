'use client';
import { useEffect, useState, useCallback } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function CommercialDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(`${API}/api/v1/oc/platform/commercial/summary`);
      if (r.ok) setData(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading commercial dashboard...</div>;

  const s = data?.summary || {};
  const byStatus = data?.byStatus || {};
  const pipeline = data?.pipeline || [];

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Commercial Platform</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Engagement pipeline, revenue, and reconciliation overview</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700 }}>{s.totalEngagements || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Engagements</div></div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{byStatus?.draft || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Draft</div></div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{byStatus?.proposed || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Proposed</div></div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{byStatus?.approved || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Approved</div></div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{byStatus?.active || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Active</div></div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#14b8a6' }}>{byStatus?.completed || 0}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Completed</div></div>
      </div>

      {/* Financial Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Total Estimated Value</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>${(s.totalEstimatedValue || 0).toLocaleString()}</div>
        </div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Total Contracted Value</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>${(s.totalContractedValue || 0).toLocaleString()}</div>
        </div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Total Realized</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>${(s.totalRealized || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Pipeline */}
      {pipeline.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Engagement Pipeline</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {pipeline.map((e: any) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#0f172a', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{e.client_id} · {e.engagement_type}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {e.total_investment && <span style={{ fontSize: 12, color: '#3b82f6' }}>${Number(e.total_investment).toLocaleString()}</span>}
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: e.status === 'active' ? '#10b981' : e.status === 'approved' ? '#22c55e' : '#6b7280', color: '#fff' }}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
