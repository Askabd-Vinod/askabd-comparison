'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorState } from '../../../../../components/error-state';
import { staffFetch } from '../../../../../lib/staff-session';

type JourneyStatus = 'passed' | 'failed' | 'blocked';
interface JourneyStep { name: string; status: 'passed' | 'failed'; detail?: string }
interface JourneyRun {
  id: string; journeyId: string; journeyName: string; environment: string; clientId: string | null;
  status: JourneyStatus;
  preconditions: string[]; steps: JourneyStep[]; expectedResult: string; actualResult: string;
  apiResult: Record<string, unknown>; databaseResult: Record<string, unknown>;
  securityResult: Record<string, unknown>; auditResult: Record<string, unknown>;
  postConditions: string[]; evidence: string[]; cleanupPerformed: boolean; cleanupEvidence: string[];
  startedAt: string; completedAt: string | null;
}

const STATUS_META: Record<JourneyStatus, { label: string; className: string }> = {
  passed: { label: '✓ PASSED', className: 'text-green-800 bg-green-50 border-green-200' },
  failed: { label: '✕ FAILED', className: 'text-red-800 bg-red-50 border-red-200' },
  blocked: { label: '○ BLOCKED', className: 'text-gray-600 bg-gray-100 border-gray-200' },
};

function ResultBlock({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{title}</p>
      <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-all font-mono">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

interface PageProps { params: Promise<{ runId: string }> }

export default function JourneyRunDetailPage({ params }: PageProps) {
  const [runId, setRunId] = useState('');
  const [run, setRun] = useState<JourneyRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/verification/journeys/runs/${id}`);
      if (res.status === 401 || res.status === 403) { setError('You are not authorized to view this journey run.'); setLoading(false); return; }
      if (res.status === 404) { setError('This journey run was not found.'); setLoading(false); return; }
      if (!res.ok) { setError('Unable to load this journey run. The backend may be unavailable.'); setLoading(false); return; }
      setRun(await res.json());
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setRunId(p.runId); load(p.runId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading journey run...</div>;
  if (error || !run) return <div className="max-w-[1600px] mx-auto px-4 py-6"><ErrorState what="Journey run could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(runId)} /></div>;

  const m = STATUS_META[run.status];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Link href="/platform/verification" className="text-xs text-purple-600 hover:text-purple-800 font-medium">← Verification Center</Link>
      <div className="flex items-start justify-between flex-wrap gap-3 mt-2 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{run.journeyName}</h1>
          <p className="text-xs text-gray-500 mt-1">{new Date(run.startedAt).toLocaleString('en-AU')} · {run.environment}{run.clientId ? ` · client ${run.clientId}` : ''}</p>
        </div>
        <span className={`inline-flex items-center text-sm font-bold px-3 py-1 rounded-lg border ${m.className}`}>{m.label}</span>
      </div>

      <section className="bg-white rounded-xl border p-5 mb-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Expected Result</p>
        <p className="text-xs text-gray-700 mb-3">{run.expectedResult}</p>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Actual Result</p>
        <p className="text-xs text-gray-700">{run.actualResult}</p>
      </section>

      {run.preconditions.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-2">Preconditions</h3>
          <ul className="list-disc list-inside space-y-1">
            {run.preconditions.map((p, i) => <li key={i} className="text-xs text-gray-600">{p}</li>)}
          </ul>
        </section>
      )}

      {run.steps.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-3">Steps</h3>
          <div className="space-y-1.5">
            {run.steps.map((s, i) => (
              <div key={i} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-medium">{s.name}</span>
                  {s.detail && <p className="text-[10px] text-gray-500 mt-0.5">{s.detail}</p>}
                </div>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border uppercase shrink-0 ${s.status === 'passed' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{s.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <ResultBlock title="API Result" value={run.apiResult} />
        <ResultBlock title="Database Result" value={run.databaseResult} />
        <ResultBlock title="Security Result" value={run.securityResult} />
        <ResultBlock title="Audit Result" value={run.auditResult} />
      </section>

      {run.postConditions.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-2">Post-Conditions</h3>
          <ul className="list-disc list-inside space-y-1">
            {run.postConditions.map((p, i) => <li key={i} className="text-xs text-gray-600">{p}</li>)}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border p-5 mb-4">
        <h3 className="font-semibold text-sm mb-2">Cleanup</h3>
        <p className="text-xs text-gray-700 mb-2">
          {run.cleanupPerformed ? '✓ Cleanup performed and independently re-verified.' : run.status === 'blocked' ? 'Not applicable — no real resources were created.' : '✕ Cleanup was not confirmed.'}
        </p>
        {run.cleanupEvidence.length > 0 && (
          <div className="space-y-0.5">
            {run.cleanupEvidence.map((e, i) => <p key={i} className="text-[10px] text-gray-400 font-mono break-all">{e}</p>)}
          </div>
        )}
      </section>

      {run.evidence.length > 0 && (
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-2">Evidence</h3>
          <div className="space-y-0.5">
            {run.evidence.map((e, i) => <p key={i} className="text-[10px] text-gray-400 font-mono break-all">{e}</p>)}
          </div>
        </section>
      )}
    </div>
  );
}
