'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorState } from '../../../components/error-state';
import { Action } from '../../../components/button';
import { staffFetch } from '../../../lib/staff-session';

/**
 * AskABD Verification Center — the real staff UI for the Verification &
 * Validation Automation Service (`verification_service_test_1`,
 * 2026-08-29). Real service catalog, real run history, and a real,
 * one-click deep health check (L1-L4: process/database/service/dependency)
 * against the platform's own real, running engines — never a fabricated
 * "all green" dashboard. Regression results are RECORDED from the real,
 * existing Vitest suite (this page never claims to spawn its own copy of
 * it) — see the service's own header comment for the full "reuse, don't
 * duplicate" rationale.
 */
type Criticality = 'low' | 'medium' | 'high' | 'critical';
type CheckStatus = 'passed' | 'failed' | 'warning' | 'blocked';
type FinalResult = 'GO' | 'NO_GO' | 'GO_WITH_RISKS' | 'BLOCKED';

interface ServiceEntry { id: string; name: string; category: string; criticality: Criticality; owner: string | null; checkType: string; dependencies: string[]; knownRisks: string[] }
interface Run {
  id: string; scope: string; environment: string; initiatedBy: string | null; trigger: string; status: string;
  totalChecks: number; passedChecks: number; failedChecks: number; warningChecks: number; blockedChecks: number;
  finalResult: FinalResult | null; startedAt: string; completedAt: string | null;
}

const CRITICALITY_META: Record<Criticality, string> = {
  critical: 'text-red-700 bg-red-50 border-red-200', high: 'text-orange-700 bg-orange-50 border-orange-200',
  medium: 'text-blue-700 bg-blue-50 border-blue-200', low: 'text-gray-500 bg-gray-50 border-gray-200',
};
const RESULT_META: Record<FinalResult, { label: string; className: string }> = {
  GO: { label: '✓ GO', className: 'text-green-800 bg-green-50 border-green-200' },
  GO_WITH_RISKS: { label: '⚠ GO WITH RISKS', className: 'text-amber-800 bg-amber-50 border-amber-200' },
  NO_GO: { label: '✕ NO-GO', className: 'text-red-800 bg-red-50 border-red-200' },
  BLOCKED: { label: '○ BLOCKED', className: 'text-gray-600 bg-gray-100 border-gray-200' },
};

function ResultBadge({ result }: { result: FinalResult | null }) {
  if (!result) return <span className="text-xs text-gray-400">Not yet run</span>;
  const m = RESULT_META[result];
  return <span className={`inline-flex items-center text-sm font-bold px-3 py-1 rounded-lg border ${m.className}`}>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface JourneyDef { id: string; name: string; implemented: boolean }
interface JourneyRun { id: string; journeyId: string; journeyName: string; status: 'running' | 'passed' | 'failed' | 'blocked'; startedAt: string; cleanupPerformed: boolean }

const JOURNEY_STATUS_META: Record<JourneyRun['status'], string> = {
  passed: 'text-green-700 bg-green-50 border-green-200', failed: 'text-red-700 bg-red-50 border-red-200',
  blocked: 'text-gray-500 bg-gray-100 border-gray-200', running: 'text-blue-700 bg-blue-50 border-blue-200',
};

export default function VerificationCenterPage() {
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [journeyDefs, setJourneyDefs] = useState<JourneyDef[]>([]);
  const [journeyRuns, setJourneyRuns] = useState<JourneyRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [runningJourney, setRunningJourney] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sRes, rRes, jdRes, jrRes] = await Promise.all([
        staffFetch('/api/v1/oc/verification/services'),
        staffFetch('/api/v1/oc/verification/runs?limit=20'),
        staffFetch('/api/v1/oc/verification/journeys'),
        staffFetch('/api/v1/oc/verification/journeys/runs?limit=20'),
      ]);
      if (sRes.status === 401 || sRes.status === 403) { setError('You are not authorized to view the Verification Center.'); setLoading(false); return; }
      if (!sRes.ok || !rRes.ok) { setError('Unable to load verification data. The backend may be unavailable.'); setLoading(false); return; }
      setServices((await sRes.json()).services ?? []);
      setRuns((await rRes.json()).runs ?? []);
      if (jdRes.ok) setJourneyDefs((await jdRes.json()).journeys ?? []);
      if (jrRes.ok) setJourneyRuns((await jrRes.json()).runs ?? []);
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runHealthCheck() {
    setRunning(true); setRunErr(null);
    try {
      const res = await staffFetch('/api/v1/oc/verification/runs/health-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (res.ok) await load();
      else { const b = await res.json().catch(() => ({})); setRunErr(b?.error?.message || 'Could not run the health check.'); }
    } catch (e) { setRunErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setRunning(false);
  }

  async function runJourney(journeyId: string) {
    setRunningJourney(journeyId); setRunErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/verification/journeys/${journeyId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (res.ok) await load();
      else { const b = await res.json().catch(() => ({})); setRunErr(b?.error?.message || 'Could not run this journey.'); }
    } catch (e) { setRunErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setRunningJourney(null);
  }

  if (loading) return <div className="p-6 text-gray-400">Loading Verification Center...</div>;
  if (error) return <div className="max-w-[1600px] mx-auto px-4 py-6"><ErrorState what="Verification Center could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={load} /></div>;

  const latestRun = runs[0] ?? null;
  const byCategory = services.reduce<Record<string, ServiceEntry[]>>((acc, s) => { (acc[s.category] ??= []).push(s); return acc; }, {});

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verification Center</h1>
          <p className="text-xs text-gray-500 mt-1">Real, continuous verification of the AskABD platform&apos;s own engines — never a fabricated &quot;all green&quot; dashboard.</p>
        </div>
        <Action variant="primary" onClick={runHealthCheck} loading={running} className="!text-xs">{running ? 'Running…' : 'Run Deep Health Check'}</Action>
      </div>
      {runErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">{runErr}</p>}

      <section className="bg-white rounded-xl border p-5 mt-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Latest Run Result</p>
            <div className="mt-1"><ResultBadge result={latestRun?.finalResult ?? null} /></div>
          </div>
          {latestRun && <p className="text-[11px] text-gray-400">{new Date(latestRun.startedAt).toLocaleString('en-AU')} · {latestRun.trigger} · {latestRun.environment}</p>}
        </div>
        {latestRun && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <Stat label="Total Checks" value={latestRun.totalChecks} />
            <Stat label="Passed" value={latestRun.passedChecks} color="text-green-600" />
            <Stat label="Failed" value={latestRun.failedChecks} color="text-red-600" />
            <Stat label="Warnings / Blocked" value={latestRun.warningChecks + latestRun.blockedChecks} color="text-amber-600" />
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border p-5 mt-4">
        <h3 className="font-semibold text-sm mb-3">Service Catalog ({services.length})</h3>
        <div className="space-y-4">
          {Object.entries(byCategory).map(([category, list]) => (
            <div key={category}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{category}</p>
              <div className="space-y-1.5">
                {list.map(s => (
                  <div key={s.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-medium">{s.name}</span>
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        {s.checkType === 'manual' ? 'No automated check yet — verified via the existing Vitest suite + manual review' : `Automated check: ${s.checkType}`}
                        {s.dependencies.length > 0 && ` · depends on ${s.dependencies.join(', ')}`}
                      </p>
                      {s.knownRisks.length > 0 && <p className="text-[9px] text-amber-600 mt-1">⚠ {s.knownRisks[0]}</p>}
                    </div>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border uppercase shrink-0 ${CRITICALITY_META[s.criticality]}`}>{s.criticality}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border p-5 mt-4">
        <h3 className="font-semibold text-sm mb-1">Business Journeys ({journeyDefs.length})</h3>
        <p className="text-[10px] text-gray-400 mb-3">Real, end-to-end business validation — each run creates a real disposable client, exercises the real engine under test, asserts real DB/API/security/audit state, and performs verified cleanup. Journeys not yet implemented are honestly reported as blocked, never simulated.</p>
        <div className="space-y-1.5">
          {journeyDefs.map(j => (
            <div key={j.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-xs font-medium">{j.name}</span>
                {!j.implemented && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border text-gray-500 bg-gray-50 border-gray-200 uppercase shrink-0">Not yet implemented</span>}
              </div>
              <Action
                variant="secondary"
                onClick={() => runJourney(j.id)}
                loading={runningJourney === j.id}
                className="!text-[10px] !py-1 !px-2.5 shrink-0"
              >
                {runningJourney === j.id ? 'Running…' : 'Run'}
              </Action>
            </div>
          ))}
        </div>

        <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mt-5 mb-2">Recent Journey Runs</h4>
        {journeyRuns.length === 0 ? (
          <p className="text-xs text-gray-400">No journey runs yet — use a Run button above.</p>
        ) : (
          <div className="bg-white border rounded divide-y">
            {journeyRuns.map(jr => (
              <Link key={jr.id} href={`/platform/verification/journeys/${jr.id}`} className="flex items-center justify-between px-3 py-2.5 gap-3 hover:bg-gray-50 transition">
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-gray-700">{jr.journeyName}</span>
                  <p className="text-[9px] text-gray-400">{new Date(jr.startedAt).toLocaleString('en-AU')} · cleanup {jr.cleanupPerformed ? 'verified' : 'n/a'}</p>
                </div>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border uppercase shrink-0 ${JOURNEY_STATUS_META[jr.status]}`}>{jr.status}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border p-5 mt-4">
        <h3 className="font-semibold text-sm mb-3">Run History</h3>
        {runs.length === 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
            <p className="text-sm font-medium text-blue-800">No verification runs yet</p>
            <p className="text-xs text-blue-700 mt-1">Run the first real deep health check above.</p>
          </div>
        ) : (
          <div className="bg-white border rounded divide-y">
            {runs.map(r => (
              <Link key={r.id} href={`/platform/verification/${r.id}`} className="flex items-center justify-between px-3 py-2.5 gap-3 hover:bg-gray-50 transition">
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-gray-700">{new Date(r.startedAt).toLocaleString('en-AU')}</span>
                  <p className="text-[9px] text-gray-400">{r.trigger} · {r.environment} · {r.totalChecks} checks</p>
                </div>
                <ResultBadge result={r.finalResult} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
