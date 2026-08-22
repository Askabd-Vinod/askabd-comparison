'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_CLASS: Record<string, string> = {
  accepted: 'border-green-400', sent: 'border-blue-400', ready: 'border-orange-400',
};
const STATUS_BADGE: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700', sent: 'bg-blue-100 text-blue-700', ready: 'bg-orange-100 text-orange-700',
};

export default function ClientProposalsPage() {
  const { clientId } = useParams() as { clientId: string };
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const eRes = await fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`);
      const engs = eRes.ok ? (await eRes.json()).engagements || [] : [];

      // Load proposals for each engagement
      const allProps: any[] = [];
      for (const eng of engs.slice(0, 10)) {
        try {
          const pRes = await fetch(`${API}/api/v1/oc/engagements/${eng.id}/proposals`);
          if (pRes.ok) {
            const data = await pRes.json();
            (data.proposals || []).forEach((p: any) => allProps.push({ ...p, engagementName: eng.name }));
          }
        } catch {}
      }
      setProposals(allProps);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading proposals…</p>;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Proposals</h2>
      <p className="text-xs text-gray-500 mb-6">Real proposals generated from this client's commercial engagements.</p>

      {proposals.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No proposals yet</p>
          <p className="text-xs text-gray-400 mt-1">Proposals are created from commercial engagements.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p: any) => (
            <div key={p.id} className={`bg-white rounded-xl border p-4 border-l-4 ${STATUS_CLASS[p.status] || 'border-gray-300'}`}>
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{p.title || `Proposal v${p.version}`}</p>
                  <p className="text-[10px] text-gray-500">{p.proposal_number || p.id.slice(0, 14)} · Version {p.version} · {p.engagementName}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md shrink-0 ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
              </div>
              {p.executive_summary && <p className="text-xs text-gray-600 mb-1.5">{p.executive_summary.slice(0, 250)}{p.executive_summary.length > 250 ? '…' : ''}</p>}
              {p.investment_summary && <p className="text-xs text-blue-600 mb-1">{p.investment_summary.slice(0, 150)}</p>}
              {p.value_summary && <p className="text-xs text-green-600">{p.value_summary.slice(0, 150)}</p>}
              <div className="flex gap-3 mt-2 text-[10px] text-gray-400 flex-wrap">
                {p.payment_terms && <span>Terms: {p.payment_terms}</span>}
                <span>Created: {new Date(p.created_at).toLocaleDateString('en-AU')}</span>
                {p.valid_until && <span>Valid until: {new Date(p.valid_until).toLocaleDateString('en-AU')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
