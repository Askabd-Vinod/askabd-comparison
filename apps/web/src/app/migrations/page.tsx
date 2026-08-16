import Link from 'next/link';
import { Breadcrumb } from '../components/breadcrumb';
import { KpiCard } from '../components/kpi-card';
import { AIInsightsPanel } from '../components/ai-insights';
import { generateMockMigrations } from '../lib/migration-intelligence';
import { MigrationPortfolio } from './portfolio';

export default function MigrationsPage() {
  const migrations = generateMockMigrations();
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalItems = migrations.reduce((a, m) => a + m.source.applications + m.source.databases, 0);
  const avgReadiness = Math.round(migrations.reduce((a, m) => a + m.readinessScore, 0) / migrations.length);
  const avgRisk = Math.round(migrations.reduce((a, m) => a + m.riskScore, 0) / migrations.length);
  const avgConfidence = Math.round(migrations.reduce((a, m) => a + m.confidenceScore, 0) / migrations.length);
  const totalGaps = migrations.reduce((a, m) => a + m.gaps.filter(g => g.status === 'open').length, 0);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Migration Intelligence' }]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Migration Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enterprise migration assessment, planning, validation, and governance</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-gray-400">Last sync: {lastSync}</span>
          <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">● Platform Active</span>
          <Link href="/migrations/new" className="text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition">+ New Migration</Link>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Executive Summary</h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          {migrations.length} active migration programs across {migrations.length} clients.
          Portfolio readiness: <span className="font-bold">{avgReadiness}%</span>.
          Average risk score: <span className="font-bold">{avgRisk}/100</span>.
          {totalGaps > 0 && ` ${totalGaps} open gaps requiring mitigation.`}
          {' '}Confidence: {avgConfidence}%. {totalItems} total assets being migrated.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 mb-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="Programs" value={migrations.length} description="Active migration programs." criteria="Count of non-cancelled migrations." />
          <KpiCard label="Readiness" value={`${avgReadiness}%`} color={avgReadiness >= 70 ? 'text-green-600' : 'text-orange-600'} description="Average migration readiness." criteria="Weighted: Technical 60% + Business 40%." />
          <KpiCard label="Risk Score" value={`${avgRisk}/100`} color={avgRisk > 50 ? 'text-red-600' : 'text-orange-600'} description="Average portfolio risk." criteria="Lower is better. >50 = high risk." />
          <KpiCard label="Confidence" value={`${avgConfidence}%`} description="Assessment confidence." criteria="Based on evidence completeness." />
          <KpiCard label="Open Gaps" value={totalGaps} color={totalGaps > 3 ? 'text-red-600' : undefined} description="Unresolved gaps across all programs." criteria="Gap items with status = 'open'." />
          <KpiCard label="Assets" value={totalItems} description="Total assets being migrated." criteria="Sum of applications + databases." />
          <KpiCard label="Avg Progress" value={`${Math.round(migrations.reduce((a, m) => a + m.progress, 0) / migrations.length)}%`} description="Overall migration progress." criteria="Average of all program progress." />
        </div>
      </div>

      {/* AI Insights */}
      <div className="mb-8">
        <AIInsightsPanel insights={[
          { type: 'issue', severity: 'critical', title: `${totalGaps} open gaps requiring attention`, description: `${migrations.filter(m => m.gaps.some(g => g.severity === 'critical' && g.status === 'open')).length} program(s) have critical gaps. Resolve before proceeding to execution.`, action: 'View Gaps', href: '#portfolio' },
          { type: 'risk', severity: 'high', title: `Monolith decomposition at ${migrations[2]?.riskScore || 0}/100 risk`, description: 'Highest risk program in portfolio. Recommend additional architecture review before wave planning.', action: 'View Program', href: `/migrations/${migrations[2]?.id}` },
          { type: 'recommendation', severity: 'medium', title: 'Cloud migration on track — Wave 2 at 65%', description: 'Trading Platform migration progressing well. Wave 3 (Database) planning should begin this week.', action: 'View Progress', href: `/migrations/${migrations[0]?.id}` },
          { type: 'prediction', severity: 'low', title: 'Portfolio completion forecast: Q2 2027', description: 'Based on current velocity and risk mitigation pace. No critical blockers for next 4 weeks.' },
        ]} title="Migration Intelligence Insights" />
      </div>

      {/* Migration Portfolio */}
      <MigrationPortfolio migrations={migrations} />
    </div>
  );
}
