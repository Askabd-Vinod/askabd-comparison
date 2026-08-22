'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useId } from 'react';
import { Breadcrumb } from '../../../../components/breadcrumb';
import { EmptyState } from '../../../../components/empty-state';
import { Action } from '../../../../components/button';

/**
 * Staff Transformations — added 2026-08-22 SDLC-completion pass, UX-hardened
 * the same day (global UX/user-friendliness pass): every field now has a
 * real label, helper text, and a required/optional indicator instead of
 * relying on placeholder text alone (placeholder-only labels fail
 * accessibility and leave a first-time user guessing what's expected) —
 * DecisionTransformationService.createTransformation/getTransformations/
 * updateTransformationStatus already existed, fully real (no mock data), and
 * were already reachable read-only from the customer portal — but staff had
 * no way to reach, create, or progress a transformation plan at all (the
 * client tab bar had no entry for it). This page reuses those exact existing
 * endpoints; it does not introduce a new service, table, or state machine.
 */
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Transformation {
  id: string; gapId?: string; decisionId?: string; clientId: string; domain: string;
  title: string; description?: string; transformationType: string;
  investment?: number; expectedSavings?: number; expectedRoi?: number;
  personDays?: number; duration?: string; owner?: string;
  expectedOutcome?: string; actualOutcome?: string; status: string;
  startedAt?: string; completedAt?: string; createdAt: string;
}
interface Summary { total: string; planned: string; in_progress: string; completed: string; total_savings: string; total_investment: string; total_person_days: string; }

const statusMeta: Record<string, { label: string; className: string }> = {
  planned: { label: 'Planned', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Progress', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
};

// Same business-friendly category vocabulary as Gap Analysis (domainLabels in
// gaps/page.tsx) — kept in sync deliberately so "Category" means the same
// thing everywhere in the app, per the global UX consistency requirement.
const CATEGORY_LABELS: Record<string, string> = {
  legacy: 'Legacy System', cloud: 'Cloud', application: 'Application', database: 'Database',
  data: 'Data', infrastructure: 'Infrastructure', security: 'Security', compliance: 'Compliance',
  finops: 'Cost / FinOps', vendor: 'Vendor', performance: 'Performance', devops: 'DevOps', other: 'Other',
};

const emptyForm = { title: '', domain: 'other', description: '', investment: '', expectedSavings: '', owner: '' };

export default function TransformationsPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const [items, setItems] = useState<Transformation[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Inline outcome capture, not window.prompt() — real UX (and avoids a
  // native modal automated/keyboard-driven workflows can't interact with).
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState('');
  const formId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/transformations`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/transformations/summary`),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setItems(d.transformations || []); }
      if (sRes.ok) setSummary(await sRes.json());
    } catch {}
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Success banners are transient — clear themselves so they don't linger
  // and get mistaken for the current state after further actions.
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(t);
  }, [successMessage]);

  async function create() {
    if (!form.title.trim()) return;
    setBusy('create');
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/transformations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, domain: form.domain, description: form.description,
          investment: form.investment ? Number(form.investment) : undefined,
          expectedSavings: form.expectedSavings ? Number(form.expectedSavings) : undefined,
          owner: form.owner || undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false); setForm(emptyForm);
        setSuccessMessage(`"${form.title}" was created as a Planned transformation. Click Start when work actually begins.`);
        load();
      }
    } catch {}
    setBusy(null);
  }

  async function setStatus(id: string, status: string, outcome?: string) {
    const item = items.find(i => i.id === id);
    setBusy(id + status);
    try {
      const res = await fetch(`${API}/api/v1/oc/transformations/${id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, outcome }),
      });
      if (res.ok) {
        setCompletingId(null); setOutcomeDraft('');
        if (item) {
          setSuccessMessage(
            status === 'in_progress'
              ? `"${item.title}" is now In Progress.`
              : `"${item.title}" is now marked Completed. Its real outcome has been recorded.`
          );
        }
        load();
      }
    } catch {}
    setBusy(null);
  }

  const requiredMissing = !form.title.trim();

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: clientId, href: `/clients/${clientId}/lifecycle` }, { label: 'Transformations' }]} />

      {/* Where am I / why am I here — per the global UX requirement, every
          major screen should answer this before showing any controls. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transformation Plans</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            A Transformation is the real, trackable plan for actually making an approved change happen —
            for example, adding database indexes, migrating to a managed service, or rolling out a new
            security control. Progress here is always real: nothing is marked complete until you confirm it.
          </p>
        </div>
        <Action variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(v => !v)} className="!bg-purple-600 hover:!bg-purple-700 !text-white shrink-0">
          {showForm ? 'Cancel' : '+ New Transformation'}
        </Action>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
          <span className="text-green-600" aria-hidden="true">✓</span>
          <p className="text-xs text-green-800">{successMessage}</p>
        </div>
      )}

      {summary && Number(summary.total) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <SC label="Total Plans" value={summary.total} />
          <SC label="Planned" value={summary.planned} />
          <SC label="In Progress" value={summary.in_progress} color="text-amber-600" />
          <SC label="Completed" value={summary.completed} color="text-green-600" />
          <SC label="Total Investment" value={`$${Number(summary.total_investment || 0).toLocaleString()}`} />
          <SC label="Expected Savings / yr" value={`$${Number(summary.total_savings || 0).toLocaleString()}`} color="text-green-600" />
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">New Transformation</h3>
            <p className="text-xs text-gray-500 mt-0.5">Only the title is required — you can fill in the rest now or come back and add it later.</p>
          </div>

          {/* Basic Information */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Basic Information</p>
            <Field id={`${formId}-title`} label="Transformation Title" required
              helper="A short, clear name describing what this plan actually does.">
              <input id={`${formId}-title`} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Add Database Indexes for Performance" required aria-required="true"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </Field>
            <Field id={`${formId}-category`} label="Category" helper="What area of the business this transformation affects.">
              <select id={`${formId}-category`} value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field id={`${formId}-description`} label="Description" helper="What will actually change? Written so a customer could understand it.">
              <textarea id={`${formId}-description`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Add covering indexes to the 90 tables flagged during assessment to improve query performance."
                rows={2} className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </Field>
          </div>

          {/* Investment & Ownership */}
          <div className="space-y-3 pt-3 border-t">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Investment &amp; Ownership</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field id={`${formId}-investment`} label="Investment ($)" helper="One-time cost to implement this, if known.">
                <input id={`${formId}-investment`} inputMode="decimal" value={form.investment} onChange={e => setForm({ ...form, investment: e.target.value })}
                  placeholder="e.g. 5000" className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </Field>
              <Field id={`${formId}-savings`} label="Expected Savings ($ / year)" helper="Estimated savings once this is complete.">
                <input id={`${formId}-savings`} inputMode="decimal" value={form.expectedSavings} onChange={e => setForm({ ...form, expectedSavings: e.target.value })}
                  placeholder="e.g. 15000" className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </Field>
              <Field id={`${formId}-owner`} label="Owner" helper="Who is responsible for delivering this.">
                <input id={`${formId}-owner`} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}
                  placeholder="e.g. hello@askabd.com" className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </Field>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Action variant="primary" onClick={create} loading={busy === 'create'} disabled={requiredMissing} className="!bg-purple-600 hover:!bg-purple-700 disabled:!bg-gray-300">
              {busy === 'create' ? 'Creating…' : 'Create Transformation'}
            </Action>
            {requiredMissing && <p className="text-[11px] text-amber-600">Enter a title to create this transformation.</p>}
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 text-center py-8">Loading transformation plans…</p>}

      {!loading && items.length === 0 && !showForm && (
        <EmptyState
          icon="🚀"
          title="No transformation plans yet"
          explanation="A Transformation turns an approved decision into real, trackable work — for example, once you approve a fix on the Gap Analysis page, plan the actual implementation here. You can also start one directly without a prior gap or decision."
          action={<Action variant="primary" onClick={() => setShowForm(true)} className="!bg-purple-600 hover:!bg-purple-700">+ New Transformation</Action>}
        />
      )}

      <div className="space-y-3">
        {items.map(t => {
          const meta = statusMeta[t.status] || { label: t.status, className: 'bg-gray-50 text-gray-600 border-gray-200' };
          return (
            <div key={t.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                    {CATEGORY_LABELS[t.domain] && <span className="text-[9px] font-medium text-gray-400 uppercase">{CATEGORY_LABELS[t.domain]}</span>}
                  </div>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t.investment ? `$${t.investment.toLocaleString()} investment` : ''}
                    {t.expectedSavings ? ` · $${t.expectedSavings.toLocaleString()}/yr expected savings` : ''}
                    {t.owner ? ` · Owner: ${t.owner}` : ''}
                  </p>
                  {t.actualOutcome && <p className="text-[11px] text-green-700 mt-1">✓ Actual outcome: {t.actualOutcome}</p>}
                </div>
                <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${meta.className}`}>{meta.label}</span>
              </div>
              <div className="mt-3">
                {t.status === 'planned' && (
                  <Action variant="secondary" onClick={() => setStatus(t.id, 'in_progress')} loading={busy === t.id + 'in_progress'}>
                    Start
                  </Action>
                )}
                {t.status === 'in_progress' && (
                  completingId === t.id ? (
                    <div className="space-y-1.5">
                      <label htmlFor={`outcome-${t.id}`} className="block text-[10px] font-medium text-gray-600">
                        What actually happened? <span className="text-gray-400 font-normal">(optional, but recommended)</span>
                      </label>
                      <textarea id={`outcome-${t.id}`} value={outcomeDraft} onChange={e => setOutcomeDraft(e.target.value)}
                        placeholder="e.g. Covering indexes added to all 90 flagged tables; query latency improved in staging validation."
                        className="w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500" rows={2} autoFocus />
                      <div className="flex gap-2">
                        <Action variant="primary" onClick={() => setStatus(t.id, 'completed', outcomeDraft || undefined)} loading={busy === t.id + 'completed'} className="!bg-green-600 hover:!bg-green-700">
                          Confirm Completion
                        </Action>
                        <Action variant="tertiary" onClick={() => { setCompletingId(null); setOutcomeDraft(''); }}>Cancel</Action>
                      </div>
                    </div>
                  ) : (
                    <Action variant="primary" onClick={() => { setCompletingId(t.id); setOutcomeDraft(''); }} className="!bg-green-600 hover:!bg-green-700">
                      Mark Completed
                    </Action>
                  )
                )}
                {t.status === 'completed' && (
                  <p className="text-[11px] text-gray-400">
                    Completed{t.completedAt ? ` on ${new Date(t.completedAt).toLocaleDateString()}` : ''}. See <a href={`/clients/${clientId}/gaps`} className="text-purple-600 hover:underline">Gap Analysis</a> to close out the related gap, if any.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ id, label, required, helper, children }: { id: string; label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required ? <span className="text-red-500 ml-0.5" aria-label="required">*</span> : <span className="text-gray-400 font-normal ml-1">(optional)</span>}
      </label>
      {children}
      {helper && <p className="text-[10px] text-gray-400 mt-1">{helper}</p>}
    </div>
  );
}

function SC({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}
