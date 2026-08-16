'use client';

import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Capability {
  id: string;
  name: string;
  description?: string;
  category: string;
  domain: string;
  businessProblem?: string;
  businessValue?: string;
  maturity: number;
  status: string;
  dependencies: string[];
  relatedServices: string[];
  relatedApis: string[];
  knownGaps: string[];
  evidence: string[];
  limitations: string[];
  roadmapPhase: string;
  priority: string;
  owner?: string;
  externalDependencies: string[];
}

interface Summary {
  total: number;
  operational: number;
  available: number;
  beta: number;
  foundation: number;
  planned: number;
  avgMaturity: number;
  byCategory: Record<string, number>;
  byDomain: Record<string, number>;
  byRoadmapPhase: Record<string, number>;
  criticalGaps: string[];
}

const MATURITY_LABELS: Record<number, string> = {
  0: 'Planned', 1: 'Foundation', 2: 'Basic', 3: 'Functional', 4: 'Mature', 5: 'Optimized',
};

const STATUS_COLORS: Record<string, string> = {
  operational: '#22c55e',
  available: '#3b82f6',
  beta: '#f59e0b',
  foundation: '#8b5cf6',
  planned: '#6b7280',
  deprecated: '#ef4444',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#6b7280',
};

export default function CapabilitiesPage() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCap, setSelectedCap] = useState<Capability | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPhase, setFilterPhase] = useState<string>('');
  const [view, setView] = useState<'grid' | 'roadmap' | 'maturity'>('grid');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPhase) params.set('roadmapPhase', filterPhase);

      const [capRes, sumRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/capabilities?${params}`),
        fetch(`${API}/api/v1/oc/capabilities/summary`),
      ]);

      if (capRes.ok) {
        const capData = await capRes.json();
        setCapabilities(capData.capabilities || []);
      }
      if (sumRes.ok) {
        setSummary(await sumRes.json());
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStatus, filterPhase]);

  useEffect(() => { loadData(); }, [loadData]);

  const categories = [...new Set(capabilities.map(c => c.category))].sort();
  const maturityBar = (maturity: number) => {
    const pct = (maturity / 5) * 100;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 70 }}>{MATURITY_LABELS[maturity] || maturity}</span>
      </div>
    );
  };

  const renderSummary = () => {
    if (!summary) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{summary.total}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Total Capabilities</div>
        </div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{summary.operational}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Operational</div>
        </div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{summary.foundation}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Foundation</div>
        </div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#6b7280' }}>{summary.planned}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Planned</div>
        </div>
        <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{summary.avgMaturity.toFixed(1)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Avg Maturity</div>
        </div>
      </div>
    );
  };

  const renderFilters = () => (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
        <option value="">All Categories</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
        <option value="">All Statuses</option>
        <option value="operational">Operational</option>
        <option value="foundation">Foundation</option>
        <option value="planned">Planned</option>
        <option value="beta">Beta</option>
      </select>
      <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={{ background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
        <option value="">All Phases</option>
        <option value="current">Current</option>
        <option value="next">Next</option>
        <option value="future">Future</option>
      </select>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        {(['grid', 'roadmap', 'maturity'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: view === v ? '#3b82f6' : '#1e293b', color: view === v ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );

  const renderGrid = () => {
    const grouped = capabilities.reduce<Record<string, Capability[]>>((acc, c) => {
      acc[c.category] = acc[c.category] || [];
      acc[c.category].push(c);
      return acc;
    }, {});

    return Object.entries(grouped).map(([cat, caps]) => (
      <div key={cat} style={{ marginBottom: 24 }}>
        <h3 style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 6 }}>{cat} ({caps.length})</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {caps.map(cap => (
            <div key={cap.id} onClick={() => setSelectedCap(cap)} style={{ background: '#1e293b', borderRadius: 8, padding: 14, cursor: 'pointer', border: '1px solid #334155', transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{cap.name}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: STATUS_COLORS[cap.status] || '#6b7280', color: '#fff', fontWeight: 500 }}>{cap.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>{cap.description?.substring(0, 100)}{(cap.description?.length || 0) > 100 ? '...' : ''}</div>
              {maturityBar(cap.maturity)}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, padding: '2px 6px', background: '#0f172a', borderRadius: 4, color: '#64748b' }}>{cap.domain}</span>
                <span style={{ fontSize: 10, padding: '2px 6px', background: '#0f172a', borderRadius: 4, color: PRIORITY_COLORS[cap.priority] || '#64748b' }}>⬤ {cap.priority}</span>
                {cap.knownGaps.length > 0 && <span style={{ fontSize: 10, padding: '2px 6px', background: '#7f1d1d', borderRadius: 4, color: '#fca5a5' }}>⚠ {cap.knownGaps.length} gaps</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  const renderRoadmap = () => {
    const phases = [
      { key: 'current', label: 'Current Phase', color: '#22c55e' },
      { key: 'next', label: 'Next Phase', color: '#f59e0b' },
      { key: 'future', label: 'Future Phase', color: '#6b7280' },
    ];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {phases.map(phase => {
          const items = capabilities.filter(c => c.roadmapPhase === phase.key);
          return (
            <div key={phase.key} style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: phase.color }} />
                <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{phase.label}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>({items.length})</span>
              </div>
              {items.map(cap => (
                <div key={cap.id} onClick={() => setSelectedCap(cap)} style={{ padding: '8px 10px', background: '#0f172a', borderRadius: 6, marginBottom: 6, cursor: 'pointer', borderLeft: `3px solid ${STATUS_COLORS[cap.status] || '#6b7280'}` }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#f1f5f9' }}>{cap.name}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{cap.category} • {MATURITY_LABELS[cap.maturity]}</div>
                </div>
              ))}
              {items.length === 0 && <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>No capabilities in this phase</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderMaturity = () => {
    const sorted = [...capabilities].sort((a, b) => b.maturity - a.maturity);
    return (
      <div style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500 }}>Capability</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500 }}>Category</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', fontWeight: 500, width: 200 }}>Maturity</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8', fontWeight: 500 }}>Gaps</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(cap => (
              <tr key={cap.id} onClick={() => setSelectedCap(cap)} style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}>
                <td style={{ padding: '8px 12px', color: '#f1f5f9' }}>{cap.name}</td>
                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{cap.category}</td>
                <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: STATUS_COLORS[cap.status], color: '#fff' }}>{cap.status}</span></td>
                <td style={{ padding: '8px 12px' }}>{maturityBar(cap.maturity)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: cap.knownGaps.length > 0 ? '#fca5a5' : '#64748b' }}>{cap.knownGaps.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedCap) return null;
    const cap = selectedCap;
    return (
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: '#0f172a', borderLeft: '1px solid #334155', zIndex: 1000, overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>{cap.name}</h2>
          <button onClick={() => setSelectedCap(null)} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: STATUS_COLORS[cap.status], color: '#fff' }}>{cap.status}</span>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#1e293b', color: PRIORITY_COLORS[cap.priority] }}>{cap.priority} priority</span>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#1e293b', color: '#94a3b8' }}>{cap.roadmapPhase} phase</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Maturity</div>
          {maturityBar(cap.maturity)}
        </div>

        {cap.description && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Description</div><div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>{cap.description}</div></div>}
        {cap.businessProblem && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Problem Solved</div><div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>{cap.businessProblem}</div></div>}
        {cap.businessValue && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Business Value</div><div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>{cap.businessValue}</div></div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><div style={{ fontSize: 12, color: '#64748b' }}>Category</div><div style={{ fontSize: 13, color: '#f1f5f9' }}>{cap.category}</div></div>
          <div><div style={{ fontSize: 12, color: '#64748b' }}>Domain</div><div style={{ fontSize: 13, color: '#f1f5f9' }}>{cap.domain}</div></div>
          <div><div style={{ fontSize: 12, color: '#64748b' }}>Owner</div><div style={{ fontSize: 13, color: '#f1f5f9' }}>{cap.owner || 'Unassigned'}</div></div>
          <div><div style={{ fontSize: 12, color: '#64748b' }}>Phase</div><div style={{ fontSize: 13, color: '#f1f5f9' }}>{cap.roadmapPhase}</div></div>
        </div>

        {cap.dependencies.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Dependencies</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {cap.dependencies.map(d => <span key={d} style={{ fontSize: 11, padding: '2px 8px', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>{d}</span>)}
            </div>
          </div>
        )}

        {cap.relatedApis.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>API Endpoints</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {cap.relatedApis.map(a => <code key={a} style={{ fontSize: 11, padding: '2px 6px', background: '#1e293b', borderRadius: 4, color: '#38bdf8' }}>{a}</code>)}
            </div>
          </div>
        )}

        {cap.evidence.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Evidence</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {cap.evidence.map((e, i) => <li key={i} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{e}</li>)}
            </ul>
          </div>
        )}

        {cap.knownGaps.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 6 }}>Known Gaps</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {cap.knownGaps.map((g, i) => <li key={i} style={{ fontSize: 12, color: '#fca5a5', marginBottom: 4 }}>{g}</li>)}
            </ul>
          </div>
        )}

        {cap.limitations.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 6 }}>Planned Enhancements</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {cap.limitations.map((l, i) => <li key={i} style={{ fontSize: 12, color: '#fbbf24', marginBottom: 4 }}>{l}</li>)}
            </ul>
          </div>
        )}

        {cap.externalDependencies.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>External Dependencies</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {cap.externalDependencies.map(d => <span key={d} style={{ fontSize: 11, padding: '2px 8px', background: '#1e293b', borderRadius: 4, color: '#fb923c' }}>{d}</span>)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Platform Capability Registry</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>AskABD platform capabilities, maturity tracking, and roadmap</p>
        </div>
        <button onClick={loadData} style={{ background: '#1e40af', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
      </div>

      {error && <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 8, marginBottom: 16, color: '#fca5a5', fontSize: 13 }}>Error: {error}</div>}
      {loading && <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Loading capabilities...</div>}

      {!loading && (
        <>
          {renderSummary()}
          {renderFilters()}
          {view === 'grid' && renderGrid()}
          {view === 'roadmap' && renderRoadmap()}
          {view === 'maturity' && renderMaturity()}
        </>
      )}

      {renderDetail()}
    </div>
  );
}
