'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

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

  const healthColor = (h: string) => h === 'healthy' || h === 'on_track' ? '#22c55e' : h === 'at_risk' || h === 'needs_attention' ? '#f59e0b' : h === 'critical' ? '#ef4444' : '#6b7280';
  const severityColor = (s: string) => s === 'critical' ? '#ef4444' : s === 'high' ? '#f59e0b' : s === 'medium' ? '#3b82f6' : '#6b7280';

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center' }}>Loading optimization data...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Continuous Optimization</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Client: {clientId}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: healthColor(summary?.health || 'unknown') }} />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{(summary?.health || 'unknown').replace('_', ' ')}</span>
          <button onClick={loadData} style={{ background: '#1e40af', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>↻</button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9' }}>{summary.metrics?.active || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Active Metrics</div>
          </div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b' }}>{summary.findings?.open || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Open Findings</div>
          </div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#22c55e' }}>${((summary.savings?.realized || 0) / 1000).toFixed(0)}K</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Realized Savings</div>
          </div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#ef4444' }}>${((summary.savings?.missed || 0) / 1000).toFixed(0)}K</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Missed Savings</div>
          </div>
          <div style={{ background: '#1e293b', padding: 14, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#3b82f6' }}>{summary.outcomes?.avgBenefitRealization?.toFixed(0) || 0}%</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Benefit Realization</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #334155', paddingBottom: 8 }}>
        {(['overview', 'findings', 'outcomes', 'metrics', 'monitoring'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: tab === t ? '#3b82f6' : 'transparent', color: tab === t ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>Transformation Outcomes</h3>
            <div style={{ fontSize: 13, color: '#f1f5f9' }}>
              <div>Total: {summary.outcomes?.total || 0}</div>
              <div style={{ color: '#22c55e' }}>On Track: {summary.outcomes?.onTrack || 0}</div>
              <div style={{ color: '#f59e0b' }}>At Risk: {summary.outcomes?.atRisk || 0}</div>
              <div style={{ color: '#ef4444' }}>Critical: {summary.outcomes?.critical || 0}</div>
            </div>
          </div>
          <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>Optimization Findings</h3>
            <div style={{ fontSize: 13, color: '#f1f5f9' }}>
              <div>Total: {summary.findings?.total || 0}</div>
              <div style={{ color: '#f59e0b' }}>Open: {summary.findings?.open || 0}</div>
              <div style={{ color: '#ef4444' }}>Critical/High: {summary.findings?.criticalHigh || 0}</div>
              <div style={{ color: '#22c55e' }}>Potential Savings: ${((summary.findings?.potentialSavings || 0) / 1000).toFixed(0)}K</div>
            </div>
          </div>
        </div>
      )}

      {/* Findings Tab */}
      {tab === 'findings' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {findings.length === 0 ? (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No optimization findings yet. Record measurements to trigger rule evaluation.</div>
          ) : findings.map(f => (
            <div key={f.id} style={{ padding: 12, borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{f.title}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: severityColor(f.severity), color: '#fff' }}>{f.severity}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{f.description?.substring(0, 120)}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#64748b' }}>
                {f.baselineValue != null && <span>Baseline: {f.baselineValue}</span>}
                {f.actualValue != null && <span>Actual: {f.actualValue}</span>}
                {f.variancePct != null && <span style={{ color: f.variancePct > 0 ? '#ef4444' : '#22c55e' }}>Variance: {f.variancePct.toFixed(1)}%</span>}
                <span>Status: {f.status}</span>
              </div>
              {f.recommendation && <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 4 }}>💡 {f.recommendation}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Outcomes Tab */}
      {tab === 'outcomes' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {outcomes.length === 0 ? (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No transformation outcomes recorded yet.</div>
          ) : outcomes.map(o => (
            <div key={o.id} style={{ padding: 14, borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>Transformation: {o.transformationId}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: healthColor(o.health), color: '#fff' }}>{o.health}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {o.expectedSavings != null && <div><div style={{ fontSize: 10, color: '#64748b' }}>Expected Savings</div><div style={{ fontSize: 13, color: '#94a3b8' }}>${o.expectedSavings.toLocaleString()}</div></div>}
                {o.actualSavings != null && <div><div style={{ fontSize: 10, color: '#64748b' }}>Actual Savings</div><div style={{ fontSize: 13, color: o.savingsVariancePct >= 0 ? '#22c55e' : '#ef4444' }}>${o.actualSavings.toLocaleString()}</div></div>}
                {o.benefitRealizationPct != null && <div><div style={{ fontSize: 10, color: '#64748b' }}>Benefit Realization</div><div style={{ fontSize: 13, color: o.benefitRealizationPct >= 80 ? '#22c55e' : o.benefitRealizationPct >= 50 ? '#f59e0b' : '#ef4444' }}>{o.benefitRealizationPct.toFixed(1)}%</div></div>}
                {o.roiActual != null && <div><div style={{ fontSize: 10, color: '#64748b' }}>ROI Actual</div><div style={{ fontSize: 13, color: '#94a3b8' }}>{o.roiActual.toFixed(1)}%</div></div>}
                {o.costVariancePct != null && <div><div style={{ fontSize: 10, color: '#64748b' }}>Cost Variance</div><div style={{ fontSize: 13, color: o.costVariancePct > 10 ? '#ef4444' : '#22c55e' }}>{o.costVariancePct > 0 ? '+' : ''}{o.costVariancePct.toFixed(1)}%</div></div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metrics Tab */}
      {tab === 'metrics' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {metrics.length === 0 ? (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No metrics defined. Create metrics to start monitoring.</div>
          ) : metrics.map(m => (
            <div key={m.id} style={{ padding: 12, borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13, color: '#f1f5f9' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{m.domain} / {m.category} • {m.unit} • {m.direction.replace(/_/g, ' ')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {m.targetValue != null && <div style={{ fontSize: 11, color: '#38bdf8' }}>Target: {m.targetValue}</div>}
                <div style={{ fontSize: 10, color: m.enabled ? '#22c55e' : '#ef4444' }}>{m.enabled ? '● Active' : '○ Disabled'}</div>
                {m.lastMeasuredAt && <div style={{ fontSize: 10, color: '#64748b' }}>Last: {new Date(m.lastMeasuredAt).toLocaleDateString()}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Monitoring Tab */}
      {tab === 'monitoring' && monitoring && (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#f1f5f9' }}>Status: <span style={{ color: healthColor(monitoring.status) }}>{monitoring.status}</span></span>
            <span style={{ fontSize: 13, color: '#22c55e' }}>Healthy: {monitoring.healthy}</span>
            <span style={{ fontSize: 13, color: '#f59e0b' }}>Overdue: {monitoring.overdue}</span>
          </div>
          {monitoring.overdueMetrics?.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>Overdue Measurements</h4>
              {monitoring.overdueMetrics.map((m: any) => (
                <div key={m.id} style={{ padding: 8, background: '#0f172a', borderRadius: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
                  <span style={{ fontWeight: 500 }}>{m.name}</span> — {m.reason === 'never_measured' ? 'Never measured' : `Last: ${new Date(m.lastMeasured).toLocaleDateString()}`} (freq: {m.frequency})
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
