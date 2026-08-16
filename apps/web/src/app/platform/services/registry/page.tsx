'use client';
import { useEffect, useState, useCallback } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ServiceRegistryPage() {
  const [services, setServices] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [bundles, setBundles] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [selectedBundle, setSelectedBundle] = useState<any>(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, sumRes, bRes] = await Promise.all([
        fetch(`${API}/platform/services/registry`),
        fetch(`${API}/platform/services/registry/summary`),
        fetch(`${API}/api/v1/oc/service-bundles`).catch(() => null),
      ]);
      if (sRes.ok) setServices((await sRes.json()).services || []);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (bRes?.ok) setBundles((await bRes.json()).bundles || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const hc = (h: string) => h === 'healthy' ? '#22c55e' : h === 'partial' ? '#f59e0b' : '#6b7280';
  const sc = (s: string) => s === 'operational' ? '#22c55e' : s === 'foundation' ? '#8b5cf6' : s === 'planned' ? '#6b7280' : '#3b82f6';

  const filtered = services.filter(s => {
    if (filterCat && s.category !== filterCat) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = [...new Set(services.map(s => s.category))].sort();

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading service registry...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Platform Service Registry</h1><p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Complete catalog of AskABD platform services</p></div>
        <button onClick={loadData} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>↻</button>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{summary.total}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Services</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{summary.operational}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Operational</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#8b5cf6' }}>{summary.foundation}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Foundation</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#6b7280' }}>{summary.planned}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Planned</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{summary.avgMaturity.toFixed(1)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Avg Maturity</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{summary.withGaps}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>With Gaps</div></div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services..." style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 13, width: 200 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 13 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#f1f5f9', fontSize: 13 }}>
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="foundation">Foundation</option>
          <option value="planned">Planned</option>
        </select>
      </div>

      {/* Service Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {filtered.map(s => (
          <div key={s.id} onClick={() => setSelected(s)} style={{ background: '#1e293b', borderRadius: 8, padding: 14, cursor: 'pointer', border: '1px solid #334155', transition: 'border-color 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{s.name}</span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: sc(s.status), color: '#fff' }}>{s.status}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{s.category}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>{s.description?.substring(0, 90)}{(s.description?.length || 0) > 90 ? '...' : ''}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hc(s.health) }} />
              <span style={{ color: '#64748b' }}>Maturity: {s.maturityLabel}</span>
              {s.apiAvailable && <span style={{ padding: '1px 5px', background: '#0f172a', borderRadius: 4, color: '#38bdf8' }}>API</span>}
              {s.uiAvailable && <span style={{ padding: '1px 5px', background: '#0f172a', borderRadius: 4, color: '#a78bfa' }}>UI</span>}
              {s.knownGaps.length > 0 && <span style={{ padding: '1px 5px', background: '#7f1d1d', borderRadius: 4, color: '#fca5a5' }}>{s.knownGaps.length} gaps</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Service Bundles */}
      {bundles.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>AskABD Service Bundles</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {bundles.map((b: any) => {
              const opCount = (b.serviceIds || []).filter((sid: string) => services.find(s => s.id === sid && s.status === 'operational')).length;
              const plannedCount = (b.serviceIds || []).length - opCount;
              return (
                <div key={b.id} onClick={() => setSelectedBundle(selectedBundle?.id === b.id ? null : b)} style={{ background: '#1e293b', borderRadius: 8, padding: 14, cursor: 'pointer', border: selectedBundle?.id === b.id ? '1px solid #3b82f6' : '1px solid #334155' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>{b.description}</div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#64748b' }}>
                    <span>{(b.serviceIds || []).length} services</span>
                    <span style={{ color: '#22c55e' }}>{opCount} operational</span>
                    {plannedCount > 0 && <span style={{ color: '#f59e0b' }}>{plannedCount} future</span>}
                  </div>
                  {b.businessValue && <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 6 }}>{b.businessValue}</div>}
                </div>
              );
            })}
          </div>
          {selectedBundle && (
            <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginTop: 12, border: '1px solid #334155' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>{selectedBundle.name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>{selectedBundle.description}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Included Services:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {(selectedBundle.serviceIds || []).map((sid: string) => {
                  const svc = services.find(s => s.id === sid);
                  return (
                    <div key={sid} style={{ fontSize: 11, padding: '4px 8px', background: '#0f172a', borderRadius: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#cbd5e1' }}>{svc?.name || sid}</span>
                      <span style={{ color: svc?.status === 'operational' ? '#22c55e' : svc?.status === 'planned' ? '#6b7280' : '#f59e0b', fontSize: 9 }}>{svc?.status || 'unknown'}</span>
                    </div>
                  );
                })}
              </div>
              {(selectedBundle.serviceIds || []).some((sid: string) => { const s = services.find(sv => sv.id === sid); return s && s.status !== 'operational'; }) && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#f59e0b' }}>⚠ Contains future capabilities not yet operational</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roadmap */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Service Roadmap</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[{ label: 'Available Now', status: 'operational', color: '#22c55e' }, { label: 'Foundation', status: 'foundation', color: '#8b5cf6' }, { label: 'Coming Next', status: 'planned', color: '#3b82f6' }, { label: 'Future', status: 'concept', color: '#6b7280' }].map(phase => {
            const phaseServices = services.filter(s => s.status === phase.status);
            return (
              <div key={phase.status} style={{ background: '#1e293b', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{phase.label}</span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>({phaseServices.length})</span>
                </div>
                {phaseServices.slice(0, 8).map(s => (
                  <div key={s.id} style={{ fontSize: 10, color: '#94a3b8', padding: '2px 0' }}>{s.name}</div>
                ))}
                {phaseServices.length > 8 && <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>+{phaseServices.length - 8} more</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: '#0f172a', borderLeft: '1px solid #334155', zIndex: 1000, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selected.name}</h2>
            <button onClick={() => setSelected(null)} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: sc(selected.status), color: '#fff' }}>{selected.status}</span>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#1e293b', color: '#94a3b8' }}>{selected.maturityLabel}</span>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#1e293b', color: hc(selected.health) }}>{selected.health}</span>
          </div>

          {selected.businessPurpose && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b' }}>Business Purpose</div><div style={{ fontSize: 13, color: '#cbd5e1' }}>{selected.businessPurpose}</div></div>}

          {selected.problemsSolved.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Problems Solved</div>{selected.problemsSolved.map((p: string, i: number) => <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0' }}>• {p}</div>)}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 12 }}>
            <div><span style={{ color: '#64748b' }}>Owner:</span> <span style={{ color: '#f1f5f9' }}>{selected.owner}</span></div>
            <div><span style={{ color: '#64748b' }}>Phase:</span> <span style={{ color: '#f1f5f9' }}>{selected.roadmapPhase}</span></div>
            <div><span style={{ color: '#64748b' }}>Automation:</span> <span style={{ color: '#f1f5f9' }}>{selected.automationStatus}</span></div>
            <div><span style={{ color: '#64748b' }}>Security:</span> <span style={{ color: '#f1f5f9' }}>{selected.securityStatus}</span></div>
          </div>

          {selected.dependencies.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Dependencies</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{selected.dependencies.map((d: string) => <span key={d} style={{ fontSize: 10, padding: '2px 8px', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>{d}</span>)}</div></div>}

          {selected.consumers.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Consumers</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{selected.consumers.map((c: string) => <span key={c} style={{ fontSize: 10, padding: '2px 8px', background: '#1e293b', borderRadius: 4, color: '#38bdf8' }}>{c}</span>)}</div></div>}

          {selected.apiEndpoints.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>API Endpoints</div>{selected.apiEndpoints.slice(0, 5).map((e: string) => <code key={e} style={{ display: 'block', fontSize: 11, padding: '2px 6px', color: '#38bdf8' }}>{e}</code>)}</div>}

          {selected.evidence.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Evidence</div>{selected.evidence.slice(0, 5).map((e: string, i: number) => <div key={i} style={{ fontSize: 11, color: '#94a3b8', padding: '2px 0' }}>✓ {e}</div>)}</div>}

          {selected.knownGaps.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 4 }}>Known Gaps</div>{selected.knownGaps.map((g: string, i: number) => <div key={i} style={{ fontSize: 11, color: '#fca5a5', padding: '2px 0' }}>⚠ {g}</div>)}</div>}

          {selected.dataTables.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Data Tables</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{selected.dataTables.map((t: string) => <code key={t} style={{ fontSize: 10, padding: '2px 6px', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>{t}</code>)}</div></div>}
        </div>
      )}
    </div>
  );
}
