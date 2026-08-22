'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { RealDefect } from '../../../lib/real-engineering';
import { severityColors, confidenceColors, confidenceLabels } from '../../../lib/real-engineering';
import { DownloadButton } from '../../../components/download-button';

type Tab = 'report' | 'technical';

export function DefectDetailView({ defect, clientName }: { defect: RealDefect; clientName: string | null }) {
  const [tab, setTab] = useState<Tab>('report');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'report', label: 'Engineering Report' },
    { id: 'technical', label: 'Technical Details' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{defect.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${severityColors[defect.severity] || 'bg-gray-100 text-gray-600'}`}>{defect.severity}</span>
            {defect.occurrence_count > 1 && <span className="text-[8px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">RECURRING ×{defect.occurrence_count}</span>}
            <span className={`text-[10px] font-bold ${confidenceColors[defect.root_cause_confidence] || 'text-gray-300'}`}>Root cause: {confidenceLabels[defect.root_cause_confidence] || 'Unknown'}</span>
            {defect.jira_issue_key ? (
              <a href={defect.jira_issue_url} target="_blank" rel="noopener" className="text-[10px] font-medium text-purple-600 hover:underline">{defect.jira_issue_key} ↗</a>
            ) : (
              <span className="text-[10px] text-gray-400">No Jira issue linked</span>
            )}
          </div>
        </div>
        <DownloadButton fileName={`Engineering_Report_${defect.id}`} format="pdf" entityId={defect.id} entityName={defect.title} clientName={clientName || undefined} data={{ title: defect.title, category: defect.category, severity: defect.severity, status: defect.status, rootCause: defect.root_cause || 'Not yet determined', rootCauseConfidence: defect.root_cause_confidence, businessImpact: defect.business_impact, technicalImpact: defect.technical_impact, recommendedFix: defect.recommended_fix || 'Not yet determined', evidence: defect.evidence || [], occurrenceCount: defect.occurrence_count, firstSeenAt: defect.first_seen_at, lastSeenAt: defect.last_seen_at }}>Download Report</DownloadButton>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">{tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${tab === t.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}</nav>
      </div>

      {/* ═══════════ ENGINEERING REPORT TAB ═══════════ */}
      {tab === 'report' && (
        <div className="space-y-6">
          {/* Business Impact */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-3">💼 Business Impact</h3>
            {defect.business_impact ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
                <p className="text-xs text-red-800 leading-relaxed">{defect.business_impact}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">Not yet available for this defect.</p>
            )}
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-500">Affected organization:</span><p className="font-medium mt-0.5">{defect.client_id ? <Link href={`/clients/${defect.client_id}`} className="text-purple-600 hover:underline">{clientName || defect.client_id}</Link> : 'Platform-wide (not client-specific)'}</p></div>
              <div><span className="text-gray-500">Affected service:</span><p className="font-medium mt-0.5">{defect.affected_service || 'Not recorded'}</p></div>
              <div><span className="text-gray-500">Recurring:</span><p className="font-medium mt-0.5">{defect.occurrence_count > 1 ? `Yes — detected ${defect.occurrence_count} times` : 'No — first occurrence'}</p></div>
              <div><span className="text-gray-500">Severity assessment:</span><p className="font-medium mt-0.5 capitalize">{defect.severity}</p></div>
            </div>
          </section>

          {/* Root Cause */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-3">🔍 Why This Happened</h3>
            {defect.root_cause ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-indigo-800">Root Cause</p>
                  <span className={`text-[10px] font-bold ${confidenceColors[defect.root_cause_confidence] || 'text-gray-300'}`}>{confidenceLabels[defect.root_cause_confidence] || 'Unknown'}</span>
                </div>
                <p className="text-sm text-indigo-700">{defect.root_cause}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">Root cause not yet determined.</p>
            )}
            {defect.evidence && defect.evidence.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Evidence</p>
                <ul className="space-y-1">{defect.evidence.map((e, i) => <li key={i} className="text-xs text-gray-700 flex items-start gap-2"><span className="text-green-500">✓</span>{e}</li>)}</ul>
              </div>
            )}
          </section>

          {/* Recommended Fix */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-3">💡 Recommended Fix</h3>
            {defect.recommended_fix ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">{defect.recommended_fix}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Not yet determined.</p>
            )}
            <p className="text-[10px] text-gray-400 mt-3">
              AskABD does not currently generate automated remediation plans, effort estimates, or risk scores for defects — those would require capabilities not yet built. Resolution and validation are tracked manually via the linked Jira issue, where connected.
            </p>
          </section>

          {defect.resolution || defect.resolved_at ? (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3">✅ Resolution</h3>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-500">Resolved at:</span><p className="font-medium mt-0.5">{defect.resolved_at ? new Date(defect.resolved_at).toLocaleString('en-AU') : 'Not yet resolved'}</p></div>
                <div><span className="text-gray-500">Resolved by:</span><p className="font-medium mt-0.5">{defect.resolved_by || 'Not recorded'}</p></div>
              </div>
              {defect.resolution && <p className="text-xs text-gray-700 mt-3">{defect.resolution}</p>}
            </section>
          ) : null}
        </div>
      )}

      {/* ═══════════ TECHNICAL DETAILS TAB ═══════════ */}
      {tab === 'technical' && (
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">Technical Context</h3>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="font-medium capitalize">{defect.category.replace('-', ' ')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Environment</span><span className="font-medium">{defect.environment}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="font-medium capitalize">{defect.status.replace('-', ' ')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Affected Service</span><span className="font-medium">{defect.affected_service || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Affected Endpoint</span><span className="font-medium font-mono text-purple-600">{defect.affected_endpoint || '—'}</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Occurrences</span><span className="font-medium font-mono">{defect.occurrence_count}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">First Seen</span><span className="font-medium">{new Date(defect.first_seen_at).toLocaleString('en-AU')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Last Seen</span><span className="font-medium">{new Date(defect.last_seen_at).toLocaleString('en-AU')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Fingerprint</span><span className="font-medium font-mono text-[10px]">{defect.fingerprint}</span></div>
              </div>
            </div>
          </section>
          {defect.description && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm mb-3">Description</h3>
              <p className="text-xs text-gray-700 leading-relaxed">{defect.description}</p>
            </section>
          )}
          {defect.technical_impact && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm mb-3">Technical Impact</h3>
              <p className="text-xs text-gray-700 leading-relaxed">{defect.technical_impact}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
