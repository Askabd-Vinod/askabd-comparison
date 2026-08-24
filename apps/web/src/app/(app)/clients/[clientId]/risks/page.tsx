'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Risk Register — real, per-client risk management backed by `oc_risks`
 * (risk-engine.ts / risk-routes.ts, `risk_test_1`, 2026-08-24). Follows the
 * same real-data, no-fabricated-percentage discipline as every other page in
 * this app: severity is a deterministic probability x impact matrix computed
 * server-side (never client-guessed), and every status transition here calls
 * the real state machine — this page invents no parallel notion of "risk."
 *
 * Layout follows the app's canonical multi-record pattern (Connector
 * Configuration page): section cards, independently expandable rows, a
 * summary Stat strip, and an "+ Add" row for creating new records. Status
 * badges here use a bespoke lifecycle vocabulary (open/mitigated/accepted/
 * transferred/closed) rather than `EvidenceBadge` — that component's
 * verified/failed/checking vocabulary describes connectivity-test evidence,
 * not a risk's workflow state; `requests/page.tsx` established this same
 * bespoke-lifecycle-badge precedent for an analogous workflow-status page.
 *
 * REPLACES a real, different, already-honest "Risks" page (health-score
 * dimension weaknesses, fixed in the 2026-08-22 UX audit) that previously
 * lived at this exact tab. Verified before replacing, not assumed safe:
 * that data is not lost — `scorecard/page.tsx` already renders the identical
 * `topRisks` / per-dimension `weaknesses` / `recommendedActions` fields from
 * the same `GET /health-score` endpoint (a superset of what this page used
 * to show). This tab now surfaces the real, dedicated Risk Engine
 * (`oc_risks` / risk-engine.ts, 2026-08-24) instead — a formal register with
 * severity, mitigation/contingency plans, and an acceptance workflow, which
 * had zero UI anywhere in the app until this page (Phase 3, "ASKABD
 * ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 */
type RiskSource =
  | 'requirements' | 'gaps' | 'security' | 'migration' | 'data' | 'deployment'
  | 'testing' | 'compliance' | 'architecture' | 'operations' | 'dependencies'
  | 'vendors' | 'business_continuity' | 'other';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type RiskProbability = 'low' | 'medium' | 'high';
type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'transferred' | 'closed';
type ApprovalStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded';

interface RiskEvent { event: string; fromStatus: RiskStatus | null; toStatus: RiskStatus; actor: string | null; timestamp: string; reason?: string }
interface Risk {
  id: string; clientId: string; title: string; description: string; source: RiskSource;
  sourceType: string | null; sourceId: string | null; probability: RiskProbability; impact: RiskLevel;
  severity: RiskLevel; owner: string | null; mitigation: string; contingency: string; status: RiskStatus;
  dueDate: string | null; residualRisk: RiskLevel | null; approvalWorkflowId: string | null;
  events: RiskEvent[]; createdBy: string | null; createdAt: string; updatedAt: string;
}
interface ApprovalWorkflow {
  id: string; status: ApprovalStatus; title: string; submittedBy: string | null; submittedAt: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
}

const SOURCES: RiskSource[] = ['requirements', 'gaps', 'security', 'migration', 'data', 'deployment', 'testing', 'compliance', 'architecture', 'operations', 'dependencies', 'vendors', 'business_continuity', 'other'];
const LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
const PROBABILITIES: RiskProbability[] = ['low', 'medium', 'high'];

const SEVERITY_META: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: 'Low', className: 'text-gray-600 bg-gray-50 border-gray-200' },
  medium: { label: 'Medium', className: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  high: { label: 'High', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  critical: { label: 'Critical', className: 'text-red-700 bg-red-50 border-red-200' },
};
const STATUS_META: Record<RiskStatus, { label: string; icon: string; className: string }> = {
  open: { label: 'Open', icon: '●', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  mitigated: { label: 'Mitigated', icon: '◐', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  accepted: { label: 'Accepted', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  transferred: { label: 'Transferred', icon: '→', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  closed: { label: 'Closed', icon: '✕', className: 'text-gray-500 bg-gray-100 border-gray-200' },
};

function SeverityBadge({ level }: { level: RiskLevel }) {
  const m = SEVERITY_META[level];
  return <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}>{m.label}</span>;
}
function StatusBadge({ status }: { status: RiskStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${m.className}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function RiskRegisterPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/risks`);
      if (res.ok) {
        setRisks((await res.json()).risks ?? []);
      } else if (res.status === 401 || res.status === 403) {
        setError('You are not authorized to manage the risk register for this client.');
      } else {
        setError('Unable to load risks. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading risk register...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState what="Risk register could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} />
    </div>
  );

  const bySeverity: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byStatus: Record<RiskStatus, number> = { open: 0, mitigated: 0, accepted: 0, transferred: 0, closed: 0 };
  for (const r of risks) { bySeverity[r.severity]++; byStatus[r.status]++; }

  const visible = risks.filter(r => (statusFilter ? r.status === statusFilter : showClosed || r.status !== 'closed'));

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Risk Register</h2>
      <p className="text-xs text-gray-500 mb-4">
        Real risks tracked for this engagement. Severity is computed automatically from probability x impact — never entered directly.
      </p>

      {risks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Total" value={risks.length} />
          <Stat label="Open" value={byStatus.open} color="text-blue-600" />
          <Stat label="Critical / High" value={bySeverity.critical + bySeverity.high} color="text-red-600" />
          <Stat label="Closed" value={byStatus.closed} color="text-gray-500" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {['', 'open', 'mitigated', 'accepted', 'transferred', 'closed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            {s === '' ? 'All' : STATUS_META[s as RiskStatus].label}
          </button>
        ))}
        {!statusFilter && (
          <label className="text-[11px] text-gray-500 ml-2 flex items-center gap-1">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
            Show closed
          </label>
        )}
      </div>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Risks</h3>
        <div className="space-y-2">
          {visible.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No risks {statusFilter ? `with status "${STATUS_META[statusFilter as RiskStatus].label}"` : 'recorded yet'}</p>
              <p className="text-xs text-blue-700 mt-1">Add the first real risk for this engagement below.</p>
            </div>
          )}
          {visible.map(r => (
            <RiskRow key={r.id} clientId={clientId} risk={r} onChanged={() => load(clientId)} />
          ))}
          <AddRiskRow clientId={clientId} onCreated={() => load(clientId)} />
        </div>
      </section>
    </div>
  );
}

function AddRiskRow({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', source: 'other' as RiskSource, probability: 'medium' as RiskProbability,
    impact: 'medium' as RiskLevel, owner: '', mitigation: '', contingency: '', dueDate: '',
  });
  const panelId = useId();

  async function submit() {
    if (!form.title.trim()) { setErr('A real title is required.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/risks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, dueDate: form.dueDate || undefined }),
      });
      if (res.ok) {
        setForm({ title: '', description: '', source: 'other', probability: 'medium', impact: 'medium', owner: '', mitigation: '', contingency: '', dueDate: '' });
        setExpanded(false);
        onCreated();
      } else {
        const body = await res.json().catch(() => ({}));
        setErr(body?.error?.message || 'Could not create this risk. Please try again.');
      }
    } catch (e) {
      setErr(`Could not reach AskABD: ${(e as Error).message}`);
    }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden border-dashed border-purple-200">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium">+ Add a risk</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
          {expanded ? 'Close' : 'Add'}
        </button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Title<span className="text-red-500 ml-0.5">*</span></label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="e.g. Legacy API rate limits may block bulk migration" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500" />
          </div>
          <div className="grid md:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Source</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as RiskSource }))} className="w-full border rounded px-2 py-1.5 text-xs">
                {SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Probability<span className="text-red-500 ml-0.5">*</span></label>
              <select value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value as RiskProbability }))} className="w-full border rounded px-2 py-1.5 text-xs">
                {PROBABILITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Impact<span className="text-red-500 ml-0.5">*</span></label>
              <select value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value as RiskLevel }))} className="w-full border rounded px-2 py-1.5 text-xs">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Owner</label>
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Mitigation Plan</label>
              <textarea value={form.mitigation} onChange={e => setForm(f => ({ ...f, mitigation: e.target.value }))} rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Contingency Plan</label>
              <textarea value={form.contingency} onChange={e => setForm(f => ({ ...f, contingency: e.target.value }))} rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">
            {saving ? 'Creating…' : 'Create Risk'}
          </Action>
        </div>
      )}
    </div>
  );
}

const ALLOWED_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ['mitigated', 'accepted', 'transferred', 'closed'],
  mitigated: ['open', 'closed'],
  accepted: ['closed'],
  transferred: ['closed'],
  closed: [],
};

function RiskRow({ clientId, risk, onChanged }: { clientId: string; risk: Risk; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [residual, setResidual] = useState<RiskLevel>('low');
  const [note, setNote] = useState('');
  const [justification, setJustification] = useState('');
  const [acceptance, setAcceptance] = useState<{ current: ApprovalWorkflow | null } | null>(null);
  const panelId = useId();

  const loadAcceptance = useCallback(async () => {
    if (!risk.approvalWorkflowId) return;
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/risks/${risk.id}/acceptance`);
      if (res.ok) setAcceptance(await res.json());
    } catch { /* non-fatal — the badge above already reflects real status */ }
  }, [clientId, risk.id, risk.approvalWorkflowId]);

  useEffect(() => { if (expanded) loadAcceptance(); }, [expanded, loadAcceptance]);

  async function act(action: string, body: Record<string, unknown>, needsField?: { value: string; message: string }) {
    if (needsField && !needsField.value.trim()) { setErr(needsField.message); return; }
    setBusy(action); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/risks/${risk.id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) { setNote(''); setJustification(''); onChanged(); } else {
        const b = await res.json().catch(() => ({}));
        setErr(b?.error?.message || 'That action could not be completed.');
      }
    } catch (e) {
      setErr(`Could not reach AskABD: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  const canRequestAcceptance = risk.status === 'open' && !risk.approvalWorkflowId;
  const pendingAcceptance = acceptance?.current?.status === 'in_review';
  const allowed = ALLOWED_TRANSITIONS[risk.status];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{risk.title}</span>
          <p className="text-[9px] text-gray-400">{risk.source.replace(/_/g, ' ')}{risk.owner ? ` · Owner: ${risk.owner}` : ''}{risk.dueDate ? ` · Due ${new Date(risk.dueDate).toLocaleDateString('en-AU')}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SeverityBadge level={risk.severity} />
          <StatusBadge status={risk.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {risk.description && <p className="text-xs text-gray-700">{risk.description}</p>}
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div><span className="text-[10px] text-gray-400 uppercase">Probability</span><p className="text-gray-700">{risk.probability}</p></div>
            <div><span className="text-[10px] text-gray-400 uppercase">Impact</span><p className="text-gray-700">{risk.impact}</p></div>
            {risk.mitigation && <div className="md:col-span-2"><span className="text-[10px] text-gray-400 uppercase">Mitigation Plan</span><p className="text-gray-700">{risk.mitigation}</p></div>}
            {risk.contingency && <div className="md:col-span-2"><span className="text-[10px] text-gray-400 uppercase">Contingency Plan</span><p className="text-gray-700">{risk.contingency}</p></div>}
            {risk.residualRisk && <div><span className="text-[10px] text-gray-400 uppercase">Residual Risk (after mitigation)</span><p className="text-gray-700">{risk.residualRisk}</p></div>}
          </div>

          {risk.approvalWorkflowId && (
            <div className={`rounded-md border p-2 text-[11px] ${pendingAcceptance ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-600'}`}>
              Risk-acceptance workflow: {acceptance?.current?.status ?? 'checking…'}
              {pendingAcceptance && (
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => act('acceptance/approve', { note: note || undefined })} disabled={busy === 'acceptance/approve'} className="text-[10px] font-medium px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">Approve Acceptance</button>
                  <button onClick={() => act('acceptance/reject', { note }, { value: note, message: 'A reason is required to reject a risk-acceptance request.' })} disabled={busy === 'acceptance/reject'} className="text-[10px] font-medium px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                </div>
              )}
            </div>
          )}

          {risk.events.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-400 uppercase">History</span>
              <div className="space-y-0.5 mt-1">
                {risk.events.map((e, i) => (
                  <p key={i} className="text-[10px] text-gray-500">{new Date(e.timestamp).toLocaleString('en-AU')} — {e.event}{e.reason ? `: ${e.reason}` : ''}</p>
                ))}
              </div>
            </div>
          )}

          {err && <p className="text-[10px] text-red-600">{err}</p>}

          {allowed.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note / reason (required for reopen, transfer, close)…" className="w-full border rounded px-2 py-1.5 text-xs" />
              <div className="flex flex-wrap items-center gap-2">
                {canRequestAcceptance && (
                  <div className="flex items-center gap-1">
                    <input value={justification} onChange={e => setJustification(e.target.value)} placeholder="Justification for accepting this risk…" className="border rounded px-2 py-1.5 text-xs w-56" />
                    <button onClick={() => act('acceptance/request', { justification }, { value: justification, message: 'A justification is required to request risk acceptance.' })} disabled={busy === 'acceptance/request'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">
                      {busy === 'acceptance/request' ? 'Requesting…' : 'Request Acceptance'}
                    </button>
                  </div>
                )}
                {allowed.includes('mitigated') && (
                  <div className="flex items-center gap-1">
                    <select value={residual} onChange={e => setResidual(e.target.value as RiskLevel)} className="border rounded px-2 py-1.5 text-xs">
                      {LEVELS.map(l => <option key={l} value={l}>{l} residual</option>)}
                    </select>
                    <button onClick={() => act('mitigate', { residualRisk: residual, note: note || undefined })} disabled={busy === 'mitigate'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                      {busy === 'mitigate' ? 'Saving…' : 'Mark Mitigated'}
                    </button>
                  </div>
                )}
                {allowed.includes('open') && (
                  <button onClick={() => act('reopen', { reason: note }, { value: note, message: 'A reason is required to reopen a risk.' })} disabled={busy === 'reopen'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">
                    {busy === 'reopen' ? 'Saving…' : 'Reopen'}
                  </button>
                )}
                {allowed.includes('transferred') && (
                  <button onClick={() => act('transfer', { note: note || undefined })} disabled={busy === 'transfer'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-800 disabled:opacity-50">
                    {busy === 'transfer' ? 'Saving…' : 'Transfer'}
                  </button>
                )}
                {allowed.includes('closed') && (
                  <button onClick={() => act('close', { reason: note }, { value: note, message: 'A reason is required to close a risk.' })} disabled={busy === 'close'} className="text-[10px] font-medium px-2 py-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {busy === 'close' ? 'Saving…' : 'Close'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
