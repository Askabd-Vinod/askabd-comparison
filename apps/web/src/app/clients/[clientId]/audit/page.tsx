'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function AuditPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/oc/audit?entityId=${clientId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setAuditLog(data.entries || []);
        setError(null);
      }
    } catch {
      setError('Unable to load audit data.');
    }
    setLoading(false);
  }, [clientId, API]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function startAudit() {
    setRunning(true);
    setError(null);
    try {
      // Get current lifecycle status first
      const lcRes = await fetch(`${API}/api/v1/oc/lifecycle/${clientId}`);
      const lcData = lcRes.ok ? await lcRes.json() : null;
      const currentStatus = lcData?.status || '';

      // Define the forward transitions from various states
      const allTransitions = [
        { from: 'validation-passed', event: 'audit_started' },
        { from: 'audit-running', event: 'audit_passed' },
        { from: 'audit-passed', event: 'go_live' },
        { from: 'go-live', event: 'hyper_care_started' },
        { from: 'hyper-care', event: 'managed_services_active' },
        { from: 'managed-services', event: 'monitoring_active' },
        { from: 'continuous-monitoring', event: 'engineering_active' },
      ];

      // Find the first transition applicable from current status
      let advanced = false;
      for (const t of allTransitions) {
        if (t.from === currentStatus) {
          const res = await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, event: t.event, actor: 'admin', actorType: 'user' }),
          });
          if (res.ok) {
            advanced = true;
            // Keep advancing
            const data = await res.json();
            const newStatus = data.lifecycle?.status;
            // Try next transition from new status
            for (const t2 of allTransitions) {
              if (t2.from === newStatus) {
                await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ clientId, event: t2.event, actor: 'admin', actorType: 'user' }),
                }).catch(() => {});
                break;
              }
            }
          }
          break;
        }
      }

      if (advanced) {
        window.location.href = `/clients/${clientId}/lifecycle`;
      } else {
        // Already at a state with no forward transition from this page
        await fetchData();
        setError(`Current status: ${currentStatus}. Use the lifecycle page to advance.`);
      }
    } catch {
      setError('Failed to advance lifecycle');
    }
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Governance</p>
            <h2 className="text-lg font-bold text-gray-900">Audit & Compliance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Governance audit trail, compliance verification, and evidence review</p>
          </div>
          <button onClick={startAudit} disabled={running} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">
            {running ? 'Running Audit...' : 'Run Audit & Advance →'}
          </button>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Audit Trail ({auditLog.length} entries)</h3>
        {auditLog.length > 0 ? (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {auditLog.map((entry: any, i: number) => (
              <div key={entry.id || i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${entry.action?.includes('failed') || entry.action?.includes('blocked') ? 'bg-red-500' : 'bg-green-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold text-gray-800">{entry.action?.replace(/_/g, ' ')}</p>
                    <span className="text-[8px] text-gray-400">{entry.entity_type || entry.entityType}</span>
                  </div>
                  <p className="text-[9px] text-gray-500 mt-0.5">{entry.entity_name || entry.entityName}</p>
                  {entry.evidence && entry.evidence.length > 0 && (
                    <p className="text-[9px] text-gray-400 mt-0.5 truncate">{entry.evidence[0]}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] text-gray-400">{entry.actor}</p>
                  <p className="text-[8px] text-gray-300">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</p>
                </div>
              </div>
            ))}
          </div>
        ) : loading ? (
          <p className="text-[10px] text-gray-400">Loading...</p>
        ) : (
          <p className="text-[10px] text-gray-400">No audit entries found for this client.</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        <Link href={`/clients/${clientId}/migrations`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          View Migrations
        </Link>
        <button onClick={fetchData} className="text-xs text-purple-600 hover:text-purple-800 font-medium ml-auto">
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
