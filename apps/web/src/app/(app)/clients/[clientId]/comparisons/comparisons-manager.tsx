'use client';
import { useId, useState } from 'react';
import { Action } from '../../../../components/button';
import type { DatabaseConnection } from '../../../../components/database-connections-manager';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export type ComparisonObjectStatus = 'match' | 'mismatch' | 'missing' | 'extra' | 'unknown';
export interface ComparisonObjectResult { objectType: string; name: string; status: ComparisonObjectStatus; leftDetail: string; rightDetail: string }
export interface ComparisonSummary { total: number; match: number; mismatch: number; missing: number; extra: number; unknown: number }
export interface ComparisonRun {
  id: string; clientId: string; comparisonType: 'database_schema' | 'configuration'; leftLabel: string; rightLabel: string;
  leftConnectionId: string | null; rightConnectionId: string | null;
  leftSnapshotId: string | null; rightSnapshotId: string | null; status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[]; summary: ComparisonSummary; errorMessage: string | null;
  createdBy: string | null; createdAt: string; completedAt: string | null;
}
export interface ConfigurationSnapshot {
  id: string; clientId: string; name: string; environment: string; config: Record<string, string>;
  source: 'manual'; createdBy: string | null; createdAt: string; updatedAt: string;
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
            {run.comparisonType === 'configuration' ? 'Configuration comparison' : 'Database schema comparison'} · {new Date(run.createdAt).toLocaleString('en-AU')}
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
                <p className="text-[11px] text-gray-400 italic">{run.comparisonType === 'configuration' ? 'No config keys found on either side.' : 'No tables found on either side.'}</p>
              ) : (
                <div className="bg-white border rounded-md overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-100 text-gray-500 text-left">
                        <th className="px-2 py-1.5 font-medium">{run.comparisonType === 'configuration' ? 'Config Key' : 'Table'}</th>
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

export interface DatabaseAdapterStatus { technology: string; status: string }

const CONFIG_ENV_OPTIONS = ['production', 'staging', 'uat', 'development', 'other'];

/** Real, staff-entered configuration snapshot creation — the input side of the Configuration comparison type (migration 052). */
function SnapshotForm({ clientId, onCreated, onCancel }: { clientId: string; onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseConfig(text: string): { config: Record<string, string> | null; error: string | null } {
    const config: Record<string, string> = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq === -1) return { config: null, error: `Line "${line}" is not in KEY=VALUE format.` };
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!key) return { config: null, error: `Line "${line}" is missing a key before "=".` };
      config[key] = value;
    }
    return { config, error: null };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { config, error: parseError } = parseConfig(raw);
    if (parseError || !config || Object.keys(config).length === 0) {
      setError(parseError || 'Enter at least one KEY=VALUE line.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-snapshots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), environment, config }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not save this snapshot.'); return; }
      onCreated();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 mb-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Snapshot name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Checkout Service Config" className="w-full border rounded-md px-3 py-2 text-sm" />
          <p className="text-[9px] text-gray-400 mt-0.5">A short, recognizable label for this configuration capture.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Environment *</label>
          <select value={environment} onChange={e => setEnvironment(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm capitalize">
            {CONFIG_ENV_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
          </select>
          <p className="text-[9px] text-gray-400 mt-0.5">Which real environment this configuration was captured from.</p>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Configuration (one KEY=VALUE per line) *</label>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} required rows={6} placeholder={'LOG_LEVEL=info\nFEATURE_FLAG_X=true\nAPI_TIMEOUT_MS=3000'} className="w-full border rounded-md px-3 py-2 text-sm font-mono" />
        <p className="text-[9px] text-gray-400 mt-0.5">
          Paste real config values (e.g. from a <code>.env</code> file or app config) — never invented. Lines starting with <code>#</code> are ignored.
          Secret-shaped keys (password/secret/token/key/credential) are automatically masked wherever this snapshot's values are displayed.
        </p>
      </div>
      {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <Action type="submit" variant="primary" loading={saving}>Save Snapshot</Action>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}

export function ComparisonsManager({ clientId, initialRuns, connections, adapters, initialSnapshots }: { clientId: string; initialRuns: ComparisonRun[]; connections: DatabaseConnection[]; adapters: DatabaseAdapterStatus[]; initialSnapshots: ConfigurationSnapshot[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [mode, setMode] = useState<'database_schema' | 'configuration'>('database_schema');
  const [showForm, setShowForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real capability negotiation, not a hard-coded 'postgresql' check: a
  // connection is only selectable for comparison if the Technology
  // Adapter Registry (migration 051) reports its connector_type as
  // `supported`. Unregistered/adapter_required technologies are never
  // silently attempted — see the disabled, honestly-labelled options below.
  const adapterStatus = new Map(adapters.map(a => [a.technology, a.status]));
  const statusOf = (connectorType: string) => adapterStatus.get(connectorType) ?? 'unknown_technology';
  const comparableConnections = connections.filter(c => statusOf(c.connectorType) === 'supported');
  const blockedConnections = connections.filter(c => statusOf(c.connectorType) !== 'supported');

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/comparisons`);
    if (res.ok) setRuns((await res.json()).runs);
  }
  async function refreshSnapshots() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-snapshots`);
    if (res.ok) setSnapshots((await res.json()).snapshots);
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!leftId || !rightId) { setError(mode === 'configuration' ? 'Choose two different snapshots to compare.' : 'Choose two different connections to compare.'); return; }
    if (leftId === rightId) { setError(mode === 'configuration' ? 'Choose two different snapshots — comparing one against itself is not meaningful.' : 'Choose two different connections — comparing a connection against itself is not meaningful.'); return; }
    setRunning(true); setError(null);
    try {
      const url = mode === 'configuration' ? `${API}/api/v1/oc/clients/${clientId}/comparisons/configuration` : `${API}/api/v1/oc/clients/${clientId}/comparisons/database-schema`;
      const payload = mode === 'configuration' ? { leftSnapshotId: leftId, rightSnapshotId: rightId } : { leftConnectionId: leftId, rightConnectionId: rightId };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not run this comparison.'); return; }
      setLeftId(''); setRightId(''); setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setRunning(false); }
  }

  const canRunDbSchema = comparableConnections.length >= 2;
  const canRunConfig = snapshots.length >= 2;

  return (
    <div>
      {comparableConnections.length < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 text-[11px] text-amber-800">
          At least two connections with a real, supported adapter are needed to run a database schema comparison. Add them from the
          <span className="font-medium"> Lifecycle</span> tab's Database Connections section.
        </div>
      )}
      {blockedConnections.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 mb-4 text-[11px] text-gray-600">
          <p className="font-medium text-gray-700 mb-1">Not available for comparison — honest adapter status, not hidden silently:</p>
          <ul className="space-y-0.5">
            {blockedConnections.map(c => (
              <li key={c.id}>
                <span className="font-mono">{c.name}</span> ({c.connectorType}) — <span className="font-medium">{statusOf(c.connectorType) === 'unknown_technology' ? 'Unknown Technology' : 'Adapter Required'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Configuration snapshots — the input side of the Configuration comparison type */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-gray-800">Configuration Snapshots</p>
            <p className="text-[9px] text-gray-400 mt-0.5">Real, staff-entered configuration captures — used as the two sides of a Configuration comparison.</p>
          </div>
          <button onClick={() => setShowSnapshotForm(v => !v)} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">
            {showSnapshotForm ? 'Cancel' : '+ Add Snapshot'}
          </button>
        </div>
        {showSnapshotForm && (
          <SnapshotForm clientId={clientId} onCreated={() => { setShowSnapshotForm(false); refreshSnapshots(); }} onCancel={() => setShowSnapshotForm(false)} />
        )}
        {snapshots.length === 0 ? (
          <p className="text-[10px] text-gray-400 italic">No configuration snapshots yet for this client.</p>
        ) : (
          <ul className="space-y-1">
            {snapshots.map(s => (
              <li key={s.id} className="text-[10px] text-gray-600 flex items-center gap-2">
                <span className="font-medium text-gray-800">{s.name}</span>
                <span className="capitalize text-gray-400">({s.environment})</span>
                <span className="text-gray-400">· {Object.keys(s.config).length} key{Object.keys(s.config).length !== 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex rounded-md border overflow-hidden text-[10px] font-semibold">
          <button onClick={() => { setMode('database_schema'); setLeftId(''); setRightId(''); setError(null); }} className={`px-3 py-1.5 ${mode === 'database_schema' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Database Schema</button>
          <button onClick={() => { setMode('configuration'); setLeftId(''); setRightId(''); setError(null); }} className={`px-3 py-1.5 border-l ${mode === 'configuration' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Configuration</button>
        </div>
        <Action variant="primary" onClick={() => setShowForm(v => !v)} disabled={mode === 'configuration' ? !canRunConfig : !canRunDbSchema}>
          {showForm ? 'Cancel' : '+ New Comparison'}
        </Action>
      </div>

      {showForm && (
        <form onSubmit={handleRun} className="bg-white rounded-xl border p-5 mb-6 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Left side (baseline) *</label>
            <select value={leftId} onChange={e => setLeftId(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">{mode === 'configuration' ? 'Select a snapshot…' : 'Select a connection…'}</option>
              {mode === 'configuration'
                ? snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({s.environment})</option>)
                : comparableConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.environment})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Right side (comparison target) *</label>
            <select value={rightId} onChange={e => setRightId(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">{mode === 'configuration' ? 'Select a snapshot…' : 'Select a connection…'}</option>
              {mode === 'configuration'
                ? snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({s.environment})</option>)
                : comparableConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.environment})</option>)}
            </select>
          </div>
          <p className="sm:col-span-2 text-[9px] text-gray-400">
            {mode === 'configuration'
              ? 'Real key-value diff: added, removed, changed, and unchanged keys are all reported — never fabricated.'
              : 'Both sides must have a real, stored credential (tested successfully at least once). A connection whose credential is unavailable will honestly report unresolved tables rather than guessing.'}
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
