'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ClientServicesPage() {
  const { clientId } = useParams() as { clientId: string };
  const [services, setServices] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [coverage, setCoverage] = useState<any>(null);
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/clients/${clientId}`;
      const [sRes, rRes, cRes, bRes] = await Promise.all([
        fetch(`${base}/services`),
        fetch(`${base}/services/recommendations`).catch(() => null),
        fetch(`${base}/services/coverage`).catch(() => null),
        fetch(`${base}/service-bundles/recommended`).catch(() => null),
      ]);
      if (sRes.ok) { const d = await sRes.json(); setServices(d.services || []); setSummary(d.summary); }
      if (rRes?.ok) { const d = await rRes.json(); setRecommendations(d.recommendations || []); }
      if (cRes?.ok) setCoverage(await cRes.json());
      if (bRes?.ok) { const d = await bRes.json(); setBundles(d.recommendations || []); }
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleService = async (serviceId: string, enable: boolean) => {
    const url = `${API}/api/v1/oc/clients/${clientId}/services/${serviceId}/${enable ? 'enable' : 'disable'}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: 'admin' }) });
    const result = await r.json();
    if (!r.ok) { alert(result.message || result.error || 'Operation failed'); }
    loadData();
  };

  const sc = (s: string) => s === 'operational' ? '#22c55e' : s === 'foundation' ? '#8b5cf6' : s === 'planned' ? '#6b7280' : s === 'concept' ? '#475569' : '#3b82f6';
  const csc = (s: string) => s === 'enabled' ? '#22c55e' : s === 'disabled' ? '#ef4444' : s === 'blocked' ? '#f59e0b' : '#6b7280';

  const categories = [...new Set(services.map(s => s.category))].sort();
  const filtered = services.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && s.category !== filterCat) return false;
    if (filterStatus && s.platformStatus !== filterStatus) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading services...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Service Configuration</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Client: {clientId}</p>
        </div>
        <button onClick={loadData} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>↻</button>
      </div>

      {/* Summary + Coverage */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Total</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{summary.enabled}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Enabled</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{recommendations.length}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Recommended</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{summary.disabled}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Disabled</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: coverage?.overall?.coverage >= 50 ? '#22c55e' : '#f59e0b' }}>{coverage?.overall?.coverage || 0}%</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Coverage</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#6b7280' }}>{summary.notApplicable}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>Planned/N-A</div></div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: '#f59e0b', marginBottom: 8 }}>⚡ Recommended for This Client</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {recommendations.slice(0, 6).map(r => (
              <div key={r.serviceId} style={{ background: '#1e293b', borderRadius: 8, padding: 14, borderLeft: `3px solid ${r.priority === 'critical' ? '#ef4444' : r.priority === 'high' ? '#f59e0b' : '#3b82f6'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{r.serviceName}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: r.priority === 'critical' ? '#ef4444' : r.priority === 'high' ? '#f59e0b' : '#3b82f6', color: '#fff' }}>{r.priority}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{r.reason}</div>
                {r.evidence?.length > 0 && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Evidence: {r.evidence.slice(0, 2).join(', ')}</div>}
                <div style={{ fontSize: 10, color: '#38bdf8' }}>{r.businessValue}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bundle Recommendations */}
      {bundles.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: '#8b5cf6', marginBottom: 8 }}>📦 Recommended Bundles</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {bundles.slice(0, 3).map(b => (
              <div key={b.bundleId} style={{ background: '#1e293b', borderRadius: 8, padding: 12, flex: '1 1 250px', border: '1px solid #334155' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>{b.bundleName}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{b.description}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${b.coverage}%`, height: '100%', background: b.coverage >= 80 ? '#22c55e' : '#3b82f6', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{b.coverage}%</span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{b.enabledServices}/{b.totalServices} services enabled</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 12, width: 180 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 12 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 12 }}>
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="foundation">Foundation</option>
          <option value="planned">Planned</option>
          <option value="concept">Concept</option>
        </select>
      </div>

      {/* Service List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
        {filtered.map(s => (
          <div key={s.serviceId} onClick={() => setSelected(s)} style={{ background: '#1e293b', borderRadius: 8, padding: 14, cursor: 'pointer', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: sc(s.platformStatus), color: '#fff' }}>{s.platformStatus}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{s.category} • {s.domain}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>{s.description?.substring(0, 80)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: csc(s.clientStatus) }}>● {s.clientStatus}</span>
              {s.platformStatus === 'operational' && (
                <button onClick={(e) => { e.stopPropagation(); toggleService(s.serviceId, s.clientStatus !== 'enabled'); }}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', background: s.clientStatus === 'enabled' ? '#334155' : '#1e40af', color: s.clientStatus === 'enabled' ? '#94a3b8' : '#fff' }}>
                  {s.clientStatus === 'enabled' ? 'Disable' : 'Enable'}
                </button>
              )}
              {s.platformStatus === 'planned' && <span style={{ fontSize: 10, color: '#64748b' }}>Coming Soon</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#0f172a', borderLeft: '1px solid #334155', zIndex: 1000, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selected.name}</h2>
            <button onClick={() => setSelected(null)} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, background: sc(selected.platformStatus), color: '#fff' }}>{selected.platformStatus}</span>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, background: csc(selected.clientStatus), color: '#fff' }}>Client: {selected.clientStatus}</span>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, background: '#1e293b', color: '#94a3b8' }}>{selected.roadmapPhase}</span>
          </div>
          {selected.description && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b' }}>Description</div><div style={{ fontSize: 12, color: '#cbd5e1' }}>{selected.description}</div></div>}
          {selected.businessValue && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b' }}>Business Value</div><div style={{ fontSize: 12, color: '#cbd5e1' }}>{selected.businessValue}</div></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 11 }}>
            <div><span style={{ color: '#64748b' }}>Category:</span> <span>{selected.category}</span></div>
            <div><span style={{ color: '#64748b' }}>Domain:</span> <span>{selected.domain}</span></div>
            <div><span style={{ color: '#64748b' }}>Maturity:</span> <span>{selected.maturity}/5</span></div>
            <div><span style={{ color: '#64748b' }}>Required:</span> <span>{selected.required ? 'Yes' : 'No'}</span></div>
          </div>
          {selected.dependencies?.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Dependencies</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{selected.dependencies.map((d: string) => <span key={d} style={{ fontSize: 10, padding: '2px 6px', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>{d}</span>)}</div></div>}
        </div>
      )}
    </div>
  );
}
