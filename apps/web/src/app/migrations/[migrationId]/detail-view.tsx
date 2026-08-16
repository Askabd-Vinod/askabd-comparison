'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { MigrationProgram } from '../../lib/migration-intelligence';
import { DownloadButton } from '../../components/download-button';
import { KpiCard } from '../../components/kpi-card';
import { MigrationConnectionPanel } from '../../components/migration-connection';

const statusColors: Record<string, string> = { planning: 'bg-gray-100 text-gray-700', assessing: 'bg-blue-100 text-blue-700', ready: 'bg-green-100 text-green-700', 'in-progress': 'bg-purple-100 text-purple-700', validating: 'bg-indigo-100 text-indigo-700', completed: 'bg-green-200 text-green-800', 'rolled-back': 'bg-orange-100 text-orange-700', paused: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-red-100 text-red-700' };

type Tab = 'overview' | 'connect' | 'assessment' | 'plan' | 'gaps' | 'waves' | 'validation' | 'reports';

export function MigrationDetailView({ migration: m }: { migration: MigrationProgram }) {
  const [tab, setTab] = useState<Tab>('overview');
  const lastSync = new Date(m.lastSync).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' }, { id: 'connect', label: 'Connect & Transfer' },
    { id: 'assessment', label: 'Assessment' },
    { id: 'plan', label: 'Plan' }, { id: 'gaps', label: `Gaps (${m.gaps.length})` },
    { id: 'waves', label: `Waves (${m.waves.length})` }, { id: 'validation', label: 'Validation' },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{m.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[m.status]}`}>{m.status.replace('-', ' ')}</span>
            <span className="text-[10px] text-gray-500 capitalize">{m.type.replace(/-/g, ' ')}</span>
            <span className="text-[10px] text-gray-400">Phase: {m.phase}</span>
            <span className="text-[10px] text-gray-400">Last sync: {lastSync}</span>
          </div>
        </div>
        <DownloadButton fileName={`Migration_${m.name}_Report`} format="pdf" entityId={m.id} entityName={m.name} clientName={m.clientName} data={{ type: m.type, status: m.status, readiness: m.readinessScore, risk: m.riskScore, confidence: m.confidenceScore, progress: m.progress }}>
          Download Full Report
        </DownloadButton>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">{tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-xs font-medium border-b-2 transition ${tab === t.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}</nav>
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard label="Progress" value={`${m.progress}%`} color={m.progress >= 80 ? 'text-green-600' : undefined} description="Overall migration progress." criteria="Weighted completion of all waves." />
            <KpiCard label="Readiness" value={`${m.readinessScore}%`} color={m.readinessScore >= 70 ? 'text-green-600' : 'text-orange-600'} description="Migration readiness score." criteria="Technical 60% + Business 40%." />
            <KpiCard label="Risk" value={`${m.riskScore}/100`} color={m.riskScore > 50 ? 'text-red-600' : undefined} description="Risk score (lower = better)." criteria="Based on gaps, complexity, dependencies." />
            <KpiCard label="Confidence" value={`${m.confidenceScore}%`} description="Assessment confidence." criteria="Evidence completeness." />
            <KpiCard label="Open Gaps" value={m.gaps.filter(g => g.status === 'open').length} color={m.gaps.filter(g => g.status === 'open').length > 0 ? 'text-orange-600' : 'text-green-600'} description="Unresolved gaps." criteria="Status = 'open'." />
            <KpiCard label="Waves" value={m.waves.length} description="Migration waves planned." criteria="Sequential execution groups." />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold mb-3">Source Environment</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{m.source.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium">{m.source.type}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Applications</span><span className="font-medium">{m.source.applications}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Databases</span><span className="font-medium">{m.source.databases}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Servers</span><span className="font-medium">{m.source.servers}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Storage</span><span className="font-medium">{m.source.storage}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Users</span><span className="font-medium">{m.source.users}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`font-medium ${m.source.status === 'connected' ? 'text-green-600' : 'text-orange-600'}`}>{m.source.status}</span></div>
              </div>
            </section>
            <section className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold mb-3">Target Environment</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{m.target.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium">{m.target.type}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Applications</span><span className="font-medium">{m.target.applications}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Databases</span><span className="font-medium">{m.target.databases}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Storage</span><span className="font-medium">{m.target.storage}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Users</span><span className="font-medium">{m.target.users}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`font-medium ${m.target.status === 'connected' ? 'text-green-600' : 'text-orange-600'}`}>{m.target.status}</span></div>
              </div>
            </section>
          </div>
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-3">Quick Links</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Link href={`/clients/${m.clientId}`} className="py-2 px-3 rounded-lg border hover:border-purple-200 hover:bg-purple-50 transition">→ {m.clientName}</Link>
              <Link href={`/clients/${m.clientId}/infrastructure`} className="py-2 px-3 rounded-lg border hover:border-purple-200 hover:bg-purple-50 transition">→ Infrastructure</Link>
              <Link href={`/clients/${m.clientId}/deployments`} className="py-2 px-3 rounded-lg border hover:border-purple-200 hover:bg-purple-50 transition">→ Deployments</Link>
              <Link href={`/clients/${m.clientId}/contracts`} className="py-2 px-3 rounded-lg border hover:border-purple-200 hover:bg-purple-50 transition">→ Contracts</Link>
            </div>
          </section>
        </div>
      )}

      {/* Connect & Transfer */}
      {tab === 'connect' && (
        <MigrationConnectionPanel />
      )}

      {/* Assessment */}
      {tab === 'assessment' && (
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-4">Migration Assessment</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div><span className="text-gray-500">Complexity</span><p className={`font-bold capitalize ${m.assessment.complexity === 'critical' ? 'text-red-600' : m.assessment.complexity === 'high' ? 'text-orange-600' : 'text-green-600'}`}>{m.assessment.complexity}</p></div>
              <div><span className="text-gray-500">Business Readiness</span><p className="font-bold">{m.assessment.businessReadiness}%</p></div>
              <div><span className="text-gray-500">Technical Readiness</span><p className="font-bold">{m.assessment.technicalReadiness}%</p></div>
              <div><span className="text-gray-500">Effort Estimate</span><p className="font-bold">{m.assessment.effortEstimate}</p></div>
              <div><span className="text-gray-500">Timeline</span><p className="font-bold">{m.assessment.timeline}</p></div>
              <div><span className="text-gray-500">Cost Estimate</span><p className="font-bold">{m.assessment.cost}</p></div>
            </div>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-3">Required Skills</h3>
            <div className="flex flex-wrap gap-2">{m.assessment.requiredSkills.map((s, i) => <span key={i} className="text-[10px] bg-purple-50 text-purple-700 px-2 py-1 rounded">{s}</span>)}</div>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-3">Recommendations</h3>
            <ol className="space-y-2">{m.assessment.recommendations.map((r, i) => <li key={i} className="text-xs text-gray-700 flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>{r}</li>)}</ol>
          </section>
        </div>
      )}

      {/* Plan */}
      {tab === 'plan' && (
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-4">Migration Plan</h3>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Strategy</p><p className="text-gray-800 font-medium">{m.plan.strategy}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Approach</p><p className="text-gray-800 font-medium">{m.plan.approach}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Rollback Plan</p><p className="text-gray-800">{m.plan.rollbackPlan}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Validation Plan</p><p className="text-gray-800">{m.plan.validationPlan}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Testing Plan</p><p className="text-gray-800">{m.plan.testingPlan}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Cutover Plan</p><p className="text-gray-800">{m.plan.cutoverPlan}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Communication Plan</p><p className="text-gray-800">{m.plan.communicationPlan}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase mb-1">Support Plan</p><p className="text-gray-800">{m.plan.supportPlan}</p></div>
            </div>
          </section>
        </div>
      )}

      {/* Gaps */}
      {tab === 'gaps' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Gap</th>
                <th className="text-left px-3 py-3">Category</th>
                <th className="text-left px-3 py-3">Severity</th>
                <th className="text-left px-3 py-3">Source</th>
                <th className="text-left px-3 py-3">Target</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="text-left px-3 py-3">Effort</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {m.gaps.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3"><p className="text-xs font-medium">{g.title}</p><p className="text-[10px] text-gray-400 mt-0.5">{g.recommendation}</p></td>
                  <td className="px-3 py-3 text-xs">{g.category}</td>
                  <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${g.severity === 'critical' ? 'bg-red-100 text-red-700' : g.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{g.severity}</span></td>
                  <td className="px-3 py-3 text-[10px] text-gray-600">{g.source}</td>
                  <td className="px-3 py-3 text-[10px] text-gray-600">{g.target}</td>
                  <td className="px-3 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${g.status === 'resolved' ? 'bg-green-100 text-green-700' : g.status === 'mitigated' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{g.status}</span></td>
                  <td className="px-3 py-3 text-[10px]">{g.effort}</td>
                </tr>
              ))}
              {m.gaps.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-xs text-gray-400">No gaps identified yet. Run assessment to detect gaps.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Waves */}
      {tab === 'waves' && (
        <div className="space-y-4">
          {m.waves.map(w => (
            <div key={w.id} className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">{w.order}</span>
                  <div><p className="text-sm font-semibold">{w.name}</p><p className="text-[10px] text-gray-500">{w.items} items • {w.startDate} → {w.endDate}</p></div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusColors[w.status]}`}>{w.status.replace('-', ' ')}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${w.progress >= 100 ? 'bg-green-500' : w.progress > 0 ? 'bg-purple-500' : 'bg-gray-300'}`} style={{ width: `${w.progress}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">{w.progress}% complete{w.dependencies.length > 0 ? ` • Depends on: ${w.dependencies.join(', ')}` : ''}</p>
            </div>
          ))}
          {m.waves.length === 0 && <div className="bg-gray-50 rounded-xl border p-8 text-center text-xs text-gray-400">No waves planned yet. Complete assessment and planning phase first.</div>}
        </div>
      )}

      {/* Validation */}
      {tab === 'validation' && (
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-4">Post-Migration Validation</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="text-center border rounded-lg p-3"><p className="text-lg font-bold">{m.validation.sourceCount.toLocaleString()}</p><p className="text-gray-500">Source Records</p></div>
              <div className="text-center border rounded-lg p-3"><p className="text-lg font-bold">{m.validation.targetCount.toLocaleString()}</p><p className="text-gray-500">Target Records</p></div>
              <div className="text-center border rounded-lg p-3"><p className="text-lg font-bold text-green-600">{m.validation.matched.toLocaleString()}</p><p className="text-gray-500">Matched</p></div>
              <div className="text-center border rounded-lg p-3"><p className={`text-lg font-bold ${m.validation.missing > 0 ? 'text-red-600' : 'text-green-600'}`}>{m.validation.missing.toLocaleString()}</p><p className="text-gray-500">Missing</p></div>
            </div>
          </section>
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-3">Validation Checks</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {[
                { label: 'Checksum Validation', pass: m.validation.checksumValid },
                { label: 'Permissions Validation', pass: m.validation.permissionsValid },
                { label: 'Performance Acceptable', pass: m.validation.performanceAcceptable },
                { label: 'Business Validation', pass: m.validation.businessValidation },
              ].map((v, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 border rounded-lg text-xs">
                  <span>{v.label}</span>
                  <span className={`font-bold ${v.pass ? 'text-green-600' : 'text-red-600'}`}>{v.pass ? '✓ PASS' : '✕ FAIL'}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Reports */}
      {tab === 'reports' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {['Migration Assessment', 'Migration Readiness', 'Gap Analysis', 'Risk Report', 'Dependency Report', 'Execution Report', 'Validation Report', 'Exception Report', 'Lessons Learned', 'Executive Report'].map(name => (
            <div key={name} className="bg-white rounded-xl border p-4">
              <p className="text-xs font-semibold mb-2">{name}</p>
              <div className="flex gap-1.5">
                <DownloadButton fileName={`${m.name}_${name}`} format="pdf" entityId={m.id} entityName={name} clientName={m.clientName} data={{ migration: m.name, type: m.type, report: name }} />
                <DownloadButton fileName={`${m.name}_${name}`} format="excel" entityId={m.id} entityName={name} clientName={m.clientName} data={{ migration: m.name, report: name }} />
                <DownloadButton fileName={`${m.name}_${name}`} format="csv" entityId={m.id} entityName={name} clientName={m.clientName} data={{ migration: m.name, report: name }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
