'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStaffSession } from '../../../../../lib/staff-session';
import { Action } from '../../../../../components/button';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', proposed: 'bg-blue-100 text-blue-700', approved: 'bg-green-100 text-green-700',
  contracted: 'bg-purple-100 text-purple-700', active: 'bg-emerald-100 text-emerald-700', completed: 'bg-teal-100 text-teal-700',
};
const PROPOSAL_BADGE: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700', sent: 'bg-blue-100 text-blue-700',
};
const TRANSITIONS: Record<string, string[]> = { draft: ['proposed'], proposed: ['approved', 'draft'], approved: ['contracted', 'draft'], contracted: ['active'], active: ['completed'], completed: [] };

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div><p className="text-[10px] text-gray-400">{label}</p><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p></div>;
}

export default function EngagementDetailPage() {
  const { clientId, engagementId } = useParams() as { clientId: string; engagementId: string };
  const router = useRouter();
  const [engagement, setEngagement] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'services' | 'pricing' | 'proposals'>('overview');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/engagements/${engagementId}`;
      // Every one of these sub-resource routes requires ?clientId= — without
      // it the API returns 400 "clientId query param required". This page
      // was never sending it, so the Services/Pricing/Proposals tabs (and
      // the entire Overview summary) silently 400'd on every load and
      // rendered as if the engagement genuinely had no data — found during
      // the 2026-08-22 global UX audit while verifying the alert()/silent-
      // failure fix below. This was a real, previously fully-hidden
      // functional break, not just a UX polish issue.
      const qs = `?clientId=${encodeURIComponent(clientId)}`;
      const [eRes, sRes, pRes, sumRes, prRes] = await Promise.all([
        fetch(base),
        fetch(`${base}/services${qs}`).catch(() => null),
        fetch(`${base}/pricing${qs}`).catch(() => null),
        fetch(`${base}/summary${qs}`).catch(() => null),
        fetch(`${base}/proposals${qs}`).catch(() => null),
      ]);
      if (eRes.ok) setEngagement((await eRes.json()).engagement || await eRes.json());
      if (sRes?.ok) setServices((await sRes.json()).services || []);
      if (pRes?.ok) setPricing((await pRes.json()).pricing || null);
      if (sumRes?.ok) setSummary(await sumRes.json());
      if (prRes?.ok) setProposals((await prRes.json()).proposals || []);
    } catch {} finally { setLoading(false); }
  }, [engagementId, clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Previously: transition() used a native alert() for failures (can't be
  // dismissed gracefully, blocks the page, inconsistent with every other
  // error surface in the app), and createProposal/generateProposal/
  // transitionProposal had NO error handling at all — a failed request just
  // did nothing, with zero feedback that anything went wrong. Found during
  // the 2026-08-22 global UX audit. All four now share one inline error
  // banner and a per-button busy indicator instead.
  const transition = async (newStatus: string) => {
    setActionError(null);
    setActionBusy(newStatus);
    try {
      const r = await fetch(`${API}/api/v1/oc/engagements/${engagementId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, newStatus, actor: getStaffSession()?.identityId || 'unknown-staff' }),
      });
      if (r.ok) { await loadData(); }
      else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.message || `Could not move this engagement to "${newStatus}". Please try again.`);
      }
    } catch {
      setActionError('Could not reach AskABD. Check your connection and try again.');
    } finally {
      setActionBusy(null);
    }
  };

  const createProposal = async () => {
    setActionError(null);
    setActionBusy('create-proposal');
    try {
      const r = await fetch(`${API}/api/v1/oc/engagements/${engagementId}/proposals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, createdBy: getStaffSession()?.identityId || 'unknown-staff' }),
      });
      if (r.ok) { setTab('proposals'); await loadData(); }
      else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.message || 'Could not create a proposal. Please try again.');
      }
    } catch {
      setActionError('Could not reach AskABD. Check your connection and try again.');
    } finally {
      setActionBusy(null);
    }
  };

  const generateProposal = async (proposalId: string) => {
    setActionError(null);
    setActionBusy(`generate-${proposalId}`);
    try {
      const r = await fetch(`${API}/api/v1/oc/proposals/${proposalId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }) });
      if (r.ok) { await loadData(); }
      else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.message || 'Could not generate the proposal content. Please try again.');
      }
    } catch {
      setActionError('Could not reach AskABD. Check your connection and try again.');
    } finally {
      setActionBusy(null);
    }
  };

  const transitionProposal = async (proposalId: string, newStatus: string) => {
    setActionError(null);
    setActionBusy(`${proposalId}-${newStatus}`);
    try {
      const r = await fetch(`${API}/api/v1/oc/proposals/${proposalId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, newStatus, actor: getStaffSession()?.identityId || 'unknown-staff' }),
      });
      if (r.ok) { await loadData(); }
      else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.message || `Could not move this proposal to "${newStatus}". Please try again.`);
      }
    } catch {
      setActionError('Could not reach AskABD. Check your connection and try again.');
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading engagement…</p>;
  if (!engagement) return <p className="text-xs text-red-600 text-center py-10">Engagement not found</p>;

  const allowed = TRANSITIONS[engagement.status] || [];

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <button onClick={() => router.push(`/clients/${clientId}/engagements`)} className="text-[11px] text-gray-400 hover:text-gray-600 mb-1">← Back to Engagements</button>
          <h2 className="font-semibold text-lg">{engagement.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{engagement.engagement_type} · {engagement.engagement_number || engagement.id.slice(0, 8)}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md uppercase ${STATUS_BADGE[engagement.status] || 'bg-gray-100 text-gray-600'}`}>{engagement.status}</span>
      </div>

      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{actionError}</p>
      )}

      {allowed.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {allowed.map(s => (
            <Action key={s} variant="secondary" onClick={() => transition(s)} loading={actionBusy === s}>→ {s}</Action>
          ))}
          {engagement.status === 'draft' && <Action variant="primary" onClick={createProposal} loading={actionBusy === 'create-proposal'}>+ Create Proposal</Action>}
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b flex-wrap">
        {(['overview', 'services', 'pricing', 'proposals'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${tab === t ? 'bg-white border border-b-0 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && summary && (
        <div className="space-y-4">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Engagement Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Metric label="Services" value={summary.servicesCount || services.length} />
              <Metric label="Problems Addressed" value={summary.problemsCount || 0} />
              <Metric label="Gaps Addressed" value={summary.gapsCount || 0} />
              <Metric label="Investment" value={`$${(summary.totalInvestment || engagement.total_investment || 0).toLocaleString()}`} color="text-blue-600" />
              <Metric label="Expected Value" value={`$${(summary.totalExpectedValue || engagement.total_expected_value || 0).toLocaleString()}`} color="text-green-600" />
              <Metric label="Effort (days)" value={summary.totalEffortDays || engagement.total_effort_days || 0} />
            </div>
          </section>
          {engagement.description && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Description</h3>
              <p className="text-xs text-gray-700">{engagement.description}</p>
            </section>
          )}
        </div>
      )}

      {tab === 'services' && (
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Selected Services ({services.length})</h3>
          {services.length === 0 ? (
            <p className="text-xs text-gray-500">No services selected yet. Add services from the client service configuration.</p>
          ) : (
            <div className="space-y-2">
              {services.map((s: any) => (
                <div key={s.id} className="bg-gray-50 rounded-lg p-3 border-l-4 border-blue-400">
                  <p className="text-xs font-semibold text-gray-900">{s.service_id}</p>
                  {s.scope_description && <p className="text-[11px] text-gray-500 mt-0.5">{s.scope_description}</p>}
                  <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400 flex-wrap">
                    {s.estimated_effort && <span>Effort: {s.estimated_effort}d</span>}
                    {s.estimated_investment && <span>Invest: ${Number(s.estimated_investment).toLocaleString()}</span>}
                    {s.expected_value && <span>Value: ${Number(s.expected_value).toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'pricing' && (
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Pricing</h3>
          {!pricing ? (
            <p className="text-xs text-gray-500">No pricing configured yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Metric label="Subtotal" value={`$${Number(pricing.subtotal || 0).toLocaleString()}`} />
              <Metric label="Discount" value={`$${Number(pricing.discount || 0).toLocaleString()}`} color="text-orange-600" />
              <Metric label="Tax" value={`$${Number(pricing.tax || 0).toLocaleString()}`} />
              <div><p className="text-[10px] text-gray-400">Total</p><p className="text-2xl font-bold text-green-600">${Number(pricing.total || 0).toLocaleString()}</p></div>
              <Metric label="Billing Model" value={pricing.billing_model || 'N/A'} />
              <Metric label="Payment Terms" value={pricing.payment_terms || 'N/A'} />
            </div>
          )}
        </section>
      )}

      {tab === 'proposals' && (
        <div>
          {proposals.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center">
              <p className="text-xs text-gray-500 mb-3">No proposals yet</p>
              <Action variant="primary" onClick={createProposal} loading={actionBusy === 'create-proposal'}>Create First Proposal</Action>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((p: any) => (
                <div key={p.id} className="bg-white rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{p.title || `Proposal v${p.version}`}</p>
                      <p className="text-[10px] text-gray-500">{p.proposal_number || p.id.slice(0, 12)} · v{p.version}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md shrink-0 ${PROPOSAL_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                  </div>
                  {p.executive_summary && <p className="text-xs text-gray-600 mb-2.5">{p.executive_summary.slice(0, 200)}…</p>}
                  <div className="flex gap-2 flex-wrap">
                    {p.status === 'draft' && <Action variant="secondary" onClick={() => generateProposal(p.id)} loading={actionBusy === `generate-${p.id}`}>Generate Content</Action>}
                    {p.status === 'draft' && <Action variant="secondary" onClick={() => transitionProposal(p.id, 'ready')} loading={actionBusy === `${p.id}-ready`}>→ Ready</Action>}
                    {p.status === 'ready' && <Action variant="primary" onClick={() => transitionProposal(p.id, 'sent')} loading={actionBusy === `${p.id}-sent`}>→ Send</Action>}
                    {p.status === 'sent' && <Action variant="primary" className="!bg-green-600 hover:!bg-green-700" onClick={() => transitionProposal(p.id, 'accepted')} loading={actionBusy === `${p.id}-accepted`}>→ Accept</Action>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
