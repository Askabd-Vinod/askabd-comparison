'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '../../../../components/breadcrumb';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Problem { id: string; clientId: string; domain: string; category: string; title: string; description: string; severity: string; priority: string; riskLevel: string; status: string; confidence: string; sourceType: string; businessImpact: string; technicalImpact: string; evidence: any[]; rootCause: string; discoveredAt: string; }
interface Financial { id: string; currentCost: number; implementationCost: number; annualSavings: number; roiPercentage: number; paybackMonths: number; currency: string; confidence: string; }
interface Effort { id: string; personDays: number; teamSize: number; estimatedDuration: string; roles: any[]; complexity: string; confidence: string; }
interface Summary { problems: { total: number; critical: number; high: number; medium: number; low: number; identified: number; resolved: number }; financial: { totalAnnualSavings: number; totalImplementationCost: number; avgRoi: number }; }

const severityColors: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700', info: 'bg-gray-100 text-gray-500' };
const statusColors: Record<string, string> = { identified: 'bg-purple-100 text-purple-700', validated: 'bg-blue-100 text-blue-700', accepted: 'bg-indigo-100 text-indigo-700', recommended: 'bg-green-100 text-green-700', resolved: 'bg-green-200 text-green-800', rejected: 'bg-gray-100 text-gray-500', deferred: 'bg-gray-100 text-gray-500' };
const domainLabels: Record<string, string> = { legacy: 'Legacy', cloud: 'Cloud', application: 'Application', database: 'Database', data: 'Data', infrastructure: 'Infrastructure', security: 'Security', compliance: 'Compliance', finops: 'FinOps', vendor: 'Vendor', license: 'License', process: 'Process', devops: 'DevOps', performance: 'Performance', cost_optimization: 'Cost', other: 'Other' };

export default function ProblemUniversePage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selected, setSelected] = useState<Problem | null>(null);
  const [financial, setFinancial] = useState<Financial | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ domain: '', severity: '', status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, probRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/problems/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/problems?${new URLSearchParams(Object.fromEntries(Object.entries(filter).filter(([,v]) => v)))}`),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (probRes.ok) { const d = await probRes.json(); setProblems(d.problems || []); }
    } catch { /* API unavailable */ }
    setLoading(false);
  }, [clientId, filter]);

  useEffect(() => { load(); }, [load]);

  async function selectProblem(p: Problem) {
    setSelected(p);
    try {
      const [fRes, eRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/problems/${p.id}/financial`),
        fetch(`${API}/api/v1/oc/problems/${p.id}/effort`),
      ]);
      setFinancial(fRes.ok ? await fRes.json() : null);
      setEffort(eRes.ok ? await eRes.json() : null);
    } catch { setFinancial(null); setEffort(null); }
  }

  const fmt = (n: number | undefined, currency = 'USD') => n != null ? `${currency === 'INR' ? '₹' : '$'}${n.toLocaleString()}` : '—';

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: clientId, href: `/clients/${clientId}/lifecycle` }, { label: 'Problem Universe' }]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Problem Universe</h1>
          <p className="text-sm text-gray-500 mt-1">Enterprise problem discovery, impact analysis & transformation opportunities</p>
        </div>
        <button onClick={load} className="text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition">↻ Refresh</button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SumCard label="Total" value={summary.problems.total} color="text-gray-900" />
          <SumCard label="Critical" value={summary.problems.critical} color="text-red-600" />
          <SumCard label="High" value={summary.problems.high} color="text-orange-600" />
          <SumCard label="Medium" value={summary.problems.medium} color="text-yellow-600" />
          <SumCard label="Savings" value={fmt(summary.financial.totalAnnualSavings)} color="text-green-600" sub="/year" />
          <SumCard label="Investment" value={fmt(summary.financial.totalImplementationCost)} color="text-blue-600" />
          <SumCard label="Avg ROI" value={`${Math.round(summary.financial.avgRoi)}%`} color="text-purple-600" />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={filter.domain} onChange={e => setFilter({ ...filter, domain: e.target.value })} className="text-xs border rounded-lg px-2 py-1.5">
          <option value="">All Domains</option>
          {Object.entries(domainLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.severity} onChange={e => setFilter({ ...filter, severity: e.target.value })} className="text-xs border rounded-lg px-2 py-1.5">
          <option value="">All Severities</option>
          <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="text-xs border rounded-lg px-2 py-1.5">
          <option value="">All Statuses</option>
          <option value="identified">Identified</option><option value="validated">Validated</option><option value="recommended">Recommended</option><option value="resolved">Resolved</option><option value="deferred">Deferred</option>
        </select>
      </div>

      {/* Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Problem List */}
        <div className="lg:col-span-2 space-y-2">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Loading problems...</p>}
          {!loading && problems.length === 0 && (
            <div className="bg-white rounded-xl border p-8 text-center">
              <p className="text-gray-500">No problems identified yet.</p>
              <p className="text-xs text-gray-400 mt-1">Run Discovery → Assessment to identify enterprise problems.</p>
              <Link href={`/clients/${clientId}/lifecycle`} className="mt-3 inline-block text-xs text-purple-600 font-medium">Go to Lifecycle →</Link>
            </div>
          )}
          {problems.map(p => (
            <button key={p.id} onClick={() => selectProblem(p)} className={`w-full text-left bg-white rounded-xl border p-4 hover:border-purple-300 transition ${selected?.id === p.id ? 'border-purple-500 ring-1 ring-purple-200' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${severityColors[p.severity] || 'bg-gray-100'}`}>{p.severity?.toUpperCase()}</span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${statusColors[p.status] || 'bg-gray-100'}`}>{p.status}</span>
                    <span className="text-[9px] text-gray-400">{domainLabels[p.domain] || p.domain}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                  {p.businessImpact && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{p.businessImpact}</p>}
                </div>
                <span className="text-[9px] text-gray-400 shrink-0">{new Date(p.discoveredAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {selected ? (
            <>
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-sm text-gray-900 mb-2">{selected.title}</h3>
                <div className="space-y-2 text-xs">
                  <Row label="Domain" value={domainLabels[selected.domain] || selected.domain} />
                  <Row label="Severity" value={selected.severity} />
                  <Row label="Priority" value={selected.priority} />
                  <Row label="Risk" value={selected.riskLevel} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Source" value={selected.sourceType} />
                  <Row label="Confidence" value={selected.confidence} />
                </div>
                {selected.description && <p className="text-[10px] text-gray-600 mt-3 pt-2 border-t">{selected.description}</p>}
                {selected.businessImpact && <div className="mt-2"><p className="text-[9px] font-medium text-orange-700">Business Impact:</p><p className="text-[10px] text-gray-700">{selected.businessImpact}</p></div>}
                {selected.technicalImpact && <div className="mt-2"><p className="text-[9px] font-medium text-blue-700">Technical Impact:</p><p className="text-[10px] text-gray-700">{selected.technicalImpact}</p></div>}
                {selected.rootCause && <div className="mt-2"><p className="text-[9px] font-medium text-purple-700">Root Cause:</p><p className="text-[10px] text-gray-700">{selected.rootCause}</p></div>}
                {selected.evidence?.length > 0 && (
                  <div className="mt-3 pt-2 border-t">
                    <p className="text-[9px] font-medium text-gray-600 mb-1">Evidence:</p>
                    {selected.evidence.map((e: any, i: number) => <p key={i} className="text-[9px] text-gray-500">• {typeof e === 'string' ? e : e.observation || e.finding || JSON.stringify(e)}</p>)}
                  </div>
                )}
              </div>

              {/* Financial */}
              {financial && financial.id && (
                <div className="bg-white rounded-xl border p-4">
                  <h4 className="text-xs font-semibold text-gray-900 mb-2">💰 Financial Impact</h4>
                  <div className="space-y-1.5 text-xs">
                    {financial.currentCost != null && <Row label="Current Cost" value={fmt(financial.currentCost, financial.currency)} />}
                    {financial.implementationCost != null && <Row label="Investment" value={fmt(financial.implementationCost, financial.currency)} />}
                    {financial.annualSavings != null && <Row label="Annual Savings" value={fmt(financial.annualSavings, financial.currency)} />}
                    {financial.roiPercentage != null && <Row label="ROI" value={`${financial.roiPercentage}%`} />}
                    {financial.paybackMonths != null && <Row label="Payback" value={`${financial.paybackMonths} months`} />}
                    <Row label="Confidence" value={financial.confidence} />
                  </div>
                </div>
              )}

              {/* Effort */}
              {effort && effort.id && (
                <div className="bg-white rounded-xl border p-4">
                  <h4 className="text-xs font-semibold text-gray-900 mb-2">👥 Effort Estimate</h4>
                  <div className="space-y-1.5 text-xs">
                    {effort.estimatedDuration && <Row label="Duration" value={effort.estimatedDuration} />}
                    {effort.personDays != null && <Row label="Person-Days" value={`${effort.personDays}`} />}
                    {effort.teamSize != null && <Row label="Team Size" value={`${effort.teamSize}`} />}
                    <Row label="Complexity" value={effort.complexity} />
                    <Row label="Confidence" value={effort.confidence} />
                    {effort.roles?.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-[9px] text-gray-500 mb-1">Roles:</p>
                        <div className="flex flex-wrap gap-1">{effort.roles.map((r: any, i: number) => <span key={i} className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{r.role || r}</span>)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
              Select a problem to view details, financial impact, and effort estimates.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SumCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}{sub && <span className="text-[9px] text-gray-400 font-normal">{sub}</span>}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
