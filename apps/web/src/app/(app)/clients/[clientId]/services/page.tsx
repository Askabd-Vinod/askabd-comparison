'use client';
import { useEffect, useState, useCallback, useId } from 'react';
import { useParams } from 'next/navigation';
import { getStaffSession } from '../../../../lib/staff-session';
import { Action } from '../../../../components/button';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/** Local status vocabulary — distinct from EvidenceStatus (evidence-status.tsx),
 * which describes verified/tested connections, not catalog/enablement state. */
const PLATFORM_STATUS_CLASS: Record<string, string> = {
  operational: 'text-green-700 bg-green-50 border-green-200',
  foundation: 'text-purple-700 bg-purple-50 border-purple-200',
  planned: 'text-gray-500 bg-gray-50 border-gray-200',
  concept: 'text-slate-500 bg-slate-50 border-slate-200',
};
const CLIENT_STATUS_CLASS: Record<string, string> = {
  enabled: 'text-green-700 bg-green-50 border-green-200',
  disabled: 'text-red-700 bg-red-50 border-red-200',
  blocked: 'text-orange-700 bg-orange-50 border-orange-200',
  not_confirmed: 'text-orange-700 bg-orange-50 border-orange-200',
  proposed: 'text-blue-700 bg-blue-50 border-blue-200',
  not_applicable: 'text-gray-500 bg-gray-50 border-gray-200',
};
const CLIENT_STATUS_LABEL: Record<string, string> = {
  enabled: 'confirmed', not_confirmed: 'not yet confirmed', proposed: 'proposed — from commercial engagement',
  not_applicable: 'not applicable', disabled: 'disabled', blocked: 'blocked',
};
function Pill({ text, className }: { text: string; className: string }) {
  return <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${className}`}>{text}</span>;
}

function ServiceRow({ s, onToggle, onConfirm }: { s: any; onToggle: (id: string, enable: boolean) => void; onConfirm: (s: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{s.name}</span>
            <Pill text={s.platformStatus} className={PLATFORM_STATUS_CLASS[s.platformStatus] || 'text-gray-500 bg-gray-50 border-gray-200'} />
          </div>
          <p className="text-[9px] text-gray-500 mt-0.5">{s.category} • {s.domain}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill text={CLIENT_STATUS_LABEL[s.clientStatus] || s.clientStatus} className={CLIENT_STATUS_CLASS[s.clientStatus] || 'text-gray-500 bg-gray-50 border-gray-200'} />
          {s.platformStatus === 'operational' && s.clientStatus === 'proposed' && (
            <Action variant="primary" onClick={() => onConfirm(s)} className="!text-[10px] !px-2.5 !py-1">Confirm</Action>
          )}
          {s.platformStatus === 'operational' && s.clientStatus !== 'proposed' && (
            <Action variant={s.clientStatus === 'enabled' ? 'secondary' : 'primary'} onClick={() => onToggle(s.serviceId, s.clientStatus !== 'enabled')} className="!text-[10px] !px-2.5 !py-1">
              {s.clientStatus === 'enabled' ? 'Disable' : 'Enable'}
            </Action>
          )}
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3 text-xs">
          {s.clientStatus === 'proposed' && s.proposalSource && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-blue-800">Source: Commercial Engagement</p>
              <p className="text-[10px] text-blue-700 mt-0.5">{s.proposalSource.engagementName} (status: {s.proposalSource.engagementStatus})</p>
            </div>
          )}
          {s.clientStatus === 'enabled' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-green-800">Confirmed</p>
              {s.enabledBy && <p className="text-[10px] text-green-700 mt-0.5">Confirmed by: {s.enabledBy}</p>}
              {s.enabledAt && <p className="text-[10px] text-green-700 mt-0.5">Confirmed: {new Date(s.enabledAt).toLocaleString('en-AU')}</p>}
              <p className="text-[10px] text-green-700 mt-0.5">Source: {s.proposalSource ? 'Commercial Engagement' : 'Manual Confirmation'}</p>
            </div>
          )}
          {s.description && <div><p className="text-[10px] text-gray-500 uppercase tracking-wide">Description</p><p className="text-gray-700 mt-0.5">{s.description}</p></div>}
          {s.businessValue && <div><p className="text-[10px] text-gray-500 uppercase tracking-wide">Business Value</p><p className="text-gray-700 mt-0.5">{s.businessValue}</p></div>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><span className="text-gray-400">Category:</span> <span className="text-gray-700 font-medium">{s.category}</span></div>
            <div><span className="text-gray-400">Domain:</span> <span className="text-gray-700 font-medium">{s.domain}</span></div>
            <div><span className="text-gray-400">Maturity:</span> <span className="text-gray-700 font-medium">{s.maturity}/5</span></div>
            <div><span className="text-gray-400">Required:</span> <span className="text-gray-700 font-medium">{s.required ? 'Yes' : 'No'}</span></div>
          </div>
          {s.dependencies?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Depends on other capabilities</p>
              <div className="flex gap-1 flex-wrap">{s.dependencies.map((d: string) => <span key={d} className="text-[10px] px-2 py-0.5 bg-white border rounded text-gray-600">{d}</span>)}</div>
            </div>
          )}
          {s.externalDependencies?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">What we'll need from you if enabled</p>
              <div className="flex flex-col gap-1">{s.externalDependencies.map((d: string) => <span key={d} className="text-[11px] px-2 py-1 bg-white border-l-2 border-orange-300 rounded text-gray-700">{d}</span>)}</div>
              <p className="text-[10px] text-gray-400 mt-1">Enabling this service will add relevant connectors to this client's Connectors page.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

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

  const toggleService = async (serviceId: string, enable: boolean, reason?: string) => {
    const url = `${API}/api/v1/oc/clients/${clientId}/services/${serviceId}/${enable ? 'enable' : 'disable'}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: getStaffSession()?.identityId || 'unknown-staff', reason }) });
    const result = await r.json();
    if (!r.ok) { alert(result.message || result.error || 'Operation failed'); }
    loadData();
  };

  // Confirming a proposal reuses the exact same enable action — the reason records where
  // the confirmation came from (Path A: commercial engagement) for the audit trail.
  const confirmProposal = (s: any) => toggleService(s.serviceId, true, `Confirmed from commercial engagement ${s.proposalSource?.engagementName || s.proposalSource?.engagementId}`);

  const categories = [...new Set(services.map(s => s.category))].sort();
  const filtered = services.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && s.category !== filterCat) return false;
    if (filterStatus && s.platformStatus !== filterStatus) return false;
    return true;
  });

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading services…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lg">Service Configuration</h2>
        <button onClick={loadData} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">↻ Refresh</button>
      </div>
      <p className="text-xs text-gray-500 mb-6">A service is "Confirmed" only after it has been explicitly enabled for this client — an operational platform capability is never treated as delivered until a real row exists.</p>

      {summary && summary.enabled === 0 && summary.proposed === 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-medium text-orange-800">Services have not yet been confirmed for this client</p>
          <p className="text-[11px] text-orange-700 mt-1">AskABD will not ask for connections or requirements until you confirm which services this client is actually receiving. {summary.notConfirmed} platform capabilities are available below — select "Enable" on each one that applies, or confirm services from a signed commercial engagement if one exists.</p>
        </div>
      )}
      {summary && summary.proposed > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-medium text-blue-800">{summary.proposed} service{summary.proposed === 1 ? '' : 's'} proposed from a commercial engagement</p>
          <p className="text-[11px] text-blue-700 mt-1">These were selected on a real engagement but are not yet confirmed — review and confirm each one below before AskABD requests any related information.</p>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
          <Stat label="Total" value={summary.total} />
          <Stat label="Confirmed" value={summary.enabled} color="text-green-600" />
          <Stat label="Proposed" value={summary.proposed || 0} color="text-blue-600" />
          <Stat label="Not Confirmed" value={summary.notConfirmed} color="text-orange-600" />
          <Stat label="Recommended" value={recommendations.length} color="text-blue-600" />
          <Stat label="Disabled" value={summary.disabled} color="text-red-600" />
          <Stat label="Coverage" value={`${coverage?.overall?.coverage || 0}%`} color={coverage?.overall?.coverage >= 50 ? 'text-green-600' : 'text-orange-600'} />
          <Stat label="Planned/N-A" value={summary.notApplicable} />
        </div>
      )}

      {recommendations.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-3">⚡ Recommended for This Client</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recommendations.slice(0, 6).map(r => (
              <div key={r.serviceId} className={`bg-gray-50 rounded-lg p-3 border-l-4 ${r.priority === 'critical' ? 'border-red-400' : r.priority === 'high' ? 'border-orange-400' : 'border-blue-400'}`}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-xs font-semibold text-gray-900">{r.serviceName}</span>
                  <Pill text={r.priority} className={r.priority === 'critical' ? 'text-red-700 bg-red-50 border-red-200' : r.priority === 'high' ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-blue-700 bg-blue-50 border-blue-200'} />
                </div>
                <p className="text-[10px] text-gray-500 mb-1">{r.reason}</p>
                {r.evidence?.length > 0 && <p className="text-[9px] text-gray-400 mb-1">Evidence: {r.evidence.slice(0, 2).join(', ')}</p>}
                <p className="text-[10px] text-purple-600">{r.businessValue}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {bundles.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-3">📦 Recommended Bundles</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {bundles.slice(0, 3).map(b => (
              <div key={b.bundleId} className="bg-gray-50 rounded-lg p-3 border">
                <p className="text-xs font-semibold text-gray-900 mb-1">{b.bundleName}</p>
                <p className="text-[10px] text-gray-500 mb-2">{b.description}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${b.coverage >= 80 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${b.coverage}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500">{b.coverage}%</span>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">{b.enabledServices}/{b.totalServices} services enabled</p>
              </div>
            ))}
          </div>
        </section>
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
          <option value="concept">Concept</option>
        </select>
      </div>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Services ({filtered.length})</h3>
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">No services match the current filters.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => <ServiceRow key={s.serviceId} s={s} onToggle={toggleService} onConfirm={confirmProposal} />)}
          </div>
        )}
      </section>
    </div>
  );
}
