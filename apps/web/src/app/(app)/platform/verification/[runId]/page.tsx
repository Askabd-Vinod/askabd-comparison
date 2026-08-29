'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorState } from '../../../../components/error-state';
import { staffFetch } from '../../../../lib/staff-session';

type CheckStatus = 'passed' | 'failed' | 'warning' | 'blocked';
type FinalResult = 'GO' | 'NO_GO' | 'GO_WITH_RISKS' | 'BLOCKED';

interface Check {
  id: string; serviceId: string | null; name: string; level: string; status: CheckStatus;
  failureClassification: string | null; detail: string; evidence: string[]; durationMs: number | null; createdAt: string;
}
interface Run {
  id: string; scope: string; environment: string; initiatedBy: string | null; trigger: string; status: string;
  totalChecks: number; passedChecks: number; failedChecks: number; warningChecks: number; blockedChecks: number;
  finalResult: FinalResult | null; startedAt: string; completedAt: string | null;
}

const STATUS_META: Record<CheckStatus, { icon: string; className: string }> = {
  passed: { icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  failed: { icon: '✕', className: 'text-red-700 bg-red-50 border-red-200' },
  warning: { icon: '⚠', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  blocked: { icon: '○', className: 'text-gray-500 bg-gray-100 border-gray-200' },
};
const RESULT_META: Record<FinalResult, { label: string; className: string }> = {
  GO: { label: '✓ GO', className: 'text-green-800 bg-green-50 border-green-200' },
  GO_WITH_RISKS: { label: '⚠ GO WITH RISKS', className: 'text-amber-800 bg-amber-50 border-amber-200' },
  NO_GO: { label: '✕ NO-GO', className: 'text-red-800 bg-red-50 border-red-200' },
  BLOCKED: { label: '○ BLOCKED', className: 'text-gray-600 bg-gray-100 border-gray-200' },
};

interface PageProps { params: Promise<{ runId: string }> }

export default function VerificationRunDetailPage({ params }: PageProps) {
  const [runId, setRunId] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/verification/runs/${id}`);
      if (res.status === 401 || res.status === 403) { setError('You are not authorized to view this run.'); setLoading(false); return; }
      if (res.status === 404) { setError('This verification run was not found.'); setLoading(false); return; }
      if (!res.ok) { setError('Unable to load this run. The backend may be unavailable.'); setLoading(false); return; }
      const data = await res.json();
      setRun(data.run); setChecks(data.checks ?? []);
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setRunId(p.runId); load(p.runId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading run detail...</div>;
  if (error || !run) return <div className="max-w-[1600px] mx-auto px-4 py-6"><ErrorState what="Run detail could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(runId)} /></div>;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Link href="/platform/verification" className="text-xs text-purple-600 hover:text-purple-800 font-medium">← Verification Center</Link>
      <div className="flex items-start justify-between flex-wrap gap-3 mt-2 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Verification Run</h1>
          <p className="text-xs text-gray-500 mt-1">{new Date(run.startedAt).toLocaleString('en-AU')} · {run.trigger} · {run.environment} · initiated by {run.initiatedBy || 'system'}</p>
        </div>
        {run.finalResult && <span className={`inline-flex items-center text-sm font-bold px-3 py-1 rounded-lg border ${RESULT_META[run.finalResult].className}`}>{RESULT_META[run.finalResult].label}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-lg font-bold text-gray-900">{run.totalChecks}</p><p className="text-[9px] text-gray-500 uppercase">Total</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-lg font-bold text-green-600">{run.passedChecks}</p><p className="text-[9px] text-gray-500 uppercase">Passed</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-lg font-bold text-red-600">{run.failedChecks}</p><p className="text-[9px] text-gray-500 uppercase">Failed</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-lg font-bold text-amber-600">{run.warningChecks + run.blockedChecks}</p><p className="text-[9px] text-gray-500 uppercase">Warning / Blocked</p></div>
      </div>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Checks</h3>
        <div className="space-y-2">
          {checks.map(c => {
            const m = STATUS_META[c.status];
            return (
              <div key={c.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-medium">{c.name}</span>
                    <p className="text-[9px] text-gray-400 mt-0.5">{c.level}{c.failureClassification ? ` · ${c.failureClassification}` : ''}{c.durationMs !== null ? ` · ${c.durationMs}ms` : ''}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${m.className}`}><span aria-hidden="true">{m.icon}</span>{c.status}</span>
                </div>
                {c.detail && <p className="text-[11px] text-gray-600 mt-1.5">{c.detail}</p>}
                {c.evidence.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {c.evidence.map((e, i) => <p key={i} className="text-[10px] text-gray-400 font-mono break-all">{e}</p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
