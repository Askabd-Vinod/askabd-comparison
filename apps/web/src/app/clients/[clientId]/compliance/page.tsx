'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

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

  const stColor = (s: string) => s === 'met' ? '#22c55e' : s === 'partially_met' ? '#f59e0b' : s === 'not_met' ? '#ef4444' : '#6b7280';

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading compliance...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Compliance</h1><p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Client: {clientId}</p></div>
        <button onClick={loadData} style={{ background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>↻</button>
      </div>

      {/* Framework Summary */}
      {summary?.frameworks?.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {summary.frameworks.map((f: any) => (
            <div key={f.frameworkId} style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{f.frameworkName}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: f.score >= 80 ? '#22c55e' : f.score >= 50 ? '#f59e0b' : '#ef4444' }}>{f.score}%</span>
                <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'flex-end' }}>compliance score</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Met: {f.met} | Partial: {f.partial} | Not Met: {f.notMet} | Not Assessed: {f.notAssessed}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Evidence missing: {f.evidenceMissing} | Maturity: {f.avgMaturity}/5</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#1e293b', padding: 20, borderRadius: 8, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', marginBottom: 12 }}>No compliance frameworks initialized for this client.</p>
          {frameworks.map(f => (
            <button key={f.id} onClick={() => initialize(f.id)} style={{ margin: 4, background: '#1e40af', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Initialize {f.name}</button>
          ))}
        </div>
      )}

      {/* Controls */}
      {controls.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Control</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8' }}>Maturity</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8' }}>Evidence</th>
            </tr></thead>
            <tbody>{controls.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={{ padding: '8px 12px', color: '#f1f5f9' }}>{c.controlId}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: stColor(c.status), color: '#fff' }}>{c.status.replace('_', ' ')}</span></td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{c.maturity}/5</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: c.evidenceStatus === 'collected' ? '#22c55e' : '#f59e0b' }}>{c.evidenceStatus}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
