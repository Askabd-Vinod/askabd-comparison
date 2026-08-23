'use client';
import { useState } from 'react';
import Link from 'next/link';
import { EvidenceBadge, type EvidenceStatus } from '../../../../components/evidence-status';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Deployment {
  id: string; environment: string; application: string; version: string; previousVersion: string | null;
  status: string; risk: string; requestedBy: string | null; plannedStart: string | null;
  actualStart: string | null; actualCompletion: string | null; createdAt: string;
}

const STATUS_MAP: Record<string, { status: EvidenceStatus; label: string }> = {
  draft: { status: 'not_configured', label: 'Draft' },
  planned: { status: 'checking', label: 'Planned' },
  readiness_pending: { status: 'checking', label: 'Checking Readiness' },
  approval_pending: { status: 'action_required', label: 'Awaiting Approval' },
  approved: { status: 'checking', label: 'Approved' },
  in_progress: { status: 'checking', label: 'In Progress' },
  deployed: { status: 'checking', label: 'Deployed (Validating)' },
  validation_pending: { status: 'checking', label: 'Validation Pending' },
  validated: { status: 'verified', label: 'Validated' },
  failed: { status: 'failed', label: 'Failed' },
  rollback_pending: { status: 'action_required', label: 'Rollback Pending' },
  rolled_back: { status: 'not_configured', label: 'Rolled Back' },
  cancelled: { status: 'not_configured', label: 'Cancelled' },
};

const RISK_COLORS: Record<string, string> = { low: 'text-green-700 bg-green-50', medium: 'text-amber-700 bg-amber-50', high: 'text-orange-700 bg-orange-50', critical: 'text-red-700 bg-red-50' };

export function DeploymentGrid({ clientId, initialDeployments }: { clientId: string; initialDeployments: Deployment[] }) {
  const [deps, setDeps] = useState(initialDeployments);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ environment: 'staging', application: '', version: '', previousVersion: '', deploymentType: 'standard', risk: 'medium', rollbackPlan: '', notes: '' });

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/deployments`);
    if (res.ok) setDeps((await res.json()).deployments);
  }

  async function createDeployment() {
    setError('');
    if (!form.application.trim() || !form.version.trim()) { setError('Application and version are both required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/deployments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { setError((await res.json()).error?.message || 'Could not create the deployment.'); return; }
      setForm({ environment: 'staging', application: '', version: '', previousVersion: '', deploymentType: 'standard', risk: 'medium', rollbackPlan: '', notes: '' });
      setShowForm(false);
      await refresh();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total" value={deps.length} />
        <Stat label="Awaiting Approval" value={deps.filter(d => d.status === 'approval_pending').length} />
        <Stat label="In Flight" value={deps.filter(d => ['in_progress', 'deployed', 'validation_pending'].includes(d.status)).length} />
        <Stat label="Failed / Rollback" value={deps.filter(d => ['failed', 'rollback_pending'].includes(d.status)).length} />
      </div>

      <div className="flex justify-end mb-3">
        <Action variant="primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Close' : '+ New Deployment'}</Action>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 mb-6">
          <h3 className="font-semibold text-sm mb-3">New Deployment</h3>
          <div className="grid md:grid-cols-2 gap-2">
            <Field label="Application / System" required value={form.application} onChange={v => setForm(f => ({ ...f, application: v }))} placeholder="AskABD Comparison API" />
            <Field label="Version / Release" required value={form.version} onChange={v => setForm(f => ({ ...f, version: v }))} placeholder="1.3.0" />
            <Field label="Previous Version" value={form.previousVersion} onChange={v => setForm(f => ({ ...f, previousVersion: v }))} placeholder="1.2.0" />
            <SelectField label="Environment" required value={form.environment} onChange={v => setForm(f => ({ ...f, environment: v }))} options={['development', 'staging', 'production']} />
            <SelectField label="Deployment Type" value={form.deploymentType} onChange={v => setForm(f => ({ ...f, deploymentType: v }))} options={['standard', 'hotfix', 'emergency', 'rollback', 'config_only']} />
            <SelectField label="Risk" value={form.risk} onChange={v => setForm(f => ({ ...f, risk: v }))} options={['low', 'medium', 'high', 'critical']} />
          </div>
          <div className="mt-2">
            <Field label="Rollback Plan" helper="Required before rollback can ever be initiated for this deployment." value={form.rollbackPlan} onChange={v => setForm(f => ({ ...f, rollbackPlan: v }))} placeholder="Redeploy previous tagged image via CI job #..." textarea />
          </div>
          <div className="mt-2">
            <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} textarea />
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="mt-3 flex justify-end">
            <Action variant="primary" loading={saving} onClick={createDeployment}>Create Deployment (Draft)</Action>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        {deps.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">No deployments recorded for this client yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Application</th>
                  <th className="text-left px-4 py-3">Version</th>
                  <th className="text-left px-4 py-3">Environment</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Risk</th>
                  <th className="text-left px-4 py-3">Requested By</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deps.map(d => {
                  const meta = STATUS_MAP[d.status] || { status: 'not_configured' as EvidenceStatus, label: d.status };
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3"><Link href={`/clients/${clientId}/deployments/${d.id}`} className="font-medium text-purple-600 hover:text-purple-800">{d.application}</Link></td>
                      <td className="px-4 py-3 font-mono text-xs">{d.version}{d.previousVersion ? <span className="text-gray-400"> (from {d.previousVersion})</span> : null}</td>
                      <td className="px-4 py-3 text-xs capitalize">{d.environment}</td>
                      <td className="px-4 py-3"><EvidenceBadge status={meta.status} label={meta.label} /></td>
                      <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded capitalize ${RISK_COLORS[d.risk] || 'text-gray-600 bg-gray-50'}`}>{d.risk}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{d.requestedBy || 'Not available from current evidence'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(d.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold text-gray-800">{value}</p><p className="text-[11px] text-gray-500 mt-0.5">{label}</p></div>;
}
function Field({ label, value, onChange, placeholder, required, helper, textarea }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; helper?: string; textarea?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-600 mb-0.5">{label}{required && <span className="text-red-500"> *</span>}</label>
      {textarea
        ? <textarea className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-purple-500" rows={2} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        : <input className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-purple-500" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
      {helper && <p className="text-[10px] text-gray-400 mt-0.5">{helper}</p>}
    </div>
  );
}
function SelectField({ label, value, onChange, options, required }: { label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-600 mb-0.5">{label}{required && <span className="text-red-500"> *</span>}</label>
      <select className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-purple-500 capitalize" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o} className="capitalize">{o.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  );
}
