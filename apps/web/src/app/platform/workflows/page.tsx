'use client';

import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export default function WorkflowsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'executions'>('rules');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rRes, eRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/workflow/rules`),
        fetch(`${API}/api/v1/oc/workflow/executions?limit=50`),
      ]);
      if (rRes.ok) setRules((await rRes.json()).rules || []);
      if (eRes.ok) setExecutions((await eRes.json()).executions || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    await fetch(`${API}/api/v1/oc/workflow/rules/${ruleId}/toggle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    loadData();
  };

  const sColor = (s: string) => s === 'critical' ? '#ef4444' : s === 'high' ? '#f59e0b' : s === 'warning' ? '#eab308' : s === 'info' ? '#3b82f6' : '#6b7280';
  const stColor = (s: string) => s === 'completed' ? '#22c55e' : s === 'dead_letter' ? '#ef4444' : s === 'failed' ? '#f59e0b' : '#3b82f6';

  if (loading) return <div style={{ padding: 40, color: '#64748b', textAlign: 'center', background: '#0f172a', minHeight: '100vh' }}>Loading workflows...</div>;

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Workflow Administration</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>Event-driven workflow rules, executions, and monitoring</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['rules', 'executions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: tab === t ? '#3b82f6' : '#1e293b', color: tab === t ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
            {t === 'rules' ? `Rules (${rules.length})` : `Executions (${executions.length})`}
          </button>
        ))}
        <button onClick={loadData} style={{ marginLeft: 'auto', background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>↻</button>
      </div>

      {tab === 'rules' && (
        <div>
          {/* Rule Builder Form */}
          <details style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#38bdf8' }}>+ Create New Rule</summary>
            <form onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const body = { name: fd.get('name'), description: fd.get('description'), eventType: fd.get('eventType'), severity: fd.get('severity'), priority: fd.get('priority'), actions: [{ type: fd.get('action') }], notificationTemplate: { title: fd.get('tmplTitle'), message: fd.get('tmplMessage'), category: fd.get('category') }, recipientRules: { roles: [(fd.get('recipientRole') || 'CLIENT_ADMIN')] }, escalationRules: fd.get('escalationHours') ? { afterHours: parseInt(fd.get('escalationHours') as string), severity: 'high' } : {}, cooldownMinutes: parseInt(fd.get('cooldown') as string || '0'), enabled: true }; await fetch(`${API}/api/v1/oc/workflow/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); loadData(); (e.target as HTMLFormElement).reset(); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <input name="name" placeholder="Rule name *" required style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }} />
              <select name="eventType" required style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }}>
                <option value="">Event Type *</option>
                <option value="LIFECYCLE_CHANGED">Lifecycle Changed</option>
                <option value="PROBLEM_CREATED">Problem Created</option>
                <option value="GAP_CREATED">Gap Created</option>
                <option value="REQUIREMENT_REJECTED">Requirement Rejected</option>
                <option value="DOCUMENT_EXPIRED">Document Expired</option>
                <option value="CONNECTOR_FAILED">Connector Failed</option>
                <option value="MIGRATION_FAILED">Migration Failed</option>
                <option value="TRANSFORMATION_DELAYED">Transformation Delayed</option>
                <option value="BENEFIT_BELOW_TARGET">Benefit Below Target</option>
                <option value="OPTIMIZATION_FINDING_CREATED">Optimization Finding</option>
                <option value="RECOMMENDATION_APPROVAL_REQUIRED">Recommendation Ready</option>
                <option value="COMPLIANCE_FINDING">Compliance Finding</option>
              </select>
              <input name="description" placeholder="Description" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13, gridColumn: 'span 2' }} />
              <select name="severity" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }}>
                <option value="info">Info</option><option value="warning">Warning</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <select name="priority" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <select name="action" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }}>
                <option value="CREATE_NOTIFICATION">Create Notification</option><option value="CREATE_ESCALATION">Create Escalation</option><option value="SEND_EMAIL">Send Email</option>
              </select>
              <select name="recipientRole" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }}>
                <option value="CLIENT_ADMIN">Client Admin</option><option value="CLIENT_EXECUTIVE">Client Executive</option><option value="CLIENT_TECHNICAL">Client Technical</option><option value="CLIENT_SECURITY">Client Security</option><option value="CLIENT_FINANCE">Client Finance</option>
              </select>
              <input name="tmplTitle" placeholder="Notification title template" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }} />
              <select name="category" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }}>
                <option value="system">System</option><option value="security">Security</option><option value="lifecycle">Lifecycle</option><option value="requirements">Requirements</option><option value="transformation">Transformation</option><option value="financial">Financial</option><option value="optimization">Optimization</option><option value="compliance">Compliance</option>
              </select>
              <input name="tmplMessage" placeholder="Notification message template" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13, gridColumn: 'span 2' }} />
              <input name="cooldown" type="number" placeholder="Cooldown (minutes)" defaultValue="0" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }} />
              <input name="escalationHours" type="number" placeholder="Escalation after (hours, 0=none)" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13 }} />
              <button type="submit" style={{ gridColumn: 'span 2', background: '#1e40af', border: 'none', color: '#fff', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Create Rule</button>
            </form>
          </details>

          <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: '#94a3b8' }}>Rule</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: '#94a3b8' }}>Event</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Severity</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Executions</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Failures</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', color: '#94a3b8' }}>Enabled</th>
            </tr></thead>
            <tbody>{rules.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 500, color: '#f1f5f9' }}>{r.name}</div><div style={{ fontSize: 11, color: '#64748b' }}>{r.description?.substring(0, 60)}</div></td>
                <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{r.eventType}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: sColor(r.severity), color: '#fff' }}>{r.severity}</span></td>
                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8' }}>{r.executionCount}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', color: r.failureCount > 0 ? '#ef4444' : '#64748b' }}>{r.failureCount}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <button onClick={() => toggleRule(r.id, !r.enabled)} style={{ background: r.enabled ? '#22c55e' : '#64748b', border: 'none', color: '#fff', borderRadius: 12, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>{r.enabled ? 'ON' : 'OFF'}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        </div>
      )}

      {tab === 'executions' && (
        <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
          {executions.length === 0 ? <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No executions yet</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Rule</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8' }}>Client</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#94a3b8' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>Duration</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#94a3b8' }}>When</th>
              </tr></thead>
              <tbody>{executions.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '8px 12px', color: '#f1f5f9', fontFamily: 'monospace', fontSize: 11 }}>{e.ruleId}</td>
                  <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{e.clientId}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: stColor(e.status), color: '#fff' }}>{e.status}</span></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{e.durationMs}ms</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{new Date(e.startedAt).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
