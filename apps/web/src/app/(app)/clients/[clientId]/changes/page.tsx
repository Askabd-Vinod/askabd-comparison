'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Change Management — real, per-client change records backed by
 * `oc_change_records` (change-management-engine.ts / change-management-routes.ts,
 * `change_management_test_1`, 2026-08-24). Second of the 11 engines wired
 * into the staff UI this pass (Phase 3, "ASKABD ENTERPRISE OPERATIONS —
 * INTEGRATION + COMPLETION PHASE", 2026-08-25) — had zero UI anywhere before
 * this page (confirmed by a mechanical grep across apps/web).
 *
 * Real, enforced business rules mirrored client-side only to gate which
 * buttons appear (never to bypass server validation, which remains
 * authoritative): a change cannot move to "assessed" without a real,
 * non-empty impact assessment/implementation plan/rollback plan, and cannot
 * "close" without real post-change validation evidence. Risk/deployment
 * linkage picks from this client's own real, ownership-verified records
 * (fetched from the already-real Risk Register and Deployments engines) —
 * never a free-typed, unverifiable id.
 */
type ChangeStatus = 'draft' | 'assessed' | 'approval_pending' | 'approved' | 'implementing' | 'validating' | 'closed' | 'cancelled';
type ChangeType = 'standard' | 'normal' | 'emergency';
type ApprovalStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded';

interface ChangeEvent { event: string; fromStatus: ChangeStatus | null; toStatus: ChangeStatus; actor: string | null; timestamp: string; reason?: string }
interface ChangeRecord {
  id: string; clientId: string; clientRequestId: string | null; title: string; description: string; changeType: ChangeType;
  impactAssessment: string; riskIds: string[]; dependencies: string; implementationPlan: string; rollbackPlan: string;
  deploymentId: string | null; validationReference: string; postChangeValidation: string | null;
  status: ChangeStatus; approvalWorkflowId: string | null; owner: string | null; events: ChangeEvent[];
  createdBy: string | null; createdAt: string; updatedAt: string;
}
interface ApprovalWorkflow { id: string; status: ApprovalStatus; decidedAt: string | null; decisionNote: string | null }
interface RiskOption { id: string; title: string }
interface DeploymentOption { id: string; application: string; version: string; environment: string }

const ALLOWED_TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
  draft: ['assessed', 'cancelled'],
  assessed: ['approval_pending', 'cancelled'],
  approval_pending: ['approved', 'draft', 'cancelled'],
  approved: ['implementing', 'cancelled'],
  implementing: ['validating'],
  validating: ['closed'],
  closed: [],
  cancelled: [],
};

const STATUS_META: Record<ChangeStatus, { label: string; icon: string; className: string }> = {
  draft: { label: 'Draft', icon: '○', className: 'text-gray-600 bg-gray-50 border-gray-200' },
  assessed: { label: 'Assessed', icon: '◐', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  approval_pending: { label: 'Approval Pending', icon: '◷', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  approved: { label: 'Approved', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  implementing: { label: 'Implementing', icon: '◐', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  validating: { label: 'Validating', icon: '◷', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  closed: { label: 'Closed', icon: '✓', className: 'text-gray-500 bg-gray-100 border-gray-200' },
  cancelled: { label: 'Cancelled', icon: '✕', className: 'text-red-700 bg-red-50 border-red-200' },
};
const TYPE_META: Record<ChangeType, string> = { standard: 'Standard', normal: 'Normal', emergency: 'Emergency' };

function StatusBadge({ status }: { status: ChangeStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${m.className}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ChangeManagementPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showTerminal, setShowTerminal] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/changes`);
      if (res.ok) setChanges((await res.json()).changes ?? []);
      else if (res.status === 401 || res.status === 403) setError('You are not authorized to manage change records for this client.');
      else setError('Unable to load change records. The backend may be unavailable.');
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading change records...</div>;
  if (error) return <div className="p-6"><ErrorState what="Change records could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  const byStatus: Record<ChangeStatus, number> = { draft: 0, assessed: 0, approval_pending: 0, approved: 0, implementing: 0, validating: 0, closed: 0, cancelled: 0 };
  for (const c of changes) byStatus[c.status]++;
  const active = changes.filter(c => c.status !== 'closed' && c.status !== 'cancelled').length;

  const visible = changes.filter(c => (statusFilter ? c.status === statusFilter : showTerminal || (c.status !== 'closed' && c.status !== 'cancelled')));

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Change Management</h2>
      <p className="text-xs text-gray-500 mb-4">
        Real change records for this engagement — impact assessment, approval, implementation, and validation, each backed by a real, enforced workflow.
      </p>

      {changes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Total" value={changes.length} />
          <Stat label="Active" value={active} color="text-blue-600" />
          <Stat label="Awaiting Approval" value={byStatus.approval_pending} color="text-amber-600" />
          <Stat label="Closed / Cancelled" value={byStatus.closed + byStatus.cancelled} color="text-gray-500" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {['', 'draft', 'assessed', 'approval_pending', 'approved', 'implementing', 'validating', 'closed', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            {s === '' ? 'All' : STATUS_META[s as ChangeStatus].label}
          </button>
        ))}
        {!statusFilter && (
          <label className="text-[11px] text-gray-500 ml-2 flex items-center gap-1">
            <input type="checkbox" checked={showTerminal} onChange={e => setShowTerminal(e.target.checked)} />
            Show closed / cancelled
          </label>
        )}
      </div>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Change Records</h3>
        <div className="space-y-2">
          {visible.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No change records {statusFilter ? `with status "${STATUS_META[statusFilter as ChangeStatus].label}"` : 'yet'}</p>
              <p className="text-xs text-blue-700 mt-1">Add the first real change record for this engagement below.</p>
            </div>
          )}
          {visible.map(c => <ChangeRow key={c.id} clientId={clientId} change={c} onChanged={() => load(clientId)} />)}
          <AddChangeRow clientId={clientId} onCreated={() => load(clientId)} />
        </div>
      </section>
    </div>
  );
}

function AddChangeRow({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', changeType: 'normal' as ChangeType, owner: '' });
  const panelId = useId();

  async function submit() {
    if (!form.title.trim()) { setErr('A real change title is required.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/changes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (res.ok) { setForm({ title: '', description: '', changeType: 'normal', owner: '' }); setExpanded(false); onCreated(); }
      else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not create this change record.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden border-dashed border-purple-200">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium">+ Add a change record</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
          {expanded ? 'Close' : 'Add'}
        </button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Title<span className="text-red-500 ml-0.5">*</span></label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="e.g. Upgrade connector auth to OAuth2" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Change Type</label>
              <select value={form.changeType} onChange={e => setForm(f => ({ ...f, changeType: e.target.value as ChangeType }))} className="w-full border rounded px-2 py-1.5 text-xs">
                {(Object.keys(TYPE_META) as ChangeType[]).map(t => <option key={t} value={t}>{TYPE_META[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Owner</label>
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">{saving ? 'Creating…' : 'Create Change Record'}</Action>
        </div>
      )}
    </div>
  );
}

function ChangeRow({ clientId, change, onChanged }: { clientId: string; change: ChangeRecord; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [approval, setApproval] = useState<{ current: ApprovalWorkflow | null } | null>(null);
  const [risks, setRisks] = useState<RiskOption[]>([]);
  const [deployments, setDeployments] = useState<DeploymentOption[]>([]);
  const [selectedRisk, setSelectedRisk] = useState('');
  const [selectedDeployment, setSelectedDeployment] = useState('');
  const [assessForm, setAssessForm] = useState({ impactAssessment: '', dependencies: '', implementationPlan: '', rollbackPlan: '' });
  const [note, setNote] = useState('');
  const [validationReference, setValidationReference] = useState(change.validationReference || '');
  const [postChangeValidation, setPostChangeValidation] = useState('');
  const panelId = useId();

  const loadContext = useCallback(async () => {
    try {
      const [aRes, rRes, dRes] = await Promise.all([
        change.approvalWorkflowId ? staffFetch(`/api/v1/oc/clients/${clientId}/changes/${change.id}/approval`) : null,
        staffFetch(`/api/v1/oc/clients/${clientId}/risks`),
        staffFetch(`/api/v1/oc/clients/${clientId}/deployments`),
      ]);
      if (aRes?.ok) setApproval(await aRes.json());
      if (rRes.ok) setRisks(((await rRes.json()).risks ?? []).map((r: RiskOption) => ({ id: r.id, title: r.title })));
      if (dRes.ok) setDeployments(((await dRes.json()).deployments ?? []).map((d: DeploymentOption) => ({ id: d.id, application: d.application, version: d.version, environment: d.environment })));
    } catch { /* non-fatal — pickers just stay empty */ }
  }, [clientId, change.id, change.approvalWorkflowId]);

  useEffect(() => { if (expanded) loadContext(); }, [expanded, loadContext]);

  async function act(action: string, body: Record<string, unknown>, needsField?: { value: string; message: string }) {
    if (needsField && !needsField.value.trim()) { setErr(needsField.message); return; }
    setBusy(action); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/changes/${change.id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) { setNote(''); onChanged(); } else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'That action could not be completed.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  const allowed = ALLOWED_TRANSITIONS[change.status];
  const pendingApproval = approval?.current?.status === 'in_review';

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{change.title}</span>
          <p className="text-[9px] text-gray-400">{TYPE_META[change.changeType]}{change.owner ? ` · Owner: ${change.owner}` : ''}{change.riskIds.length > 0 ? ` · ${change.riskIds.length} risk${change.riskIds.length === 1 ? '' : 's'} linked` : ''}{change.deploymentId ? ' · Deployment linked' : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={change.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Details'}</button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {change.description && <p className="text-xs text-gray-700">{change.description}</p>}
          {change.impactAssessment && (
            <div className="grid md:grid-cols-2 gap-3 text-xs bg-white border rounded p-3">
              <div className="md:col-span-2"><span className="text-[10px] text-gray-400 uppercase">Impact Assessment</span><p className="text-gray-700">{change.impactAssessment}</p></div>
              {change.dependencies && <div className="md:col-span-2"><span className="text-[10px] text-gray-400 uppercase">Dependencies</span><p className="text-gray-700">{change.dependencies}</p></div>}
              <div><span className="text-[10px] text-gray-400 uppercase">Implementation Plan</span><p className="text-gray-700">{change.implementationPlan}</p></div>
              <div><span className="text-[10px] text-gray-400 uppercase">Rollback Plan</span><p className="text-gray-700">{change.rollbackPlan}</p></div>
            </div>
          )}
          {change.postChangeValidation && (
            <div className="bg-white border rounded p-3 text-xs"><span className="text-[10px] text-gray-400 uppercase">Post-Change Validation</span><p className="text-gray-700">{change.postChangeValidation}</p></div>
          )}

          {change.approvalWorkflowId && (
            <div className={`rounded-md border p-2 text-[11px] ${pendingApproval ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-600'}`}>
              Approval workflow: {approval?.current?.status ?? 'checking…'}
              {pendingApproval && (
                <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (required to reject / request changes)…" className="border rounded px-2 py-1 text-[10px] flex-1 min-w-[160px]" />
                  <button onClick={() => act('approval/approve', { note: note || undefined })} disabled={busy === 'approval/approve'} className="text-[10px] font-medium px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">Approve</button>
                  <button onClick={() => act('approval/request_changes', { note }, { value: note, message: 'A reason is required to request changes.' })} disabled={busy === 'approval/request_changes'} className="text-[10px] font-medium px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">Request Changes</button>
                  <button onClick={() => act('approval/reject', { note }, { value: note, message: 'A reason is required to reject a change.' })} disabled={busy === 'approval/reject'} className="text-[10px] font-medium px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                </div>
              )}
            </div>
          )}

          {change.events.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-400 uppercase">History</span>
              <div className="space-y-0.5 mt-1">
                {change.events.map((e, i) => <p key={i} className="text-[10px] text-gray-500">{new Date(e.timestamp).toLocaleString('en-AU')} — {e.event}{e.reason ? `: ${e.reason}` : ''}</p>)}
              </div>
            </div>
          )}

          {err && <p className="text-[10px] text-red-600">{err}</p>}

          {/* Assess — required before approval-pending; needs 3 real fields */}
          {allowed.includes('assessed') && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-[10px] font-semibold text-gray-600 uppercase">Impact Assessment (required to move to Assessed)</p>
              <textarea value={assessForm.impactAssessment} onChange={e => setAssessForm(f => ({ ...f, impactAssessment: e.target.value }))} placeholder="Impact assessment…" rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
              <textarea value={assessForm.dependencies} onChange={e => setAssessForm(f => ({ ...f, dependencies: e.target.value }))} placeholder="Dependencies (optional)…" rows={1} className="w-full border rounded px-2 py-1.5 text-xs" />
              <div className="grid md:grid-cols-2 gap-2">
                <textarea value={assessForm.implementationPlan} onChange={e => setAssessForm(f => ({ ...f, implementationPlan: e.target.value }))} placeholder="Implementation plan…" rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
                <textarea value={assessForm.rollbackPlan} onChange={e => setAssessForm(f => ({ ...f, rollbackPlan: e.target.value }))} placeholder="Rollback plan…" rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
              </div>
              <button
                onClick={() => act('assess', assessForm,
                  !assessForm.impactAssessment.trim() ? { value: '', message: 'A real impact assessment is required.' }
                  : !assessForm.implementationPlan.trim() ? { value: '', message: 'A real implementation plan is required.' }
                  : !assessForm.rollbackPlan.trim() ? { value: '', message: 'A real rollback plan is required.' } : undefined)}
                disabled={busy === 'assess'} className="text-[10px] font-medium px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {busy === 'assess' ? 'Saving…' : 'Mark Assessed'}
              </button>
            </div>
          )}

          {/* Link risk / deployment — available any time before closed/cancelled */}
          {change.status !== 'closed' && change.status !== 'cancelled' && (
            <div className="flex flex-wrap gap-2 items-center border-t pt-3">
              <select value={selectedRisk} onChange={e => setSelectedRisk(e.target.value)} className="border rounded px-2 py-1.5 text-[10px]">
                <option value="">Link a risk…</option>
                {risks.filter(r => !change.riskIds.includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <button onClick={() => act('link-risk', { riskId: selectedRisk }, { value: selectedRisk, message: 'Choose a risk to link.' })} disabled={busy === 'link-risk'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">Link Risk</button>
              <select value={selectedDeployment} onChange={e => setSelectedDeployment(e.target.value)} className="border rounded px-2 py-1.5 text-[10px]">
                <option value="">Link a deployment…</option>
                {deployments.map(d => <option key={d.id} value={d.id}>{d.application} {d.version} ({d.environment})</option>)}
              </select>
              <button onClick={() => act('link-deployment', { deploymentId: selectedDeployment }, { value: selectedDeployment, message: 'Choose a deployment to link.' })} disabled={busy === 'link-deployment' || !!change.deploymentId} className="text-[10px] font-medium px-2 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">{change.deploymentId ? 'Deployment Linked' : 'Link Deployment'}</button>
            </div>
          )}

          {allowed.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note / reason (required for cancel)…" className="w-full border rounded px-2 py-1.5 text-xs" />
              <div className="flex flex-wrap items-center gap-2">
                {allowed.includes('approval_pending') && (
                  <button onClick={() => act('request-approval', {})} disabled={busy === 'request-approval'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">{busy === 'request-approval' ? 'Requesting…' : 'Request Approval'}</button>
                )}
                {change.status === 'approved' && (
                  <button onClick={() => act('start-implementation', {})} disabled={busy === 'start-implementation'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{busy === 'start-implementation' ? 'Starting…' : 'Start Implementation'}</button>
                )}
                {change.status === 'implementing' && (
                  <div className="flex items-center gap-1">
                    <input value={validationReference} onChange={e => setValidationReference(e.target.value)} placeholder="Validation reference (optional)…" className="border rounded px-2 py-1.5 text-[10px] w-48" />
                    <button onClick={() => act('validate', { validationReference: validationReference || undefined })} disabled={busy === 'validate'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">{busy === 'validate' ? 'Saving…' : 'Move to Validating'}</button>
                  </div>
                )}
                {change.status === 'validating' && (
                  <div className="flex items-center gap-1">
                    <input value={postChangeValidation} onChange={e => setPostChangeValidation(e.target.value)} placeholder="Post-change validation evidence…" className="border rounded px-2 py-1.5 text-[10px] w-56" />
                    <button onClick={() => act('close', { postChangeValidation }, { value: postChangeValidation, message: 'Real post-change validation evidence is required to close.' })} disabled={busy === 'close'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">{busy === 'close' ? 'Closing…' : 'Close Change'}</button>
                  </div>
                )}
                {allowed.includes('cancelled') && (
                  <button onClick={() => act('cancel', { reason: note }, { value: note, message: 'A reason is required to cancel a change.' })} disabled={busy === 'cancel'} className="text-[10px] font-medium px-2 py-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">{busy === 'cancel' ? 'Saving…' : 'Cancel'}</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
