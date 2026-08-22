'use client';
import { useEffect, useState, useCallback } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_BADGE: Record<string, string> = {
  operational: 'bg-green-100 text-green-700', foundation: 'bg-purple-100 text-purple-700',
  planned: 'bg-gray-100 text-gray-600', concept: 'bg-blue-100 text-blue-700',
};
const HEALTH_DOT: Record<string, string> = { healthy: 'bg-green-500', partial: 'bg-orange-500' };

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}

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

  const filtered = services.filter(s => {
    if (filterCat && s.category !== filterCat) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = [...new Set(services.map(s => s.category))].sort();

  if (loading) return <div className="max-w-[1600px] mx-auto px-4 py-6"><p className="text-xs text-gray-500 text-center py-10">Loading service registry…</p></div>;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Platform Service Registry</h1>
          <p className="text-xs text-gray-500 mt-0.5">Complete catalog of AskABD platform services</p>
        </div>
        <button onClick={loadData} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">↻</button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Stat label="Total Services" value={summary.total} />
          <Stat label="Operational" value={summary.operational} color="text-green-600" />
          <Stat label="Foundation" value={summary.foundation} color="text-purple-600" />
          <Stat label="Planned" value={summary.planned} />
          <Stat label="Avg Maturity" value={summary.avgMaturity.toFixed(1)} color="text-orange-600" />
          <Stat label="With Gaps" value={summary.withGaps} color="text-red-600" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services…" className="border rounded-lg px-2.5 py-1.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500">
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="foundation">Foundation</option>
          <option value="planned">Planned</option>
        </select>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(s => (
          <div key={s.id} onClick={() => setSelected(s)} className="bg-white rounded-xl border p-3.5 cursor-pointer hover:border-purple-300 transition">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="font-semibold text-sm text-gray-900">{s.name}</span>
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1.5">{s.category}</p>
            <p className="text-xs text-gray-500 mb-2 leading-relaxed">{s.description?.substring(0, 90)}{(s.description?.length || 0) > 90 ? '…' : ''}</p>
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[s.health] || 'bg-gray-300'}`} />
              <span className="text-gray-400">Maturity: {s.maturityLabel}</span>
              {s.apiAvailable && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">API</span>}
              {s.uiAvailable && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">UI</span>}
              {s.knownGaps.length > 0 && <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded">{s.knownGaps.length} gaps</span>}
            </div>
          </div>
        ))}
      </div>

      {bundles.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">AskABD Service Bundles</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bundles.map((b: any) => {
              const opCount = (b.serviceIds || []).filter((sid: string) => services.find(s => s.id === sid && s.status === 'operational')).length;
              const plannedCount = (b.serviceIds || []).length - opCount;
              return (
                <div key={b.id} onClick={() => setSelectedBundle(selectedBundle?.id === b.id ? null : b)} className={`bg-white rounded-xl border p-3.5 cursor-pointer transition ${selectedBundle?.id === b.id ? 'border-purple-400 ring-1 ring-purple-200' : 'hover:border-gray-300'}`}>
                  <p className="font-semibold text-sm text-gray-900 mb-1">{b.name}</p>
                  <p className="text-xs text-gray-500 mb-2 leading-relaxed">{b.description}</p>
                  <div className="flex gap-2 text-[10px] text-gray-400 flex-wrap">
                    <span>{(b.serviceIds || []).length} services</span>
                    <span className="text-green-600">{opCount} operational</span>
                    {plannedCount > 0 && <span className="text-orange-600">{plannedCount} future</span>}
                  </div>
                  {b.businessValue && <p className="text-[10px] text-blue-600 mt-1.5">{b.businessValue}</p>}
                </div>
              );
            })}
          </div>
          {selectedBundle && (
            <div className="bg-white rounded-xl border p-4 mt-3">
              <p className="text-sm font-semibold text-gray-900 mb-1.5">{selectedBundle.name}</p>
              <p className="text-xs text-gray-500 mb-3">{selectedBundle.description}</p>
              <p className="text-[10px] text-gray-400 mb-2">Included Services:</p>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {(selectedBundle.serviceIds || []).map((sid: string) => {
                  const svc = services.find(s => s.id === sid);
                  return (
                    <div key={sid} className="flex justify-between text-[11px] bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-700">{svc?.name || sid}</span>
                      <span className={svc?.status === 'operational' ? 'text-green-600' : svc?.status === 'planned' ? 'text-gray-400' : 'text-orange-600'}>{svc?.status || 'unknown'}</span>
                    </div>
                  );
                })}
              </div>
              {(selectedBundle.serviceIds || []).some((sid: string) => { const s = services.find(sv => sv.id === sid); return s && s.status !== 'operational'; }) && (
                <p className="mt-2 text-[10px] text-orange-600">⚠ Contains future capabilities not yet operational</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">Service Roadmap</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[{ label: 'Available Now', status: 'operational', dot: 'bg-green-500' }, { label: 'Foundation', status: 'foundation', dot: 'bg-purple-500' }, { label: 'Coming Next', status: 'planned', dot: 'bg-blue-500' }, { label: 'Future', status: 'concept', dot: 'bg-gray-400' }].map(phase => {
            const phaseServices = services.filter(s => s.status === phase.status);
            return (
              <div key={phase.status} className="bg-white rounded-xl border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`w-2 h-2 rounded-full ${phase.dot}`} />
                  <span className="text-xs font-semibold text-gray-900">{phase.label}</span>
                  <span className="text-[10px] text-gray-400">({phaseServices.length})</span>
                </div>
                {phaseServices.slice(0, 8).map(s => (
                  <p key={s.id} className="text-[10px] text-gray-500 py-0.5">{s.name}</p>
                ))}
                {phaseServices.length > 8 && <p className="text-[10px] text-gray-400 mt-1">+{phaseServices.length - 8} more</p>}
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white border-l shadow-xl z-40 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">✕</button>
          </div>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md ${STATUS_BADGE[selected.status] || 'bg-gray-100 text-gray-600'}`}>{selected.status}</span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600">{selected.maturityLabel}</span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 capitalize">{selected.health}</span>
          </div>

          {selected.businessPurpose && <div className="mb-3"><p className="text-[10px] text-gray-400">Business Purpose</p><p className="text-xs text-gray-700">{selected.businessPurpose}</p></div>}

          {selected.problemsSolved.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1">Problems Solved</p>
              {selected.problemsSolved.map((p: string, i: number) => <p key={i} className="text-xs text-gray-600 py-0.5">• {p}</p>)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div><span className="text-gray-400">Owner:</span> <span className="text-gray-800">{selected.owner}</span></div>
            <div><span className="text-gray-400">Phase:</span> <span className="text-gray-800">{selected.roadmapPhase}</span></div>
            <div><span className="text-gray-400">Automation:</span> <span className="text-gray-800">{selected.automationStatus}</span></div>
            <div><span className="text-gray-400">Security:</span> <span className="text-gray-800">{selected.securityStatus}</span></div>
          </div>

          {selected.dependencies.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1">Dependencies</p>
              <div className="flex gap-1 flex-wrap">{selected.dependencies.map((d: string) => <span key={d} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600">{d}</span>)}</div>
            </div>
          )}

          {selected.consumers.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1">Consumers</p>
              <div className="flex gap-1 flex-wrap">{selected.consumers.map((c: string) => <span key={c} className="text-[10px] px-2 py-0.5 bg-blue-50 rounded text-blue-600">{c}</span>)}</div>
            </div>
          )}

          {selected.apiEndpoints.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1">API Endpoints</p>
              {selected.apiEndpoints.slice(0, 5).map((e: string) => <code key={e} className="block text-[11px] px-1.5 py-0.5 text-blue-600">{e}</code>)}
            </div>
          )}

          {selected.evidence.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1">Evidence</p>
              {selected.evidence.slice(0, 5).map((e: string, i: number) => <p key={i} className="text-xs text-gray-600 py-0.5">✓ {e}</p>)}
            </div>
          )}

          {selected.knownGaps.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-red-500 mb-1">Known Gaps</p>
              {selected.knownGaps.map((g: string, i: number) => <p key={i} className="text-xs text-red-500 py-0.5">⚠ {g}</p>)}
            </div>
          )}

          {selected.dataTables.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-gray-400 mb-1">Data Tables</p>
              <div className="flex gap-1 flex-wrap">{selected.dataTables.map((t: string) => <code key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{t}</code>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
