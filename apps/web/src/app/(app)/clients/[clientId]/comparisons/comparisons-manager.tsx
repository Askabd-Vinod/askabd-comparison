'use client';
import { useId, useState } from 'react';
import { Action } from '../../../../components/button';
import type { DatabaseConnection } from '../../../../components/database-connections-manager';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export type ComparisonObjectStatus = 'match' | 'mismatch' | 'missing' | 'extra' | 'unknown';
export interface ComparisonObjectResult { objectType: string; name: string; status: ComparisonObjectStatus; leftDetail: string; rightDetail: string }
export interface ComparisonSummary { total: number; match: number; mismatch: number; missing: number; extra: number; unknown: number }
export interface ComparisonRun {
  id: string; clientId: string; comparisonType: 'database_schema'; leftLabel: string; rightLabel: string;
  leftConnectionId: string; rightConnectionId: string; status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[]; summary: ComparisonSummary; errorMessage: string | null;
  createdBy: string | null; createdAt: string; completedAt: string | null;
}

// Same icon+label discipline as evidence-status.tsx / QualityBadge elsewhere in
// this app — never color alone.
const STATUS_META: Record<ComparisonRun['status'], { icon: string; label: string; className: string }> = {
  running: { icon: '…', label: 'Running', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  completed: { icon: '✓', label: 'Completed', className: 'text-green-700 bg-green-50 border-green-200' },
  failed: { icon: '✕', label: 'Failed', className: 'text-red-700 bg-red-50 border-red-200' },
};

const OBJECT_META: Record<ComparisonObjectStatus, { icon: string; label: string; className: string }> = {
  match: { icon: '✓', label: 'Match', className: 'text-green-700 bg-green-50 border-green-200' },
  mismatch: { icon: '≠', label: 'Mismatch', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  missing: { icon: '−', label: 'Missing on right', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  extra: { icon: '+', label: 'Extra on right', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  unknown: { icon: '?', label: 'Unknown', className: 'text-gray-500 bg-gray-50 border-gray-200' },
};

function StatusBadge({ status }: { status: ComparisonRun['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${meta.className}`}>
      <span aria-hidden="true">{meta.icon}</span>{meta.label}
    </span>
  );
}

function ObjectBadge({ status }: { status: ComparisonObjectStatus }) {
  const meta = OBJECT_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${meta.className}`}>
      <span aria-hidden="true">{meta.icon}</span>{meta.label}
    </span>
  );
}

function RunCard({ run }: { run: ComparisonRun }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900">{run.leftLabel} <span className="text-gray-400">vs</span> {run.rightLabel}</p>
          <p className="text-[9px] text-gray-400 mt-0.5">
            Database schema comparison · {new Date(run.createdAt).toLocaleString('en-AU')}
            {run.createdBy && <> · by {run.createdBy}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {run.status === 'completed' && (
            <span className="text-[10px] text-gray-500">
              {run.summary.match} match{run.summary.match !== 1 ? 'es' : ''}
              {(run.summary.missing + run.summary.extra + run.summary.mismatch + run.summary.unknown) > 0 && (
                <span className="text-amber-600 font-medium"> · {run.summary.missing + run.summary.extra + run.summary.mismatch + run.summary.unknown} differ</span>
              )}
            </span>
          )}
          <StatusBadge status={run.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {run.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-[11px] text-red-700">
              <p className="font-semibold mb-1">Comparison could not complete</p>
              <p>{run.errorMessage || 'An unknown error occurred.'}</p>
            </div>
          )}
          {run.status === 'completed' && (
            <>
              <div className="grid grid-cols-5 gap-2 text-center">
                {(['match', 'mismatch', 'missing', 'extra', 'unknown'] as ComparisonObjectStatus[]).map(k => (
                  <div key={k} className="bg-white rounded-md border p-2">
                    <p className="text-sm font-bold text-gray-900">{run.summary[k]}</p>
                    <p className="text-[8px] text-gray-500 uppercase">{OBJECT_META[k].label}</p>
                  </div>
                ))}
              </div>
              {run.results.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No tables found on either side.</p>
              ) : (
                <div className="bg-white border rounded-md overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-100 text-gray-500 text-left">
                        <th className="px-2 py-1.5 font-medium">Table</th>
                        <th className="px-2 py-1.5 font-medium">{run.leftLabel}</th>
                        <th className="px-2 py-1.5 font-medium">{run.rightLabel}</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.results.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5 font-mono text-gray-700">{r.name}</td>
                          <td className="px-2 py-1.5 text-gray-500">{r.leftDetail}</td>
                          <td className="px-2 py-1.5 text-gray-500">{r.rightDetail}</td>
                          <td className="px-2 py-1.5"><ObjectBadge status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ComparisonsManager({ clientId, initialRuns, connections }: { clientId: string; initialRuns: ComparisonRun[]; connections: DatabaseConnection[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [showForm, setShowForm] = useState(false);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v1 only compares PostgreSQL connections (the one type inspectSchema
  // supports) — never offered as an option if it can't actually be compared.
  const pgConnections = connections.filter(c => c.connectorType === 'postgresql');

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/comparisons`);
    if (res.ok) setRuns((await res.json()).runs);
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!leftId || !rightId) { setError('Choose two different connections to compare.'); return; }
    if (leftId === rightId) { setError('Choose two different connections — comparing a connection against itself is not meaningful.'); return; }
    setRunning(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/comparisons/database-schema`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leftConnectionId: leftId, rightConnectionId: rightId }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not run this comparison.'); return; }
      setLeftId(''); setRightId(''); setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setRunning(false); }
  }

  return (
    <div>
      {pgConnections.length < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 text-[11px] text-amber-800">
          At least two PostgreSQL database connections are needed to run a comparison. Add them from the
          <span className="font-medium"> Lifecycle</span> tab's Database Connections section.
        </div>
      )}

      <div className="flex justify-end mb-4">
        <Action variant="primary" onClick={() => setShowForm(v => !v)} disabled={pgConnections.length < 2}>
          {showForm ? 'Cancel' : '+ New Comparison'}
        </Action>
      </div>

      {showForm && (
        <form onSubmit={handleRun} className="bg-white rounded-xl border p-5 mb-6 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Left side (baseline) *</label>
            <select value={leftId} onChange={e => setLeftId(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select a connection…</option>
              {pgConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.environment})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Right side (comparison target) *</label>
            <select value={rightId} onChange={e => setRightId(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select a connection…</option>
              {pgConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.environment})</option>)}
            </select>
          </div>
          <p className="sm:col-span-2 text-[9px] text-gray-400">
            Both sides must have a real, stored credential (tested successfully at least once). A connection
            whose credential is unavailable will honestly report unresolved tables rather than guessing.
          </p>
          {error && <div className="sm:col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="sm:col-span-2">
            <Action type="submit" variant="primary" loading={running}>Run Comparison</Action>
          </div>
        </form>
      )}

      {runs.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No comparisons run yet for this client.
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(r => <RunCard key={r.id} run={r} />)}
        </div>
      )}
    </div>
  );
}
