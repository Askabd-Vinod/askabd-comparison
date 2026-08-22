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

const STATUS_BADGE: Record<string, string> = {
  operational: 'bg-green-100 text-green-700', available: 'bg-blue-100 text-blue-700', beta: 'bg-orange-100 text-orange-700',
  foundation: 'bg-purple-100 text-purple-700', planned: 'bg-gray-100 text-gray-600', deprecated: 'bg-red-100 text-red-700',
};
const PRIORITY_TEXT: Record<string, string> = {
  critical: 'text-red-500', high: 'text-orange-500', medium: 'text-blue-500', low: 'text-gray-400',
};
const PHASE_DOT: Record<string, string> = { current: 'bg-green-500', next: 'bg-orange-500', future: 'bg-gray-400' };

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-4 text-center"><p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-xs text-gray-500">{label}</p></div>;
}

function MaturityBar({ maturity }: { maturity: number }) {
  const pct = (maturity / 5) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 min-w-[60px]">{MATURITY_LABELS[maturity] || maturity}</span>
    </div>
  );
}

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

  const renderGrid = () => {
    const grouped = capabilities.reduce<Record<string, Capability[]>>((acc, c) => {
      acc[c.category] = acc[c.category] || [];
      acc[c.category].push(c);
      return acc;
    }, {});

    return Object.entries(grouped).map(([cat, caps]) => (
      <div key={cat} className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 pb-1.5 border-b">{cat} ({caps.length})</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {caps.map(cap => (
            <div key={cap.id} onClick={() => setSelectedCap(cap)} className="bg-white rounded-xl border p-3.5 cursor-pointer hover:border-purple-300 transition">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-semibold text-sm text-gray-900">{cap.name}</span>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${STATUS_BADGE[cap.status] || 'bg-gray-100 text-gray-600'}`}>{cap.status}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2 leading-relaxed">{cap.description?.substring(0, 100)}{(cap.description?.length || 0) > 100 ? '…' : ''}</p>
              <MaturityBar maturity={cap.maturity} />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{cap.domain}</span>
                <span className={`text-[10px] px-1.5 py-0.5 bg-gray-100 rounded ${PRIORITY_TEXT[cap.priority] || 'text-gray-400'}`}>⬤ {cap.priority}</span>
                {cap.knownGaps.length > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-50 rounded text-red-600">⚠ {cap.knownGaps.length} gaps</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  const renderRoadmap = () => {
    const phases = [
      { key: 'current', label: 'Current Phase' },
      { key: 'next', label: 'Next Phase' },
      { key: 'future', label: 'Future Phase' },
    ];
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {phases.map(phase => {
          const items = capabilities.filter(c => c.roadmapPhase === phase.key);
          return (
            <div key={phase.key} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${PHASE_DOT[phase.key]}`} />
                <span className="font-semibold text-sm text-gray-900">{phase.label}</span>
                <span className="text-[10px] text-gray-400">({items.length})</span>
              </div>
              <div className="space-y-1.5">
                {items.map(cap => (
                  <div key={cap.id} onClick={() => setSelectedCap(cap)} className={`bg-gray-50 rounded-md p-2 cursor-pointer border-l-4 ${cap.status === 'operational' ? 'border-green-400' : cap.status === 'foundation' ? 'border-purple-400' : 'border-gray-300'}`}>
                    <p className="text-xs font-medium text-gray-900">{cap.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{cap.category} • {MATURITY_LABELS[cap.maturity]}</p>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-gray-400 italic">No capabilities in this phase</p>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMaturity = () => {
    const sorted = [...capabilities].sort((a, b) => b.maturity - a.maturity);
    return (
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Capability</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5 w-48">Maturity</th>
                <th className="text-center px-4 py-2.5">Gaps</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(cap => (
                <tr key={cap.id} onClick={() => setSelectedCap(cap)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-900">{cap.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{cap.category}</td>
                  <td className="px-4 py-2.5"><span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${STATUS_BADGE[cap.status] || 'bg-gray-100 text-gray-600'}`}>{cap.status}</span></td>
                  <td className="px-4 py-2.5"><MaturityBar maturity={cap.maturity} /></td>
                  <td className={`px-4 py-2.5 text-center ${cap.knownGaps.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>{cap.knownGaps.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const renderDetail = () => {
    if (!selectedCap) return null;
    const cap = selectedCap;
    return (
      <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white border-l shadow-xl z-40 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{cap.name}</h2>
          <button onClick={() => setSelectedCap(null)} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">✕</button>
        </div>

        <div className="flex gap-1.5 mb-4 flex-wrap">
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md ${STATUS_BADGE[cap.status] || 'bg-gray-100 text-gray-600'}`}>{cap.status}</span>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md bg-gray-100 ${PRIORITY_TEXT[cap.priority] || 'text-gray-500'}`}>{cap.priority} priority</span>
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600">{cap.roadmapPhase} phase</span>
        </div>

        <div className="mb-4">
          <p className="text-[10px] text-gray-400 mb-1">Maturity</p>
          <MaturityBar maturity={cap.maturity} />
        </div>

        {cap.description && <div className="mb-4"><p className="text-[10px] text-gray-400 mb-1">Description</p><p className="text-xs text-gray-700 leading-relaxed">{cap.description}</p></div>}
        {cap.businessProblem && <div className="mb-4"><p className="text-[10px] text-gray-400 mb-1">Problem Solved</p><p className="text-xs text-gray-700 leading-relaxed">{cap.businessProblem}</p></div>}
        {cap.businessValue && <div className="mb-4"><p className="text-[10px] text-gray-400 mb-1">Business Value</p><p className="text-xs text-gray-700 leading-relaxed">{cap.businessValue}</p></div>}

        <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div><p className="text-[10px] text-gray-400">Category</p><p className="text-gray-800">{cap.category}</p></div>
          <div><p className="text-[10px] text-gray-400">Domain</p><p className="text-gray-800">{cap.domain}</p></div>
          <div><p className="text-[10px] text-gray-400">Owner</p><p className="text-gray-800">{cap.owner || 'Unassigned'}</p></div>
          <div><p className="text-[10px] text-gray-400">Phase</p><p className="text-gray-800">{cap.roadmapPhase}</p></div>
        </div>

        {cap.dependencies.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-400 mb-1.5">Dependencies</p>
            <div className="flex gap-1 flex-wrap">{cap.dependencies.map(d => <span key={d} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600">{d}</span>)}</div>
          </div>
        )}

        {cap.relatedApis.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-400 mb-1.5">API Endpoints</p>
            <div className="flex flex-col gap-0.5">{cap.relatedApis.map(a => <code key={a} className="text-[11px] px-1.5 py-0.5 bg-gray-100 rounded text-blue-600">{a}</code>)}</div>
          </div>
        )}

        {cap.evidence.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-400 mb-1.5">Evidence</p>
            <ul className="list-disc pl-4 space-y-1">{cap.evidence.map((e, i) => <li key={i} className="text-xs text-gray-600">{e}</li>)}</ul>
          </div>
        )}

        {cap.knownGaps.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-red-500 mb-1.5">Known Gaps</p>
            <ul className="list-disc pl-4 space-y-1">{cap.knownGaps.map((g, i) => <li key={i} className="text-xs text-red-500">{g}</li>)}</ul>
          </div>
        )}

        {cap.limitations.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-orange-500 mb-1.5">Planned Enhancements</p>
            <ul className="list-disc pl-4 space-y-1">{cap.limitations.map((l, i) => <li key={i} className="text-xs text-orange-600">{l}</li>)}</ul>
          </div>
        )}

        {cap.externalDependencies.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-400 mb-1.5">External Dependencies</p>
            <div className="flex gap-1 flex-wrap">{cap.externalDependencies.map(d => <span key={d} className="text-[10px] px-2 py-0.5 bg-orange-50 rounded text-orange-600">{d}</span>)}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Platform Capability Registry</h1>
          <p className="text-xs text-gray-500 mt-0.5">AskABD platform capabilities, maturity tracking, and roadmap</p>
        </div>
        <button onClick={loadData} className="bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg px-4 py-2 transition">↻ Refresh</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">Error: {error}</div>}
      {loading && <p className="text-xs text-gray-500 text-center py-10">Loading capabilities…</p>}

      {!loading && (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              <Stat label="Total Capabilities" value={summary.total} />
              <Stat label="Operational" value={summary.operational} color="text-green-600" />
              <Stat label="Foundation" value={summary.foundation} color="text-purple-600" />
              <Stat label="Planned" value={summary.planned} />
              <Stat label="Avg Maturity" value={summary.avgMaturity.toFixed(1)} color="text-orange-600" />
            </div>
          )}

          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500">
              <option value="">All Statuses</option>
              <option value="operational">Operational</option>
              <option value="foundation">Foundation</option>
              <option value="planned">Planned</option>
              <option value="beta">Beta</option>
            </select>
            <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500">
              <option value="">All Phases</option>
              <option value="current">Current</option>
              <option value="next">Next</option>
              <option value="future">Future</option>
            </select>
            <div className="ml-auto flex gap-1">
              {(['grid', 'roadmap', 'maturity'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${view === v ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600 hover:border-gray-400'}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {view === 'grid' && renderGrid()}
          {view === 'roadmap' && renderRoadmap()}
          {view === 'maturity' && renderMaturity()}
        </>
      )}

      {renderDetail()}
    </div>
  );
}
