'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Requirements Clarification — real, per-requirement clarification
 * questions backed by `oc_requirement_clarifications`
 * (requirements-clarification-engine.ts / requirements-clarification
 * -routes.ts, `requirements_clarification_test_1`, 2026-08-24). Seventh of
 * the 11 engines wired into the staff UI (Phase 3, "ASKABD ENTERPRISE
 * OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 *
 * Every question is generated deterministically from the EXISTING, real
 * `classifyQuality()` findings on a real business requirement (never
 * AI-fabricated) — this page never invents a question of its own; "Generate
 * Clarifications" simply asks the engine to turn a requirement's own real
 * quality findings into specific, answerable questions.
 *
 * Staff-vs-portal split, matching the route file's own design: the CLIENT
 * answers each question from their own portal (`/oc/portal/:clientId/
 * clarifications/:id/answer`, out of scope here); staff generate questions
 * and decide Resolve/Won't Fix once an answer (or a staff decision not to
 * pursue one) exists. `clientAnswer` is rendered read-only, exactly as the
 * client submitted it — never edited or paraphrased here.
 */
type ClarificationStatus = 'open' | 'answered' | 'resolved' | 'wont_fix';
interface Clarification {
  id: string; clientId: string; requirementId: string; findingRule: string;
  problem: string; whyRequired: string; whatIsMissing: string; questionToClient: string;
  possibleInterpretation: string; impact: string; priority: string; owner: string | null;
  status: ClarificationStatus; clientAnswer: string | null; answeredBy: string | null; answeredAt: string | null;
  resolution: string | null; createdAt: string;
}
interface RequirementOption { id: string; title: string }

const STATUS_META: Record<ClarificationStatus, { label: string; icon: string; className: string }> = {
  open: { label: 'Open', icon: '●', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  answered: { label: 'Answered', icon: '◐', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  resolved: { label: 'Resolved', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  wont_fix: { label: "Won't Fix", icon: '✕', className: 'text-gray-500 bg-gray-100 border-gray-200' },
};

function StatusBadge({ status }: { status: ClarificationStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${m.className}`}><span aria-hidden="true">{m.icon}</span>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClarificationsPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/clarifications`);
      if (res.ok) setClarifications((await res.json()).clarifications ?? []);
      else if (res.status === 401 || res.status === 403) setError('You are not authorized to manage requirement clarifications for this client.');
      else setError('Unable to load clarifications. The backend may be unavailable.');
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading clarifications...</div>;
  if (error) return <div className="p-6"><ErrorState what="Clarifications could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  const byStatus: Record<ClarificationStatus, number> = { open: 0, answered: 0, resolved: 0, wont_fix: 0 };
  for (const c of clarifications) byStatus[c.status]++;
  const visible = statusFilter ? clarifications.filter(c => c.status === statusFilter) : clarifications;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Requirements Clarification</h2>
      <p className="text-xs text-gray-500 mb-4">Real, specific questions generated from this client&apos;s own business-requirement quality findings — never a fabricated question. The client answers from their own portal; staff resolve or mark won&apos;t-fix.</p>

      {clarifications.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Total" value={clarifications.length} />
          <Stat label="Open" value={byStatus.open} color="text-blue-600" />
          <Stat label="Answered — Awaiting Review" value={byStatus.answered} color="text-amber-600" />
          <Stat label="Resolved / Won't Fix" value={byStatus.resolved + byStatus.wont_fix} color="text-gray-500" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'open', 'answered', 'resolved', 'wont_fix'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            {s === '' ? 'All' : STATUS_META[s as ClarificationStatus].label}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-xl border p-5 mb-4">
        <h3 className="font-semibold text-sm mb-3">Questions</h3>
        <div className="space-y-2">
          {visible.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No clarification questions {statusFilter ? `with status "${STATUS_META[statusFilter as ClarificationStatus].label}"` : 'yet'}</p>
              <p className="text-xs text-blue-700 mt-1">Generate real questions from a requirement below.</p>
            </div>
          )}
          {visible.map(c => <ClarificationRow key={c.id} clientId={clientId} clarification={c} onChanged={() => load(clientId)} />)}
        </div>
      </section>

      <GenerateSection clientId={clientId} onGenerated={() => load(clientId)} />
    </div>
  );
}

function GenerateSection({ clientId, onGenerated }: { clientId: string; onGenerated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!expanded || requirements.length > 0) return;
    staffFetch(`/api/v1/oc/clients/${clientId}/business-requirements`).then(async r => {
      if (r.ok) setRequirements(((await r.json()).requirements ?? []).map((req: RequirementOption) => ({ id: req.id, title: req.title })));
    }).catch(() => { /* picker just stays empty — non-fatal */ });
  }, [expanded, clientId, requirements.length]);

  async function generate() {
    if (!selected) { setErr('Choose a real requirement first.'); return; }
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/requirements/${selected}/clarifications/generate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const count = (data.clarifications ?? []).length;
        setResult(count > 0 ? `Generated ${count} real clarification question${count === 1 ? '' : 's'} from this requirement's quality findings.` : 'This requirement has no outstanding quality findings — no clarification questions were needed.');
        onGenerated();
      } else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not generate clarifications for this requirement.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(false);
  }

  return (
    <section className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Generate Clarifications</h3>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Open'}</button>
      </div>
      {expanded && (
        <div id={panelId} className="mt-3 space-y-2">
          {requirements.length === 0 ? (
            <p className="text-[10px] text-gray-400">No real business requirements exist yet for this client — add some on the Business Requirements tab first.</p>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <select value={selected} onChange={e => setSelected(e.target.value)} className="border rounded px-2 py-1.5 text-xs flex-1 min-w-[200px]">
                <option value="">Choose a requirement…</option>
                {requirements.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <Action variant="primary" onClick={generate} loading={busy} className="!text-[10px] !px-3 !py-1.5">{busy ? 'Generating…' : 'Generate Clarifications'}</Action>
            </div>
          )}
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          {result && <p className="text-[10px] text-green-700">{result}</p>}
        </div>
      )}
    </section>
  );
}

function ClarificationRow({ clientId, clarification, onChanged }: { clientId: string; clarification: Clarification; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  const panelId = useId();

  async function resolve() {
    if (!resolution.trim()) { setErr('A real resolution is required.'); return; }
    setBusy('resolve'); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/clarifications/${clarification.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution: resolution.trim() }) });
      if (res.ok) { setResolution(''); onChanged(); } else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not resolve this clarification.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  async function wontFix() {
    if (!reason.trim()) { setErr('A real reason is required.'); return; }
    setBusy('wont-fix'); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/clarifications/${clarification.id}/wont-fix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      if (res.ok) { setReason(''); onChanged(); } else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not mark this clarification as won\'t-fix.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  const canDecide = clarification.status === 'open' || clarification.status === 'answered';

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{clarification.questionToClient}</span>
          <p className="text-[9px] text-gray-400">{clarification.priority} priority{clarification.owner ? ` · Owner: ${clarification.owner}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={clarification.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Details'}</button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-2 text-xs">
          <div><span className="text-[10px] text-gray-400 uppercase">Problem</span><p className="text-gray-700">{clarification.problem}</p></div>
          <div><span className="text-[10px] text-gray-400 uppercase">What&apos;s Missing</span><p className="text-gray-700">{clarification.whatIsMissing}</p></div>
          <div><span className="text-[10px] text-gray-400 uppercase">Why It Matters</span><p className="text-gray-700">{clarification.whyRequired}</p></div>
          {clarification.possibleInterpretation && <div><span className="text-[10px] text-gray-400 uppercase">Possible Interpretation</span><p className="text-gray-700">{clarification.possibleInterpretation}</p></div>}
          {clarification.impact && <div><span className="text-[10px] text-gray-400 uppercase">Impact</span><p className="text-gray-700">{clarification.impact}</p></div>}

          {clarification.clientAnswer ? (
            <div className="bg-white border rounded p-3">
              <span className="text-[10px] text-gray-400 uppercase">Client&apos;s Answer</span>
              <p className="text-gray-700 mt-0.5">{clarification.clientAnswer}</p>
              {clarification.answeredAt && <p className="text-[10px] text-gray-400 mt-1">Answered {new Date(clarification.answeredAt).toLocaleString('en-AU')}</p>}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">No answer from the client yet — they answer this question from their own portal.</p>
          )}

          {clarification.resolution && <div><span className="text-[10px] text-gray-400 uppercase">Resolution</span><p className="text-gray-700">{clarification.resolution}</p></div>}

          {err && <p className="text-[10px] text-red-600">{err}</p>}

          {canDecide && (
            <div className="border-t pt-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Resolution…" className="border rounded px-2 py-1.5 text-[10px] flex-1 min-w-[160px]" />
                <button onClick={resolve} disabled={busy === 'resolve'} className="text-[10px] font-medium px-2 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">{busy === 'resolve' ? 'Saving…' : 'Resolve'}</button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)…" className="border rounded px-2 py-1.5 text-[10px] flex-1 min-w-[160px]" />
                <button onClick={wontFix} disabled={busy === 'wont-fix'} className="text-[10px] font-medium px-2 py-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">{busy === 'wont-fix' ? 'Saving…' : "Won't Fix"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
