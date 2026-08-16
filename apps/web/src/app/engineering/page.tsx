import Link from 'next/link';
import { Breadcrumb } from '../components/breadcrumb';
import { KpiCard } from '../components/kpi-card';
import { AIInsightsPanel } from '../components/ai-insights';
import { generateMockDefects, generateMockMetrics } from '../lib/engineering-intelligence';
import { EngineeringDefectsTable } from './defects-table';

export default function EngineeringDashboardPage() {
  const metrics = generateMockMetrics();
  const defects = generateMockDefects();
  const criticalCount = defects.filter(d => d.severity === 'critical').length;
  const highCount = defects.filter(d => d.severity === 'high').length;
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Engineering Intelligence' }]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automatic detection, root cause analysis, and resolution engine</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-gray-400">Last sync: {lastSync}</span>
          <span className="text-[10px] font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">● Engine Active</span>
          <Link href="/engineering/knowledge" className="text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition">Knowledge Base</Link>
          <Link href="/engineering/reports" className="text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 transition">Reports</Link>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-indigo-900 mb-2">Executive Summary</h3>
        <p className="text-xs text-indigo-700 leading-relaxed">
          Engineering Health Score: <span className="font-bold">{Math.round((metrics.buildHealth + metrics.deploymentHealth + metrics.codeQuality) / 3)}%</span>.
          {criticalCount > 0 && ` ${criticalCount} critical defect(s) require immediate attention.`}
          {metrics.recurringIssues > 0 && ` ${metrics.recurringIssues} recurring patterns detected — knowledge engine has historical resolutions.`}
          {' '}Build success rate {metrics.buildHealth}%, deployment success rate {metrics.deploymentHealth}%.
          {metrics.securityFindings > 0 && ` ${metrics.securityFindings} security findings pending review.`}
          {' '}MTTR: {metrics.avgTimeToResolve}. Knowledge reuse: {metrics.knowledgeReuse} resolutions applied from previous fixes.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 mb-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="Health Score" value={`${Math.round((metrics.buildHealth + metrics.deploymentHealth + metrics.codeQuality) / 3)}%`} color="text-purple-600" description="Overall engineering health composite." criteria="Average of Build Health, Deploy Health, and Code Quality." />
          <KpiCard label="Open Critical" value={criticalCount} color={criticalCount > 0 ? 'text-red-600' : 'text-green-600'} description="Critical defects requiring immediate action." criteria="Defects with severity = 'critical' and status ≠ 'closed'." />
          <KpiCard label="MTTR" value={metrics.avgTimeToResolve} description="Mean Time To Resolve across all defects." criteria="Average resolution time for defects closed this month." />
          <KpiCard label="Build Health" value={`${metrics.buildHealth}%`} color="text-green-600" description="CI/CD build success rate." criteria="Successful builds / total builds × 100 (7-day window)." />
          <KpiCard label="Deploy Health" value={`${metrics.deploymentHealth}%`} description="Deployment success rate." criteria="Successful deploys / total deploys × 100." />
          <KpiCard label="Code Quality" value={`${metrics.codeQuality}%`} description="Composite code quality score." criteria="TypeScript 40% + ESLint 30% + Patterns 30%." />
          <KpiCard label="Security" value={metrics.securityFindings} color={metrics.securityFindings > 5 ? 'text-orange-600' : undefined} description="Unresolved security findings." criteria="Count of open security scan results." />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-3">
          <KpiCard label="Open Defects" value={metrics.openDefects} description="Total open engineering defects." criteria="All non-closed defects." />
          <KpiCard label="Recurring" value={metrics.recurringIssues} color="text-orange-600" description="Issues occurring more than once." criteria="occurrenceCount > 1." />
          <KpiCard label="Tech Debt" value={metrics.technicalDebt} description="Technical debt items tracked." criteria="Architecture violations + code smells." />
          <KpiCard label="Confidence" value={`${metrics.avgConfidence}%`} description="Average RCA confidence." criteria="Mean confidence of all analyses." />
          <KpiCard label="Automation" value={metrics.automationOpportunities} color="text-purple-600" description="Defects eligible for auto-fix." criteria="Confidence ≥ 85% and autoFixable." />
          <KpiCard label="Knowledge" value={metrics.knowledgeReuse} color="text-green-600" description="Resolutions reused from KB." criteria="Count of fixes applied from knowledge base." />
          <KpiCard label="Trend" value={metrics.performanceTrends === 'improving' ? '↑' : metrics.performanceTrends === 'degrading' ? '↓' : '→'} color={metrics.performanceTrends === 'improving' ? 'text-green-600' : metrics.performanceTrends === 'degrading' ? 'text-red-600' : undefined} description="Overall performance trend direction." criteria="Based on 30-day rolling comparison." />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Top Root Causes */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Top Root Causes</h3>
          <div className="space-y-2">
            {metrics.topRootCauses.map((rc, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{rc.cause}</span>
                <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{rc.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Most Impacted Systems */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Most Impacted Systems</h3>
          <div className="space-y-2">
            {metrics.mostImpactedSystems.map((sys, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{sys.system}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(sys.defects / 3) * 100}%` }} />
                  </div>
                  <span className="font-bold text-gray-900">{sys.defects}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Recent Activity</h3>
          <div className="space-y-2 text-xs">
            {defects.slice(0, 4).map(d => (
              <Link key={d.id} href={`/engineering/${d.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 transition">
                <span className={`w-2 h-2 rounded-full ${d.severity === 'critical' ? 'bg-red-500' : d.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-700 truncate flex-1">{d.title}</span>
                <span className="text-[9px] text-gray-400">{new Date(d.detectedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </Link>
            ))}
            <div className="pt-2 border-t">
              <Link href="/engineering/knowledge" className="text-[10px] text-purple-600 font-medium hover:text-purple-800">View Knowledge Base →</Link>
            </div>
          </div>
        </section>
      </div>

      {/* AI Insights */}
      <div className="mb-8">
        <AIInsightsPanel insights={[
          { type: 'issue', severity: 'critical', title: `${criticalCount} critical + ${highCount} high severity defects`, description: `Immediate attention required. MTTR target: < 4h. Current: ${metrics.avgTimeToResolve}.`, action: 'View Defects', href: '#defects' },
          { type: 'risk', severity: 'high', title: `${metrics.recurringIssues} recurring patterns — knowledge engine active`, description: 'Historical resolutions available. Auto-apply with approval (Premium).', action: 'View Knowledge', href: '/engineering/knowledge' },
          { type: 'recommendation', severity: 'medium', title: `${metrics.automationOpportunities} auto-remediation candidates`, description: 'Confidence ≥ 85%. Generate patch, dry-run, validate, and apply with human approval.', action: 'View Automation', href: '#defects' },
          { type: 'prediction', severity: 'low', title: `Performance trend: ${metrics.performanceTrends}`, description: `Code quality: ${metrics.codeQuality}%. Security: ${metrics.securityFindings} findings. Tech debt: ${metrics.technicalDebt} items.` },
        ]} title="AI Engineering Insights" />
      </div>

      {/* Defects Table */}
      <section id="defects" className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Active Defects</h2>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">{defects.length} tracked • Last sync: {lastSync}</span>
            <Link href="/engineering/reports" className="text-[10px] font-medium text-purple-600 hover:text-purple-800">Download Report →</Link>
          </div>
        </div>
        <EngineeringDefectsTable defects={defects} />
      </section>
    </div>
  );
}
