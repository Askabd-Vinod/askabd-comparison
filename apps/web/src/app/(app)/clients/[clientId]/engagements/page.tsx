'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Action } from '../../../../components/button';
import { getStaffSession } from '../../../../lib/staff-session';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', proposed: 'bg-blue-100 text-blue-700', approved: 'bg-green-100 text-green-700',
  contracted: 'bg-purple-100 text-purple-700', active: 'bg-emerald-100 text-emerald-700', completed: 'bg-teal-100 text-teal-700',
};
const STATUS_BORDER: Record<string, string> = {
  draft: 'border-gray-300', proposed: 'border-blue-400', approved: 'border-green-400',
  contracted: 'border-purple-400', active: 'border-emerald-400', completed: 'border-teal-400',
};

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-xl font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}

export default function EngagementsPage() {
  const { clientId } = useParams() as { clientId: string };
  const router = useRouter();
  const [engagements, setEngagements] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [reconSummary, setReconSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('transformation');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/clients/${clientId}`;
      const [eRes, pmRes, txRes, rRes] = await Promise.all([
        fetch(`${base}/engagements`),
        fetch(`${base}/payment-methods`).catch(() => null),
        fetch(`${base}/transactions`).catch(() => null),
        fetch(`${base}/reconciliation/summary`).catch(() => null),
      ]);
      if (eRes.ok) setEngagements((await eRes.json()).engagements || []);
      if (pmRes?.ok) setPaymentMethods((await pmRes.json()).paymentMethods || []);
      if (txRes?.ok) setTransactions((await txRes.json()).transactions || []);
      if (rRes?.ok) setReconSummary(await rRes.json());
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const createEngagement = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const r = await fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Previously never sent createdBy at all, so every engagement was
        // attributed to 'unknown-staff' in the audit trail even though the
        // real staff identity was known client-side — found during the
        // 2026-08-22 global UX/fabrication audit, same bug class as the
        // other actor-attribution fixes this session.
        body: JSON.stringify({ name: newName, engagementType: newType, createdBy: getStaffSession()?.identityId || 'unknown-staff' }),
      });
      if (r.ok) { setShowCreate(false); setNewName(''); loadData(); }
      else {
        // Previously a failed create silently did nothing at all — no
        // error, no feedback, the form just sat there looking unresponsive.
        const body = await r.json().catch(() => ({}));
        setCreateError(body?.message || body?.error?.message || 'Could not create the engagement. Please check the details and try again.');
      }
    } catch {
      setCreateError('Could not reach AskABD. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading commercial…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lg">Commercial Engagements</h2>
        <Action variant="primary" onClick={() => { setShowCreate(v => !v); setCreateError(null); }}>{showCreate ? 'Cancel' : '+ New Engagement'}</Action>
      </div>
      <p className="text-xs text-gray-500 mb-6">Real commercial engagements, payments, and reconciliation for this client.</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Stat label="Engagements" value={engagements.length} />
        <Stat label="Active" value={engagements.filter(e => e.status === 'active').length} color="text-green-600" />
        <Stat label="Payment Methods" value={paymentMethods.length} color="text-blue-600" />
        <Stat label="Transactions" value={transactions.length} color="text-purple-600" />
        <Stat label="Reconciliations" value={reconSummary?.reconciliation?.totalRuns || 0} color={reconSummary?.exceptions?.open ? 'text-orange-600' : 'text-green-600'} />
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-1">Create New Engagement</h3>
          <p className="text-xs text-gray-500 mb-4">A commercial engagement tracks the scope, pricing, and proposal for a piece of work with this client.</p>

          <label htmlFor="eng-name" className="block text-xs font-medium text-gray-700 mb-1">
            Engagement name <span className="text-red-500">*</span>
          </label>
          <input
            id="eng-name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Cloud Migration Phase 1"
            className="w-full border rounded-md px-3 py-2 text-sm mb-1"
            required
            aria-required="true"
          />
          <p className="text-[11px] text-gray-400 mb-3">A short, recognizable name — shown to the client and used on invoices and proposals.</p>

          <label htmlFor="eng-type" className="block text-xs font-medium text-gray-700 mb-1">Engagement type</label>
          <select id="eng-type" value={newType} onChange={e => setNewType(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-1">
            <option value="transformation">Transformation — migration or modernization work</option>
            <option value="managed_services">Managed Services — ongoing operational support</option>
            <option value="advisory">Advisory — consulting and recommendations</option>
            <option value="assessment">Assessment — discovery and analysis only</option>
          </select>
          <p className="text-[11px] text-gray-400 mb-4">Determines which service categories and pricing templates apply.</p>

          {createError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{createError}</p>
          )}

          <div className="flex items-center gap-3">
            <Action variant="primary" onClick={createEngagement} disabled={!newName.trim()} loading={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Action>
            {!newName.trim() && <span className="text-[11px] text-gray-400">Enter an engagement name to continue</span>}
          </div>
        </div>
      )}

      {engagements.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center mb-4">
          <p className="text-sm font-medium text-gray-700 mb-1">No engagements yet</p>
          <p className="text-xs text-gray-400">Create an engagement to begin the commercial lifecycle.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {engagements.map((e: any) => (
            <div key={e.id} onClick={() => router.push(`/clients/${clientId}/engagements/${e.id}`)} className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-sm transition border-l-4 ${STATUS_BORDER[e.status] || 'border-gray-300'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{e.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{e.engagement_type} · {e.engagement_number || e.id.slice(0, 8)}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md uppercase shrink-0 ${STATUS_BADGE[e.status] || 'bg-gray-100 text-gray-600'}`}>{e.status}</span>
              </div>
              {e.description && <p className="text-xs text-gray-500 mt-2">{e.description}</p>}
              <div className="flex gap-4 mt-2.5 text-[10px] text-gray-400 flex-wrap">
                {e.total_investment && <span>Investment: ${Number(e.total_investment).toLocaleString()}</span>}
                {e.currency && <span>Currency: {e.currency}</span>}
                <span>Created: {new Date(e.created_at).toLocaleDateString('en-AU')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {paymentMethods.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-4">
          <h3 className="font-semibold text-sm mb-3">Payment Methods</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {paymentMethods.map((pm: any) => (
              <div key={pm.id} className="bg-gray-50 rounded-lg p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-900">{pm.display_name}</span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${pm.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{pm.status}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">{pm.type} · {pm.currency}{pm.last4 ? ` · ****${pm.last4}` : ''}</p>
                {pm.is_default && <p className="text-[10px] text-blue-600 mt-1">★ Default</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {reconSummary && reconSummary.transactions?.total > 0 && (
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Financial Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Transactions" value={reconSummary.transactions.total} />
            <Stat label="Total Amount" value={`$${reconSummary.transactions.totalAmount?.toLocaleString() || 0}`} color="text-green-600" />
            <Stat label="Matched" value={reconSummary.reconciliation.totalMatched} />
            <Stat label="Open Exceptions" value={reconSummary.exceptions.open} color={reconSummary.exceptions.open > 0 ? 'text-orange-600' : 'text-green-600'} />
          </div>
        </section>
      )}
    </div>
  );
}
