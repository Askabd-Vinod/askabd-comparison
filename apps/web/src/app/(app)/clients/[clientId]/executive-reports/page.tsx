'use client';
import { useState, useEffect, useCallback } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Executive Reporting — real, cross-domain client health reports backed by
 * `oc_executive_reports` (executive-reporting-engine.ts /
 * executive-reporting-routes.ts, `executive_reporting_test_1`, 2026-08-24).
 * Eighth of the 11 engines wired into the staff UI (Phase 3, "ASKABD
 * ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 *
 * Distinct from the pre-existing "Reports" tab (an operational
 * incidents/defects/migrations/remediations count summary) — this engine
 * aggregates real evidence across dimensions into a genuine executive
 * health verdict, with an honest `insufficient_evidence` status distinct
 * from `healthy`/`at_risk`/`critical` for any dimension the engine cannot
 * yet substantiate — never silently defaulted to a false "healthy".
 */
type DimensionStatus = 'healthy' | 'at_risk' | 'critical' | 'insufficient_evidence';
interface ReportDimension { name: string; status: DimensionStatus; summary: string; data: Record<string, unknown> }
interface ExecutiveReport {
  id: string; clientId: string; overallHealth: DimensionStatus; dimensions: ReportDimension[];
  openIssues: string[]; criticalDecisions: string[]; recommendations: string[]; nextActions: string[];
  generatedBy: string | null; generatedAt: string;
}

const HEALTH_META: Record<DimensionStatus, { label: string; icon: string; className: string }> = {
  healthy: { label: 'Healthy', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  at_risk: { label: 'At Risk', icon: '!', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  critical: { label: 'Critical', icon: '✕', className: 'text-red-700 bg-red-50 border-red-200' },
  insufficient_evidence: { label: 'Insufficient Evidence', icon: '○', className: 'text-gray-400 bg-gray-50 border-gray-200 border-dashed' },
};

function HealthBadge({ status }: { status: DimensionStatus }) {
  const m = HEALTH_META[status];
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${m.className}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ExecutiveReportsPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [reports, setReports] = useState<ExecutiveReport[]>([]);
  const [selected, setSelected] = useState<ExecutiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/executive-reports`);
      if (res.ok) {
        const list: ExecutiveReport[] = (await res.json()).reports ?? [];
        setReports(list);
        setSelected(prev => prev ? list.find(r => r.id === prev.id) ?? list[0] ?? null : list[0] ?? null);
      } else if (res.status === 401 || res.status === 403) setError('You are not authorized to view executive reports for this client.');
      else setError('Unable to load executive reports. The backend may be unavailable.');
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  async function generate() {
    setGenerating(true); setGenErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/executive-reports`, { method: 'POST' });
      if (res.ok) await load(clientId);
      else { const b = await res.json().catch(() => ({})); setGenErr(b?.error?.message || 'Could not generate a report.'); }
    } catch (e) { setGenErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setGenerating(false);
  }

  async function downloadMarkdown(report: ExecutiveReport) {
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/executive-reports/${report.id}/export/markdown`);
      if (!res.ok) { setGenErr('Could not export this report.'); return; }
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `executive-report-${report.id}.md`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { setGenErr(`Could not reach AskABD: ${(e as Error).message}`); }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading executive reports...</div>;
  if (error) return <div className="p-6"><ErrorState what="Executive reports could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h2 className="font-semibold text-lg">Executive Reporting</h2>
        <Action variant="primary" onClick={generate} loading={generating} className="!text-xs">{generating ? 'Generating…' : 'Generate New Report'}</Action>
      </div>
      <p className="text-xs text-gray-500 mb-4">Real, cross-domain health reports for this engagement — evidence-based dimensions, never fabricated status.</p>
      {genErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{genErr}</p>}

      {reports.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-blue-800">No executive reports yet</p>
          <p className="text-xs text-blue-700 mt-1">Generate the first real report above.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-[200px_1fr] gap-4">
          <div className="bg-white rounded-xl border p-3 space-y-1 h-fit">
            {reports.map(r => (
              <button key={r.id} onClick={() => setSelected(r)} className={`w-full text-left text-[11px] px-2 py-1.5 rounded ${selected?.id === r.id ? 'bg-purple-100 text-purple-800 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                {new Date(r.generatedAt).toLocaleString('en-AU')}
              </button>
            ))}
          </div>
          {selected && <ReportDetail report={selected} onExport={() => downloadMarkdown(selected)} />}
        </div>
      )}
    </div>
  );
}

function ReportDetail({ report, onExport }: { report: ExecutiveReport; onExport: () => void }) {
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-5 flex items-center justify-between flex-wrap gap-3 ${HEALTH_META[report.overallHealth].className}`}>
        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-70">Overall Health</p>
          <p className="text-lg font-bold">{HEALTH_META[report.overallHealth].icon} {HEALTH_META[report.overallHealth].label}</p>
        </div>
        <button onClick={onExport} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-current">Export Markdown</button>
      </div>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Dimensions</h3>
        <div className="space-y-2">
          {report.dimensions.map((d, i) => (
            <div key={i} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-medium">{d.name}</span>
                <p className="text-[11px] text-gray-500 mt-0.5">{d.summary}</p>
              </div>
              <HealthBadge status={d.status} />
            </div>
          ))}
        </div>
      </section>

      {report.openIssues.length > 0 && <ListSection title="Open Issues" items={report.openIssues} color="text-red-700" />}
      {report.criticalDecisions.length > 0 && <ListSection title="Critical Decisions Needed" items={report.criticalDecisions} color="text-amber-700" />}
      {report.recommendations.length > 0 && <ListSection title="Recommendations" items={report.recommendations} color="text-blue-700" />}
      {report.nextActions.length > 0 && <ListSection title="Next Actions" items={report.nextActions} color="text-gray-700" />}
    </div>
  );
}

function ListSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <section className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className={`text-xs flex items-start gap-1.5 ${color}`}>
            <span className="mt-0.5">•</span><span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
