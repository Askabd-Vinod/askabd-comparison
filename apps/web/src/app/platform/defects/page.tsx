'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface Defect {
  id: string;
  client_id: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  affected_service: string;
  fingerprint: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  root_cause: string;
  root_cause_confidence: string;
  business_impact: string;
  technical_impact: string;
  status: string;
  recommended_fix: string;
  jira_issue_key: string;
  jira_issue_url: string;
  evidence: string[];
}

const severityColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

const statusColor: Record<string, string> = {
  detected: 'bg-red-50 text-red-700',
  acknowledged: 'bg-yellow-50 text-yellow-700',
  investigating: 'bg-blue-50 text-blue-700',
  mitigating: 'bg-purple-50 text-purple-700',
  resolved: 'bg-green-50 text-green-700',
  verified: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

export default function DefectsPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ severity: '', status: '', clientId: '' });
  const [selected, setSelected] = useState<Defect | null>(null);

  useEffect(() => {
    loadDefects();
  }, [filter]);

  async function loadDefects() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.severity) params.set('severity', filter.severity);
      if (filter.status) params.set('status', filter.status);
      if (filter.clientId) params.set('clientId', filter.clientId);
      const res = await fetch(`${API}/api/v1/oc/defects?${params}`);
      const data = await res.json();
      setDefects(data.defects || []);
    } catch { setDefects([]); }
    setLoading(false);
  }

  const counts = {
    total: defects.length,
    critical: defects.filter(d => d.severity === 'critical').length,
    high: defects.filter(d => d.severity === 'high').length,
    open: defects.filter(d => !['resolved', 'verified', 'closed'].includes(d.status)).length,
    jiraLinked: defects.filter(d => d.jira_issue_key).length,
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Defect Center</h1>
          <p className="text-sm text-gray-500 mt-1">Platform-wide defect tracking, deduplication, and remediation.</p>
        </div>
        <Link href="/platform" className="text-sm text-purple-600 hover:underline">← Platform</Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold">{counts.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{counts.critical}</div>
          <div className="text-xs text-red-600">Critical</div>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4 text-center">
          <div className="text-2xl font-bold text-orange-700">{counts.high}</div>
          <div className="text-xs text-orange-600">High</div>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{counts.open}</div>
          <div className="text-xs text-yellow-600">Open</div>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-4 text-center">
          <div className="text-2xl font-bold text-purple-700">{counts.jiraLinked}</div>
          <div className="text-xs text-purple-600">Jira Linked</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <select value={filter.severity} onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}
          className="px-3 py-1.5 border rounded text-sm">
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          className="px-3 py-1.5 border rounded text-sm">
          <option value="">All Statuses</option>
          <option value="detected">Detected</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="verified">Verified</option>
          <option value="closed">Closed</option>
        </select>
        <button onClick={loadDefects} className="px-3 py-1.5 bg-gray-100 border rounded text-sm hover:bg-gray-200">
          Refresh
        </button>
      </div>

      {/* Defect List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading defects...</div>
      ) : defects.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-gray-50">
          <p className="text-gray-500 font-medium">No defects found</p>
          <p className="text-xs text-gray-400 mt-1">Defects are automatically detected from platform health, connector failures, and validation issues.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {defects.map(d => (
            <div key={d.id} className="border rounded-lg p-4 hover:shadow-sm cursor-pointer transition"
              onClick={() => setSelected(selected?.id === d.id ? null : d)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${severityColor[d.severity] || 'bg-gray-100'}`}>
                    {d.severity.toUpperCase()}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${statusColor[d.status] || 'bg-gray-100'}`}>
                    {d.status}
                  </span>
                  <span className="font-medium text-sm">{d.title}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {d.occurrence_count > 1 && <span className="bg-gray-100 px-2 py-0.5 rounded">{d.occurrence_count}×</span>}
                  {d.jira_issue_key && (
                    <a href={d.jira_issue_url} target="_blank" rel="noopener" className="text-purple-600 hover:underline" onClick={e => e.stopPropagation()}>
                      {d.jira_issue_key}
                    </a>
                  )}
                  <span>{d.category}</span>
                </div>
              </div>

              {selected?.id === d.id && (
                <div className="mt-4 pt-4 border-t space-y-3 text-sm">
                  {d.description && <div><span className="font-medium text-gray-700">Description:</span> <span className="text-gray-600">{d.description}</span></div>}
                  {d.affected_service && <div><span className="font-medium text-gray-700">Service:</span> <span className="text-gray-600">{d.affected_service}</span></div>}
                  {d.root_cause && <div><span className="font-medium text-gray-700">Root Cause ({d.root_cause_confidence}):</span> <span className="text-gray-600">{d.root_cause}</span></div>}
                  {d.business_impact && <div><span className="font-medium text-gray-700">Business Impact:</span> <span className="text-gray-600">{d.business_impact}</span></div>}
                  {d.technical_impact && <div><span className="font-medium text-gray-700">Technical Impact:</span> <span className="text-gray-600">{d.technical_impact}</span></div>}
                  {d.recommended_fix && <div><span className="font-medium text-gray-700">Recommended Fix:</span> <span className="text-gray-600">{d.recommended_fix}</span></div>}
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>First seen: {new Date(d.first_seen_at).toLocaleString()}</span>
                    <span>Last seen: {new Date(d.last_seen_at).toLocaleString()}</span>
                    <span>Occurrences: {d.occurrence_count}</span>
                  </div>
                  {d.evidence && d.evidence.length > 0 && (
                    <div className="bg-gray-50 rounded p-2 text-xs">
                      <span className="font-medium">Evidence:</span>
                      <ul className="list-disc list-inside mt-1">{d.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
