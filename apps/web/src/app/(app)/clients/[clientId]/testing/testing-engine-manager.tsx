'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

type Category = 'positive' | 'negative' | 'boundary' | 'validation' | 'permission' | 'security' | 'integration' | 'regression' | 'error_handling' | 'data_validation' | 'performance' | 'accessibility' | 'cross_browser' | 'cross_device';
type ExecStatus = 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_executed' | 'not_applicable';
type DefectStatus = 'open' | 'in_progress' | 'fixed' | 'ready_for_retest' | 'retest_failed' | 'retest_passed' | 'closed' | 'wont_fix' | 'duplicate';

interface TestCase {
  id: string; title: string; description: string; category: Category; priority: string; severity: string;
  source: 'generated' | 'manual'; generationReason: string; status: string; expectedResult: string;
  steps: string[]; sourceType: string; sourceId: string | null;
}
interface Execution {
  id: string; status: ExecStatus; actualResult: string; evidence: { type: string; description: string }[];
  executedAt: string; defectId: string | null;
}
interface Defect { id: string; title: string; status: DefectStatus; severity: string; testCaseId: string; executionId: string; actualResult: string; stepsToReproduce: string }
interface Requirement { id: string; title: string }
interface CoverageRow { requirementId: string; requirement: string; totalCases: number; executed: number; passed: number; failed: number; coveragePercent: number; defectIds: string[] }
interface Report { totals: Record<string, number>; passPercent: number; coveragePercent: number; finalRecommendation: string; defectsBySeverity: Record<string, number>; knownLimitations: string[] }

const STATUS_META: Record<ExecStatus, { icon: string; label: string; className: string }> = {
  pass: { icon: '✓', label: 'Pass', className: 'text-green-700 bg-green-50 border-green-200' },
  fail: { icon: '✕', label: 'Fail', className: 'text-red-700 bg-red-50 border-red-200' },
  blocked: { icon: '⊘', label: 'Blocked', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  skipped: { icon: '⏭', label: 'Skipped', className: 'text-gray-500 bg-gray-50 border-gray-200' },
  not_executed: { icon: '—', label: 'Not Executed', className: 'text-gray-400 bg-gray-50 border-gray-200' },
  not_applicable: { icon: 'N/A', label: 'Not Applicable', className: 'text-gray-400 bg-gray-50 border-gray-200' },
};
const DEFECT_META: Record<DefectStatus, { className: string }> = {
  open: { className: 'text-red-700 bg-red-50 border-red-200' }, in_progress: { className: 'text-blue-700 bg-blue-50 border-blue-200' },
  fixed: { className: 'text-purple-700 bg-purple-50 border-purple-200' }, ready_for_retest: { className: 'text-amber-700 bg-amber-50 border-amber-200' },
  retest_failed: { className: 'text-red-700 bg-red-50 border-red-200' }, retest_passed: { className: 'text-green-700 bg-green-50 border-green-200' },
  closed: { className: 'text-gray-500 bg-gray-50 border-gray-200' }, wont_fix: { className: 'text-gray-500 bg-gray-50 border-gray-200' }, duplicate: { className: 'text-gray-500 bg-gray-50 border-gray-200' },
};
const CATEGORIES: Category[] = ['positive', 'negative', 'boundary', 'validation', 'permission', 'security', 'integration', 'regression', 'error_handling', 'data_validation', 'performance', 'accessibility', 'cross_browser', 'cross_device'];

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${className}`}>{children}</span>;
}

function ExecutionForm({ testCaseId, clientId, onDone }: { testCaseId: string; clientId: string; onDone: () => void }) {
  const [status, setStatus] = useState<ExecStatus>('pass');
  const [actualResult, setActualResult] = useState('');
  const [evidenceDesc, setEvidenceDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      const needsEvidence = status === 'pass' || status === 'fail';
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/test-cases/${testCaseId}/executions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status, actualResult,
          evidence: needsEvidence && evidenceDesc.trim() ? [{ type: 'note', description: evidenceDesc.trim() }] : [],
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => null); setError(d?.error?.message || 'Could not record this execution.'); return; }
      setActualResult(''); setEvidenceDesc('');
      onDone();
    } catch { setError('Could not reach the server.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-gray-50 border rounded-md p-3 space-y-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Record Execution — real evidence required for Pass/Fail</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <select value={status} onChange={e => setStatus(e.target.value as ExecStatus)} className="border rounded px-2 py-1.5 text-xs">
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <textarea value={actualResult} onChange={e => setActualResult(e.target.value)} placeholder="Actual result observed" rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
      {(status === 'pass' || status === 'fail') && (
        <input value={evidenceDesc} onChange={e => setEvidenceDesc(e.target.value)} placeholder="Evidence note (what you observed/verified — required for Pass/Fail)" className="w-full border rounded px-2 py-1.5 text-xs" />
      )}
      {error && <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}
      <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">Save Execution</Action>
    </div>
  );
}

function TestCaseRow({ testCase, clientId, onChanged }: { testCase: TestCase; clientId: string; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [history, setHistory] = useState<Execution[] | null>(null);
  const panelId = useId();

  async function loadHistory() {
    const res = await fetch(`${API}/api/v1/oc/test-cases/${testCase.id}/executions`);
    if (res.ok) setHistory((await res.json()).executions);
  }
  useEffect(() => { if (expanded) loadHistory(); }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = history?.[0];

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{testCase.title}</span>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{testCase.category}</span>
            {testCase.source === 'generated' && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">Generated</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {latest && <Badge className={STATUS_META[latest.status].className}>{STATUS_META[latest.status].icon} {STATUS_META[latest.status].label}</Badge>}
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Details'}</button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3 text-[11px]">
          <p><span className="text-gray-400">Why this test exists: </span>{testCase.generationReason || '—'}</p>
          {testCase.expectedResult && <p><span className="text-gray-400">Expected: </span>{testCase.expectedResult}</p>}
          {testCase.steps.length > 0 && <div><span className="text-gray-400">Steps: </span><ol className="list-decimal list-inside">{testCase.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>}

          {history && history.length > 0 && (
            <div className="bg-white border rounded p-2 space-y-1">
              <p className="text-[9px] font-semibold text-gray-400 uppercase">Execution History</p>
              {history.map(ex => (
                <div key={ex.id} className="flex items-center gap-2 flex-wrap">
                  <Badge className={STATUS_META[ex.status].className}>{STATUS_META[ex.status].icon} {STATUS_META[ex.status].label}</Badge>
                  <span className="text-gray-500">{new Date(ex.executedAt).toLocaleString('en-AU')}</span>
                  {ex.actualResult && <span className="text-gray-400 italic truncate max-w-xs">{ex.actualResult}</span>}
                  {ex.defectId && <span className="text-red-500">defect: {ex.defectId.slice(0, 10)}…</span>}
                </div>
              ))}
            </div>
          )}

          {!executing ? (
            <Action variant="secondary" onClick={() => setExecuting(true)} className="!text-[10px] !px-3 !py-1.5">+ Record Execution</Action>
          ) : (
            <ExecutionForm testCaseId={testCase.id} clientId={clientId} onDone={() => { setExecuting(false); loadHistory(); onChanged(); }} />
          )}
        </div>
      )}
    </div>
  );
}

export function TestingEngineManager({ clientId }: { clientId: string }) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedReqId, setSelectedReqId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [tcRes, reqRes, defRes, covRes, repRes] = await Promise.all([
      fetch(`${API}/api/v1/oc/clients/${clientId}/test-cases`),
      fetch(`${API}/api/v1/oc/clients/${clientId}/business-requirements`),
      fetch(`${API}/api/v1/oc/clients/${clientId}/test-defects`),
      fetch(`${API}/api/v1/oc/clients/${clientId}/test-coverage`),
      fetch(`${API}/api/v1/oc/clients/${clientId}/test-report`),
    ]);
    if (tcRes.ok) setTestCases((await tcRes.json()).testCases);
    if (reqRes.ok) setRequirements((await reqRes.json()).requirements);
    if (defRes.ok) setDefects((await defRes.json()).defects);
    if (covRes.ok) setCoverage((await covRes.json()).coverage);
    if (repRes.ok) setReport(await repRes.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!selectedReqId) return;
    setGenerating(true);
    try {
      await fetch(`${API}/api/v1/oc/clients/${clientId}/test-cases/generate/business-requirement/${selectedReqId}`, { method: 'POST' });
      await load();
    } finally { setGenerating(false); }
  }

  if (loading) return <p className="text-xs text-gray-400 py-4">Loading test cases…</p>;

  const filtered = categoryFilter ? testCases.filter(t => t.category === categoryFilter) : testCases;

  return (
    <div className="space-y-6">
      {report && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <p className="text-xs font-semibold text-gray-700">Test Summary</p>
            <div className="flex gap-2">
              <a href={`${API}/api/v1/oc/clients/${clientId}/test-report/export?format=html`} target="_blank" rel="noreferrer" className="text-[10px] text-purple-600 font-medium hover:text-purple-800">Export HTML →</a>
              <a href={`${API}/api/v1/oc/clients/${clientId}/test-report/export?format=markdown`} target="_blank" rel="noreferrer" className="text-[10px] text-purple-600 font-medium hover:text-purple-800">Export Markdown →</a>
            </div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
            <Stat label="Total" value={report.totals.total} /><Stat label="Pass" value={report.totals.pass} color="text-green-600" />
            <Stat label="Fail" value={report.totals.fail} color={report.totals.fail > 0 ? 'text-red-600' : undefined} />
            <Stat label="Blocked" value={report.totals.blocked} /><Stat label="Not Executed" value={report.totals.notExecuted} />
            <Stat label="Coverage" value={`${report.coveragePercent}%`} />
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Final Recommendation: <span className="font-semibold">{report.finalRecommendation.replace('_', ' ')}</span></p>
        </div>
      )}

      <div className="bg-white rounded-xl border p-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">Generate Test Cases from a Business Requirement</p>
        <div className="flex gap-2 flex-wrap">
          <select value={selectedReqId} onChange={e => setSelectedReqId(e.target.value)} className="border rounded px-2 py-1.5 text-xs flex-1 min-w-[200px]">
            <option value="">Select a requirement…</option>
            {requirements.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <Action variant="primary" onClick={generate} loading={generating} disabled={!selectedReqId} className="!text-[10px] !px-3 !py-1.5">Generate</Action>
        </div>
        <p className="text-[9px] text-gray-400 mt-1">Real, rule-based generation — every case gets a real reason, never a meaningless test.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-700">Test Cases ({filtered.length})</p>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border rounded px-2 py-1 text-[10px]">
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center text-xs text-gray-400">No test cases yet. Generate some from a requirement above.</div>
        ) : (
          <div className="space-y-2">{filtered.map(tc => <TestCaseRow key={tc.id} testCase={tc} clientId={clientId} onChanged={load} />)}</div>
        )}
      </div>

      {defects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Defects ({defects.length})</p>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-gray-50 text-gray-500 text-left"><th className="px-3 py-2">Title</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>{defects.map(d => (
                <tr key={d.id} className="border-t"><td className="px-3 py-2">{d.title}</td><td className="px-3 py-2 capitalize">{d.severity}</td>
                  <td className="px-3 py-2"><Badge className={DEFECT_META[d.status].className}>{d.status.replace('_', ' ')}</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {coverage.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Requirement Coverage</p>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-gray-50 text-gray-500 text-left"><th className="px-3 py-2">Requirement</th><th className="px-3 py-2">Cases</th><th className="px-3 py-2">Executed</th><th className="px-3 py-2">Passed</th><th className="px-3 py-2">Coverage</th></tr></thead>
              <tbody>{coverage.map(c => (
                <tr key={c.requirementId} className="border-t"><td className="px-3 py-2">{c.requirement}</td><td className="px-3 py-2">{c.totalCases}</td><td className="px-3 py-2">{c.executed}</td><td className="px-3 py-2">{c.passed}</td><td className="px-3 py-2">{c.coveragePercent}%</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}
