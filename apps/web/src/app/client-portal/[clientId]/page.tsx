'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function ClientPortalPage() {
  const { clientId } = useParams() as { clientId: string };
  const [home, setHome] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [transformations, setTransformations] = useState<any[]>([]);
  const [financial, setFinancial] = useState<any>(null);
  const [optimization, setOptimization] = useState<any>(null);
  const [serviceCoverage, setServiceCoverage] = useState<any>(null);
  const [serviceRecs, setServiceRecs] = useState<any[]>([]);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('home');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const base = `${API}/api/v1/oc/portal/${clientId}`;
      const [hRes, aRes, tRes, nRes, pRes, gRes, tfRes, fRes, oRes, scRes, srRes] = await Promise.all([
        fetch(`${base}/home`), fetch(`${base}/actions`), fetch(`${base}/timeline`),
        fetch(`${base}/notifications`), fetch(`${base}/problems`), fetch(`${base}/gaps`),
        fetch(`${base}/transformations`), fetch(`${base}/financial`), fetch(`${base}/optimization`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/services/coverage`).catch(() => null),
        fetch(`${API}/api/v1/oc/clients/${clientId}/services/recommendations`).catch(() => null),
      ]);
      if (hRes.ok) setHome(await hRes.json());
      if (aRes.ok) setActions((await aRes.json()).actions || []);
      if (tRes.ok) setTimeline((await tRes.json()).events || []);
      if (nRes.ok) setNotifications((await nRes.json()).notifications || []);
      if (pRes.ok) setProblems((await pRes.json()).problems || []);
      if (gRes.ok) setGaps((await gRes.json()).gaps || []);
      if (tfRes.ok) setTransformations((await tfRes.json()).transformations || []);
      if (fRes.ok) setFinancial(await fRes.json());
      if (oRes.ok) setOptimization(await oRes.json());
      if (scRes?.ok) setServiceCoverage(await scRes.json());
      if (srRes?.ok) setServiceRecs((await srRes.json()).recommendations || []);
      // Load commercial engagements
      try {
        const eRes = await fetch(`${API}/api/v1/oc/clients/${clientId}/engagements`);
        if (eRes.ok) setEngagements((await eRes.json()).engagements || []);
      } catch { /* non-critical */ }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const hc = (v: string) => v === 'critical' ? '#ef4444' : v === 'high' ? '#f59e0b' : v === 'medium' ? '#3b82f6' : '#6b7280';
  const fmt = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading portal...</div>;

  const tabs = ['home','actions','problems','gaps','transformations','financial','optimization','notifications','timeline'];

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Client Portal</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{clientId}</p>
          {clientId === 'demo-meridian-financial' && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, padding: '2px 8px', background: '#1e40af', color: '#93c5fd', borderRadius: 4 }}>DEMO — Fictional Data</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {home && <span style={{ fontSize: 13, padding: '4px 12px', borderRadius: 12, background: '#1e293b', color: '#94a3b8' }}>Stage: {home.lifecycle?.status}</span>}
          {home && <span style={{ fontSize: 13, padding: '4px 12px', borderRadius: 12, background: '#1e40af', color: '#fff' }}>{home.lifecycle?.progress}% complete</span>}
          <a href={`/client-portal/${clientId}/journey`} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 12, background: '#065f46', color: '#6ee7b7', textDecoration: 'none' }}>View Journey →</a>
          {notifications.filter(n => n.unread).length > 0 && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: '#ef4444', color: '#fff' }}>🔔 {notifications.filter(n => n.unread).length}</span>}
          <button onClick={loadData} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>↻</button>
        </div>
      </div>

      {/* Executive Business Summary */}
      {home && tab === 'home' && (
        <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderRadius: 8, padding: 16, marginBottom: 16, border: '1px solid #334155' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
            {home.lifecycle?.progress === 100 ? 'Your transformation is actively managed by AskABD.' : home.lifecycle?.progress >= 50 ? 'AskABD is progressing your transformation.' : 'AskABD is analyzing your environment.'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            {home.problems?.total > 0 && `We identified ${home.problems.total} problem${home.problems.total > 1 ? 's' : ''} in your environment${home.problems.critical > 0 ? ` including ${home.problems.critical} critical issue${home.problems.critical > 1 ? 's' : ''} requiring attention` : ''}. `}
            {home.gaps?.open > 0 && `There are ${home.gaps.open} gap${home.gaps.open > 1 ? 's' : ''} between your current and target state. `}
            {home.financial?.realizedSavings > 0 && `So far, the transformation has realized $${(home.financial.realizedSavings / 1000).toFixed(0)}K in savings (${home.financial.benefitRealization}% of expected benefits). `}
            {home.financial?.realizedSavings === 0 && home.financial?.expectedSavings > 0 && `The expected annual savings opportunity is $${(home.financial.expectedSavings / 1000).toFixed(0)}K. `}
            {home.optimization?.openFindings > 0 && `${home.optimization.openFindings} optimization opportunit${home.optimization.openFindings > 1 ? 'ies have' : 'y has'} been detected. `}
          </div>
        </div>
      )}

      {/* Service Summary */}
      {home && tab === 'home' && (serviceCoverage || serviceRecs.length > 0) && (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>AskABD Services</span>
            <a href={`/clients/${clientId}/services`} style={{ fontSize: 11, color: '#38bdf8', textDecoration: 'none' }}>Manage Services →</a>
          </div>
          {serviceCoverage && (
            <div style={{ display: 'flex', gap: 16, marginBottom: serviceRecs.length > 0 ? 10 : 0, fontSize: 12 }}>
              <span style={{ color: '#22c55e' }}>● {serviceCoverage.overall?.enabled || 0} enabled</span>
              <span style={{ color: '#f59e0b' }}>● {serviceRecs.length} recommended</span>
              <span style={{ color: '#94a3b8' }}>{serviceCoverage.overall?.coverage || 0}% coverage</span>
            </div>
          )}
          {serviceRecs.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Recommended next:</div>
              {serviceRecs.slice(0, 3).map(r => (
                <div key={r.serviceId} style={{ fontSize: 11, color: '#cbd5e1', padding: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.serviceName}</span>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: r.priority === 'critical' ? '#ef4444' : r.priority === 'high' ? '#f59e0b' : '#3b82f6', color: '#fff' }}>{r.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Commercial Summary */}
      {home && tab === 'home' && engagements.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Commercial Engagements</span>
            <a href={`/clients/${clientId}/engagements`} style={{ fontSize: 11, color: '#38bdf8', textDecoration: 'none' }}>View All →</a>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ color: '#22c55e' }}>● {engagements.filter((e: any) => e.status === 'active').length} active</span>
            <span style={{ color: '#3b82f6' }}>● {engagements.filter((e: any) => e.status === 'proposed').length} proposed</span>
            <span style={{ color: '#6b7280' }}>● {engagements.filter((e: any) => e.status === 'draft').length} draft</span>
            <span style={{ color: '#14b8a6' }}>● {engagements.filter((e: any) => e.status === 'completed').length} completed</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #334155', paddingBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: tab === t ? '#3b82f6' : 'transparent', color: tab === t ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'actions' && actions.length > 0 ? ` (${actions.length})` : ''}{t === 'notifications' && notifications.filter(n => n.unread).length > 0 ? ` (${notifications.filter(n => n.unread).length})` : ''}
          </button>
        ))}
      </div>

      {/* Home Tab */}
      {tab === 'home' && home && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{home.lifecycle.progress}%</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Progress</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{home.problems.critical}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Critical Problems</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{home.gaps.open}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Open Gaps</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{fmt(home.financial.realizedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Realized Savings</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700 }}>{home.requirements.missing}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Missing Requirements</div></div>
          </div>
          {actions.length > 0 && (
            <div style={{ background: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, color: '#f59e0b', marginBottom: 10 }}>⚡ Action Required ({actions.length})</h3>
              {actions.slice(0, 5).map((a, i) => (
                <div key={i} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 6, borderLeft: `3px solid ${hc(a.priority)}` }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{a.description}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#1e293b', padding: 14, borderRadius: 8 }}>
              <h4 style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Connectors</h4>
              <div style={{ fontSize: 13 }}>{home.connectors.connected}/{home.connectors.total} connected</div>
            </div>
            <div style={{ background: '#1e293b', padding: 14, borderRadius: 8 }}>
              <h4 style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Transformations</h4>
              <div style={{ fontSize: 13 }}>{home.transformations.completed} completed / {home.transformations.total} total</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions Tab */}
      {tab === 'actions' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {actions.length === 0 ? <div style={{ padding: 20, color: '#22c55e', textAlign: 'center' }}>✓ No actions required</div> : actions.map((a, i) => (
            <div key={i} style={{ padding: 12, borderBottom: '1px solid #0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{a.title}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{a.description}</div>
              </div>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: hc(a.priority), color: '#fff' }}>{a.priority}</span>
            </div>
          ))}
        </div>
      )}

      {/* Problems Tab */}
      {tab === 'problems' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {problems.length === 0 ? <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No problems identified yet</div> : problems.map(p => (
            <div key={p.id} style={{ padding: 12, borderBottom: '1px solid #0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{p.title}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: hc(p.severity), color: '#fff' }}>{p.severity}</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{p.domain} / {p.category} • Status: {p.status}</div>
              {p.businessImpact && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Impact: {p.businessImpact}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Gaps Tab */}
      {tab === 'gaps' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {gaps.length === 0 ? <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No gaps identified yet</div> : gaps.map(g => (
            <div key={g.id} style={{ padding: 12, borderBottom: '1px solid #0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9' }}>{g.title}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: hc(g.severity), color: '#fff' }}>{g.severity}</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Maturity: {g.currentMaturity} → {g.targetMaturity} • {g.status}</div>
              {g.currentState && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Current: {g.currentState.substring(0, 80)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Transformations Tab */}
      {tab === 'transformations' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {transformations.length === 0 ? <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No transformations planned yet</div> : transformations.map(t => (
            <div key={t.id} style={{ padding: 14, borderBottom: '1px solid #0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{t.title}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: t.status === 'completed' ? '#22c55e' : '#3b82f6', color: '#fff' }}>{t.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{t.description?.substring(0, 100)}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
                {t.investment && <span>Investment: {fmt(t.investment)}</span>}
                {t.expectedSavings && <span>Expected: {fmt(t.expectedSavings)}/yr</span>}
                {t.duration && <span>Duration: {t.duration}</span>}
              </div>
              {t.outcome && <div style={{ marginTop: 6, fontSize: 11, padding: '4px 8px', background: '#0f172a', borderRadius: 4, display: 'inline-block' }}>Benefit: {t.outcome.benefitRealization?.toFixed(0) || '?'}% | Health: {t.outcome.health}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Financial Tab */}
      {tab === 'financial' && financial && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(financial.investment)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Investment</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{fmt(financial.expectedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Expected Savings</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{fmt(financial.realizedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Realized</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{fmt(financial.missedSavings)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Missed</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{financial.avgRoi}%</div><div style={{ fontSize: 11, color: '#94a3b8' }}>ROI</div></div>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{financial.benefitRealization}%</div><div style={{ fontSize: 11, color: '#94a3b8' }}>Benefit Realized</div></div>
          </div>
          <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, fontSize: 11, color: '#64748b' }}>Data source: {financial.dataSource}. Values are {financial.dataSource === 'measured' ? 'based on actual transformation outcomes' : 'estimated based on assessment data'}.</div>
        </div>
      )}

      {/* Optimization Tab */}
      {tab === 'optimization' && optimization && (
        <div>
          {optimization.findings.length > 0 && (
            <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, color: '#f59e0b', marginBottom: 10 }}>Optimization Findings</h3>
              {optimization.findings.map((f: any) => (
                <div key={f.id} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 6, borderLeft: `3px solid ${hc(f.severity)}` }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#f1f5f9' }}>{f.title}</div>
                  {f.variancePct != null && <div style={{ fontSize: 11, color: '#64748b' }}>Variance: {f.variancePct.toFixed(1)}% (baseline: {f.baselineValue} → actual: {f.actualValue})</div>}
                  {f.recommendation && <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2 }}>💡 {f.recommendation}</div>}
                </div>
              ))}
            </div>
          )}
          {optimization.metrics.length > 0 && (
            <div style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
              <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>Active Metrics</h3>
              {optimization.metrics.map((m: any) => (
                <div key={m.id} style={{ padding: 6, fontSize: 12, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{m.name} ({m.category})</span>
                  <span style={{ color: '#64748b' }}>{m.targetValue != null ? `Target: ${m.targetValue} ${m.unit}` : m.unit}</span>
                </div>
              ))}
            </div>
          )}
          {optimization.findings.length === 0 && optimization.metrics.length === 0 && (
            <div style={{ background: '#1e293b', padding: 20, borderRadius: 8, textAlign: 'center', color: '#64748b' }}>No optimization data available yet</div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {notifications.length === 0 ? <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No notifications</div> : notifications.map(n => (
            <div key={n.id} style={{ padding: 12, borderBottom: '1px solid #0f172a', background: n.unread ? '#1e293b' : '#0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: n.unread ? 600 : 400, color: '#f1f5f9' }}>{n.subject}</span>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 12, background: hc(n.priority), color: '#fff' }}>{n.priority}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{n.summary}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()} • {n.phase}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline Tab */}
      {tab === 'timeline' && (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          {timeline.length === 0 ? <div style={{ color: '#64748b', textAlign: 'center' }}>No activity recorded yet</div> : timeline.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #0f172a' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginTop: 5, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: '#f1f5f9' }}>{e.description}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(e.timestamp).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
