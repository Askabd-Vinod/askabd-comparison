'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * UAT (User Acceptance Testing) — real, per-client cycles backed by
 * `uat-service.ts` / `uat-routes.ts` (`uat_test_1`, 2026-08-24). Third of
 * the 11 engines wired into the staff UI this pass (Phase 3, "ASKABD
 * ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 *
 * Deliberate staff/customer split, matching the real route design
 * (uat-routes.ts's own header comment): staff CREATE cycles (picking real
 * test cases from the already-real Testing Engine) and DECIDE sign-off;
 * the CLIENT executes test cases and REQUESTS sign-off via the customer
 * portal (`/oc/portal/:clientId/uat/*`, out of scope for this staff page).
 * This page is therefore read/decide-oriented for execution progress, not
 * an execution-recording UI — recording an execution here would bypass the
 * entire point of the engine (the client's own acceptance).
 *
 * A sign-off cannot be requested until every test case reaches a terminal
 * result (pass/fail/blocked/skipped/not_applicable) — enforced server-side
 * by `SignoffNotReadyError`; this page only ever reflects that real state,
 * never invents a "ready" indicator of its own.
 */
type ExecutionStatus = 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_executed' | 'not_applicable';
type ApprovalStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded';

interface UatCycle { id: string; clientId: string; name: string; description: string; testCaseIds: string[]; createdBy: string | null; createdAt: string }
interface TestCase { id: string; title: string; priority: string; category: string }
interface TestExecution { id: string; status: ExecutionStatus; actualResult: string; executedBy: string | null; executedAt: string }
interface UatTestCaseStatus { testCaseId: string; title: string; description: string; expectedResult: string; priority: string; latestExecution: TestExecution | null }
interface UatProgress { total: number; passed: number; failed: number; blocked: number; skipped: number; notApplicable: number; notExecuted: number; allTerminal: boolean }
interface ApprovalWorkflow { id: string; status: ApprovalStatus; decidedAt: string | null; decisionNote: string | null }

const EXEC_META: Record<ExecutionStatus, { label: string; className: string }> = {
  pass: { label: 'Pass', className: 'text-green-700 bg-green-50 border-green-200' },
  fail: { label: 'Fail', className: 'text-red-700 bg-red-50 border-red-200' },
  blocked: { label: 'Blocked', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  skipped: { label: 'Skipped', className: 'text-gray-500 bg-gray-100 border-gray-200' },
  not_executed: { label: 'Not Executed', className: 'text-gray-400 bg-gray-50 border-gray-200 border-dashed' },
  not_applicable: { label: 'N/A', className: 'text-gray-400 bg-gray-50 border-gray-200' },
};

function ExecBadge({ status }: { status: ExecutionStatus }) {
  const m = EXEC_META[status];
  return <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function UatPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [cycles, setCycles] = useState<UatCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/uat/cycles`);
      if (res.ok) setCycles((await res.json()).cycles ?? []);
      else if (res.status === 401 || res.status === 403) setError('You are not authorized to manage UAT for this client.');
      else setError('Unable to load UAT cycles. The backend may be unavailable.');
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading UAT cycles...</div>;
  if (error) return <div className="p-6"><ErrorState what="UAT cycles could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">User Acceptance Testing</h2>
      <p className="text-xs text-gray-500 mb-4">
        Real UAT cycles for this engagement. The client executes each cycle&apos;s test cases and requests sign-off from their own portal — this page tracks real progress and decides sign-off, it never records executions on the client&apos;s behalf.
      </p>

      {cycles.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"><Stat label="Cycles" value={cycles.length} /></div>}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">UAT Cycles</h3>
        <div className="space-y-2">
          {cycles.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No UAT cycles yet</p>
              <p className="text-xs text-blue-700 mt-1">Create the first real cycle below, selecting test cases from this client&apos;s real test-case catalog.</p>
            </div>
          )}
          {cycles.map(c => <CycleRow key={c.id} clientId={clientId} cycle={c} />)}
          <AddCycleRow clientId={clientId} onCreated={() => load(clientId)} />
        </div>
      </section>
    </div>
  );
}

function AddCycleRow({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const panelId = useId();

  useEffect(() => {
    if (!expanded || testCases.length > 0) return;
    staffFetch(`/api/v1/oc/clients/${clientId}/test-cases`).then(async r => {
      if (r.ok) setTestCases(((await r.json()).testCases ?? []).map((t: TestCase) => ({ id: t.id, title: t.title, priority: t.priority, category: t.category })));
    }).catch(() => { /* picker just stays empty — non-fatal */ });
  }, [expanded, clientId, testCases.length]);

  function toggle(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function submit() {
    if (!name.trim()) { setErr('A real cycle name is required.'); return; }
    if (selected.size === 0) { setErr('Select at least one real test case for this cycle.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/uat/cycles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description, testCaseIds: Array.from(selected) }),
      });
      if (res.ok) { setName(''); setDescription(''); setSelected(new Set()); setExpanded(false); onCreated(); }
      else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not create this UAT cycle.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden border-dashed border-purple-200">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium">+ Create a UAT cycle</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Add'}</button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Cycle Name<span className="text-red-500 ml-0.5">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="e.g. Release 2.4 — Client Acceptance" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Test Cases<span className="text-red-500 ml-0.5">*</span> ({selected.size} selected)</label>
            {testCases.length === 0 ? (
              <p className="text-[10px] text-gray-400">No real test cases exist yet for this client — add some on the Testing tab first, or via the Testing Engine.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border rounded bg-white divide-y">
                {testCases.map(tc => (
                  <label key={tc.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px] cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selected.has(tc.id)} onChange={() => toggle(tc.id)} />
                    <span className="flex-1">{tc.title}</span>
                    <span className="text-[9px] text-gray-400 uppercase">{tc.priority} · {tc.category}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">{saving ? 'Creating…' : 'Create Cycle'}</Action>
        </div>
      )}
    </div>
  );
}

function CycleRow({ clientId, cycle }: { clientId: string; cycle: UatCycle }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testCases, setTestCases] = useState<UatTestCaseStatus[]>([]);
  const [progress, setProgress] = useState<UatProgress | null>(null);
  const [signoff, setSignoff] = useState<{ current: ApprovalWorkflow | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const panelId = useId();

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/uat/cycles/${cycle.id}/status`);
      if (res.ok) {
        const data = await res.json();
        setTestCases(data.testCases ?? []);
        setProgress(data.progress ?? null);
        setSignoff(data.signoff ?? null);
      }
    } catch { /* non-fatal — row shows what it has */ }
    setLoadingStatus(false);
  }, [clientId, cycle.id]);

  useEffect(() => { if (expanded) loadStatus(); }, [expanded, loadStatus]);

  async function decide(decision: 'approve' | 'reject' | 'request-changes') {
    if (!signoff?.current) return;
    if (decision !== 'approve' && !note.trim()) { setErr(decision === 'reject' ? 'A reason is required to reject a sign-off.' : 'A note is required to request changes.'); return; }
    setBusy(decision); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/uat/cycles/${cycle.id}/signoff/${signoff.current.id}/${decision}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note || undefined }),
      });
      if (res.ok) { setNote(''); loadStatus(); } else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'That decision could not be recorded.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  const pendingSignoff = signoff?.current?.status === 'in_review';

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{cycle.name}</span>
          <p className="text-[9px] text-gray-400">{cycle.testCaseIds.length} test case{cycle.testCaseIds.length === 1 ? '' : 's'} · Created {new Date(cycle.createdAt).toLocaleDateString('en-AU')}</p>
        </div>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'View Progress'}</button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {cycle.description && <p className="text-xs text-gray-700">{cycle.description}</p>}
          {loadingStatus && <p className="text-xs text-gray-400">Loading progress…</p>}
          {progress && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <Stat label="Pass" value={progress.passed} color="text-green-600" />
              <Stat label="Fail" value={progress.failed} color="text-red-600" />
              <Stat label="Blocked" value={progress.blocked} color="text-orange-600" />
              <Stat label="Skipped" value={progress.skipped} color="text-gray-500" />
              <Stat label="N/A" value={progress.notApplicable} color="text-gray-400" />
              <Stat label="Not Executed" value={progress.notExecuted} color="text-gray-400" />
            </div>
          )}
          {testCases.length > 0 && (
            <div className="bg-white border rounded divide-y">
              {testCases.map(tc => (
                <div key={tc.testCaseId} className="flex items-center justify-between px-3 py-2 gap-2">
                  <span className="text-[11px] text-gray-700 min-w-0 truncate">{tc.title}</span>
                  {tc.latestExecution ? <ExecBadge status={tc.latestExecution.status} /> : <ExecBadge status="not_executed" />}
                </div>
              ))}
            </div>
          )}

          {err && <p className="text-[10px] text-red-600">{err}</p>}

          {signoff?.current ? (
            <div className={`rounded-md border p-2 text-[11px] ${pendingSignoff ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-600'}`}>
              Sign-off workflow: {signoff.current.status}
              {pendingSignoff && (
                <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (required to reject / request changes)…" className="border rounded px-2 py-1 text-[10px] flex-1 min-w-[160px]" />
                  <button onClick={() => decide('approve')} disabled={busy === 'approve'} className="text-[10px] font-medium px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">Approve Sign-off</button>
                  <button onClick={() => decide('request-changes')} disabled={busy === 'request-changes'} className="text-[10px] font-medium px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">Request Changes</button>
                  <button onClick={() => decide('reject')} disabled={busy === 'reject'} className="text-[10px] font-medium px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                </div>
              )}
            </div>
          ) : (
            progress && !progress.allTerminal && (
              <p className="text-[10px] text-gray-400">Sign-off cannot be requested by the client until every test case reaches a final result ({progress.notExecuted} outstanding).</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
