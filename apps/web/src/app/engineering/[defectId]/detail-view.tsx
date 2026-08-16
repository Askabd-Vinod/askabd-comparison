'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { EngineeringDefect } from '../../lib/engineering-intelligence';
import { DownloadButton } from '../../components/download-button';
import { RemediationPanel } from '../../components/remediation-panel';
import type { RemediationPlan } from '../../components/remediation-panel';

const severityColors: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700', info: 'bg-gray-100 text-gray-600' };

type Tab = 'report' | 'technical' | 'actions';

export function DefectDetailView({ defect }: { defect: EngineeringDefect }) {
  const [tab, setTab] = useState<Tab>('report');
  const [showTechDetails, setShowTechDetails] = useState(false);
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'report', label: 'Engineering Report' },
    { id: 'technical', label: 'Technical Details' },
    { id: 'actions', label: 'Actions & Remediate' },
  ];

  // Generate plain-English executive summary
  const executiveSummary = defect.solution?.executiveSummary || generatePlainEnglish(defect);
  const businessImpactText = defect.solution?.businessImpact || defect.context.businessImpact;
  const canAutoFix = defect.solution && defect.confidenceScore >= 80 ? 'YES' : defect.solution && defect.confidenceScore >= 50 ? 'PARTIAL' : 'NO';

  const remediationPlan: RemediationPlan | null = defect.solution ? {
    id: `rem-${defect.id}`, title: `Remediate: ${defect.title}`, description: defect.solution.problemStatement,
    grade: defect.severity === 'critical' ? 'expedited' : 'standard',
    incident: { id: defect.id, title: defect.title, severity: defect.severity },
    client: { id: defect.clientId, name: defect.clientName },
    fix: { immediate: defect.solution.recommendedFix, permanent: defect.solution.alternativeFixes?.[1]?.fix || defect.solution.recommendedFix },
    impact: { affectedServices: defect.impact?.affectedServices || [], affectedEnvironments: [defect.context.environment], downtime: defect.severity === 'critical' ? '2-5 min' : 'Zero', riskLevel: defect.severity === 'critical' ? 'high' : 'medium', clientImpact: defect.solution.businessImpact, dataRisk: 'None', rollbackTime: '< 2 minutes', dependencies: defect.solution.dependencies, sideEffects: defect.solution.disadvantages },
    steps: defect.solution.implementationSteps.map((s, i) => ({ id: `step-${i}`, label: s, description: s, status: 'pending' as const })),
    rollbackPlan: defect.solution.rollbackSteps.join('. '), validationCriteria: defect.solution.successCriteria, owner: defect.solution.owner, phase: 'idle',
  } : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{defect.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${severityColors[defect.severity]}`}>{defect.severity}</span>
            {defect.recurring && <span className="text-[8px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">RECURRING ×{defect.occurrenceCount}</span>}
            {defect.confidenceScore > 0 && <span className="text-[10px] font-bold text-purple-600">Confidence: {defect.confidenceScore}%</span>}
            <span className="text-[9px] text-gray-400">Last sync: {lastSync}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <DownloadButton fileName={`Engineering_Report_${defect.id}`} format="pdf" entityId={defect.id} entityName={defect.title} clientName={defect.clientName} data={{ title: defect.title, severity: defect.severity, confidence: defect.confidenceScore, rootCause: defect.rootCause?.primaryCause || 'Pending', solution: defect.solution?.recommendedFix || 'Pending', businessImpact: businessImpactText }}>Executive Report</DownloadButton>
          <DownloadButton fileName={`Technical_Report_${defect.id}`} format="csv" entityId={defect.id} entityName={defect.title} clientName={defect.clientName} data={{ file: defect.context.file, function: defect.context.function, framework: defect.context.framework }}>Technical Report</DownloadButton>
        </div>
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
          {/* 1. Executive Summary — Plain English */}
          <section className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-purple-900 mb-2">📋 Executive Summary</h3>
            <p className="text-sm text-purple-800 leading-relaxed">{executiveSummary}</p>
          </section>

          {/* 2. Business Impact */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-3">💼 Business Impact</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
              <p className="text-xs text-red-800 leading-relaxed">{businessImpactText}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-500">What users experience:</span><p className="font-medium mt-0.5">{defect.severity === 'critical' ? 'Complete service disruption — users cannot access the affected system' : defect.severity === 'high' ? 'Degraded experience — some features not working correctly' : 'Minor inconvenience — workaround available'}</p></div>
              <div><span className="text-gray-500">Operational impact:</span><p className="font-medium mt-0.5">{defect.recurring ? 'Recurring issue requiring permanent resolution' : 'First occurrence — monitoring for recurrence'}</p></div>
              <div><span className="text-gray-500">Affected organization:</span><p className="font-medium mt-0.5"><Link href={`/clients/${defect.clientId}`} className="text-purple-600 hover:underline">{defect.clientName}</Link></p></div>
              <div><span className="text-gray-500">Severity assessment:</span><p className="font-medium mt-0.5 capitalize">{defect.severity} — {defect.severity === 'critical' ? 'Immediate action required' : defect.severity === 'high' ? 'Action within 4 hours' : 'Scheduled resolution'}</p></div>
            </div>
          </section>

          {/* 4. Root Cause Analysis */}
          {defect.rootCause && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3">🔍 Why This Happened</h3>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-indigo-800">Primary Root Cause</p>
                  <span className="text-[10px] font-bold text-purple-600">{defect.rootCause.confidence}% confidence</span>
                </div>
                <p className="text-sm text-indigo-700">{defect.rootCause.primaryCause}</p>
              </div>
              {defect.rootCause.alternativeCauses.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-gray-500 uppercase font-medium mb-2">Other Possible Causes</p>
                  <div className="space-y-1.5">{defect.rootCause.alternativeCauses.map((ac, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2">
                      <span className="text-gray-700">{ac.cause}</span>
                      <span className="text-[10px] text-gray-500">{ac.confidence}% likely</span>
                    </div>
                  ))}</div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Evidence</p>
                <ul className="space-y-1">{defect.rootCause.evidence.map((e, i) => <li key={i} className="text-xs text-gray-700 flex items-start gap-2"><span className="text-green-500">✓</span>{e}</li>)}</ul>
              </div>
            </section>
          )}

          {/* 6. Recommended Solution */}
          {defect.solution && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3">💡 Recommended Solution</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
                <p className="text-sm text-green-800">{defect.solution.recommendedFix}</p>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-xs mb-3">
                <div><span className="text-gray-500">Expected outcome:</span><p className="font-medium mt-0.5">{defect.solution.expectedOutcome}</p></div>
                <div><span className="text-gray-500">Effort:</span><p className="font-medium mt-0.5">{defect.solution.estimatedEffort}</p></div>
                <div><span className="text-gray-500">Risk:</span><p className="font-medium mt-0.5">{defect.solution.risk}</p></div>
              </div>
              {/* 7. Alternative Solutions */}
              {defect.solution.alternativeFixes.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-medium mb-2">Alternative Approaches (Ranked)</p>
                  <div className="space-y-2">{defect.solution.alternativeFixes.map((af, i) => (
                    <div key={i} className="border rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">Option {i + 2}: {af.fix}</span>
                        <span className="text-[9px] text-gray-400">Effort: {af.effort}</span>
                      </div>
                      <div className="flex gap-4 text-[10px] text-gray-500">
                        <span className="text-green-600">✓ {af.advantages.join(', ')}</span>
                        <span className="text-orange-600">⚠ {af.disadvantages.join(', ')}</span>
                      </div>
                    </div>
                  ))}</div>
                </div>
              )}
            </section>
          )}

          {/* 8. Auto-Fix Assessment */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-3">🤖 Automatic Fix Assessment</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="border rounded-lg p-3">
                <p className={`text-lg font-bold ${canAutoFix === 'YES' ? 'text-green-600' : canAutoFix === 'PARTIAL' ? 'text-orange-600' : 'text-gray-500'}`}>{canAutoFix}</p>
                <p className="text-[9px] text-gray-500">Can AskABD fix?</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-lg font-bold text-purple-600">{defect.confidenceScore}%</p>
                <p className="text-[9px] text-gray-500">Confidence</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-lg font-bold">{defect.solution?.estimatedEffort || '—'}</p>
                <p className="text-[9px] text-gray-500">Estimated Time</p>
              </div>
            </div>
          </section>

          {/* 9. Validation Checklist */}
          {defect.solution && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3">✅ Validation Checklist</h3>
              <div className="space-y-1.5">{defect.solution.validationSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs"><span className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center text-[10px] text-gray-400">○</span><span className="text-gray-700">{s}</span></div>
              ))}</div>
            </section>
          )}

          {/* 10. Regression & 11. Rollback */}
          {defect.solution && (
            <div className="grid md:grid-cols-2 gap-4">
              <section className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold mb-3">🔄 Regression Risk</h3>
                {defect.impact && (
                  <div className="space-y-1 text-xs">
                    {defect.impact.affectedPages.length > 0 && <p><span className="text-gray-500">Pages:</span> {defect.impact.affectedPages.join(', ')}</p>}
                    {defect.impact.affectedComponents.length > 0 && <p><span className="text-gray-500">Components:</span> {defect.impact.affectedComponents.join(', ')}</p>}
                    {defect.impact.affectedApis.length > 0 && <p><span className="text-gray-500">APIs:</span> {defect.impact.affectedApis.join(', ')}</p>}
                    <p><span className="text-gray-500">Regression risk:</span> <span className={`font-bold ${defect.impact.regressionRisk === 'low' ? 'text-green-600' : 'text-orange-600'}`}>{defect.impact.regressionRisk}</span></p>
                  </div>
                )}
              </section>
              <section className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold mb-3">↩ Rollback Plan</h3>
                <ul className="space-y-1">{defect.solution.rollbackSteps.map((s, i) => <li key={i} className="text-xs text-gray-700 flex items-start gap-2"><span className="text-orange-500">↩</span>{s}</li>)}</ul>
              </section>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TECHNICAL DETAILS TAB ═══════════ */}
      {tab === 'technical' && (
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">Technical Context</h3>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Framework</span><span className="font-medium font-mono">{defect.context.framework}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Application</span><span className="font-medium">{defect.context.application}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Module</span><span className="font-medium">{defect.context.module}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Component</span><span className="font-medium font-mono">{defect.context.component}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">File</span><span className="font-medium font-mono text-purple-600">{defect.context.file}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Function</span><span className="font-medium font-mono">{defect.context.function}</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Environment</span><span className="font-medium">{defect.context.environment}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Version</span><span className="font-medium font-mono">{defect.context.deploymentVersion}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Database</span><span className="font-medium">{defect.context.database}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">API</span><span className="font-medium font-mono">{defect.context.api}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Connector</span><span className="font-medium">{defect.context.connector}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Correlation ID</span><span className="font-medium font-mono text-[10px]">{defect.context.correlationId}</span></div>
              </div>
            </div>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">Stack Trace</h3>
            <pre className="bg-gray-900 text-green-400 text-[10px] p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">{defect.context.stackTrace}</pre>
          </section>
          {defect.rootCause && (
            <section className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm mb-3">Related Items</h3>
              <div className="grid md:grid-cols-3 gap-3 text-[10px]">
                {defect.rootCause.relatedDeployments.length > 0 && <div><span className="text-gray-500 block mb-1">Deployments</span>{defect.rootCause.relatedDeployments.map((r, i) => <span key={i} className="block font-mono text-purple-600">{r}</span>)}</div>}
                {defect.rootCause.relatedCommits.length > 0 && <div><span className="text-gray-500 block mb-1">Commits</span>{defect.rootCause.relatedCommits.map((r, i) => <span key={i} className="block font-mono text-purple-600">{r}</span>)}</div>}
                {defect.rootCause.relatedPullRequests.length > 0 && <div><span className="text-gray-500 block mb-1">Pull Requests</span>{defect.rootCause.relatedPullRequests.map((r, i) => <span key={i} className="block font-mono text-purple-600">{r}</span>)}</div>}
                {defect.rootCause.relatedIncidents.length > 0 && <div><span className="text-gray-500 block mb-1">Incidents</span>{defect.rootCause.relatedIncidents.map((r, i) => <span key={i} className="block">{r}</span>)}</div>}
                {defect.rootCause.historicalSimilar.length > 0 && <div><span className="text-gray-500 block mb-1">Similar Historical</span>{defect.rootCause.historicalSimilar.map((r, i) => <span key={i} className="block">{r}</span>)}</div>}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════════ ACTIONS TAB ═══════════ */}
      {tab === 'actions' && (
        <div className="space-y-6">
          {/* Quick Actions */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">⚡ One-Click Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Link href={`/engineering/knowledge`} className="border rounded-lg p-3 text-center text-xs hover:border-purple-300 hover:bg-purple-50 transition">🔍 Search Similar</Link>
              <DownloadButton fileName={`Report_${defect.id}`} format="pdf" entityId={defect.id} entityName={defect.title} clientName={defect.clientName} data={{ title: defect.title }} className="border rounded-lg p-3 text-center text-xs hover:border-purple-300 hover:bg-purple-50 transition cursor-pointer">📄 Download Report</DownloadButton>
              <Link href={`/clients/${defect.clientId}/audit`} className="border rounded-lg p-3 text-center text-xs hover:border-purple-300 hover:bg-purple-50 transition">📋 Audit Trail</Link>
              <Link href={`/clients/${defect.clientId}/incidents`} className="border rounded-lg p-3 text-center text-xs hover:border-purple-300 hover:bg-purple-50 transition">🚨 Related Incidents</Link>
            </div>
          </section>
          {/* Remediation Panel */}
          {remediationPlan ? <RemediationPanel plan={remediationPlan} /> : (
            <div className="bg-gray-50 rounded-xl border p-8 text-center">
              <p className="text-sm text-gray-500">Remediation requires a completed solution. Waiting for RCA and solution generation.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function generatePlainEnglish(defect: EngineeringDefect): string {
  const category = defect.category.replace(/-/g, ' ');
  const client = defect.clientName;

  if (defect.category === 'database') {
    return `A database issue is affecting ${client}'s operations. The system's connection to the database is experiencing problems, which means some features may be slow or unavailable. This is causing ${defect.context.frequency} occurrences and needs to be addressed to prevent service disruption.`;
  }
  if (defect.category === 'hydration') {
    return `A display issue is occurring on ${client}'s website where the page initially loads incorrectly in some browsers. Users may see a brief flash of wrong content or an unresponsive interface. This affects approximately ${defect.context.frequency} page loads and degrades the user experience.`;
  }
  if (defect.category === 'authentication') {
    return `An authentication issue is intermittently preventing users from staying logged into ${client}'s system. Some users experience unexpected sign-outs or failed login attempts during certain conditions. This creates a frustrating experience and could affect ${defect.context.frequency} user sessions.`;
  }
  if (defect.category === 'memory-leak') {
    return `A memory management issue is causing ${client}'s system to gradually slow down over time and eventually restart. This means some services become unresponsive after extended operation, requiring periodic manual intervention to restore normal performance.`;
  }
  if (defect.category === 'kubernetes') {
    return `A container resource issue is causing services to restart unexpectedly in ${client}'s infrastructure. This leads to brief service interruptions and delayed processing of background tasks, affecting operational continuity.`;
  }
  return `A ${category} issue has been detected in ${client}'s environment. The engineering intelligence engine has identified this problem occurring ${defect.context.frequency} times and is analyzing the root cause to provide a recommended resolution.`;
}
