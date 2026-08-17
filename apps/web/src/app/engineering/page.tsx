import Link from 'next/link';
import { Breadcrumb } from '../components/breadcrumb';
import { KpiCard } from '../components/kpi-card';
import { apiSafe } from '../lib/api';
import { computeRealMetrics, formatResolutionTime, type RealDefect } from '../lib/real-engineering';
import { EngineeringDefectsTable } from './defects-table';

interface RealClient { id: string; name: string }

export default async function EngineeringDashboardPage() {
  // Authoritative defect data — GET /oc/defects (oc_defects table), populated by
  // DefectDetectionService from real connector/discovery/migration/lifecycle/security
  // signals. Not sample data.
  const { defects } = await apiSafe<{ defects: RealDefect[] }>('/api/v1/oc/defects', { defects: [] });
  const { clients } = await apiSafe<{ clients: RealClient[] }>('/api/v1/oc/clients', { clients: [] });
  const clientNameById: Record<string, string> = Object.fromEntries(clients.map(c => [c.id, c.name]));

  const metrics = computeRealMetrics(defects);
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Engineering Intelligence' }]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automated defect detection from real platform signals</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-gray-400">Viewed: {lastSync}</span>
          <Link href="/engineering/reports" className="text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 transition">Reports</Link>
        </div>
      </div>

      {/* Executive Summary — every figure below is drawn directly from oc_defects; nothing is a composite guess */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-indigo-900 mb-2">Executive Summary</h3>
        <p className="text-xs text-indigo-700 leading-relaxed">
          {metrics.openDefects} open defect(s) across the platform.
          {metrics.criticalOpen > 0 && ` ${metrics.criticalOpen} critical defect(s) require immediate attention.`}
          {metrics.recurringIssues > 0 && ` ${metrics.recurringIssues} recurring issue(s) detected (occurred more than once).`}
          {metrics.securityOpen > 0 && ` ${metrics.securityOpen} open security-related defect(s).`}
          {' '}Average resolution time: {formatResolutionTime(metrics.avgResolutionHours)}
          {metrics.resolvedCount > 0 ? ` (based on ${metrics.resolvedCount} resolved defect(s)).` : ' — no defect has been resolved yet.'}
        </p>
      </div>

      {/* KPI Grid — build health, deploy health, code quality, and technical debt are not
          shown here: there is no CI/CD, deployment tracking, or static-analysis data source
          wired into this platform yet, so those numbers would be fabricated. */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 mb-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard label="Open Defects" value={metrics.openDefects} description="Total open engineering defects." criteria="Count of oc_defects rows with status not in (resolved, verified, closed)." />
          <KpiCard label="Open Critical" value={metrics.criticalOpen} color={metrics.criticalOpen > 0 ? 'text-red-600' : 'text-green-600'} description="Critical defects requiring immediate action." criteria="Open defects with severity = 'critical'." />
          <KpiCard label="Open High" value={metrics.highOpen} color={metrics.highOpen > 0 ? 'text-orange-600' : undefined} description="High-severity open defects." criteria="Open defects with severity = 'high'." />
          <KpiCard label="Recurring" value={metrics.recurringIssues} color={metrics.recurringIssues > 0 ? 'text-orange-600' : undefined} description="Defects that have been detected more than once (same fingerprint)." criteria="occurrence_count > 1." />
          <KpiCard label="Security" value={metrics.securityOpen} color={metrics.securityOpen > 0 ? 'text-red-600' : 'text-green-600'} description="Open defects in the security category." criteria="Open defects with category = 'security'." />
          <KpiCard label="Avg Resolution" value={formatResolutionTime(metrics.avgResolutionHours)} color={metrics.avgResolutionHours === null ? 'text-gray-400' : undefined} description={metrics.resolvedCount > 0 ? `Mean of resolved_at − first_seen_at across ${metrics.resolvedCount} resolved defect(s).` : 'No defect has been resolved yet — nothing to average.'} criteria="Mean(resolved_at − first_seen_at) for resolved defects." />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Root Cause Confidence — categorical, matching the real schema (confirmed/likely/possible/unknown). No fabricated numeric average. */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Root Cause Confidence</h3>
          {defects.length === 0 ? (
            <p className="text-xs text-gray-400">No defects recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {(['confirmed', 'likely', 'possible', 'unknown'] as const).map(level => (
                <div key={level} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 capitalize">{level}</span>
                  <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{metrics.confidenceDistribution[level] || 0}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Most Impacted Services — real, derived from affected_service on recorded defects */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Most Impacted Services</h3>
          {metrics.mostImpactedServices.length === 0 ? (
            <p className="text-xs text-gray-400">No affected-service data recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {metrics.mostImpactedServices.map((sys, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{sys.service}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.round((sys.count / metrics.mostImpactedServices[0].count) * 100)}%` }} />
                    </div>
                    <span className="font-bold text-gray-900">{sys.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity — real, most-recently-seen defects */}
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Recent Activity</h3>
          <div className="space-y-2 text-xs">
            {defects.length === 0 && <p className="text-gray-400">No defects detected yet.</p>}
            {[...defects].sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()).slice(0, 4).map(d => (
              <Link key={d.id} href={`/engineering/${d.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 transition">
                <span className={`w-2 h-2 rounded-full ${d.severity === 'critical' ? 'bg-red-500' : d.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                <span className="text-gray-700 truncate flex-1">{d.title}</span>
                <span className="text-[9px] text-gray-400">{new Date(d.last_seen_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Top Root Causes — only shown when at least one defect has a recorded root cause */}
      {metrics.topRootCauses.length > 0 && (
        <section className="bg-white rounded-xl border p-5 mb-8">
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
      )}

      {/* Defects Table */}
      <section id="defects" className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Active Defects</h2>
          <span className="text-[10px] text-gray-400">{defects.length} tracked</span>
        </div>
        {defects.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-500">No defects have been detected yet.</p>
            <p className="text-[10px] text-gray-400 mt-1">Defects are recorded automatically from connector failures, discovery failures, migration failures, stalled lifecycles, and open security findings.</p>
          </div>
        ) : (
          <EngineeringDefectsTable defects={defects} clientNameById={clientNameById} />
        )}
      </section>
    </div>
  );
}
