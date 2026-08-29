'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Data Reconciliation — real, row-level source-vs-target reconciliation
 * runs backed by `oc_data_reconciliation_runs` (data-reconciliation-engine.ts
 * / data-reconciliation-routes.ts, `data_reconciliation_test_1`, 2026-08-24).
 * Sixth of the 11 engines wired into the staff UI (Phase 3, "ASKABD
 * ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 *
 * Distinct from the pre-existing "Reconciliation" tab, which covers
 * financial/payment reconciliation — a different, unrelated engine
 * (`oc/clients/:id/reconciliation` / `.../reconciliation/exceptions`),
 * verified before naming this tab "Data Reconciliation" to avoid collision.
 *
 * Real, honestly-disclosed scope limit surfaced directly from the engine:
 * row-level reconciliation only runs when BOTH connections are
 * `postgresql` — any other connector type produces a real, visible
 * per-table `error` result explaining the limitation (never a fabricated
 * match/mismatch). This page renders that `error` status exactly as
 * returned, never hidden or reinterpreted as a pass.
 */
type RunStatus = 'completed' | 'completed_with_differences' | 'failed';
type TableStatus = 'match' | 'mismatch' | 'missing_in_target' | 'missing_in_source' | 'error';

interface TableResult {
  table: string; status: TableStatus; sourceRowCount: number | null; targetRowCount: number | null;
  rowCountDifference: number | null; withinTolerance: boolean; sourceChecksum: string | null; targetChecksum: string | null;
  checksumMatch: boolean | null; evidence: string[];
}
interface ReconciliationRun {
  id: string; clientId: string; name: string; sourceConnectionId: string; targetConnectionId: string;
  tolerancePercent: number; status: RunStatus; results: TableResult[];
  summary: { total: number; matched: number; mismatched: number; missing: number; errored: number };
  createdBy: string | null; createdAt: string;
}
interface DbConnection { id: string; name: string; connectorType: string; environment: string }

const RUN_STATUS_META: Record<RunStatus, { label: string; className: string }> = {
  completed: { label: 'Completed — All Matched', className: 'text-green-700 bg-green-50 border-green-200' },
  completed_with_differences: { label: 'Completed — Differences Found', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  failed: { label: 'Failed', className: 'text-red-700 bg-red-50 border-red-200' },
};
const TABLE_STATUS_META: Record<TableStatus, { icon: string; className: string }> = {
  match: { icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  mismatch: { icon: '✕', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  missing_in_target: { icon: '→', className: 'text-red-700 bg-red-50 border-red-200' },
  missing_in_source: { icon: '←', className: 'text-red-700 bg-red-50 border-red-200' },
  error: { icon: '!', className: 'text-gray-500 bg-gray-100 border-gray-200' },
};

function RunBadge({ status }: { status: RunStatus }) {
  const m = RUN_STATUS_META[status];
  return <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}>{m.label}</span>;
}
function TableBadge({ status }: { status: TableStatus }) {
  const m = TABLE_STATUS_META[status];
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}><span aria-hidden="true">{m.icon}</span>{status.replace(/_/g, ' ')}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function DataReconciliationPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/reconciliation-runs`);
      if (res.ok) setRuns((await res.json()).runs ?? []);
      else if (res.status === 401 || res.status === 403) setError('You are not authorized to view data reconciliation for this client.');
      else setError('Unable to load reconciliation runs. The backend may be unavailable.');
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading reconciliation runs...</div>;
  if (error) return <div className="p-6"><ErrorState what="Reconciliation runs could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Data Reconciliation</h2>
      <p className="text-xs text-gray-500 mb-4">Real, row-level source-vs-target reconciliation — row counts and a deterministic checksum per table, computed live against real database connections. Distinct from the Reconciliation tab (financial/payment reconciliation).</p>

      {runs.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"><Stat label="Runs" value={runs.length} /></div>}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Reconciliation Runs</h3>
        <div className="space-y-2">
          {runs.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No reconciliation runs yet</p>
              <p className="text-xs text-blue-700 mt-1">Run the first real reconciliation below, choosing two of this client&apos;s real database connections.</p>
            </div>
          )}
          {runs.map(r => <RunRow key={r.id} run={r} />)}
          <AddRunRow clientId={clientId} onCreated={() => load(clientId)} />
        </div>
      </section>
    </div>
  );
}

function AddRunRow({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [name, setName] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [tables, setTables] = useState('');
  const [tolerancePercent, setTolerancePercent] = useState('0');
  const panelId = useId();

  useEffect(() => {
    if (!expanded || connections.length > 0) return;
    staffFetch(`/api/v1/oc/clients/${clientId}/database-connections`).then(async r => {
      if (r.ok) setConnections(((await r.json()).connections ?? []).map((c: DbConnection) => ({ id: c.id, name: c.name, connectorType: c.connectorType, environment: c.environment })));
    }).catch(() => { /* picker just stays empty — non-fatal */ });
  }, [expanded, clientId, connections.length]);

  async function submit() {
    if (!name.trim()) { setErr('A real run name is required.'); return; }
    if (!sourceId || !targetId) { setErr('Choose both a source and a target connection.'); return; }
    if (sourceId === targetId) { setErr('Source and target must be two different connections.'); return; }
    const tableList = tables.split(',').map(t => t.trim()).filter(Boolean);
    if (tableList.length === 0) { setErr('At least one real table name is required.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/reconciliation-runs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sourceConnectionId: sourceId, targetConnectionId: targetId, tables: tableList, tolerancePercent: Number(tolerancePercent) || 0 }),
      });
      if (res.ok) { setName(''); setSourceId(''); setTargetId(''); setTables(''); setTolerancePercent('0'); setExpanded(false); onCreated(); }
      else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not start this reconciliation run.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden border-dashed border-purple-200">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium">+ Run a reconciliation</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Add'}</button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Run Name<span className="text-red-500 ml-0.5">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="e.g. Post-migration verification — Customer + Orders" />
          </div>
          {connections.length === 0 ? (
            <p className="text-[10px] text-gray-400">No real database connections exist yet for this client — add one on the Connectors tab first.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Source Connection<span className="text-red-500 ml-0.5">*</span></label>
                <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs">
                  <option value="">Choose…</option>
                  {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.connectorType}, {c.environment})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Target Connection<span className="text-red-500 ml-0.5">*</span></label>
                <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs">
                  <option value="">Choose…</option>
                  {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.connectorType}, {c.environment})</option>)}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Tables, comma-separated<span className="text-red-500 ml-0.5">*</span></label>
            <input value={tables} onChange={e => setTables(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="e.g. customers, orders, order_items" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Row-Count Tolerance (%)</label>
            <input type="number" min="0" value={tolerancePercent} onChange={e => setTolerancePercent(e.target.value)} className="w-32 border rounded px-2 py-1.5 text-xs" />
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">{saving ? 'Running…' : 'Run Reconciliation'}</Action>
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: ReconciliationRun }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{run.name}</span>
          <p className="text-[9px] text-gray-400">{run.summary.total} table{run.summary.total === 1 ? '' : 's'} · {new Date(run.createdAt).toLocaleString('en-AU')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RunBadge status={run.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Details'}</button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Total" value={run.summary.total} />
            <Stat label="Matched" value={run.summary.matched} color="text-green-600" />
            <Stat label="Mismatched" value={run.summary.mismatched} color="text-orange-600" />
            <Stat label="Missing" value={run.summary.missing} color="text-red-600" />
            <Stat label="Errored" value={run.summary.errored} color="text-gray-500" />
          </div>
          <div className="bg-white border rounded divide-y">
            {run.results.map((t, i) => (
              <div key={i} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-gray-700">{t.table}</span>
                  <TableBadge status={t.status} />
                </div>
                {(t.sourceRowCount !== null || t.targetRowCount !== null) && (
                  <p className="text-[10px] text-gray-500">Rows: source {t.sourceRowCount ?? '—'} · target {t.targetRowCount ?? '—'}{t.rowCountDifference !== null ? ` · diff ${t.rowCountDifference}` : ''}{t.withinTolerance ? ' (within tolerance)' : ''}</p>
                )}
                {t.checksumMatch !== null && <p className="text-[10px] text-gray-500">Checksum: {t.checksumMatch ? 'match' : 'mismatch'}</p>}
                {t.evidence.length > 0 && t.evidence.map((e, j) => <p key={j} className="text-[10px] text-gray-400">{e}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
