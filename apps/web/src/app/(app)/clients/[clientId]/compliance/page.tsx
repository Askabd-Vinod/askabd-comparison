'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Action } from '../../../../components/button';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STATUS_CLASS: Record<string, string> = {
  met: 'bg-green-100 text-green-700', partially_met: 'bg-orange-100 text-orange-700',
  not_met: 'bg-red-100 text-red-700',
};

export default function CompliancePage() {
  const { clientId } = useParams() as { clientId: string };
  const [summary, setSummary] = useState<any>(null);
  const [controls, setControls] = useState<any[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, cRes, fRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/compliance/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/compliance`),
        fetch(`${API}/api/v1/oc/compliance/frameworks`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (cRes.ok) setControls((await cRes.json()).controls || []);
      if (fRes.ok) setFrameworks((await fRes.json()).frameworks || []);
    } catch {} finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const initialize = async (fwId: string) => {
    await fetch(`${API}/api/v1/oc/clients/${clientId}/compliance/initialize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frameworkId: fwId }) });
    await fetch(`${API}/api/v1/oc/clients/${clientId}/compliance/auto-map`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    loadData();
  };

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading compliance…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lg">Compliance</h2>
        <button onClick={loadData} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">↻ Refresh</button>
      </div>
      <p className="text-xs text-gray-500 mb-6">Real, evidence-backed compliance framework tracking for this client.</p>

      {summary?.frameworks?.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {summary.frameworks.map((f: any) => (
            <div key={f.frameworkId} className="bg-white rounded-xl border p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">{f.frameworkName}</p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className={`text-2xl font-bold ${f.score >= 80 ? 'text-green-600' : f.score >= 50 ? 'text-orange-600' : 'text-red-600'}`}>{f.score}%</span>
                <span className="text-[10px] text-gray-400">compliance score</span>
              </div>
              <p className="text-[10px] text-gray-500">Met: {f.met} | Partial: {f.partial} | Not Met: {f.notMet} | Not Assessed: {f.notAssessed}</p>
              <p className="text-[10px] text-gray-400 mt-1">Evidence missing: {f.evidenceMissing} | Maturity: {f.avgMaturity}/5</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-6 mb-4 text-center">
          <p className="text-sm text-gray-500 mb-3">No compliance frameworks initialized for this client.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {frameworks.map(f => (
              <Action key={f.id} variant="primary" onClick={() => initialize(f.id)}>Initialize {f.name}</Action>
            ))}
          </div>
        </div>
      )}

      {controls.length > 0 && (
        <section className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Control</th>
                  <th className="text-center px-4 py-2.5">Status</th>
                  <th className="text-center px-4 py-2.5">Maturity</th>
                  <th className="text-center px-4 py-2.5">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {controls.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-800">{c.controlId}</td>
                    <td className="px-4 py-2.5 text-center"><span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${STATUS_CLASS[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status.replace('_', ' ')}</span></td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{c.maturity}/5</td>
                    <td className={`px-4 py-2.5 text-center ${c.evidenceStatus === 'collected' ? 'text-green-600' : 'text-orange-600'}`}>{c.evidenceStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
