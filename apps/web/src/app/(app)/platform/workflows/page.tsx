'use client';

import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  warning: 'bg-yellow-100 text-yellow-700', info: 'bg-blue-100 text-blue-700',
};
const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-100 text-green-700', dead_letter: 'bg-red-100 text-red-700', failed: 'bg-orange-100 text-orange-700',
};
const FIELD = 'border rounded-md px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500';

export default function WorkflowsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'executions'>('rules');
  const [actionError, setActionError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rRes, eRes, cRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/workflow/rules`),
        fetch(`${API}/api/v1/oc/workflow/executions?limit=50`),
        fetch(`${API}/api/v1/oc/clients`).catch(() => null),
      ]);
      if (rRes.ok) setRules((await rRes.json()).rules || []);
      if (eRes.ok) setExecutions((await eRes.json()).executions || []);
      if (cRes?.ok) setClients((await cRes.json()).clients || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Previously these two request-namespace values (rule id, client id) were
  // shown raw in the Executions table with no way to tell which real rule
  // or client an execution belongs to without manually cross-referencing
  // the Rules tab. Found during the 2026-08-22 global UX audit.
  const ruleNameMap: Record<string, string> = {};
  rules.forEach(r => { ruleNameMap[r.id] = r.name; });
  const clientNameMap: Record<string, string> = {};
  clients.forEach(c => { clientNameMap[c.id] = c.name; });

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    setActionError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/workflow/rules/${ruleId}/toggle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      if (res.ok) { await loadData(); }
      else { setActionError(`Could not ${enabled ? 'enable' : 'disable'} this rule. Please try again.`); }
    } catch {
      setActionError('Could not reach AskABD. Check your connection and try again.');
    }
  };

  if (loading) return <div className="max-w-[1600px] mx-auto px-4 py-6"><p className="text-xs text-gray-500 text-center py-10">Loading workflows…</p></div>;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Workflow Administration</h1>
        <p className="text-xs text-gray-500 mt-0.5">Event-driven workflow rules, executions, and monitoring</p>
      </div>

      <div className="flex gap-1 mb-4 items-center">
        {(['rules', 'executions'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${tab === t ? 'bg-gray-900 text-white' : 'bg-white border text-gray-600 hover:border-gray-400'}`}>
            {t === 'rules' ? `Rules (${rules.length})` : `Executions (${executions.length})`}
          </button>
        ))}
        <button onClick={loadData} className="ml-auto text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">↻</button>
      </div>

      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}

      {tab === 'rules' && (
        <div>
          <details className="bg-white border rounded-xl p-4 mb-4 group">
            <summary className="cursor-pointer text-sm font-semibold text-purple-600 list-none flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90">▸</span> + Create New Rule
            </summary>
            {/* Previously every field here was placeholder-only with no
                <label> at all (a real accessibility/business-language gap),
                and a failed submit did nothing — no error, no feedback.
                Found during the 2026-08-22 global UX audit. */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setCreateError(null);
                setCreating(true);
                const form = e.currentTarget;
                const fd = new FormData(form);
                const body = { name: fd.get('name'), description: fd.get('description'), eventType: fd.get('eventType'), severity: fd.get('severity'), priority: fd.get('priority'), actions: [{ type: fd.get('action') }], notificationTemplate: { title: fd.get('tmplTitle'), message: fd.get('tmplMessage'), category: fd.get('category') }, recipientRules: { roles: [(fd.get('recipientRole') || 'CLIENT_ADMIN')] }, escalationRules: fd.get('escalationHours') ? { afterHours: parseInt(fd.get('escalationHours') as string), severity: 'high' } : {}, cooldownMinutes: parseInt(fd.get('cooldown') as string || '0'), enabled: true };
                try {
                  const res = await fetch(`${API}/api/v1/oc/workflow/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  if (res.ok) { await loadData(); form.reset(); }
                  else {
                    const errBody = await res.json().catch(() => ({}));
                    setCreateError(errBody?.message || errBody?.error?.message || 'Could not create the rule. Please check the details and try again.');
                  }
                } catch {
                  setCreateError('Could not reach AskABD. Check your connection and try again.');
                } finally {
                  setCreating(false);
                }
              }}
              className="grid sm:grid-cols-2 gap-3 mt-3"
            >
              <div>
                <label htmlFor="wf-name" className="block text-[10px] font-medium text-gray-600 mb-1">Rule name <span className="text-red-500">*</span></label>
                <input id="wf-name" name="name" placeholder="e.g. Critical incident escalation" required className={`${FIELD} w-full`} />
              </div>
              <div>
                <label htmlFor="wf-event" className="block text-[10px] font-medium text-gray-600 mb-1">Trigger event <span className="text-red-500">*</span></label>
                <select id="wf-event" name="eventType" required defaultValue="" className={`${FIELD} w-full`}>
                  <option value="" disabled>Select an event…</option>
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
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="wf-desc" className="block text-[10px] font-medium text-gray-600 mb-1">Description <span className="text-gray-400">(optional)</span></label>
                <input id="wf-desc" name="description" placeholder="What this rule is for" className={`${FIELD} w-full`} />
              </div>
              <div>
                <label htmlFor="wf-severity" className="block text-[10px] font-medium text-gray-600 mb-1">Severity</label>
                <select id="wf-severity" name="severity" className={`${FIELD} w-full`}>
                  <option value="info">Info</option><option value="warning">Warning</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label htmlFor="wf-priority" className="block text-[10px] font-medium text-gray-600 mb-1">Priority</label>
                <select id="wf-priority" name="priority" className={`${FIELD} w-full`}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label htmlFor="wf-action" className="block text-[10px] font-medium text-gray-600 mb-1">Action to take</label>
                <select id="wf-action" name="action" className={`${FIELD} w-full`}>
                  <option value="CREATE_NOTIFICATION">Create Notification</option><option value="CREATE_ESCALATION">Create Escalation</option><option value="SEND_EMAIL">Send Email</option>
                </select>
              </div>
              <div>
                <label htmlFor="wf-recipient" className="block text-[10px] font-medium text-gray-600 mb-1">Notify</label>
                <select id="wf-recipient" name="recipientRole" className={`${FIELD} w-full`}>
                  <option value="CLIENT_ADMIN">Client Admin</option><option value="CLIENT_EXECUTIVE">Client Executive</option><option value="CLIENT_TECHNICAL">Client Technical</option><option value="CLIENT_SECURITY">Client Security</option><option value="CLIENT_FINANCE">Client Finance</option>
                </select>
              </div>
              <div>
                <label htmlFor="wf-tmpl-title" className="block text-[10px] font-medium text-gray-600 mb-1">Notification title <span className="text-gray-400">(optional)</span></label>
                <input id="wf-tmpl-title" name="tmplTitle" placeholder="e.g. Critical incident detected" className={`${FIELD} w-full`} />
              </div>
              <div>
                <label htmlFor="wf-category" className="block text-[10px] font-medium text-gray-600 mb-1">Category</label>
                <select id="wf-category" name="category" className={`${FIELD} w-full`}>
                  <option value="system">System</option><option value="security">Security</option><option value="lifecycle">Lifecycle</option><option value="requirements">Requirements</option><option value="transformation">Transformation</option><option value="financial">Financial</option><option value="optimization">Optimization</option><option value="compliance">Compliance</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="wf-tmpl-msg" className="block text-[10px] font-medium text-gray-600 mb-1">Notification message <span className="text-gray-400">(optional)</span></label>
                <input id="wf-tmpl-msg" name="tmplMessage" placeholder="What the recipient will read" className={`${FIELD} w-full`} />
              </div>
              <div>
                <label htmlFor="wf-cooldown" className="block text-[10px] font-medium text-gray-600 mb-1">Cooldown (minutes)</label>
                <input id="wf-cooldown" name="cooldown" type="number" min="0" defaultValue="0" className={`${FIELD} w-full`} />
                <p className="text-[9px] text-gray-400 mt-0.5">Minimum time between repeat triggers of this rule.</p>
              </div>
              <div>
                <label htmlFor="wf-escalation" className="block text-[10px] font-medium text-gray-600 mb-1">Escalate after (hours) <span className="text-gray-400">(optional)</span></label>
                <input id="wf-escalation" name="escalationHours" type="number" min="0" placeholder="0 = no escalation" className={`${FIELD} w-full`} />
              </div>
              {createError && (
                <p className="sm:col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{createError}</p>
              )}
              <button type="submit" disabled={creating} className="sm:col-span-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-xs font-semibold rounded-lg px-4 py-2.5 transition">{creating ? 'Creating…' : 'Create Rule'}</button>
            </form>
          </details>

          <section className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5">Rule</th>
                    <th className="text-left px-4 py-2.5">Event</th>
                    <th className="text-center px-4 py-2.5">Severity</th>
                    <th className="text-center px-4 py-2.5">Executions</th>
                    <th className="text-center px-4 py-2.5">Failures</th>
                    <th className="text-center px-4 py-2.5">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rules.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{r.name}</p><p className="text-[10px] text-gray-400">{r.description?.substring(0, 60)}</p></td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-[11px]">{r.eventType}</td>
                      <td className="px-4 py-2.5 text-center"><span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${SEVERITY_BADGE[r.severity] || 'bg-gray-100 text-gray-600'}`}>{r.severity}</span></td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{r.executionCount}</td>
                      <td className={`px-4 py-2.5 text-center ${r.failureCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.failureCount}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => toggleRule(r.id, !r.enabled)} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full text-white transition ${r.enabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'}`}>{r.enabled ? 'ON' : 'OFF'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'executions' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {executions.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">No executions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5">Rule</th>
                    <th className="text-left px-4 py-2.5">Client</th>
                    <th className="text-center px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Duration</th>
                    <th className="text-right px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {executions.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-800">{ruleNameMap[e.ruleId] || <span className="font-mono text-[10px] text-gray-400">{e.ruleId}</span>}</td>
                      <td className="px-4 py-2.5 text-gray-500">{clientNameMap[e.clientId] || <span className="font-mono text-[10px] text-gray-400">{e.clientId}</span>}</td>
                      <td className="px-4 py-2.5 text-center"><span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${STATUS_BADGE[e.status] || 'bg-blue-100 text-blue-700'}`}>{e.status}</span></td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{e.durationMs}ms</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{new Date(e.startedAt).toLocaleString('en-AU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
