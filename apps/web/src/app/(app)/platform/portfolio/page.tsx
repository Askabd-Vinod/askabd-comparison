'use client';

import { useEffect, useState, useCallback } from 'react';
import { ErrorState } from '../../../components/error-state';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const HEALTH_DOT: Record<string, string> = {
  healthy: 'bg-green-500', Healthy: 'bg-green-500', on_track: 'bg-green-500',
  watch: 'bg-orange-500', Watch: 'bg-orange-500', needs_attention: 'bg-orange-500',
  at_risk: 'bg-orange-500', 'At Risk': 'bg-orange-500',
  critical: 'bg-red-500', Critical: 'bg-red-500',
};
const HEALTH_BADGE: Record<string, string> = {
  healthy: 'bg-green-100 text-green-700', Healthy: 'bg-green-100 text-green-700', on_track: 'bg-green-100 text-green-700',
  watch: 'bg-orange-100 text-orange-700', Watch: 'bg-orange-100 text-orange-700', needs_attention: 'bg-orange-100 text-orange-700',
  at_risk: 'bg-orange-100 text-orange-700', 'At Risk': 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700', Critical: 'bg-red-100 text-red-700',
};
const HEALTH_TEXT: Record<string, string> = {
  healthy: 'text-green-600', Healthy: 'text-green-600', on_track: 'text-green-600',
  watch: 'text-orange-600', Watch: 'text-orange-600', needs_attention: 'text-orange-600',
  at_risk: 'text-orange-600', 'At Risk': 'text-orange-600',
  critical: 'text-red-600', Critical: 'text-red-600',
};

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}

export default function PortfolioPage() {
  const [health, setHealth] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [financial, setFinancial] = useState<any>(null);
  const [transformations, setTransformations] = useState<any>(null);
  const [patterns, setPatterns] = useState<any>(null);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>('overview');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hRes, cRes, fRes, tRes, pRes, iRes, rRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/portfolio/health`),
        fetch(`${API}/api/v1/oc/portfolio/clients`),
        fetch(`${API}/api/v1/oc/portfolio/financial`),
        fetch(`${API}/api/v1/oc/portfolio/transformations`),
        fetch(`${API}/api/v1/oc/portfolio/patterns`),
        fetch(`${API}/api/v1/oc/portfolio/intelligence`),
        fetch(`${API}/api/v1/oc/portfolio/resources`),
      ]);
      if (hRes.ok) setHealth(await hRes.json());
      else throw new Error(`Portfolio health request failed (${hRes.status})`);
      if (cRes.ok) setClients((await cRes.json()).clients || []);
      if (fRes.ok) setFinancial(await fRes.json());
      if (tRes.ok) setTransformations(await tRes.json());
      if (pRes.ok) setPatterns(await pRes.json());
      if (iRes.ok) setIntelligence(await iRes.json());
      if (rRes.ok) setResources(await rRes.json());
    } catch (err) {
      setError((err as Error).message || 'Unable to reach AskABD.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const fmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  if (loading) return <div className="max-w-[1600px] mx-auto px-4 py-6"><p className="text-xs text-gray-500 text-center py-10">Loading portfolio intelligence…</p></div>;
  if (error) return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <ErrorState what="Portfolio intelligence could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={loadData} />
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Enterprise Portfolio Intelligence</h1>
          <p className="text-xs text-gray-500 mt-0.5">Cross-client aggregation, patterns, and recommendations</p>
        </div>
        <div className="flex items-center gap-3">
          {health && <><span className={`w-3.5 h-3.5 rounded-full inline-block ${HEALTH_DOT[health.overallHealth] || 'bg-gray-400'}`} /><span className="text-sm font-semibold text-gray-900">{health.overallScore}/100</span></>}
          <button onClick={loadData} className="bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg px-3.5 py-1.5 transition">↻</button>
        </div>
      </div>

      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
          <Stat label="Clients" value={health.clients.total} />
          <Stat label="Critical Problems" value={health.problems.critical} color="text-red-600" />
          <Stat label="Open Gaps" value={health.gaps.open} color="text-orange-600" />
          <Stat label="Transformations" value={health.transformations.total} color="text-blue-600" />
          <Stat label="Realized Savings" value={fmt(health.financial.actualSavings)} color="text-green-600" />
          <Stat label="Missed Savings" value={fmt(health.financial.missedSavings)} color="text-red-600" />
          <Stat label="Benefit Realization" value={`${health.financial.avgBenefitRealization}%`} />
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b flex-wrap">
        {['overview', 'clients', 'financial', 'transformations', 'patterns', 'resources', 'intelligence'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 text-xs font-medium rounded-t-lg transition ${tab === t ? 'bg-white border border-b-0 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && intelligence && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Top Risks</h3>
            {intelligence.topRisks.length === 0 ? <p className="text-xs text-gray-400">No critical risks</p> : (
              <div className="divide-y">
                {/* Previously always rendered "(clientName)" even when
                    clientName was null — a real, orphaned problem row (no
                    matching oc_clients record; the SQL LEFT JOIN correctly
                    returns null rather than fabricating a name) showed as a
                    bare, confusing "()" with nothing inside. Found during
                    the 2026-08-22 global UX audit. */}
                {intelligence.topRisks.slice(0, 5).map((r: any, i: number) => (
                  <p key={i} className="text-xs text-gray-700 py-1.5"><span className={r.severity === 'critical' ? 'text-red-500' : 'text-orange-500'}>●</span> {r.title} {r.clientName && <span className="text-gray-400">({r.clientName})</span>}</p>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Top Opportunities</h3>
            {intelligence.topOpportunities.length === 0 ? <p className="text-xs text-gray-400">No opportunities identified</p> : (
              <div className="divide-y">
                {intelligence.topOpportunities.slice(0, 5).map((o: any, i: number) => (
                  <p key={i} className="text-xs text-gray-700 py-1.5"><span className="text-green-600 font-medium">{fmt(o.savings)}/yr</span> — {o.problemTitle || 'Unnamed'} {o.clientName && <span className="text-gray-400">({o.clientName})</span>}</p>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4 md:col-span-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Recommendations</h3>
            {intelligence.recommendations.length === 0 ? <p className="text-xs text-gray-400">No recommendations</p> : (
              <div className="space-y-1.5">
                {intelligence.recommendations.map((r: any, i: number) => (
                  <div key={i} className={`bg-gray-50 rounded-md p-2.5 border-l-4 ${HEALTH_TEXT[r.priority] ? HEALTH_TEXT[r.priority].replace('text-', 'border-').replace('-600', '-400') : 'border-blue-400'}`}>
                    <p className="text-xs font-medium text-gray-900">{r.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{r.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'clients' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-center px-4 py-2.5">Score</th>
                  <th className="text-center px-4 py-2.5">Health</th>
                  <th className="text-center px-4 py-2.5">Risk</th>
                  <th className="text-left px-4 py-2.5">Top Risks</th>
                  <th className="text-center px-4 py-2.5">Lifecycle</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clients.map(c => (
                  <tr key={c.clientId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium"><a href={`/clients/${c.clientId}/optimization`} className="text-purple-600 hover:text-purple-800">{c.clientName}</a></td>
                    <td className={`px-4 py-2.5 text-center font-semibold ${HEALTH_TEXT[c.health] || 'text-gray-600'}`}>{c.score}</td>
                    <td className="px-4 py-2.5 text-center"><span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${HEALTH_BADGE[c.health] || 'bg-gray-100 text-gray-600'}`}>{c.health}</span></td>
                    <td className={`px-4 py-2.5 text-center ${c.riskLevel === 'critical' ? 'text-red-600' : c.riskLevel === 'high' ? 'text-orange-600' : 'text-green-600'}`}>{c.riskLevel}</td>
                    <td className="px-4 py-2.5 text-gray-500">{c.topRisks.slice(0, 2).join(', ') || 'None'}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400">{c.lifecycleStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'financial' && financial && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Total Investment" value={fmt(financial.totals.investment)} />
            <Stat label="Expected Savings" value={fmt(financial.totals.expectedSavings)} color="text-blue-600" />
            <Stat label="Realized" value={fmt(financial.totals.realizedSavings)} color="text-green-600" />
            <Stat label="Missed" value={fmt(financial.totals.missedSavings)} color="text-red-600" />
          </div>
          <section className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5">Client</th>
                    <th className="text-right px-4 py-2.5">Investment</th>
                    <th className="text-right px-4 py-2.5">Expected</th>
                    <th className="text-right px-4 py-2.5">Realized</th>
                    <th className="text-right px-4 py-2.5">ROI</th>
                    <th className="text-right px-4 py-2.5">Benefit %</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {financial.clients.map((c: any) => (
                    <tr key={c.clientId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-900">{c.clientName || c.clientId}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{fmt(c.investment)}</td>
                      <td className="px-4 py-2.5 text-right text-blue-600">{fmt(c.expectedSavings)}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{fmt(c.realizedSavings)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{c.avgRoi}%</td>
                      <td className={`px-4 py-2.5 text-right ${c.benefitRealization >= 80 ? 'text-green-600' : 'text-orange-600'}`}>{c.benefitRealization}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'transformations' && transformations && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {['planned', 'inProgress', 'completed', 'failed'].map(s => (
              <div key={s} className="bg-white rounded-xl border p-3 text-center">
                <p className={`text-lg font-bold ${s === 'completed' ? 'text-green-600' : s === 'failed' ? 'text-red-600' : s === 'inProgress' ? 'text-blue-600' : 'text-gray-500'}`}>{transformations.summary[s]}</p>
                <p className="text-[10px] text-gray-500 capitalize">{s.replace(/([A-Z])/g, ' $1')}</p>
              </div>
            ))}
            <Stat label="Total Investment" value={fmt(transformations.summary.totalInvestment)} />
          </div>
          <section className="bg-white rounded-xl border overflow-hidden">
            <div className="divide-y">
              {transformations.transformations.map((t: any) => (
                <div key={t.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-900">{t.title}</p>
                    <p className="text-[10px] text-gray-400">{t.clientName} • {t.domain} • {t.duration || 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.outcome && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${HEALTH_BADGE[t.outcome.health] || 'bg-gray-100 text-gray-600'}`}>{t.outcome.benefitRealization?.toFixed(0) || '?'}% benefit</span>}
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${t.status === 'completed' ? 'bg-green-100 text-green-700' : t.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{t.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'patterns' && patterns && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Repeated Problems</h3>
            {patterns.problems.length === 0 ? <p className="text-xs text-gray-400">No patterns detected</p> : (
              <div className="space-y-1.5">
                {patterns.problems.map((p: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded-md p-2">
                    <p className="text-xs font-medium text-gray-900">{p.label}</p>
                    <p className="text-[10px] text-gray-400">{p.frequency} instances • {p.affectedClients.length} client(s)</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Repeated Gaps</h3>
            {patterns.gaps.length === 0 ? <p className="text-xs text-gray-400">No patterns detected</p> : (
              <div className="space-y-1.5">
                {patterns.gaps.map((g: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded-md p-2">
                    <p className="text-xs font-medium text-gray-900">{g.label}</p>
                    <p className="text-[10px] text-gray-400">{g.frequency} instances • {g.affectedClients.length} client(s)</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">{g.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4 md:col-span-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Technology Intelligence</h3>
            {patterns.technologies.length === 0 ? <p className="text-xs text-gray-400">No technology data from discovery</p> : (
              <div className="flex flex-wrap gap-1.5">
                {patterns.technologies.map((t: any, i: number) => (
                  <span key={i} className="text-xs px-2.5 py-1 bg-gray-100 rounded-full text-gray-600">{t.label} ({t.frequency})</span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'resources' && resources && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Total Person-Days (Est.)" value={resources.totals.totalPersonDays} />
            <Stat label="Active (Planned/In-Progress)" value={resources.totals.activePersonDays} color="text-blue-600" />
            <Stat label="Clients with Estimates" value={resources.totals.totalClients} />
          </div>
          <section className="bg-white rounded-xl border p-4 mb-3">
            <p className="text-[11px] text-orange-600 mb-2">⚠ Data source: {resources.dataSource}. Actual resource allocation tracking not yet implemented.</p>
            <div className="divide-y">
              {resources.clients.map((c: any) => (
                <div key={c.clientId} className="flex justify-between py-1.5 text-xs">
                  <span className="text-gray-800">{c.clientName}</span>
                  <span className="text-gray-500">{c.totalPersonDays} days • team ~{c.avgTeamSize} • {c.maxComplexity}</span>
                </div>
              ))}
            </div>
          </section>
          {resources.roles.length > 0 && (
            <section className="bg-white rounded-xl border p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Role Demand</h4>
              <div className="flex flex-wrap gap-1.5">
                {resources.roles.map((r: any) => (
                  <span key={r.role} className="text-[11px] px-2.5 py-1 bg-gray-100 rounded-full text-gray-600">{r.role} ({r.frequency})</span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'intelligence' && intelligence && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Underperforming Transformations</h3>
            {intelligence.underperforming.length === 0 ? <p className="text-xs text-gray-400">All transformations on track</p> : (
              <div className="space-y-1.5">
                {intelligence.underperforming.map((u: any, i: number) => (
                  <div key={i} className={`bg-gray-50 rounded-md p-2 border-l-4 ${HEALTH_TEXT[u.health] ? HEALTH_TEXT[u.health].replace('text-', 'border-').replace('-600', '-400') : 'border-gray-300'}`}>
                    <p className="text-xs font-medium text-gray-900">{u.title}</p>
                    <p className="text-[10px] text-gray-400">{u.clientName} • Benefit: {u.benefitRealization?.toFixed(0) || '?'}%</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2.5">Repeated Technology Patterns</h3>
            {intelligence.patterns.technologies.length === 0 ? <p className="text-xs text-gray-400">No patterns</p> : (
              <div className="space-y-1">
                {intelligence.patterns.technologies.map((t: any, i: number) => (
                  <p key={i} className="text-xs text-gray-600">• {t.label} — {t.affectedClients.length} client(s)</p>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
