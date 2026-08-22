'use client';
import { useId, useState } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export type RequirementType = 'business' | 'functional' | 'non_functional' | 'technical' | 'integration' | 'security' | 'compliance' | 'data' | 'reporting' | 'migration' | 'performance' | 'availability' | 'usability';
export type QualityStatus = 'complete' | 'partially_complete' | 'incomplete' | 'ambiguous' | 'conflicting' | 'duplicate' | 'unverified';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ReqStatus = 'draft' | 'active' | 'superseded' | 'deprecated';

export interface QualityFinding { rule: string; message: string }
export interface BusinessRequirement {
  id: string; clientId: string; requirementType: RequirementType; title: string; description: string;
  source: string; businessObjective: string; stakeholder: string; priority: Priority; category: string;
  status: ReqStatus; qualityStatus: QualityStatus; qualityFindings: QualityFinding[]; relatedRequirementId: string | null;
  acceptanceCriteria: string; dependencies: string; constraints: string; assumptions: string; evidence: string;
  owner: string; version: number; createdAt: string; updatedAt: string;
}
export type QualitySummary = Record<QualityStatus, number> & { total: number };

const TYPE_LABEL: Record<RequirementType, string> = {
  business: 'Business', functional: 'Functional', non_functional: 'Non-Functional', technical: 'Technical',
  integration: 'Integration', security: 'Security', compliance: 'Compliance', data: 'Data', reporting: 'Reporting',
  migration: 'Migration', performance: 'Performance', availability: 'Availability', usability: 'Usability',
};

// Same icon+label discipline as evidence-status.tsx (never color alone), scoped
// locally because this 7-value quality vocabulary is specific to requirement
// intelligence and doesn't map cleanly onto the shared EvidenceStatus set.
const QUALITY_META: Record<QualityStatus, { icon: string; label: string; className: string }> = {
  complete: { icon: '✓', label: 'Complete', className: 'text-green-700 bg-green-50 border-green-200' },
  partially_complete: { icon: '◐', label: 'Partially Complete', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  incomplete: { icon: '!', label: 'Incomplete', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  ambiguous: { icon: '?', label: 'Ambiguous', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  conflicting: { icon: '⚠', label: 'Conflicting', className: 'text-red-700 bg-red-50 border-red-200' },
  duplicate: { icon: '⧉', label: 'Duplicate', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  unverified: { icon: '—', label: 'Unverified', className: 'text-gray-500 bg-gray-50 border-gray-200' },
};

function QualityBadge({ status }: { status: QualityStatus }) {
  const meta = QUALITY_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${meta.className}`}>
      <span aria-hidden="true">{meta.icon}</span>{meta.label}
    </span>
  );
}

const PRIORITY_CLASS: Record<Priority, string> = {
  low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
};

const EMPTY_FORM = {
  title: '', description: '', requirementType: 'business' as RequirementType, priority: 'medium' as Priority,
  category: '', stakeholder: '', businessObjective: '', acceptanceCriteria: '', source: '', owner: '',
};

function RequirementRow({ requirement, allRequirements, onChanged }: { requirement: BusinessRequirement; allRequirements: BusinessRequirement[]; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deprecating, setDeprecating] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [conflictTarget, setConflictTarget] = useState('');
  const panelId = useId();

  async function handleDeprecate() {
    setDeprecating(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/business-requirements/${requirement.id}/deprecate`, { method: 'POST' });
      if (res.ok) onChanged();
    } finally { setDeprecating(false); }
  }

  async function handleFlagConflict() {
    if (!conflictTarget) return;
    setFlagging(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/business-requirements/${requirement.id}/flag-conflict`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conflictsWithId: conflictTarget }),
      });
      if (res.ok) { setConflictTarget(''); onChanged(); }
    } finally { setFlagging(false); }
  }

  const otherRequirements = allRequirements.filter(r => r.id !== requirement.id && r.status !== 'deprecated');

  return (
    <div className={`border rounded-lg overflow-hidden bg-white ${requirement.status === 'deprecated' ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{requirement.title}</span>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{TYPE_LABEL[requirement.requirementType]}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CLASS[requirement.priority]}`}>{requirement.priority}</span>
            {requirement.status === 'deprecated' && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">DEPRECATED</span>}
          </div>
          {requirement.category && <p className="text-[9px] text-gray-400 mt-0.5">{requirement.category}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <QualityBadge status={requirement.qualityStatus} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {requirement.qualityFindings.length > 0 && (
            <div className="bg-white border rounded-md p-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Why this status — real, explainable findings</p>
              <ul className="space-y-1">
                {requirement.qualityFindings.map((f, i) => (
                  <li key={i} className="text-[11px] text-gray-700"><span className="font-mono text-[9px] text-gray-400 mr-1">[{f.rule}]</span>{f.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3 text-[11px]">
            <Field label="Description" value={requirement.description} />
            <Field label="Business Objective" value={requirement.businessObjective} />
            <Field label="Stakeholder" value={requirement.stakeholder} />
            <Field label="Source" value={requirement.source} />
            <Field label="Acceptance Criteria" value={requirement.acceptanceCriteria} />
            <Field label="Owner" value={requirement.owner} />
          </div>
          <p className="text-[9px] text-gray-400">Version {requirement.version} · Updated {new Date(requirement.updatedAt).toLocaleString('en-AU')}</p>
          {requirement.status !== 'deprecated' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <select value={conflictTarget} onChange={e => setConflictTarget(e.target.value)} className="border rounded px-2 py-1.5 text-[10px]">
                <option value="">Flag conflicting with…</option>
                {otherRequirements.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <Action variant="secondary" onClick={handleFlagConflict} disabled={!conflictTarget} loading={flagging} className="!text-[10px] !px-3 !py-1.5">
                Flag Conflict
              </Action>
              <Action variant="tertiary" onClick={handleDeprecate} loading={deprecating} className="!text-[10px] !px-3 !py-1.5 !text-red-600">
                Deprecate
              </Action>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-gray-700">{value || <span className="text-gray-300 italic">Not provided</span>}</p>
    </div>
  );
}

export function BusinessRequirementsManager({ clientId, initialRequirements, initialSummary }: { clientId: string; initialRequirements: BusinessRequirement[]; initialSummary: QualitySummary }) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [summary, setSummary] = useState(initialSummary);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function refresh() {
    const [reqRes, summaryRes] = await Promise.all([
      fetch(`${API}/api/v1/oc/clients/${clientId}/business-requirements`),
      fetch(`${API}/api/v1/oc/clients/${clientId}/business-requirements/summary`),
    ]);
    if (reqRes.ok) setRequirements((await reqRes.json()).requirements);
    if (summaryRes.ok) setSummary((await summaryRes.json()).summary);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/business-requirements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not save this requirement.'); return; }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  const active = requirements.filter(r => r.status !== 'deprecated');
  const deprecated = requirements.filter(r => r.status === 'deprecated');

  return (
    <div>
      {/* Real, evidence-backed summary — no fabricated single "quality score" */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {(Object.keys(QUALITY_META) as QualityStatus[]).filter(k => summary[k] > 0).map(k => (
          <div key={k} className="bg-white rounded-xl border p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{summary[k]}</p>
            <p className="text-[9px] text-gray-500 uppercase">{QUALITY_META[k].label}</p>
          </div>
        ))}
        {summary.total === 0 && <div className="col-span-4 text-xs text-gray-400">No requirements recorded yet.</div>}
      </div>

      <div className="flex justify-end mb-4">
        <Action variant="primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Requirement'}</Action>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-5 mb-6 grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Order confirmation email must send within 30 seconds" className="w-full border rounded-md px-3 py-2 text-sm" />
            <p className="text-[9px] text-gray-400 mt-0.5">A specific, unique statement of what's needed. Duplicate titles for this client are flagged automatically.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What is needed and why, in the client's own words" className="w-full border rounded-md px-3 py-2 text-sm" />
            <p className="text-[9px] text-gray-400 mt-0.5">Vague terms like "better" or "faster" without a measurable target will be flagged as ambiguous.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.requirementType} onChange={e => setForm(f => ({ ...f, requirementType: e.target.value as RequirementType }))} className="w-full border rounded-md px-3 py-2 text-sm">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))} className="w-full border rounded-md px-3 py-2 text-sm">
              {(['low', 'medium', 'high', 'critical'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. order-management" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stakeholder</label>
            <input value={form.stakeholder} onChange={e => setForm(f => ({ ...f, stakeholder: e.target.value }))} placeholder="Who this requirement is for" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Business Objective</label>
            <input value={form.businessObjective} onChange={e => setForm(f => ({ ...f, businessObjective: e.target.value }))} placeholder="The business outcome this requirement serves" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Acceptance Criteria</label>
            <textarea value={form.acceptanceCriteria} onChange={e => setForm(f => ({ ...f, acceptanceCriteria: e.target.value }))} rows={2} placeholder="Given / when / then — how we'll know this is met" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
            <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Where this came from (e.g. discovery call)" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
            <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Who's accountable for this requirement" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          {error && <div className="sm:col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="sm:col-span-2">
            <Action type="submit" variant="primary" loading={saving}>Save Requirement</Action>
          </div>
        </form>
      )}

      {active.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No business requirements recorded yet for this client.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map(r => <RequirementRow key={r.id} requirement={r} allRequirements={requirements} onChanged={refresh} />)}
        </div>
      )}

      {deprecated.length > 0 && (
        <details className="mt-6">
          <summary className="text-xs text-gray-400 cursor-pointer">{deprecated.length} deprecated requirement{deprecated.length !== 1 ? 's' : ''}</summary>
          <div className="space-y-2 mt-3">
            {deprecated.map(r => <RequirementRow key={r.id} requirement={r} allRequirements={requirements} onChanged={refresh} />)}
          </div>
        </details>
      )}
    </div>
  );
}
