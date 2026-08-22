'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const HEALTH_DOT: Record<string, string> = {
  healthy: 'bg-green-500', on_track: 'bg-green-500', at_risk: 'bg-orange-500', needs_attention: 'bg-orange-500', critical: 'bg-red-500',
};
const HEALTH_BADGE: Record<string, string> = {
  healthy: 'bg-green-100 text-green-700', on_track: 'bg-green-100 text-green-700',
  at_risk: 'bg-orange-100 text-orange-700', needs_attention: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};
const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-blue-100 text-blue-700',
};

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-xl font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}

export default function OptimizationPage() {
  const { clientId } = useParams() as { clientId: string };
  const [summary, setSummary] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'findings' | 'outcomes' | 'metrics' | 'monitoring'>('overview');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sumRes, findRes, outRes, metRes, monRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/clients/${clientId}/optimization/summary`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/optimization/findings`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/optimization/outcomes`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/optimization/metrics`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/optimization/monitoring`),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (findRes.ok) { const d = await findRes.json(); setFindings(d.findings || []); }
      if (outRes.ok) { const d = await outRes.json(); setOutcomes(d.outcomes || []); }
      if (metRes.ok) { const d = await metRes.json(); setMetrics(d.metrics || []); }
      if (monRes.ok) setMonitoring(await monRes.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="text-xs text-gray-500 text-center py-10">Loading optimization data…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-semibold text-lg">Continuous Optimization</h2>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${HEALTH_DOT[summary?.health] || 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500 capitalize">{(summary?.health || 'unknown').replace('_', ' ')}</span>
          <button onClick={loadData} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">↻ Refresh</button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-6">Real optimization findings, transformation outcomes, and monitored metrics for this client.</p>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <Stat label="Active Metrics" value={summary.metrics?.active || 0} />
          <Stat label="Open Findings" value={summary.findings?.open || 0} color="text-orange-600" />
          <Stat label="Realized Savings" value={`$${((summary.savings?.realized || 0) / 1000).toFixed(0)}K`} color="text-green-600" />
          <Stat label="Missed Savings" value={`$${((summary.savings?.missed || 0) / 1000).toFixed(0)}K`} color="text-red-600" />
          <Stat label="Benefit Realization" value={`${summary.outcomes?.avgBenefitRealization?.toFixed(0) || 0}%`} color="text-blue-600" />
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b flex-wrap">
        {(['overview', 'findings', 'outcomes', 'metrics', 'monitoring'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${tab === t ? 'bg-white border border-b-0 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && summary && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Transformation Outcomes</h3>
            <div className="space-y-1 text-xs text-gray-800">
              <p>Total: {summary.outcomes?.total || 0}</p>
              <p className="text-green-600">On Track: {summary.outcomes?.onTrack || 0}</p>
              <p className="text-orange-600">At Risk: {summary.outcomes?.atRisk || 0}</p>
              <p className="text-red-600">Critical: {summary.outcomes?.critical || 0}</p>
            </div>
          </section>
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Optimization Findings</h3>
            <div className="space-y-1 text-xs text-gray-800">
              <p>Total: {summary.findings?.total || 0}</p>
              <p className="text-orange-600">Open: {summary.findings?.open || 0}</p>
              <p className="text-red-600">Critical/High: {summary.findings?.criticalHigh || 0}</p>
              <p className="text-green-600">Potential Savings: ${((summary.findings?.potentialSavings || 0) / 1000).toFixed(0)}K</p>
            </div>
          </section>
        </div>
      )}

      {tab === 'findings' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {findings.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">No optimization findings yet. Record measurements to trigger rule evaluation.</p>
          ) : (
            <div className="divide-y">
              {findings.map(f => (
                <div key={f.id} className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900">{f.title}</span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${SEVERITY_BADGE[f.severity] || 'bg-gray-100 text-gray-600'}`}>{f.severity}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">{f.description?.substring(0, 120)}</p>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400 flex-wrap">
                    {f.baselineValue != null && <span>Baseline: {f.baselineValue}</span>}
                    {f.actualValue != null && <span>Actual: {f.actualValue}</span>}
                    {f.variancePct != null && <span className={f.variancePct > 0 ? 'text-red-500' : 'text-green-600'}>Variance: {f.variancePct.toFixed(1)}%</span>}
                    <span>Status: {f.status}</span>
                  </div>
                  {f.recommendation && <p className="text-[10px] text-blue-600 mt-1">💡 {f.recommendation}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'outcomes' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {outcomes.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">No transformation outcomes recorded yet.</p>
          ) : (
            <div className="divide-y">
              {outcomes.map(o => (
                <div key={o.id} className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-900">Transformation: {o.transformationId}</span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${HEALTH_BADGE[o.health] || 'bg-gray-100 text-gray-600'}`}>{o.health}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {o.expectedSavings != null && <div><p className="text-[9px] text-gray-400">Expected Savings</p><p className="text-xs text-gray-700">${o.expectedSavings.toLocaleString()}</p></div>}
                    {o.actualSavings != null && <div><p className="text-[9px] text-gray-400">Actual Savings</p><p className={`text-xs font-medium ${o.savingsVariancePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>${o.actualSavings.toLocaleString()}</p></div>}
                    {o.benefitRealizationPct != null && <div><p className="text-[9px] text-gray-400">Benefit Realization</p><p className={`text-xs font-medium ${o.benefitRealizationPct >= 80 ? 'text-green-600' : o.benefitRealizationPct >= 50 ? 'text-orange-600' : 'text-red-600'}`}>{o.benefitRealizationPct.toFixed(1)}%</p></div>}
                    {o.roiActual != null && <div><p className="text-[9px] text-gray-400">ROI Actual</p><p className="text-xs text-gray-700">{o.roiActual.toFixed(1)}%</p></div>}
                    {o.costVariancePct != null && <div><p className="text-[9px] text-gray-400">Cost Variance</p><p className={`text-xs font-medium ${o.costVariancePct > 10 ? 'text-red-600' : 'text-green-600'}`}>{o.costVariancePct > 0 ? '+' : ''}{o.costVariancePct.toFixed(1)}%</p></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'metrics' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {metrics.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">No metrics defined. Create metrics to start monitoring.</p>
          ) : (
            <div className="divide-y">
              {metrics.map(m => (
                <div key={m.id} className="p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-900">{m.name}</p>
                    <p className="text-[10px] text-gray-400">{m.domain} / {m.category} • {m.unit} • {m.direction.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="text-right">
                    {m.targetValue != null && <p className="text-[10px] text-blue-600">Target: {m.targetValue}</p>}
                    <p className={`text-[10px] ${m.enabled ? 'text-green-600' : 'text-red-600'}`}>{m.enabled ? '● Active' : '○ Disabled'}</p>
                    {m.lastMeasuredAt && <p className="text-[9px] text-gray-400">Last: {new Date(m.lastMeasuredAt).toLocaleDateString('en-AU')}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'monitoring' && monitoring && (
        <section className="bg-white rounded-xl border p-4">
          <div className="flex gap-4 mb-4 flex-wrap text-xs">
            <span className="text-gray-700">Status: <span className="font-medium">{monitoring.status}</span></span>
            <span className="text-green-600">Healthy: {monitoring.healthy}</span>
            <span className="text-orange-600">Overdue: {monitoring.overdue}</span>
          </div>
          {monitoring.overdueMetrics?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-orange-600 uppercase mb-2">Overdue Measurements</h4>
              <div className="space-y-1.5">
                {monitoring.overdueMetrics.map((m: any) => (
                  <div key={m.id} className="bg-gray-50 rounded-md p-2 text-[11px] text-gray-600">
                    <span className="font-medium text-gray-800">{m.name}</span> — {m.reason === 'never_measured' ? 'Never measured' : `Last: ${new Date(m.lastMeasured).toLocaleDateString('en-AU')}`} (freq: {m.frequency})
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
