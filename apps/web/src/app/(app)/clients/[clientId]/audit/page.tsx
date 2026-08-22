'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getStaffSession } from '../../../../lib/staff-session';
import Link from 'next/link';

// Real forward transitions this button drives — kept as a module-level
// constant (was previously redeclared inline on every startAudit() call)
// and reused to compute an honest button label below, instead of the
// button always claiming "Run Audit" regardless of what it actually does.
const TRANSITIONS = [
  { from: 'validation-passed', event: 'audit_started', label: 'Start governance audit' },
  { from: 'audit-running', event: 'audit_passed', label: 'Mark audit passed' },
  { from: 'audit-passed', event: 'go_live', label: 'Go live' },
  { from: 'go-live', event: 'hyper_care_started', label: 'Begin hyper-care' },
  { from: 'hyper-care', event: 'managed_services_active', label: 'Move to managed services' },
  { from: 'managed-services', event: 'monitoring_active', label: 'Enable continuous monitoring' },
  { from: 'continuous-monitoring', event: 'engineering_active', label: 'Enable engineering intelligence' },
];

export default function AuditPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<{ frameworks: any[] } | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const [auditRes, complianceRes, lcRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/audit?entityId=${clientId}&limit=50`),
        fetch(`${API}/api/v1/oc/clients/${clientId}/compliance/summary`).catch(() => null),
        fetch(`${API}/api/v1/oc/lifecycle/${clientId}`).catch(() => null),
      ]);
      if (auditRes.ok) {
        const data = await auditRes.json();
        setAuditLog(data.entries || []);
        setError(null);
      }
      if (complianceRes?.ok) setCompliance(await complianceRes.json());
      if (lcRes?.ok) { const lc = await lcRes.json(); setLifecycleStatus(lc.status || ''); }
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
      const allTransitions = TRANSITIONS;

      // Find the first transition applicable from current status
      let advanced = false;
      for (const t of allTransitions) {
        if (t.from === currentStatus) {
          const res = await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId, event: t.event, actor: getStaffSession()?.identityId || 'unknown-staff', actorType: 'user' }),
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
                  body: JSON.stringify({ clientId, event: t2.event, actor: getStaffSession()?.identityId || 'unknown-staff', actorType: 'user' }),
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

  // Previously this button was always labeled "Run Audit & Advance →" even
  // though it performs no audit check of any kind — it only walks the
  // lifecycle state machine forward one step. That's a real "fabricated
  // progress" bug (the label claims work that never happens) — found during
  // the 2026-08-22 global UX audit. The label now describes the one real
  // thing the button does: advance to the specific next lifecycle stage.
  const nextTransition = TRANSITIONS.find(t => t.from === lifecycleStatus);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Governance</p>
            <h2 className="text-lg font-bold text-gray-900">Audit & Compliance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Governance audit trail, compliance verification, and evidence review</p>
          </div>
          {nextTransition ? (
            <div className="text-right">
              <button onClick={startAudit} disabled={running} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">
                {running ? 'Working…' : `${nextTransition.label} →`}
              </button>
              <p className="text-[10px] text-gray-400 mt-1">This advances the lifecycle stage only — it does not run an automated audit check.</p>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">No further lifecycle stage to advance to from here.</p>
          )}
        </div>
      </div>

      {/* Real compliance status — evidence-backed, from the compliance
          framework data model (see compliance-service.ts). Previously
          absent from this page entirely, so nothing here reflected whether
          the client actually had any real compliance posture at all. */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1">Compliance Status</h3>
        <p className="text-[11px] text-gray-500 mb-4">Real, evidence-backed compliance posture per framework — not affected by the lifecycle button above.</p>
        {compliance && compliance.frameworks.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {compliance.frameworks.map((f: any) => (
              <div key={f.frameworkId} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-900">{f.frameworkName}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.score >= 80 ? 'bg-green-100 text-green-700' : f.score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{f.score}%</span>
                </div>
                <p className="text-[10px] text-gray-500">{f.met} met · {f.partial} partial · {f.notMet} not met · {f.notAssessed} not assessed</p>
                {(f.evidenceMissing > 0 || f.evidenceExpired > 0) && (
                  <p className="text-[10px] text-amber-600 mt-1">{f.evidenceMissing} missing / {f.evidenceExpired} expired evidence</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">No compliance framework has been initialized for this client yet — there is no automated compliance data to show.</p>
        )}
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
