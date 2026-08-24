'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MigrationRun } from '../../../lib/real-migration';
import { statusColors, stepStatusColors, formatDuration } from '../../../lib/real-migration';
import { DownloadButton } from '../../../components/download-button';
import { KpiCard } from '../../../components/kpi-card';
import { OperationProgress } from '../../../components/operation-progress';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

type Tab = 'overview' | 'steps' | 'validation';

export function MigrationDetailView({ migration: initial, clientName }: { migration: MigrationRun; clientName: string }) {
  const router = useRouter();
  const [m, setM] = useState(initial);
  const [tab, setTab] = useState<Tab>('overview');
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ status: string; checks: any[]; evidence: string[] } | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'steps', label: `Steps (${m.steps.length})` },
    { id: 'validation', label: 'Validation' },
  ];

  async function runAction(action: 'dry-run' | 'execute' | 'validate' | 'rollback') {
    setRunning(action);
    setError(null);
    try {
      if (action === 'dry-run') {
        const res = await fetch(`${API}/api/v1/oc/migration/dry-run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ migrationId: m.id }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Dry run failed');
        setM(data);
      } else if (action === 'execute') {
        // Real async execution — returns immediately with an operationId; the
        // OperationProgress panel below polls the real oc_operations row for genuine,
        // per-step progress as the migration actually runs (no more blocking on a
        // single "Executing…" spinner for the entire duration).
        const res = await fetch(`${API}/api/v1/oc/migration/${m.id}/execute-async`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Execution failed to start');
        setOperationId(data.operation.id);
        setM({ ...m, status: 'running' as any });
      } else if (action === 'validate') {
        const res = await fetch(`${API}/api/v1/oc/migration/${m.id}/validate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Validation failed');
        setValidation(data);
        setTab('validation');
      } else if (action === 'rollback') {
        const res = await fetch(`${API}/api/v1/oc/migration/${m.id}/rollback?clientId=${encodeURIComponent(m.clientId)}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Rollback failed');
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setRunning(null);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{m.sourceSchema} → {m.targetSchema}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[m.status] || 'bg-gray-100 text-gray-600'}`}>{m.status.replace('-', ' ')}</span>
            <Link href={`/clients/${m.clientId}`} className="text-[10px] text-purple-600 hover:underline">{clientName}</Link>
            <span className="text-[10px] text-gray-400">Created: {new Date(m.createdAt).toLocaleString('en-AU')}</span>
          </div>
        </div>
        <DownloadButton fileName={`Migration_${m.id}_Report`} format="pdf" entityId={m.id} entityName={`${m.sourceSchema} → ${m.targetSchema}`} clientName={clientName} data={{ status: m.status, plan: m.plan, progress: m.progress, evidence: m.evidence, error: m.error }}>Download Report</DownloadButton>
      </div>

      {/* Real actions — call the actual MigrationExecutionService endpoints, no simulation */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => runAction('dry-run')} disabled={running !== null || m.status === 'running'} className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">{running === 'dry-run' ? 'Running…' : 'Run Dry Run'}</button>
        <button onClick={() => runAction('execute')} disabled={running !== null || m.status === 'running' || m.status === 'completed'} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">{running === 'execute' ? 'Executing…' : 'Execute Migration'}</button>
        <button onClick={() => runAction('validate')} disabled={running !== null} className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">{running === 'validate' ? 'Validating…' : 'Validate'}</button>
        <button onClick={() => runAction('rollback')} disabled={running !== null} className="text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 px-4 py-2 rounded-lg transition">{running === 'rollback' ? 'Rolling back…' : 'Rollback'}</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-xs text-red-700">{error}</div>}
      {m.error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-xs text-red-700">Run error: {m.error}</div>}

      {/* Real, live, per-step execution progress — replaces the old blocking spinner */}
      {operationId && (
        <div className="mb-6">
          <OperationProgress
            operationId={operationId}
            onSettled={async () => {
              // The real execution finished (completed/failed/cancelled/interrupted) —
              // re-fetch the real migration run for its final, authoritative detail.
              try {
                const res = await fetch(`${API}/api/v1/oc/migrations/${m.id}`);
                if (res.ok) { const data = await res.json(); setM(data.migration); }
              } catch { /* the OperationProgress panel above still shows the real final state */ }
            }}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">{tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${tab === t.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}</nav>
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard label="Mandatory Progress" value={`${m.progress?.percentage ?? 0}%`} color={(m.progress?.percentage ?? 0) === 100 ? 'text-green-600' : undefined} description="Mandatory steps completed." criteria="mandatoryCompleted / mandatory × 100." />
            <KpiCard label="Tables" value={m.plan?.tables ?? 0} description="Tables discovered in source schema." criteria="pg_tables count at plan creation." />
            <KpiCard label="Indexes" value={m.plan?.indexes ?? 0} description="Non-primary-key indexes discovered." criteria="pg_indexes count." />
            <KpiCard label="Views" value={m.plan?.views ?? 0} description="Views discovered (optional — dependency ordering)." criteria="pg_views count." />
            <KpiCard label="Failed Steps" value={m.progress?.failed ?? 0} color={(m.progress?.failed ?? 0) > 0 ? 'text-red-600' : 'text-green-600'} description="Steps that failed during execution." criteria="steps where status = 'failed'." />
            <KpiCard label="Duration" value={formatDuration(m.durationMs)} description="Wall-clock execution duration." criteria="completedAt − startedAt." />
          </div>
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-3">Evidence Log</h3>
            {m.evidence.length === 0 ? <p className="text-xs text-gray-400">No evidence recorded yet.</p> : (
              <ul className="space-y-1">{m.evidence.map((e, i) => <li key={i} className="text-xs text-gray-700 font-mono">{e}</li>)}</ul>
            )}
          </section>
        </div>
      )}

      {/* Steps */}
      {tab === 'steps' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Step</th>
                <th className="text-left px-3 py-3">Type</th>
                <th className="text-left px-3 py-3">Mandatory</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="text-center px-3 py-3">Rows</th>
                <th className="text-left px-3 py-3">Duration</th>
                <th className="text-left px-3 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {m.steps.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3"><p className="text-xs font-medium">{s.name}</p></td>
                  <td className="px-3 py-3 text-xs capitalize">{s.type}</td>
                  <td className="px-3 py-3 text-xs">{s.mandatory ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${stepStatusColors[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status.replace('_', ' ')}</span></td>
                  <td className="px-3 py-3 text-center text-xs font-mono">{s.rowsProcessed ?? '—'}</td>
                  <td className="px-3 py-3 text-[10px] text-gray-500">{formatDuration(s.durationMs)}</td>
                  <td className="px-3 py-3 text-[10px] text-red-600">{s.error || (s.resolution ? <span className="text-gray-400">{s.resolution}</span> : '—')}</td>
                </tr>
              ))}
              {m.steps.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-xs text-gray-400">No steps recorded.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Validation */}
      {tab === 'validation' && (
        <div className="space-y-6">
          {!validation ? (
            <div className="bg-gray-50 rounded-xl border p-8 text-center">
              <p className="text-sm text-gray-500">No validation has been run yet.</p>
              <button onClick={() => runAction('validate')} disabled={running !== null} className="mt-3 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">{running === 'validate' ? 'Validating…' : 'Run Validation'}</button>
            </div>
          ) : (
            <>
              <section className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold mb-3">Validation Result: <span className={validation.status === 'passed' ? 'text-green-600' : validation.status.includes('drift') ? 'text-orange-600' : 'text-red-600'}>{validation.status.replace(/_/g, ' ')}</span></h3>
                <ul className="space-y-1">{validation.evidence.map((e, i) => <li key={i} className="text-xs text-gray-700 font-mono">{e}</li>)}</ul>
              </section>
              <section className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr><th className="text-left px-5 py-3">Check</th><th className="text-center px-3 py-3">Expected</th><th className="text-center px-3 py-3">Actual</th><th className="text-center px-3 py-3">Mandatory</th><th className="text-center px-3 py-3">Result</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validation.checks.map((c, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-xs">{c.name}{c.drift && <p className="text-[9px] text-orange-500 mt-0.5">{c.drift}</p>}</td>
                        <td className="px-3 py-3 text-center text-xs font-mono">{c.expected}</td>
                        <td className="px-3 py-3 text-center text-xs font-mono">{c.actual}</td>
                        <td className="px-3 py-3 text-center text-xs">{c.mandatory ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-3 text-center"><span className={`text-[10px] font-bold ${c.match ? 'text-green-600' : 'text-red-600'}`}>{c.match ? '✓ MATCH' : '✕ MISMATCH'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
