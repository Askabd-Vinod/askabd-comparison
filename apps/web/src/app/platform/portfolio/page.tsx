'use client';

import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function PortfolioPage() {
  const [health, setHealth] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [financial, setFinancial] = useState<any>(null);
  const [transformations, setTransformations] = useState<any>(null);
  const [patterns, setPatterns] = useState<any>(null);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('overview');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
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
      if (cRes.ok) setClients((await cRes.json()).clients || []);
      if (fRes.ok) setFinancial(await fRes.json());
      if (tRes.ok) setTransformations(await tRes.json());
      if (pRes.ok) setPatterns(await pRes.json());
      if (iRes.ok) setIntelligence(await iRes.json());
      if (rRes.ok) setResources(await rRes.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const hc = (h: string) => h === 'healthy' || h === 'Healthy' || h === 'on_track' ? '#22c55e' : h === 'watch' || h === 'Watch' || h === 'needs_attention' ? '#f59e0b' : h === 'at_risk' || h === 'At Risk' ? '#f97316' : h === 'critical' || h === 'Critical' ? '#ef4444' : '#6b7280';
  const fmt = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading portfolio intelligence...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Enterprise Portfolio Intelligence</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Cross-client aggregation, patterns, and recommendations</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {health && <><span style={{ width: 14, height: 14, borderRadius: '50%', background: hc(health.overallHealth), display: 'inline-block' }} /><span style={{ fontSize: 14, fontWeight: 600 }}>{health.overallScore}/100</span></>}
          <button onClick={loadData} style={{ background: '#1e40af', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>↻</button>
        </div>
      </div>

      {/* Executive Summary */}
      {health && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700 }}>{health.clients.total}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Clients</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{health.problems.critical}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Critical Problems</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{health.gaps.open}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Open Gaps</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{health.transformations.total}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Transformations</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{fmt(health.financial.actualSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Realized Savings</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{fmt(health.financial.missedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Missed Savings</div></div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700 }}>{health.financial.avgBenefitRealization}%</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Benefit Realization</div></div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #334155', paddingBottom: 8, flexWrap: 'wrap' }}>
        {['overview','clients','financial','transformations','patterns','resources','intelligence'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: tab === t ? '#3b82f6' : 'transparent', color: tab === t ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && intelligence && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Top Risks</h3>
            {intelligence.topRisks.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No critical risks</div> : intelligence.topRisks.slice(0, 5).map((r: any, i: number) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #0f172a', fontSize: 12 }}>
                <span style={{ color: hc(r.severity === 'critical' ? 'critical' : 'at_risk') }}>●</span> {r.title} <span style={{ color: '#64748b' }}>({r.clientName})</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Top Opportunities</h3>
            {intelligence.topOpportunities.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No opportunities identified</div> : intelligence.topOpportunities.slice(0, 5).map((o: any, i: number) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #0f172a', fontSize: 12 }}>
                <span style={{ color: '#22c55e' }}>{fmt(o.savings)}/yr</span> — {o.problemTitle || 'Unnamed'} <span style={{ color: '#64748b' }}>({o.clientName})</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, gridColumn: 'span 2' }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Recommendations</h3>
            {intelligence.recommendations.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No recommendations</div> : intelligence.recommendations.map((r: any, i: number) => (
              <div key={i} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 6, borderLeft: `3px solid ${hc(r.priority)}` }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{r.title}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{r.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clients Tab */}
      {tab === 'clients' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: '#94a3b8' }}>Client</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Score</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Health</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Risk</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: '#94a3b8' }}>Top Risks</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Lifecycle</th>
            </tr></thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.clientId} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '8px 12px', color: '#f1f5f9', fontWeight: 500 }}><a href={`/clients/${c.clientId}/optimization`} style={{ color: '#38bdf8', textDecoration: 'none' }}>{c.clientName}</a></td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: hc(c.health) }}>{c.score}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: hc(c.health), color: '#fff' }}>{c.health}</span></td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: hc(c.riskLevel === 'critical' ? 'critical' : c.riskLevel === 'high' ? 'at_risk' : 'healthy') }}>{c.riskLevel}</td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#94a3b8' }}>{c.topRisks.slice(0, 2).join(', ') || 'None'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, color: '#64748b' }}>{c.lifecycleStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Financial Tab */}
      {tab === 'financial' && financial && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(financial.totals.investment)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Investment</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{fmt(financial.totals.expectedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Expected Savings</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{fmt(financial.totals.realizedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Realized</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{fmt(financial.totals.missedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Missed</div></div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Client</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Investment</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Expected</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Realized</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>ROI</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Benefit %</th>
              </tr></thead>
              <tbody>{financial.clients.map((c: any) => (
                <tr key={c.clientId} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '8px 12px', color: '#f1f5f9' }}>{c.clientName || c.clientId}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>{fmt(c.investment)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#3b82f6' }}>{fmt(c.expectedSavings)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e' }}>{fmt(c.realizedSavings)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>{c.avgRoi}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: c.benefitRealization >= 80 ? '#22c55e' : '#f59e0b' }}>{c.benefitRealization}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transformations Tab */}
      {tab === 'transformations' && transformations && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            {['planned','inProgress','completed','failed'].map(s => (
              <div key={s} style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s === 'completed' ? '#22c55e' : s === 'failed' ? '#ef4444' : s === 'inProgress' ? '#3b82f6' : '#94a3b8' }}>{transformations.summary[s]}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.replace(/([A-Z])/g, ' $1')}</div>
              </div>
            ))}
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(transformations.summary.totalInvestment)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Investment</div></div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
            {transformations.transformations.map((t: any) => (
              <div key={t.id} style={{ padding: 12, borderBottom: '1px solid #0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{t.title}</div><div style={{ fontSize: 11, color: '#64748b' }}>{t.clientName} • {t.domain} • {t.duration || 'N/A'}</div></div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {t.outcome && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: hc(t.outcome.health), color: '#fff' }}>{t.outcome.benefitRealization?.toFixed(0) || '?'}% benefit</span>}
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: t.status === 'completed' ? '#22c55e' : t.status === 'failed' ? '#ef4444' : '#3b82f6', color: '#fff' }}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns Tab */}
      {tab === 'patterns' && patterns && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Repeated Problems</h3>
            {patterns.problems.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No patterns detected</div> : patterns.problems.map((p: any, i: number) => (
              <div key={i} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#f1f5f9' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{p.frequency} instances • {p.affectedClients.length} client(s)</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Repeated Gaps</h3>
            {patterns.gaps.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No patterns detected</div> : patterns.gaps.map((g: any, i: number) => (
              <div key={i} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#f1f5f9' }}>{g.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{g.frequency} instances • {g.affectedClients.length} client(s)</div>
                <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 2 }}>{g.recommendation}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, gridColumn: 'span 2' }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Technology Intelligence</h3>
            {patterns.technologies.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No technology data from discovery</div> : patterns.technologies.map((t: any, i: number) => (
              <div key={i} style={{ display: 'inline-block', padding: '4px 12px', background: '#0f172a', borderRadius: 16, margin: 4, fontSize: 12, color: '#94a3b8' }}>{t.label} ({t.frequency})</div>
            ))}
          </div>
        </div>
      )}

      {/* Resources Tab */}
      {tab === 'resources' && resources && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{resources.totals.totalPersonDays}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Total Person-Days (Est.)</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{resources.totals.activePersonDays}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Active (Planned/In-Progress)</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{resources.totals.totalClients}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Clients with Estimates</div></div>
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>⚠ Data source: {resources.dataSource}. Actual resource allocation tracking not yet implemented.</div>
            {resources.clients.map((c: any) => (
              <div key={c.clientId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #0f172a', fontSize: 12 }}>
                <span style={{ color: '#f1f5f9' }}>{c.clientName}</span>
                <span style={{ color: '#94a3b8' }}>{c.totalPersonDays} days • team ~{c.avgTeamSize} • {c.maxComplexity}</span>
              </div>
            ))}
          </div>
          {resources.roles.length > 0 && (
            <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
              <h4 style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Role Demand</h4>
              {resources.roles.map((r: any) => (
                <span key={r.role} style={{ display: 'inline-block', padding: '3px 10px', background: '#0f172a', borderRadius: 12, margin: 3, fontSize: 11, color: '#94a3b8' }}>{r.role} ({r.frequency})</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Intelligence Tab */}
      {tab === 'intelligence' && intelligence && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Underperforming Transformations</h3>
            {intelligence.underperforming.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>All transformations on track</div> : intelligence.underperforming.map((u: any, i: number) => (
              <div key={i} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 6, borderLeft: `3px solid ${hc(u.health)}` }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#f1f5f9' }}>{u.title}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{u.clientName} • Benefit: {u.benefitRealization?.toFixed(0) || '?'}%</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Repeated Technology Patterns</h3>
            {intelligence.patterns.technologies.length === 0 ? <div style={{ color: '#475569', fontSize: 12 }}>No patterns</div> : intelligence.patterns.technologies.map((t: any, i: number) => (
              <div key={i} style={{ padding: 6, fontSize: 12, color: '#94a3b8' }}>• {t.label} — {t.affectedClients.length} client(s)</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
