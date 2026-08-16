'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '../../../components/breadcrumb';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Gap { id: string; clientId: string; domain: string; category: string; title: string; description: string; currentState: string; targetState: string; gapDescription: string; businessImpact: string; technicalImpact: string; riskLevel: string; severity: string; priority: string; currentMaturity: number; targetMaturity: number; rootCause: string; relatedProblemId: string; confidence: string; sourceType: string; status: string; evidence: any[]; createdAt: string; }
interface Summary { gaps: { total: number; critical: number; high: number; medium: number; low: number; open: number; resolved: number }; avgMaturityGap: number; }

const severityColors: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };
const domainLabels: Record<string, string> = { legacy: 'Legacy', cloud: 'Cloud', application: 'Application', database: 'Database', data: 'Data', infrastructure: 'Infrastructure', security: 'Security', compliance: 'Compliance', finops: 'FinOps', vendor: 'Vendor', performance: 'Performance', devops: 'DevOps', other: 'Other' };

export default function GapAnalysisPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [selected, setSelected] = useState<Gap | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState({ domain: '', severity: '', status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, gRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/gaps/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/gaps?${new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([,v]) => v)))}`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (gRes.ok) { const d = await gRes.json(); setGaps(d.gaps || []); }
    } catch {}
    setLoading(false);
  }, [clientId, filter]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/gaps/generate`, { method: 'POST' });
      if (res.ok) { const r = await res.json(); alert(`Generated ${r.generated} gaps (${r.existing} already existed)`); load(); }
    } catch {}
    setGenerating(false);
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: clientId, href: `/clients/${clientId}/lifecycle` }, { label: 'Gap Analysis' }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enterprise Gap Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">Current state vs target state — identify transformation opportunities</p>
        </div>
        <div className="flex gap-2">
          <button onClick={generate} disabled={generating} className="text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition disabled:opacity-50">
            {generating ? 'Generating...' : '⚡ Generate from Problems'}
          </button>
          <button onClick={load} className="text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border transition">↻ Refresh</button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SC label="Total Gaps" value={summary.gaps.total} color="text-gray-900" />
          <SC label="Critical" value={summary.gaps.critical} color="text-red-600" />
          <SC label="High" value={summary.gaps.high} color="text-orange-600" />
          <SC label="Open" value={summary.gaps.open} color="text-purple-600" />
          <SC label="Resolved" value={summary.gaps.resolved} color="text-green-600" />
          <SC label="Avg Maturity Gap" value={summary.avgMaturityGap.toFixed(1)} color="text-blue-600" />
          <SC label="Medium" value={summary.gaps.medium} color="text-yellow-600" />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={filter.domain} onChange={e => setFilter({...filter, domain: e.target.value})} className="text-xs border rounded-lg px-2 py-1.5"><option value="">All Domains</option>{Object.entries(domainLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={filter.severity} onChange={e => setFilter({...filter, severity: e.target.value})} className="text-xs border rounded-lg px-2 py-1.5"><option value="">All Severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="text-xs border rounded-lg px-2 py-1.5"><option value="">All Statuses</option><option value="identified">Identified</option><option value="validated">Validated</option><option value="target_defined">Target Defined</option><option value="resolved">Resolved</option></select>
      </div>

      {/* Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Loading gaps...</p>}
          {!loading && gaps.length === 0 && (
            <div className="bg-white rounded-xl border p-8 text-center">
              <p className="text-gray-500">No gaps identified yet.</p>
              <p className="text-xs text-gray-400 mt-1">Run "Generate from Problems" to auto-create gaps from the Problem Universe.</p>
              <Link href={`/clients/${clientId}/problems`} className="mt-3 inline-block text-xs text-purple-600 font-medium">View Problem Universe →</Link>
            </div>
          )}
          {gaps.map(g => (
            <button key={g.id} onClick={() => setSelected(g)} className={`w-full text-left bg-white rounded-xl border p-4 hover:border-purple-300 transition ${selected?.id === g.id ? 'border-purple-500 ring-1 ring-purple-200' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${severityColors[g.severity] || 'bg-gray-100'}`}>{g.severity?.toUpperCase()}</span>
                    <span className="text-[9px] text-gray-400">{domainLabels[g.domain] || g.domain}</span>
                    <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">Maturity: {g.currentMaturity}→{g.targetMaturity}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{g.title}</p>
                  {g.currentState && <p className="text-[10px] text-gray-500 mt-0.5 truncate">Current: {g.currentState}</p>}
                </div>
                <span className="text-[9px] text-gray-400 shrink-0">{g.status}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="space-y-4">
          {selected ? (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">{selected.title}</h3>
              <div className="space-y-3 text-xs">
                <Section title="Current State" value={selected.currentState || 'Identified from assessment'} />
                <Section title="Target State" value={selected.targetState || '⚠ Target state required — define the desired outcome'} warn={!selected.targetState} />
                <Section title="Gap" value={selected.gapDescription || selected.description || '—'} />
                <Section title="Business Impact" value={selected.businessImpact} />
                <Section title="Technical Impact" value={selected.technicalImpact} />
                <Section title="Root Cause" value={selected.rootCause} />
                <div className="pt-2 border-t">
                  <p className="text-[9px] text-gray-500 mb-1">Maturity</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-600">{selected.currentMaturity}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xs font-bold text-green-600">{selected.targetMaturity}</span>
                    <span className="text-[9px] text-gray-400 ml-2">(Gap: {selected.targetMaturity - selected.currentMaturity})</span>
                  </div>
                </div>
                <div className="pt-2 border-t space-y-1">
                  <R label="Domain" value={domainLabels[selected.domain] || selected.domain} />
                  <R label="Severity" value={selected.severity} />
                  <R label="Risk" value={selected.riskLevel} />
                  <R label="Confidence" value={selected.confidence} />
                  <R label="Source" value={selected.sourceType} />
                  <R label="Status" value={selected.status} />
                </div>
                {selected.relatedProblemId && (
                  <div className="pt-2 border-t">
                    <Link href={`/clients/${clientId}/problems`} className="text-[10px] text-purple-600 font-medium hover:underline">View Related Problem →</Link>
                  </div>
                )}
                {selected.evidence?.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-[9px] text-gray-500 mb-1">Evidence:</p>
                    {selected.evidence.slice(0, 3).map((e: any, i: number) => <p key={i} className="text-[9px] text-gray-600">• {typeof e === 'string' ? e : e.observation || e.finding || JSON.stringify(e).slice(0, 80)}</p>)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">Select a gap to view current/target state, maturity, and impact analysis.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SC({ label, value, color }: { label: string; value: string | number; color: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}
function Section({ title, value, warn }: { title: string; value?: string; warn?: boolean }) {
  if (!value) return null;
  return <div><p className="text-[9px] font-medium text-gray-500">{title}</p><p className={`text-[10px] ${warn ? 'text-orange-600 italic' : 'text-gray-700'}`}>{value}</p></div>;
}
function R({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>;
}
